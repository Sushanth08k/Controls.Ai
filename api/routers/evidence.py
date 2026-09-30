from typing import Any
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/evidence", tags=["evidence"])


_EVIDENCE_STORE: dict[str, dict[str, Any]] = {
    "ev-superusers-001": {
        "evidence_id": "ev-superusers-001",
        "control_id": "PILOT-ACCESS-001",
        "run_id": "run-dummy-001",
        "catalog_ref": "VQ-001",
        "result_sha256": "abcdef1234567890" * 4,
        "row_count": 2,
        "rows": [{"rolname": "bad_admin"}, {"rolname": "postgres"}],
    }
}


@router.get("/{evidence_id}")
def get_evidence(evidence_id: str) -> dict[str, Any]:
    ev = _EVIDENCE_STORE.get(evidence_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return ev
