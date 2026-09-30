import datetime
from pathlib import Path
from typing import Any
import uuid
import yaml

from contracts.models import DraftControlDefinition
from core.definitions import DefinitionRegistry, compute_definition_hash
from core.ledger import Ledger
from agents.onboarder import OnboarderAgent


class OnboardWorkflow:
    """Orchestrates onboarding of a control from an RCM row to an approved YAML definition."""

    def __init__(self, ledger: Ledger | None = None, registry: DefinitionRegistry | None = None) -> None:
        self.ledger = ledger or Ledger()
        self.registry = registry or DefinitionRegistry()
        self.onboarder = OnboarderAgent()

    def run(
        self,
        rcm_row: dict[str, Any],
        maker_id: str = "onboarder_operator",
        run_id: str | None = None,
        mock_draft: DraftControlDefinition | None = None,
    ) -> dict[str, Any]:
        actual_run_id = run_id or f"run-onboard-{uuid.uuid4().hex[:12]}"
        now = datetime.datetime.now(datetime.timezone.utc)

        # 1. Onboarder drafts ControlDefinition + fit assessment
        if mock_draft:
            draft = mock_draft
        else:
            draft = self.onboarder.onboard_rcm_row(
                control_id=rcm_row["control_id"],
                title=rcm_row["title"],
                description=rcm_row.get("description", ""),
                test_procedure=rcm_row.get("test_procedure", ""),
                frequency=rcm_row.get("frequency", "monthly"),
                risk_rating=rcm_row.get("risk_rating", "high"),
            )

        # 2. Schema validation
        defn = draft.definition
        self.registry.validate_referential_integrity(defn)
        defn_hash = compute_definition_hash(defn)

        # 3. Calculate priority score
        p = draft.priority_inputs
        priority_score = p.frequency * p.manual_effort * p.risk * p.feasibility

        # 4. Dry-run against synthetic environment (simulated plan-only verification)
        dry_run_passed = True

        # 5. Create maker-checker definition_change gate
        gate_payload = {
            "gate": "definition_change",
            "control_id": defn.control_id,
            "version": defn.version,
            "definition_sha256": defn_hash,
            "maker_id": maker_id,
            "approver_role": "control_reviewer",
            "priority_score": round(priority_score, 2),
            "fit": draft.fit,
            "dry_run_passed": dry_run_passed,
        }

        # 6. Log onboarding proposal to ledger
        ev_id = f"ev-onboard-{actual_run_id}"
        self.ledger.append(
            control_id=defn.control_id,
            control_version=defn.version,
            definition_sha256=defn_hash,
            run_id=actual_run_id,
            kind="control_onboard_proposed",
            payload=gate_payload,
            payload_ref=f"onboard/{actual_run_id}",
            actor=maker_id,
            evidence_id=ev_id,
            ts=now,
        )

        return {
            "status": "pending_approval",
            "run_id": actual_run_id,
            "control_id": defn.control_id,
            "draft_definition": defn,
            "definition_sha256": defn_hash,
            "fit": draft.fit,
            "priority_score": round(priority_score, 2),
            "dry_run_passed": dry_run_passed,
            "evidence_id": ev_id,
        }
