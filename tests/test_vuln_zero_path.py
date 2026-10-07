"""Tests for zero-candidate ticketing path, rerun_review idempotency, and stage guards."""

import pytest
from fastapi.testclient import TestClient

from api.main import app
from sim.vuln_schema import reseed_vulnerability_tables, get_core_connection

client = TestClient(app)
VULN_CONTROL_ID = "CTL" + "-" + "VULN-001"


@pytest.fixture(autouse=True)
def ensure_fresh_seed():
    """Seed fresh planted defect state before each test, and restore it after."""
    reseed_vulnerability_tables()
    yield
    reseed_vulnerability_tables()


def test_rerun_review_preserves_run_id_and_guard():
    """Test that rerun_review keeps the same run_id in EVALUATED stage and returns 409 once TICKETED."""
    # 1. Start a run
    resp = client.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID},
    )
    assert resp.status_code == 200
    run_id = resp.json()["run_id"]
    assert resp.json()["stage"] == "EVALUATED"

    # 2. Rerun review
    rerun_resp = client.post(
        "/vulnerability/run/rerun_review",
        json={"run_id": run_id},
    )
    assert rerun_resp.status_code == 200
    rerun_data = rerun_resp.json()
    assert rerun_data["run_id"] == run_id  # Preserves exact run_id
    assert rerun_data["stage"] == "EVALUATED"
    assert rerun_data["review_snapshot"]["review_executed"] is True

    # 3. Advance to TICKETED
    ticket_resp = client.post(
        "/vulnerability/run/ticket",
        json={"run_id": run_id},
    )
    assert ticket_resp.status_code == 200
    assert ticket_resp.json()["stage"] == "TICKETED"

    # 4. Attempt rerun_review after TICKETED -> must return 409 Conflict
    conflict_resp = client.post(
        "/vulnerability/run/rerun_review",
        json={"run_id": run_id},
    )
    assert conflict_resp.status_code == 409


def test_zero_candidate_ticketing_lifecycle():
    """Test that a run with zero candidate tickets completes the entire lifecycle cleanly."""
    # First, run a ticketing step so all 4 untracked findings are ticketed in the DB
    resp1 = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert resp1.status_code == 200
    run1_id = resp1.json()["run_id"]
    ticket1_resp = client.post("/vulnerability/run/ticket", json={"run_id": run1_id})
    assert ticket1_resp.status_code == 200
    assert ticket1_resp.json()["created_count"] == 4

    # Now start a second run: there are now ZERO untracked findings needing tickets
    resp2 = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert resp2.status_code == 200
    run2_id = resp2.json()["run_id"]
    snap2 = resp2.json()["review_snapshot"]
    assert snap2["q4_ticket_coverage"]["candidate_count"] == 0

    # Execute ticketing on zero candidates -> should return 200, created_count 0, stage TICKETED
    ticket2_resp = client.post("/vulnerability/run/ticket", json={"run_id": run2_id})
    assert ticket2_resp.status_code == 200
    ticket2_data = ticket2_resp.json()
    assert ticket2_data["created_count"] == 0
    assert ticket2_data["stage"] == "TICKETED"

    # Verify ticketing -> should PASS with 0 reconciled
    ver_resp = client.post("/vulnerability/run/verify", json={"run_id": run2_id})
    assert ver_resp.status_code == 200
    ver_data = ver_resp.json()
    assert ver_data["stage"] == "VERIFIED"
    assert ver_data["verification_results"]["verified"] is True

    # Request approval -> gate created or skipped depending on pending exceptions/escalations
    appr_resp = client.post(
        "/vulnerability/run/request_approval",
        json={"run_id": run2_id, "user_id": "test_user"},
    )
    assert appr_resp.status_code == 200
    appr_data = appr_resp.json()
    assert appr_data["stage"] in ("APPROVAL_PENDING", "APPLIED")

    if appr_data["stage"] == "APPROVAL_PENDING":
        approve_resp = client.post(
            "/vulnerability/run/approve",
            json={"run_id": run2_id, "approver_id": "test_approver", "notes": "Approved in test"},
        )
        assert approve_resp.status_code == 200
        assert approve_resp.json()["stage"] == "APPROVED"

        apply_resp = client.post("/vulnerability/run/apply", json={"run_id": run2_id})
        assert apply_resp.status_code == 200
        assert apply_resp.json()["stage"] == "APPLIED"

    # Finalize -> completes to FINALIZED
    fin_resp = client.post("/vulnerability/run/finalize", json={"run_id": run2_id})
    assert fin_resp.status_code == 200
    fin_data = fin_resp.json()
    assert fin_data["stage"] == "FINALIZED"
    assert fin_data["control_assessment"]["overall_grade"] in ("Effective", "Ineffective", "Needs Improvement")


def test_zero_approval_items_skips_directly_to_applied():
    """When no pending exceptions or escalations exist, request_approval skips straight to APPLIED."""
    resp = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert resp.status_code == 200
    run_id = resp.json()["run_id"]

    # Ticket & verify
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})

    # Clear pending exceptions and push all ticket due dates into future
    conn = get_core_connection()
    cur = conn.cursor()
    cur.execute("UPDATE vuln_exceptions SET status = 'APPROVED'")
    cur.execute("UPDATE vuln_tickets SET due_date = '2099-01-01'")
    conn.commit()
    conn.close()

    # Request approval -> must skip directly to APPLIED
    appr_resp = client.post(
        "/vulnerability/run/request_approval",
        json={"run_id": run_id, "user_id": "test_user"},
    )
    assert appr_resp.status_code == 200
    assert appr_resp.json()["stage"] == "APPLIED"
    assert appr_resp.json().get("skipped") is True
