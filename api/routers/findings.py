from typing import Any
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/findings", tags=["findings"])


class FindingSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    finding_id: str
    run_id: str
    control_id: str
    title: str
    severity: str
    status: str
    evidence_ids: list[str]
    target: str | None = None
    cve_id: str | None = None
    age_days: int | None = None
    allowed_sla_days: int | None = None
    result: str | None = "FAIL"
    reason: str | None = None


from sim.audit_store import list_audit_findings

_FINDINGS_STORE: list[FindingSummary] = []


@router.get("", response_model=list[FindingSummary])
def list_findings() -> list[FindingSummary]:
    """List all findings across runs, loading from SQLite audit storage."""
    db_findings = list_audit_findings()
    db_items: dict[str, FindingSummary] = {}
    for f in db_findings:
        details = f.get("details") or {}
        db_items[f["finding_id"]] = FindingSummary(
            finding_id=f["finding_id"],
            run_id=f["run_id"],
            control_id=f["control_id"],
            title=f["title"],
            severity=f["severity"],
            status=f["status"],
            evidence_ids=details.get("evidence_ids", [f"ev-{f['run_id']}"]),
            target=details.get("database_name") or f.get("affected_record"),
            cve_id=details.get("cve_id"),
            age_days=details.get("age_days"),
            allowed_sla_days=details.get("allowed_sla_days"),
            result=details.get("result", "FAIL"),
            reason=f.get("description"),
        )
    # Merge with in-memory findings
    for mem_f in _FINDINGS_STORE:
        db_items[mem_f.finding_id] = mem_f

    return list(db_items.values())
