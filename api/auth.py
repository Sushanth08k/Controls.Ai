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
