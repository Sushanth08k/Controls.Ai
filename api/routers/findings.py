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


_FINDINGS_STORE: list[FindingSummary] = [
    FindingSummary(
        finding_id="FIND-001",
        run_id="run-dummy-001",
        control_id="PILOT-ACCESS-001",
        title="Unauthorized superuser role 'bad_admin' detected",
        severity="high",
        status="open",
        evidence_ids=["ev-superusers-001"],
    )
]


@router.get("", response_model=list[FindingSummary])
def list_findings() -> list[FindingSummary]:
    return _FINDINGS_STORE
