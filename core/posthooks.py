from typing import Any
from contracts.models import Challenge, Finding, Workpaper


def verify_evidence_ids_resolve(evidence_ids: list[str], available_evidence_ids: set[str]) -> bool:
    """Verify that every cited evidence_id actually exists in the ledger/run collection."""
    if not evidence_ids:
        return False
    return all(ev_id in available_evidence_ids for ev_id in evidence_ids)


def posthook_validate_finding(finding: Finding, available_evidence_ids: set[str]) -> Finding:
    """Ensure finding has at least one valid resolved evidence ID."""
    if not verify_evidence_ids_resolve(finding.evidence_ids, available_evidence_ids):
        raise ValueError(
            f"Finding {finding.finding_id} references unresolved evidence_ids: {finding.evidence_ids}"
        )
    return finding


def posthook_validate_challenge(challenge: Challenge, finding: Finding) -> Challenge:
    """Ensure challenge references the correct subject finding."""
    if challenge.subject_id != finding.finding_id:
        raise ValueError(
            f"Challenge subject_id '{challenge.subject_id}' does not match finding '{finding.finding_id}'"
        )
    return challenge


def posthook_validate_workpaper(workpaper: Workpaper, available_evidence_ids: set[str]) -> Workpaper:
    """Ensure every section of the workpaper cites resolved evidence ids."""
    for section in workpaper.sections:
        if not section.evidence_ids:
            raise ValueError(f"Workpaper section '{section.heading}' missing evidence citations")
        if not verify_evidence_ids_resolve(section.evidence_ids, available_evidence_ids):
            raise ValueError(
                f"Workpaper section '{section.heading}' cites unresolved evidence: {section.evidence_ids}"
            )
    return workpaper
