from collections.abc import Generator
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from api.main import app
from api.routers.gates import _GATE_STORE, GateItem

from sim.audit_store import get_connection

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_rbac_test_gates() -> Generator[None, None, None]:
    with get_connection() as conn:
        conn.cursor().execute("DELETE FROM control_approvals WHERE gate_id = 'gate-dummy-001'")
        conn.commit()

    _GATE_STORE["gate-dummy-001"] = GateItem(
        gate_id="gate-dummy-001",
        run_id="run-dummy-001",
        control_id="PILOT-ACCESS-001",
        gate_name="finding_signoff",
        maker_id="sec_owner_1",
        approver_role="control_reviewer",
        status="pending",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    yield
    _GATE_STORE.pop("gate-dummy-001", None)
    with get_connection() as conn:
        conn.cursor().execute("DELETE FROM control_approvals WHERE gate_id = 'gate-dummy-001'")
        conn.commit()


def test_api_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_api_list_controls() -> None:
    res = client.get("/controls")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_api_list_gates() -> None:
    res = client.get("/gates")
    assert res.status_code == 200
    gates = res.json()
    assert any(g["gate_id"] == "gate-dummy-001" for g in gates)


def test_maker_cannot_approve_own_gate() -> None:
    """Security Gate: The maker (sec_owner_1) attempting to approve their own gate must receive 403."""
    res = client.post(
        "/gates/gate-dummy-001/decision",
        json={"decision": "approved", "comment": "Self-approval attempt"},
        headers={"X-User-Id": "sec_owner_1", "X-User-Roles": "control_reviewer"},
    )
    assert res.status_code == 403
    assert "cannot approve their own gate" in res.json()["detail"]


def test_unauthorized_role_cannot_approve_gate() -> None:
    """Security Gate: User without required role (control_reviewer) must receive 403."""
    res = client.post(
        "/gates/gate-dummy-001/decision",
        json={"decision": "approved", "comment": "Unauthorized role attempt"},
        headers={"X-User-Id": "random_user", "X-User-Roles": "developer"},
    )
    assert res.status_code == 403
    assert "lacks required approver role" in res.json()["detail"]


def test_rejection_requires_comment() -> None:
    """Security Gate: Rejection requires a mandatory comment."""
    res = client.post(
        "/gates/gate-dummy-001/decision",
        json={"decision": "rejected", "comment": ""},
        headers={"X-User-Id": "sec_reviewer_1", "X-User-Roles": "control_reviewer"},
    )
    assert res.status_code == 422
    assert "Comment is mandatory" in res.json()["detail"]


def test_valid_approval_by_reviewer() -> None:
    """Legitimate reviewer with control_reviewer role successfully approves gate."""
    res = client.post(
        "/gates/gate-dummy-001/decision",
        json={"decision": "approved", "comment": "All superuser findings reviewed and verified"},
        headers={"X-User-Id": "sec_reviewer_1", "X-User-Roles": "control_reviewer"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["gate"]["status"] == "approved"
    assert data["gate"]["decided_by"] == "sec_reviewer_1"
