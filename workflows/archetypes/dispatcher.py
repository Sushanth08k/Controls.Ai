import logging
from typing import Any

from contracts.models import ControlDefinition
from core.definitions import compute_definition_hash
from core.ledger import Ledger
from workflows.archetypes.query_review_wf import QueryReviewWorkflow

logger = logging.getLogger(__name__)


class WorkflowDispatcher:
    """Generic Workflow Dispatcher routing any ControlDefinition to its archetype workflow engine.

    Follows the canonical architecture:
    Control YAML -> ControlDefinition -> WorkflowDispatcher -> Archetype Workflow (A-E)
    """

    def __init__(self, ledger: Ledger | None = None) -> None:
        self.ledger = ledger or Ledger()

    def dispatch(
        self,
        definition: ControlDefinition,
        target_evidence: dict[str, dict[str, Any]] | None = None,
        period: str = "current_period",
        run_id: str | None = None,
        previous_period_data: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> Any:
        """Dispatch control execution to the appropriate archetype workflow based strictly on definition."""
        archetype = definition.archetype
        defn_hash = compute_definition_hash(definition)

        if archetype == "A":
            wf = QueryReviewWorkflow(ledger=self.ledger)
            return wf.run(
                definition=definition,
                target_evidence=target_evidence,
                period=period,
                previous_period_data=previous_period_data,
                run_id=run_id,
            )
        elif archetype == "B":
            from workflows.archetypes.test_exec_wf import TestExecWorkflow

            wf_b = TestExecWorkflow(ledger=self.ledger)
            return wf_b.run(
                run_id=run_id,
                control_id=definition.control_id,
                control_version=definition.version,
                definition_sha256=defn_hash,
                **kwargs,
            )
        elif archetype == "C":
            from workflows.archetypes.reconcile_wf import ReconcileWorkflow

            wf_c = ReconcileWorkflow(ledger=self.ledger)
            recon_res = wf_c.run(
                run_id=run_id,
                control_id=definition.control_id,
                control_version=definition.version,
                definition_sha256=defn_hash,
                **kwargs,
            )
            return recon_res.model_dump() if hasattr(recon_res, "model_dump") else recon_res
        elif archetype == "D":
            from workflows.archetypes.execute_verify_wf import ExecuteVerifyWorkflow

            wf_d = ExecuteVerifyWorkflow(ledger=self.ledger)
            return wf_d.run(
                run_id=run_id,
                control_id=definition.control_id,
                control_version=definition.version,
                definition_sha256=defn_hash,
                **kwargs,
            )
        elif archetype == "E":
            from workflows.archetypes.doc_review_wf import DocReviewWorkflow

            wf_e = DocReviewWorkflow(ledger=self.ledger)
            return wf_e.run(
                run_id=run_id,
                control_id=definition.control_id,
                control_version=definition.version,
                definition_sha256=defn_hash,
                **kwargs,
            )
        else:
            raise ValueError(f"Unsupported archetype '{archetype}' for control '{definition.control_id}'")
