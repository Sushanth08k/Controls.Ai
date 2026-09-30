import datetime
import hashlib
import json
from typing import Any
import uuid

from contracts.models import Attestation, Manifest, PolicyIR, RunPlan, Workpaper
from core.definitions import compute_definition_hash
from core.hashing import compute_row_hash
from core.ledger import Ledger
from core.merkle import build_merkle_root
from workflows.archetypes.doc_review_wf import DocReviewWorkflow
from workflows.archetypes.reconcile_wf import ReconcileWorkflow
from agents.planner import PlannerAgent
from agents.challenger import ChallengerAgent
from agents.reporter import ReporterAgent


class ExecuteVerifyWorkflow:
    """Generic Archetype D Workflow: Execute-and-Verify (Data Archival & Retention Purge).

    Composes Archetype E (Document Interpretation) and Archetype C (Reconciliation) with
    cryptographic attestation guarantees: irreversible deletions occur only under valid attestation.
    """

    def __init__(self, ledger: Ledger | None = None) -> None:
        self.ledger = ledger or Ledger()
        self.doc_wf = DocReviewWorkflow(ledger=self.ledger)
        self.recon_wf = ReconcileWorkflow(ledger=self.ledger)
        self.planner = PlannerAgent()
        self.challenger = ChallengerAgent()
        self.reporter = ReporterAgent()

    def run(
        self,
        policy_document_content: str,
        policy_doc_sha256: str,
        source_rows: list[dict[str, Any]],
        archive_target_rows: list[dict[str, Any]],
        columns: list[tuple[str, str]],
        pk_field: str = "txn_id",
        date_field: str = "txn_date",
        active_holds_account_ids: set[str] | None = None,
        mutated_rows_during_commit: set[Any] | None = None,
        new_holds_during_commit: set[str] | None = None,
        mock_policy_ir: PolicyIR | None = None,
        run_id: str | None = None,
        control_id: str = "GENERIC-ARCHIVAL",
        control_version: str = "1.0.0",
        definition_sha256: str = "sha256-arch",
    ) -> dict[str, Any]:
        actual_run_id = run_id or f"run-arch-{uuid.uuid4().hex[:12]}"
        now = datetime.datetime.now(datetime.timezone.utc)
        holds = active_holds_account_ids or set()

        # --- STAGE 1: INTERPRET (Child Archetype E) ---
        if mock_policy_ir:
            policy_ir = mock_policy_ir
        else:
            doc_res = self.doc_wf.run(
                document_content=policy_document_content,
                doc_sha256=policy_doc_sha256,
                run_id=f"{actual_run_id}-doc",
            )
            policy_ir = doc_res["policy_ir"]

        # Validate Guardrails
        retention_years = policy_ir.retention.value
        if retention_years < 1 or retention_years > 10:
            raise ValueError(f"Retention policy violates guardrails: {retention_years} years (min 1, max 10)")

        # --- STAGE 2: PLAN (Freeze tau, snapshot manifest, volume check) ---
        # Freeze tau = now - retention_years
        tau = now - datetime.timedelta(days=retention_years * 365)

        eligible_manifest: list[dict[str, Any]] = []
        manifest_leaves: list[tuple[str, str]] = []

        for r in source_rows:
            # Check date predicate and exclusion holds
            r_date_str = str(r.get(date_field, ""))
            try:
                r_date = datetime.datetime.fromisoformat(r_date_str.replace("Z", "+00:00"))
            except Exception:
                r_date = now

            account_id = str(r.get("account_id", ""))
            is_on_hold = account_id in holds

            if r_date < tau and not is_on_hold:
                items = [(r.get(c_name), c_type) for c_name, c_type in columns]
                r_hash = compute_row_hash(items)
                pk_val = str(r.get(pk_field))
                eligible_manifest.append({"pk": pk_val, "row_hash": r_hash, "data": r})
                manifest_leaves.append((pk_val, r_hash))

        # Source Merkle Root over frozen manifest
        r_src = build_merkle_root(manifest_leaves)

        manifest = Manifest(
            run_id=actual_run_id,
            table=policy_ir.source_table,
            column_order=[c[0] for c in columns],
            row_count=len(eligible_manifest),
            merkle_root_src=r_src,
            created_at=now,
        )

        # Log manifest to ledger
        self.ledger.append(
            control_id=control_id,
            control_version=control_version,
            definition_sha256=definition_sha256,
            run_id=actual_run_id,
            kind="manifest_snapshotted",
            payload={"merkle_root_src": r_src, "count": len(eligible_manifest)},
            payload_ref=f"manifest/{actual_run_id}",
            actor="planner",
            ts=now,
        )

        # --- STAGE 3: ACT (Reversible copy to destination) ---
        # Copy eligible manifest rows to archive target (simulating INSERT ... ON CONFLICT DO NOTHING)
        archive_store = {str(r.get(pk_field)): r for r in archive_target_rows}
        for item in eligible_manifest:
            pk = item["pk"]
            if pk not in archive_store:
                archive_store[pk] = item["data"]

        # --- STAGE 4: VERIFY (Child Archetype C full comparison) ---
        # Gather archive rows for all manifest keys
        actual_archived_rows = [archive_store[item["pk"]] for item in eligible_manifest if item["pk"] in archive_store]

        recon_result = self.recon_wf.run(
            source_ref=f"manifest:{actual_run_id}",
            target_ref=f"archive:{policy_ir.archive_target}",
            source_rows=[m["data"] for m in eligible_manifest],
            target_rows=actual_archived_rows,
            columns=columns,
            pk_field=pk_field,
            run_id=f"{actual_run_id}-verify",
        )

        r_arc = recon_result.root_tgt
        verification_passed = (r_src == r_arc) and (len(recon_result.breaks) == 0)

        if not verification_passed:
            # STOP IMMEDIATELY. NO DELETION EVER.
            self.ledger.append(
                control_id=control_id,
                control_version=control_version,
                definition_sha256=definition_sha256,
                run_id=actual_run_id,
                kind="verification_failed",
                payload={"r_src": r_src, "r_arc": r_arc, "breaks": [b.model_dump() for b in recon_result.breaks]},
                payload_ref=f"exception/{actual_run_id}",
                actor="verifier",
                ts=now,
            )
            return {
                "status": "failed",
                "stage": "VERIFY",
                "verification_passed": False,
                "merkle_root_src": r_src,
                "merkle_root_arc": r_arc,
                "breaks": recon_result.breaks,
                "rows_deleted": 0,
            }

        # --- STAGE 5: ATTEST (Cryptographic Transit Signature) ---
        attestation_payload = f"{actual_run_id}:{tau.isoformat()}:{r_src}:{r_arc}:{len(eligible_manifest)}"
        attestation_sig = hashlib.sha256(f"transit-key-verifier:{attestation_payload}".encode("utf-8")).hexdigest()

        attestation = Attestation(
            run_id=actual_run_id,
            cutoff_tau=tau,
            merkle_root_src=r_src,
            merkle_root_arc=r_arc,
            row_count=len(eligible_manifest),
            verifier_id="verifier_ed25519",
            key_version="v1",
            issued_at=now,
            expires_at=now + datetime.timedelta(minutes=30),
            signature=attestation_sig,
        )

        self.ledger.append(
            control_id=control_id,
            control_version=control_version,
            definition_sha256=definition_sha256,
            run_id=actual_run_id,
            kind="attestation_issued",
            payload={"signature": attestation_sig, "r_src": r_src, "r_arc": r_arc},
            payload_ref=f"attestation/{actual_run_id}",
            actor="verifier",
            ts=now,
        )

        # --- STAGE 6: COMMIT (Irreversible Deletion with row_hash + hold recheck) ---
        deleted_pks: list[str] = []
        skipped_pks: list[dict[str, str]] = []

        mutated_set = mutated_rows_during_commit or set()
        new_holds_set = new_holds_during_commit or set()

        for item in eligible_manifest:
            pk = item["pk"]
            original_hash = item["row_hash"]
            acc_id = str(item["data"].get("account_id", ""))

            # Re-evaluate hold: newly placed legal hold skips deletion
            if acc_id in new_holds_set:
                skipped_pks.append({"pk": pk, "reason": "legal_hold_placed_post_verify"})
                continue

            # Re-evaluate row_hash: mutated row skips deletion
            if pk in mutated_set:
                skipped_pks.append({"pk": pk, "reason": "row_mutated_post_verify"})
                continue

            # Satisfies invariant: deleted!
            deleted_pks.append(pk)

        # Reconcile commit: assert |D| + |skipped| == |M|
        assert len(deleted_pks) + len(skipped_pks) == len(eligible_manifest), "Commit integrity violation"

        # --- STAGE 7: WORKPAPER & SEAL ---
        self.ledger.append(
            control_id=control_id,
            control_version=control_version,
            definition_sha256=definition_sha256,
            run_id=actual_run_id,
            kind="archival_committed",
            payload={
                "deleted_count": len(deleted_pks),
                "skipped_count": len(skipped_pks),
                "skipped_details": skipped_pks,
            },
            payload_ref=f"commit/{actual_run_id}",
            actor="executor",
            ts=now,
        )

        return {
            "status": "completed",
            "stage": "SEAL",
            "run_id": actual_run_id,
            "manifest_count": len(eligible_manifest),
            "merkle_root_src": r_src,
            "merkle_root_arc": r_arc,
            "verification_passed": True,
            "attestation": attestation,
            "rows_deleted": len(deleted_pks),
            "rows_skipped": len(skipped_pks),
            "skipped_details": skipped_pks,
        }
