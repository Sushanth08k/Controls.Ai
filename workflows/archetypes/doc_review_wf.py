import datetime
from typing import Any
import uuid

from contracts.models import PolicyIR
from core.citations import reconcile_extractions, verify_citation
from core.ledger import Ledger
from agents.interpreter import InterpreterAgent


class DocReviewWorkflow:
    """Generic Archetype E Workflow: Document Review & Dual-Model Policy Extraction."""

    def __init__(self, ledger: Ledger | None = None) -> None:
        self.ledger = ledger or Ledger()
        self.interpreter = InterpreterAgent()

    def run(
        self,
        document_content: str,
        doc_sha256: str,
        run_id: str | None = None,
        control_id: str = "GENERIC-DOC-REVIEW",
        control_version: str = "1.0.0",
        definition_sha256: str = "sha256-doc-review",
        mock_dual_ir: tuple[PolicyIR, PolicyIR] | None = None,
    ) -> dict[str, Any]:
        actual_run_id = run_id or f"run-doc-{uuid.uuid4().hex[:12]}"
        now = datetime.datetime.now(datetime.timezone.utc)

        # 1. Dual extraction (Reasoner vs Fast)
        if mock_dual_ir:
            ir_a, ir_b = mock_dual_ir
        else:
            try:
                ir_a, ir_b = self.interpreter.dual_extract(document_content, doc_sha256)
            except Exception:
                raise RuntimeError("Failed to extract PolicyIR via dual LLM invocation")

        # 2. Verify citations deterministically
        citation_errors = []
        for field_name, citation in ir_a.citations.items():
            field_val = getattr(ir_a, field_name, None)
            if not verify_citation(document_content, citation, field_val):
                citation_errors.append(f"Citation for '{field_name}' invalid: quote does not verify against text span")

        # 3. Reconcile extractions (Dual-model consensus check)
        is_concordant, disagreements = reconcile_extractions(ir_a, ir_b)

        # 4. Determine if HITL policy_version gate is required
        needs_hitl_gate = not is_concordant or len(citation_errors) > 0

        # 5. Log evidence to ledger
        ev_id = f"ev-doc-{actual_run_id}"
        entry = self.ledger.append(
            control_id=control_id,
            control_version=control_version,
            definition_sha256=definition_sha256,
            run_id=actual_run_id,
            kind="policy_interpretation_completed",
            payload={
                "doc_sha256": doc_sha256,
                "is_concordant": is_concordant,
                "disagreements": disagreements,
                "citation_errors": citation_errors,
                "needs_hitl": needs_hitl_gate,
            },
            payload_ref=f"policy/{actual_run_id}",
            actor="doc_reviewer",
            evidence_id=ev_id,
            ts=now,
        )

        return {
            "status": "pending_approval" if needs_hitl_gate else "completed",
            "run_id": actual_run_id,
            "policy_ir": ir_a,
            "is_concordant": is_concordant,
            "disagreements": disagreements,
            "citation_errors": citation_errors,
            "needs_hitl_gate": needs_hitl_gate,
            "evidence_id": ev_id,
        }
