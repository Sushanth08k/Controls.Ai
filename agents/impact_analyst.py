from typing import Any
from contracts.models import ImpactAddendum
from core.llm import structured_call


class ImpactAnalystAgent:
    """Analyzes release changes and recommends additional test endpoints."""

    def __init__(self, template_version: str | int = 1) -> None:
        self.template_version = template_version

    def analyze_change(
        self,
        change_id: str,
        release_notes: str,
        modified_endpoints: list[str],
        dependency_graph: dict[str, list[str]],
    ) -> ImpactAddendum:
        inputs = {
            "change_id": change_id,
            "release_notes": release_notes,
            "modified_endpoints": modified_endpoints,
            "dependency_graph": dependency_graph,
        }
        return structured_call(
            role="fast",
            template_id="change_impact",
            template_version=self.template_version,
            inputs=inputs,
            output_model=ImpactAddendum,
            temperature=0.0,
        )
