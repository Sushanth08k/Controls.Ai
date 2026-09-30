from typing import Any
from contracts.models import Evaluation
from core.llm import structured_call


class EvaluatorAgent:
    """Evaluates rule failures where human or contextual judgment is required."""

    def __init__(self, template_version: str | int = 1) -> None:
        self.template_version = template_version

    def evaluate(
        self,
        rule_id: str,
        product: str,
        version: str,
        evidence_ids: list[str],
        context: dict[str, Any],
    ) -> Evaluation:
        inputs = {
            "rule_id": rule_id,
            "product": product,
            "version": version,
            "evidence_ids": evidence_ids,
            "context": context,
        }
        return structured_call(
            role="reasoner",
            template_id="cve_applicability",
            template_version=self.template_version,
            inputs=inputs,
            output_model=Evaluation,
            temperature=0.0,
        )
