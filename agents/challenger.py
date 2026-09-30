from typing import Any
from contracts.models import Challenge, Finding
from core.llm import structured_call
from core.posthooks import posthook_validate_challenge


class ChallengerAgent:
    """Independent critic agent challenging proposed findings against evidence."""

    def __init__(self, template_version: str | int = 1) -> None:
        self.template_version = template_version

    def challenge_finding(self, finding: Finding, evidence_payload: Any) -> Challenge:
        inputs = {
            "finding_id": finding.finding_id,
            "title": finding.title,
            "severity": finding.severity,
            "evidence": evidence_payload,
        }
        challenge = structured_call(
            role="critic",
            template_id="finding_challenge",
            template_version=self.template_version,
            inputs=inputs,
            output_model=Challenge,
            temperature=0.0,
        )
        return posthook_validate_challenge(challenge, finding)
