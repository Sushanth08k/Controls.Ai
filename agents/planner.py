from typing import Any
from contracts.models import PlanReview
from core.llm import structured_call


class PlannerAgent:
    """Reviews deterministic execute-and-verify plans, explains flags, and evaluates volume anomalies."""

    def __init__(self, template_version: str | int = 1) -> None:
        self.template_version = template_version

    def review_plan(
        self,
        run_id: str,
        policy_ref: str,
        eligible_count: int,
        baseline: dict[str, Any],
        fk_order: list[str],
        batch_size: int,
    ) -> PlanReview:
        inputs = {
            "run_id": run_id,
            "policy_ref": policy_ref,
            "eligible_count": eligible_count,
            "baseline": baseline,
            "fk_order": fk_order,
            "batch_size": batch_size,
        }
        return structured_call(
            role="reasoner",
            template_id="archival_plan_review",
            template_version=self.template_version,
            inputs=inputs,
            output_model=PlanReview,
            temperature=0.0,
        )
