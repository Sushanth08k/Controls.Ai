from fastapi import HTTPException
from api.auth import UserSession


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
    if user.user_id == maker_id or (user.email and user.email == maker_id):
        raise HTTPException(
            status_code=403,
            detail=f"Forbidden: Maker '{maker_id}' cannot approve their own gate",
        )

    # 2. User must possess the gate's required approver role
    if required_role not in user.roles:
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
