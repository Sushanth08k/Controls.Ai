from datetime import datetime, timezone
from typing import Any, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from api.auth import UserSession, get_current_user
from api.rbac import check_gate_authorization
from api.sse import sse_broker

from sim.audit_store import list_audit_approvals, save_audit_approval

router = APIRouter(prefix="/gates", tags=["gates"])


class GateDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approved", "rejected"]
    comment: str


class GateItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gate_id: str
    run_id: str
    control_id: str
    gate_name: str
    maker_id: str
    approver_role: str
    status: Literal["pending", "approved", "rejected"]
    created_at: str
    decided_at: str | None = None
    decided_by: str | None = None
    comment: str | None = None


# Initial sample gates
_GATE_STORE: dict[str, GateItem] = {
    "gate-dummy-001": GateItem(
        gate_id="gate-dummy-001",
        run_id="run-dummy-001",
        control_id="PILOT-ACCESS-001",
        gate_name="finding_signoff",
        maker_id="sec_owner_1",
        approver_role="control_reviewer",
        status="pending",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
}


@router.get("", response_model=list[GateItem])
def list_gates(user: UserSession = Depends(get_current_user)) -> list[GateItem]:
    """List pending gates for the current user roles, merging persistent approvals."""
    db_approvals = list_audit_approvals()
    db_gates: dict[str, GateItem] = {}
    for a in db_approvals:
        db_gates[a["gate_id"]] = GateItem(
            gate_id=a["gate_id"],
            run_id=a["run_id"],
            control_id=a["control_id"],
            gate_name="operator_signoff",
            maker_id="system",
            approver_role="control_reviewer",
            status=a["status"] if a["status"] in ("pending", "approved", "rejected") else "approved",
            created_at=a.get("created_at") or datetime.now(timezone.utc).isoformat(),
            decided_at=a.get("approved_at"),
            decided_by=a.get("approved_by"),
            comment=a.get("comment"),
        )
    merged = {**db_gates, **_GATE_STORE}
    return list(merged.values())


@router.post("/{gate_id}/decision")
async def decide_gate(
    gate_id: str,
    body: GateDecisionRequest,
    user: UserSession = Depends(get_current_user),
) -> dict[str, Any]:
    """Approve or reject a gate with strict RBAC enforcement."""
    gate = _GATE_STORE.get(gate_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")

    if gate.status != "pending":
        raise HTTPException(status_code=400, detail="Gate is already decided")

    # Enforce RBAC & maker != checker
    check_gate_authorization(
        user=user,
        gate_name=gate.gate_name,
        required_role=gate.approver_role,
        maker_id=gate.maker_id,
        decision=body.decision,
        comment=body.comment,
    )

    # Update gate state
    now_iso = datetime.now(timezone.utc).isoformat()
    updated = GateItem(
        gate_id=gate.gate_id,
        run_id=gate.run_id,
        control_id=gate.control_id,
        gate_name=gate.gate_name,
        maker_id=gate.maker_id,
        approver_role=gate.approver_role,
        status=body.decision,
        created_at=gate.created_at,
        decided_at=now_iso,
        decided_by=user.user_id,
        comment=body.comment,
    )
    _GATE_STORE[gate_id] = updated

    save_audit_approval(
        gate_id=gate.gate_id,
        run_id=gate.run_id,
        control_id=gate.control_id,
        status=body.decision,
        approved_by=user.user_id,
        approved_at=now_iso,
        comment=body.comment,
    )

    # Emit realtime event
    await sse_broker.publish(
        "gate.decided",
        {"gate_id": gate_id, "decision": body.decision, "decided_by": user.user_id},
    )

    return {"status": "ok", "gate": updated.model_dump()}
