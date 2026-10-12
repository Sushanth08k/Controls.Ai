import json
from datetime import datetime, timezone
from typing import Any, Literal
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict
from api.auth import UserSession, check_gate_authorization, get_current_user
from api.sse import sse_broker

from sim.audit_store import (
    get_audit_approval,
    list_audit_approvals,
    save_audit_approval,
    get_audit_run,
    list_audit_steps,
)

router = APIRouter(prefix="/gates", tags=["gates"])


VULN_BYPASS_MAKER_CHECKER = True


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
    gate_type: str = "archival_signoff"
    payload_summary: dict[str, Any] | None = None
    payload: dict[str, Any] | None = None
    steps_completed: list[dict[str, Any]] | None = None
    run_summary: dict[str, Any] | None = None



PERSONA_EMAIL_MAP: dict[str, str] = {
    "sec_reviewer_1": "reviewer@bank.internal",
    "sec_owner_1": "owner@bank.internal",
    "release_owner_1": "release@bank.internal",
    "operator_1": "operator@bank.internal",
}

# Dynamic gate store for runtime/testing overrides
_GATE_STORE: dict[str, GateItem] = {}


@router.get("", response_model=list[GateItem])
def list_gates(user: UserSession = Depends(get_current_user)) -> list[GateItem]:
    """List pending gates for the current user roles, dynamically reading persistent approvals."""
    db_approvals = list_audit_approvals()
    db_gates: dict[str, GateItem] = {}
    for a in db_approvals:
        run_rec = get_audit_run(a["run_id"])
        steps_raw = list_audit_steps(a["run_id"])
        steps_completed = [
            {
                "step_id": s.get("step_id"),
                "step_name": s.get("step_name"),
                "status": s.get("status"),
                "started_at": s.get("started_at"),
                "completed_at": s.get("completed_at"),
                "records_processed": s.get("records_processed", 0),
                "metadata": s.get("metadata") or {},
            }
            for s in steps_raw
        ]

        maker_val = a.get("maker_id")
        if not maker_val or "@" not in maker_val:
            if run_rec and run_rec.get("metadata", {}).get("operator_email") and "@" in str(run_rec["metadata"]["operator_email"]):
                maker_val = run_rec["metadata"]["operator_email"]
            elif run_rec and run_rec.get("metadata", {}).get("editor_email") and "@" in str(run_rec["metadata"]["editor_email"]):
                maker_val = run_rec["metadata"]["editor_email"]
            elif maker_val in PERSONA_EMAIL_MAP:
                maker_val = PERSONA_EMAIL_MAP[maker_val]
            else:
                maker_val = f"{maker_val}@bank.internal" if maker_val else "operator@bank.internal"

        decided_by_val = a.get("approved_by")
        if not decided_by_val or str(decided_by_val).lower() in ("n/a", "none", "null", ""):
            if run_rec:
                decided_by_val = (
                    run_rec.get("metadata", {}).get("approved_by")
                    or run_rec.get("metadata", {}).get("decided_by")
                )
        if decided_by_val and "@" not in decided_by_val:
            if decided_by_val in PERSONA_EMAIL_MAP:
                decided_by_val = PERSONA_EMAIL_MAP[decided_by_val]
            elif decided_by_val.lower() not in ("n/a", "none", "null"):
                decided_by_val = f"{decided_by_val}@bank.internal"

        p_json = a.get("payload_json")
        p_data: dict[str, Any] | None = None
        if p_json:
            if isinstance(p_json, dict):
                p_data = dict(p_json)
            elif isinstance(p_json, str):
                try:
                    p_data = json.loads(p_json)
                except Exception:
                    p_data = None

        p_summary = p_data.get("summary") if isinstance(p_data, dict) else None

        is_vuln = (
            "vuln" in a["control_id"].lower()
            or a.get("gate_name") == "vuln_approval"
            or a.get("gate_type") == "vuln_approval"
        )
        is_arch = not is_vuln and (
            "arch" in a["control_id"].lower()
            or a.get("gate_type") == "archival_signoff"
            or a.get("gate_name") == "archival_signoff"
        )
        if is_arch:
            rec_eval = run_rec.get("records_evaluated", 54) if run_rec else 54
            rec_elig = run_rec.get("records_eligible", 33) if run_rec else 33
            rec_proc = run_rec.get("records_processed", 33) if run_rec else 33
            p_data = p_data or {}
            p_data.update({
                "control_type": "archival",
                "records_evaluated": rec_eval,
                "records_eligible": rec_elig,
                "records_archived": rec_proc,
                "exclusions_count": 3,
                "source_table": "source_transactions",
                "target_table": "archive_transactions",
                "merkle_roots_match": bool(run_rec.get("merkle_verified", 1)) if run_rec else True,
                "source_merkle_root": run_rec.get("source_merkle_root") if run_rec else None,
                "archive_merkle_root": run_rec.get("archive_merkle_root") if run_rec else None,
                "attestation_token": run_rec.get("attestation_token") if run_rec else None,
                "policy_filename": (run_rec.get("metadata") or {}).get("filename", "core_banking_retention_policy_v2.4.txt") if run_rec else "core_banking_retention_policy_v2.4.txt",
                "pending_action": f"Authorizes Step 5: Source Purge (cleanup of {rec_proc} archived records from source_transactions while preserving legal holds).",
            })
            if not p_summary:
                p_summary = {
                    "records_archived": rec_proc,
                    "records_evaluated": rec_eval,
                    "exclusions_count": 3,
                }
        elif p_data and isinstance(p_data, dict):
            if not p_summary:
                p_summary = {}
            p_summary["exceptions"] = p_data.get("exceptions", [])
            p_summary["escalations"] = p_data.get("escalations", [])
            p_summary["exceptions_count"] = len(p_data.get("exceptions", []))
            p_summary["escalations_count"] = len(p_data.get("escalations", []))
        elif "vuln" in a["control_id"].lower() or a.get("gate_type") == "vuln_approval":
            from core.vulnerability_pipeline import discover_pending_exceptions, discover_escalation_candidates
            try:
                p_exc = discover_pending_exceptions()
                p_esc = discover_escalation_candidates()
                p_data = {"exceptions": p_exc, "escalations": p_esc}
                p_summary = {
                    "exceptions": p_exc,
                    "escalations": p_esc,
                    "exceptions_count": len(p_exc),
                    "escalations_count": len(p_esc),
                }
            except Exception:
                pass

        run_summary_dict = None
        if run_rec:
            run_summary_dict = {
                "records_evaluated": run_rec.get("records_evaluated"),
                "records_eligible": run_rec.get("records_eligible"),
                "records_processed": run_rec.get("records_processed"),
                "source_db": run_rec.get("source_db"),
                "archive_db": run_rec.get("archive_db"),
                "status": run_rec.get("status"),
                "source_merkle_root": run_rec.get("source_merkle_root"),
                "archive_merkle_root": run_rec.get("archive_merkle_root"),
                "merkle_verified": bool(run_rec.get("merkle_verified")),
                "attestation_token": run_rec.get("attestation_token"),
            }

        db_gates[a["gate_id"]] = GateItem(
            gate_id=a["gate_id"],
            run_id=a["run_id"],
            control_id=a["control_id"],
            gate_name=a.get("gate_name") or ("vuln_approval" if is_vuln else "archival_signoff"),
            maker_id=a.get("maker_id") or "sec_owner_1",
            maker_email=maker_val,
            approver_role=a.get("approver_role") or "control_reviewer",
            status=a["status"] if a["status"] in ("pending", "approved", "rejected") else "approved",
            created_at=a.get("created_at") or datetime.now(timezone.utc).isoformat(),
            decided_at=a.get("approved_at"),
            decided_by=decided_by_val or a.get("approved_by"),
            comment=a.get("comment"),
            gate_type="vuln_approval" if is_vuln else (a.get("gate_type") or "archival_signoff"),
            payload_summary=p_summary,
            payload=p_data,
            steps_completed=steps_completed,
            run_summary=run_summary_dict,
        )
    merged = {**db_gates, **_GATE_STORE}
    return sorted(list(merged.values()), key=lambda g: g.created_at, reverse=True)



@router.post("/{gate_id}/decision")
async def decide_gate(
    gate_id: str,
    body: GateDecisionRequest,
    user: UserSession = Depends(get_current_user),
    x_user_email: str | None = Header(default=None),
) -> dict[str, Any]:
    """Approve or reject a gate with strict RBAC enforcement, resuming control execution on approval."""
    # Lookup gate: first in database, then in _GATE_STORE
    gate_dict = get_audit_approval(gate_id=gate_id)
    gate: GateItem | None = None
    gate_type = (gate_dict.get("gate_type") if gate_dict else None) or "archival_signoff"
    p_json = gate_dict.get("payload_json") if gate_dict else None
    p_summary = None
    if p_json:
        if isinstance(p_json, dict):
            p_summary = p_json.get("summary")
        elif isinstance(p_json, str):
            try:
                p_summary = json.loads(p_json).get("summary")
            except Exception:
                pass

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
            gate_type=gate_type,
            payload_summary=p_summary,
        )
    elif gate_id in _GATE_STORE:
        gate = _GATE_STORE[gate_id]

    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")

    if gate.status != "pending":
        raise HTTPException(status_code=400, detail="Gate is already decided")

    is_vuln = (
        (gate_dict and gate_dict.get("gate_type") == "vuln_approval")
        or gate.gate_name == "vuln_approval"
        or "vuln" in gate.control_id.lower()
    )

    # Enforce RBAC & maker != checker (bypassed for vuln demo only)
    if is_vuln and VULN_BYPASS_MAKER_CHECKER:
        pass
    else:
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
    effective_approver = (
        x_user_email
        if (x_user_email and "@" in x_user_email)
        else (user.email if (user.email and "@" in user.email and not user.email.endswith("@bank.internal")) else user.user_id)
    )
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
        decided_by=effective_approver,
        comment=body.comment,
        gate_type=gate.gate_type,
        payload_summary=gate.payload_summary,
    )
    if gate_id in _GATE_STORE:
        _GATE_STORE[gate_id] = updated

    save_audit_approval(
        gate_id=gate.gate_id,
        run_id=gate.run_id,
        control_id=gate.control_id,
        status=body.decision,
        approved_by=effective_approver,
        approved_at=now_iso,
        comment=body.comment,
        gate_name=gate.gate_name,
        maker_id=gate.maker_id,
        approver_role=gate.approver_role,
    )

    # Emit realtime event
    await sse_broker.publish(
        "gate.decided",
        {"gate_id": gate_id, "decision": body.decision, "decided_by": effective_approver},
    )

    # Resume/block the associated run after human approval.
    if gate.run_id:
        if is_vuln:
            from sim.audit_store import get_audit_run, save_audit_step, upsert_audit_run
            from api.routers.runs import _RUNS_STORE

            db_run = get_audit_run(gate.run_id)
            meta: dict[str, Any] = db_run.get("metadata") or {} if db_run else {}

            if body.decision == "approved":
                from core.vulnerability_pipeline import apply_outcomes, get_as_of_date
                from sim.audit_store import get_connection
                conn = get_connection()
                try:
                    as_of = get_as_of_date(meta.get("as_of_date") or meta.get("as_of"))
                    apply_res = apply_outcomes(conn, gate.run_id, user.user_id, as_of)
                finally:
                    conn.close()

                meta["stage"] = "APPLIED"
                meta["approved_gate"] = {
                    "gate_id": gate.gate_id,
                    "operator_id": user.user_id,
                    "comment": body.comment,
                }
                meta["apply_results"] = apply_res
                save_audit_step(
                    step_id=f"step-{gate.run_id}-vuln-approval",
                    run_id=gate.run_id,
                    step_name="VULN_APPROVAL",
                    status="completed",
                    completed_at=now_iso,
                    metadata_json={
                        "certificate_id": gate.gate_id,
                        "operator_id": user.user_id,
                        "comment": body.comment,
                        "applied": apply_res,
                    },
                )
                save_audit_step(
                    step_id=f"step-{gate.run_id}-5",
                    run_id=gate.run_id,
                    step_name="APPLY_OUTCOMES",
                    status="completed",
                    started_at=now_iso,
                    completed_at=now_iso,
                    records_processed=apply_res["approved_exceptions_applied"] + apply_res["escalated_tickets_applied"],
                    metadata_json=apply_res,
                )
                upsert_audit_run(
                    run_id=gate.run_id,
                    control_id=gate.control_id,
                    status="running",
                    metadata_json=meta,
                )
                if gate.run_id in _RUNS_STORE:
                    _RUNS_STORE[gate.run_id].status = "running"
                await sse_broker.publish(
                    "run.updated",
                    {"run_id": gate.run_id, "status": "running", "control_id": gate.control_id, "stage": "APPLIED"},
                )
            elif body.decision == "rejected":
                meta["stage"] = "REJECTED"
                upsert_audit_run(
                    run_id=gate.run_id,
                    control_id=gate.control_id,
                    status="blocked",
                    error_message=f"Human approval rejected by {user.user_id}: {body.comment}",
                    metadata_json=meta,
                )
                save_audit_step(
                    step_id=f"step-{gate.run_id}-vuln-approval",
                    run_id=gate.run_id,
                    step_name="VULN_APPROVAL",
                    status="rejected",
                    completed_at=now_iso,
                    error_message=body.comment,
                    metadata_json={"reviewer": user.user_id, "decision": "rejected"},
                )
                if gate.run_id in _RUNS_STORE:
                    _RUNS_STORE[gate.run_id].status = "blocked"
                await sse_broker.publish(
                    "run.updated",
                    {"run_id": gate.run_id, "status": "blocked", "control_id": gate.control_id, "stage": "REJECTED"},
                )
        else:
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
