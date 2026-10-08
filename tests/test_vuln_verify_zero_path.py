"""Tests for CTL-VULN-001 verify zero-path and approval transition."""

import pytest
from fastapi.testclient import TestClient

from api.main import app
from sim.vuln_schema import get_core_connection, reseed_vulnerability_tables

client = TestClient(app)
VULN_CONTROL_ID = "CTL" + "-" + "VULN-001"


@pytest.fixture(autouse=True)
def clean_seed():
    reseed_vulnerability_tables()
    yield
    reseed_vulnerability_tables()


def test_zero_candidate_verify_returns_passed_and_request_approval_transitions():
    """With zero ticket candidates, /run/verify returns passed=true, and /run/request_approval succeeds or skips to APPLIED."""
    # 1. Run ticketing on first run to provision tickets for all 4 candidate findings
    res1 = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert res1.status_code == 200
    run1_id = res1.json()["run_id"]
    tkt1_res = client.post("/vulnerability/run/ticket", json={"run_id": run1_id})
    assert tkt1_res.status_code == 200
    assert tkt1_res.json()["created_count"] == 4

    # 2. Start a second run: exactly zero untracked candidates exist now
    res2 = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert res2.status_code == 200
    run2_id = res2.json()["run_id"]
    assert res2.json()["review_snapshot"]["q2_ticket_coverage"]["candidate_count"] == 0

    # 3. Ticket second run -> 0 tickets provisioned
    tkt2_res = client.post("/vulnerability/run/ticket", json={"run_id": run2_id})
    assert tkt2_res.status_code == 200
    assert tkt2_res.json()["stage"] == "TICKETED"
    assert tkt2_res.json()["created_count"] == 0

    # 4. Verify ticketing -> must return passed=True and "Nothing to reconcile"
    verify_res = client.post("/vulnerability/run/verify", json={"run_id": run2_id})
    assert verify_res.status_code == 200
    vdata = verify_res.json()
    assert vdata["run_id"] == run2_id
    assert vdata["stage"] == "VERIFIED"
    assert vdata["passed"] is True
    assert vdata["verified"] is True
    assert vdata["required_count"] == 0
    assert vdata["created_count"] == 0
    assert vdata["mismatch_count"] == 0
    assert vdata["verification_results"]["passed"] is True
    assert vdata["verification_results"]["required_count"] == 0
    assert vdata["verification_results"]["created_count"] == 0
    assert "Nothing to reconcile" in vdata["verification_results"]["verification_banner"]

    # 5. Idempotent check: calling verify again preserves run_id and returns 200
    verify_res_again = client.post("/vulnerability/run/verify", json={"run_id": run2_id})
    assert verify_res_again.status_code == 200
    assert verify_res_again.json()["run_id"] == run2_id
    assert verify_res_again.json()["passed"] is True

    # 6. Request approval -> succeeds
    appr_res = client.post(
        "/vulnerability/run/request_approval",
        json={"run_id": run2_id, "user_id": "test_user"},
    )
    assert appr_res.status_code == 200
    assert appr_res.json()["stage"] in ("APPROVAL_PENDING", "APPLIED")


def test_zero_candidate_approval_skips_to_applied_when_no_pending_items():
    """When both ticket candidates and approval queue items are 0, request_approval skips straight to APPLIED."""
    # 1. Provision tickets on run1
    res1 = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run1_id = res1.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run1_id})

    # 2. Run2 has 0 candidates
    res2 = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run2_id = res2.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run2_id})

    # 3. Verify returns passed=True
    ver_res = client.post("/vulnerability/run/verify", json={"run_id": run2_id})
    assert ver_res.status_code == 200
    assert ver_res.json()["passed"] is True

    # 4. Clear pending exceptions and push due dates forward
    conn = get_core_connection()
    cur = conn.cursor()
    cur.execute("UPDATE vuln_exceptions SET status = 'APPROVED'")
    cur.execute("UPDATE vuln_tickets SET due_date = '2099-01-01'")
    conn.commit()
    conn.close()

    # 5. Request approval skips to APPLIED
    appr_res = client.post(
        "/vulnerability/run/request_approval",
        json={"run_id": run2_id, "user_id": "test_user"},
    )
    assert appr_res.status_code == 200
    assert appr_res.json()["stage"] == "APPLIED"
    assert appr_res.json()["skipped"] is True
