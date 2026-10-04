from typing import Any
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/evidence", tags=["evidence"])


from sim.audit_store import get_audit_evidence

_EVIDENCE_STORE: dict[str, dict[str, Any]] = {}


@router.get("/{evidence_id}")
def get_evidence(evidence_id: str) -> dict[str, Any]:
    ev = _EVIDENCE_STORE.get(evidence_id)
    if ev:
        return ev
    db_ev = get_audit_evidence(evidence_id)
    if db_ev:
        payload = db_ev.get("payload")
        if isinstance(payload, dict):
            return payload
        return db_ev
    raise HTTPException(status_code=404, detail="Evidence not found")
