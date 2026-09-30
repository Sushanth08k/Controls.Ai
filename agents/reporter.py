from typing import Any
from contracts.models import Finding, Workpaper
from core.llm import structured_call
from core.posthooks import posthook_validate_workpaper


class ReporterAgent:
    """Drafts formal audit workpapers where every section cites verified evidence IDs."""

    def __init__(self, template_version: str | int = 1) -> None:
        self.template_version = template_version

    def generate_workpaper(
        self,
        control_id: str,
        run_id: str,
        period: str,
        findings: list[Finding],
        evidence_summary: dict[str, Any],
        available_evidence_ids: set[str],
    ) -> Workpaper:
        findings_summary = [
            {"finding_id": f.finding_id, "title": f.title, "severity": f.severity, "evidence_ids": f.evidence_ids}
            for f in findings
        ]
        inputs = {
            "control_id": control_id,
            "run_id": run_id,
            "period": period,
            "total_findings": len(findings),
            "findings_summary": findings_summary,
            "evidence_summary": evidence_summary,
        }
        workpaper = structured_call(
            role="reasoner",
            template_id="review_workpaper",
            template_version=self.template_version,
            inputs=inputs,
            output_model=Workpaper,
            temperature=0.2,
        )
        return posthook_validate_workpaper(workpaper, available_evidence_ids)
