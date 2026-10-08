from datetime import datetime, timezone
from typing import Any, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from api.auth import UserSession, get_current_user
from api.rbac import check_gate_authorization
from api.sse import sse_broker

from sim.audit_store import (
    get_audit_approval,
    list_audit_approvals,
    save_audit_approval,
    get_audit_run,
)

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
    maker_email: str | None = None


# Dynamic gate store for runtime/testing overrides
_GATE_STORE: dict[str, GateItem] = {}


@router.get("", response_model=list[GateItem])
def list_gates(user: UserSession = Depends(get_current_user)) -> list[GateItem]:
    """List pending gates for the current user roles, dynamically reading persistent approvals."""
    db_approvals = list_audit_approvals()
    db_gates: dict[str, GateItem] = {}
    for a in db_approvals:
        maker_val = a.get("maker_id") or "sec_owner_1"
        if not maker_val or maker_val == "sec_owner_1" or "@" not in maker_val:
            run_rec = get_audit_run(a["run_id"])
            if run_rec and run_rec.get("metadata", {}).get("operator_email"):
                maker_val = run_rec["metadata"]["operator_email"]
            else:
                maker_val = "ksushanth9030@gmail.com"

        decided_by_val = a.get("approved_by")
        if decided_by_val == "sec_reviewer_1":
            decided_by_val = "imsushanth2005@gmail.com"

        db_gates[a["gate_id"]] = GateItem(
            gate_id=a["gate_id"],
            run_id=a["run_id"],
            control_id=a["control_id"],
            gate_name=a.get("gate_name") or "archival_signoff",
            maker_id=maker_val,
            maker_email=maker_val,
            approver_role=a.get("approver_role") or "control_reviewer",
            status=a["status"] if a["status"] in ("pending", "approved", "rejected") else "approved",
            created_at=a.get("created_at") or datetime.now(timezone.utc).isoformat(),
            decided_at=a.get("approved_at"),
            decided_by=decided_by_val,
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
    """Approve or reject a gate with strict RBAC enforcement, resuming control execution on approval."""
    # Lookup gate: first in database, then in _GATE_STORE
    gate_dict = get_audit_approval(gate_id=gate_id)
    gate: GateItem | None = None
    if gate_dict:
        gate = GateItem(
            gate_id=gate_dict["gate_id"],
            run_id=gate_dict["run_id"],
            control_id=gate_dict["control_id"],
            gate_name=gate_dict.get("gate_name") or "archival_signoff",
            maker_id=gate_dict.get("maker_id") or "sec_owner_1",
            approver_role=gate_dict.get("approver_role") or "control_reviewer",
            status=gate_dict["status"] if gate_dict["status"] in ("pending", "approved", "rejected") else "approved",
            created_at=gate_dict.get("created_at") or datetime.now(timezone.utc).isoformat(),
            decided_at=gate_dict.get("approved_at"),
            decided_by=gate_dict.get("approved_by"),
            comment=gate_dict.get("comment"),
        )
    elif gate_id in _GATE_STORE:
        gate = _GATE_STORE[gate_id]

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
    if gate_id in _GATE_STORE:
        _GATE_STORE[gate_id] = updated

    save_audit_approval(
        gate_id=gate.gate_id,
        run_id=gate.run_id,
        control_id=gate.control_id,
        status=body.decision,
        approved_by=user.user_id,
        approved_at=now_iso,
        comment=body.comment,
        gate_name=gate.gate_name,
        maker_id=gate.maker_id,
        approver_role=gate.approver_role,
    )

    # Emit realtime event
    await sse_broker.publish(
        "gate.decided",
        {"gate_id": gate_id, "decision": body.decision, "decided_by": user.user_id},
    )

    # Resume/block the associated run after human approval.
    if gate.run_id:
        if body.decision == "approved":
            from sim.audit_store import save_audit_step, upsert_audit_run
            from api.routers.runs import _RUNS_STORE
            save_audit_step(
                step_id=f"step-{gate.run_id}-4",
                run_id=gate.run_id,
                step_name="HUMAN_APPROVAL",
                status="completed",
                completed_at=now_iso,
                metadata_json={
                    "certificate_id": gate.gate_id,
                    "operator_id": user.user_id,
                    "comment": body.comment,
                },
            )
            upsert_audit_run(
                run_id=gate.run_id,
                control_id=gate.control_id,
                status="running",
            )
            if gate.run_id in _RUNS_STORE:
                _RUNS_STORE[gate.run_id].status = "running"
            await sse_broker.publish(
                "run.updated",
                {"run_id": gate.run_id, "status": "running", "control_id": gate.control_id, "stage": "APPROVED"},
            )
        elif body.decision == "rejected":
            from sim.audit_store import upsert_audit_run, save_audit_step
            from api.routers.runs import _RUNS_STORE
            upsert_audit_run(
                run_id=gate.run_id,
                control_id=gate.control_id,
                status="blocked",
                error_message=f"Human approval rejected by {user.user_id}: {body.comment}",
            )
            save_audit_step(
                step_id=f"step-{gate.run_id}-4",
                run_id=gate.run_id,
                step_name="HUMAN_APPROVAL",
                status="rejected",
                completed_at=now_iso,
                error_message=body.comment,
                metadata_json={"reviewer": user.user_id, "decision": "rejected"},
            )
            if gate.run_id in _RUNS_STORE:
                _RUNS_STORE[gate.run_id].status = "blocked"
            await sse_broker.publish(
                "run.updated",
                {"run_id": gate.run_id, "status": "blocked", "control_id": gate.control_id},
            )

    return {"status": "ok", "gate": updated.model_dump()}
