import datetime
from typing import Any
import uuid

from contracts.models import ReconBreak, ReconCounts, ReconResult
from core.hashing import compute_row_hash
from core.ledger import Ledger
from core.merkle import bisect_breaks, build_merkle_root


class ReconcileWorkflow:
    """Generic Archetype C Workflow: Cryptographic Reconciliation.

    Computes canonical row hashes, constructs Merkle trees, compares roots, and bisects breaks.
    """

    def __init__(self, ledger: Ledger | None = None) -> None:
        self.ledger = ledger or Ledger()

    def run(
        self,
        source_ref: str,
        target_ref: str,
        source_rows: list[dict[str, Any]],
        target_rows: list[dict[str, Any]],
        columns: list[tuple[str, str]],
        pk_field: str = "id",
        run_id: str | None = None,
        control_id: str = "GENERIC-RECON",
        control_version: str = "1.0.0",
        definition_sha256: str = "sha256-recon",
    ) -> ReconResult:
        actual_run_id = run_id or f"run-recon-{uuid.uuid4().hex[:12]}"
        now = datetime.datetime.now(datetime.timezone.utc)

        # 1. Compute canonical row hashes on both sides
        src_leaves = []
        for r in source_rows:
            items = [(r.get(col_name), col_type) for col_name, col_type in columns]
            r_hash = compute_row_hash(items)
            pk = str(r.get(pk_field))
            src_leaves.append((pk, r_hash))

        tgt_leaves = []
        for r in target_rows:
            items = [(r.get(col_name), col_type) for col_name, col_type in columns]
            r_hash = compute_row_hash(items)
            pk = str(r.get(pk_field))
            tgt_leaves.append((pk, r_hash))

        # 2. Build Merkle roots
        root_src = build_merkle_root(src_leaves)
        root_tgt = build_merkle_root(tgt_leaves)

        # 3. Compare roots; if roots match, zero breaks. Otherwise bisect to locate breaks.
        raw_breaks = []
        if root_src != root_tgt:
            raw_breaks = bisect_breaks(src_leaves, tgt_leaves)

        breaks = [
            ReconBreak(pk=b["pk"], type=b["type"])  # type: ignore[arg-type]
            for b in raw_breaks
        ]

        # 4. Log reconciliation evidence to ledger
        ev_id = f"ev-recon-{actual_run_id}"
        recon_payload = {
            "source_ref": source_ref,
            "target_ref": target_ref,
            "root_src": root_src,
            "root_tgt": root_tgt,
            "counts": {"src": len(source_rows), "tgt": len(target_rows)},
            "breaks_count": len(breaks),
            "match": root_src == root_tgt,
        }

        entry = self.ledger.append(
            control_id=control_id,
            control_version=control_version,
            definition_sha256=definition_sha256,
            run_id=actual_run_id,
            kind="reconciliation_completed",
            payload=recon_payload,
            payload_ref=f"recon/{actual_run_id}",
            actor="reconciler",
            evidence_id=ev_id,
            ts=now,
        )

        return ReconResult(
            run_id=actual_run_id,
            source_ref=source_ref,
            target_ref=target_ref,
            root_src=root_src,
            root_tgt=root_tgt,
            counts=ReconCounts(src=len(source_rows), tgt=len(target_rows)),
            breaks=breaks,
            evidence_ids=[ev_id],
        )
