from typing import Any
from contracts.models import DraftControlDefinition
from core.llm import structured_call


class OnboarderAgent:
    """Drafts ControlDefinitions from spreadsheet RCM rows and assesses archetype fit."""

    def __init__(self, template_version: str | int = 1) -> None:
        self.template_version = template_version

    def onboard_rcm_row(
        self,
        control_id: str,
        title: str,
        description: str,
        test_procedure: str,
        frequency: str,
        risk_rating: str,
    ) -> DraftControlDefinition:
        inputs = {
            "control_id": control_id,
            "title": title,
            "description": description,
            "test_procedure": test_procedure,
            "frequency": frequency,
            "risk_rating": risk_rating,
        }
        return structured_call(
            role="reasoner",
            template_id="rcm_onboard",
            template_version=self.template_version,
            inputs=inputs,
            output_model=DraftControlDefinition,
            temperature=0.0,
        )
