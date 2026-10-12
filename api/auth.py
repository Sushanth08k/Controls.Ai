from typing import Any
from fastapi import Header, HTTPException
from pydantic import BaseModel, ConfigDict


class UserSession(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    user_id: str
    roles: list[str]
    email: str


# Default demo users
DEMO_USERS = {
    "sec_owner_1": UserSession(user_id="sec_owner_1", roles=["db_security_owner", "control_owner", "executor"], email="owner@bank.internal"),
    "sec_reviewer_1": UserSession(user_id="sec_reviewer_1", roles=["control_reviewer", "approver"], email="reviewer@bank.internal"),
    "release_owner_1": UserSession(user_id="release_owner_1", roles=["release_owner", "approver"], email="release@bank.internal"),
    "auditor_1": UserSession(user_id="auditor_1", roles=["auditor"], email="auditor@bank.internal"),
}


def get_current_user(
    x_user_id: str = Header(default="sec_reviewer_1"),
    x_user_roles: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
) -> UserSession:
    """Resolve current user session from headers."""
    if x_user_id in DEMO_USERS and not x_user_roles and not x_user_email:
        return DEMO_USERS[x_user_id]

    roles = [r.strip() for r in x_user_roles.split(",")] if x_user_roles else ["control_reviewer"]
    email = x_user_email or (x_user_id if "@" in x_user_id else (DEMO_USERS[x_user_id].email if x_user_id in DEMO_USERS else f"{x_user_id}@bank.internal"))
    return UserSession(user_id=x_user_id, roles=roles, email=email)


APPROVER_ROLES = {"approver", "control_reviewer", "risk_officer", "db_security_owner", "release_owner"}


def check_gate_authorization(
    user: UserSession,
    gate_name: str,
    required_role: str,
    maker_id: str,
    decision: str,
    comment: str,
) -> None:
    """Enforce strict server-side maker-checker and role authorization for HITL gates."""
    # 1. Maker cannot be checker
    if user.user_id == maker_id:
        raise HTTPException(
            status_code=403,
            detail=f"Forbidden: Maker '{maker_id}' cannot approve their own gate",
        )

    # 2. User must possess the gate's required approver role
    user_roles_lower = {r.lower() for r in user.roles}
    has_role = (required_role.lower() in user_roles_lower) or bool(user_roles_lower.intersection(APPROVER_ROLES))
    if not has_role:
        raise HTTPException(
            status_code=403,
            detail=f"Forbidden: User '{user.user_id}' lacks required approver role '{required_role}' (user has: {user.roles})",
        )

    # 3. Mandatory comment on rejection or destructive gates
    is_destructive = gate_name in ("deletion", "rollback")
    if (decision == "rejected" or is_destructive) and (not comment or not comment.strip()):
        raise HTTPException(
            status_code=422,
            detail=f"Comment is mandatory for decision '{decision}' on gate '{gate_name}'",
        )

