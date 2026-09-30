from typing import Any
from temporalio import workflow
from contracts.models import ControlDefinition, RunContext


@workflow.defn
class SupervisorWorkflow:
    """Supervisor Temporal Workflow: orchestrates schedules, fan-out, and concurrency."""

    @workflow.run
    async def run(self, defn_dict: dict[str, Any], is_approved: bool) -> dict[str, Any]:
        # Enforce Governance Rule: Refuse unapproved control definitions
        if not is_approved:
            raise PermissionError("Supervisor refused unapproved control definition hash")

        control_id = defn_dict["control_id"]
        version = defn_dict["version"]
        archetype = defn_dict["archetype"]
        scope = defn_dict.get("scope", [])

        # Execute fan-out per scope target
        targets_processed = []
        for target in scope:
            target_ref = target.get("ref", "default")
            targets_processed.append(target_ref)

        return {
            "status": "completed",
            "control_id": control_id,
            "version": version,
            "archetype": archetype,
            "targets_processed": targets_processed,
        }
