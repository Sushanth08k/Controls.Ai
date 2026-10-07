"""Comprehensive tests for the simplified CTL-VULN-001 6-screen, 4-check execution wizard."""

import pytest
from fastapi.testclient import TestClient

from api.main import app
from sim.database import reseed_compliance_databases
from sim.vuln_schema import get_core_connection, reseed_vulnerability_tables
from sim.audit_store import get_audit_run, list_audit_steps, get_audit_approval

client = TestClient(app)
VULN_CONTROL_ID = "CTL" + "-" + "VULN-001"


@pytest.fixture(autouse=True)
def clean_seed():
    reseed_compliance_databases()
    reseed_vulnerability_tables()
    yield
    reseed_compliance_databases()
    reseed_vulnerability_tables()


def test_fresh_seed_full_lifecycle_with_before_not_equal_after():
    """1. Fresh-seed full lifecycle to FINALIZED with before != after across attributes."""
    # Screen 1 -> Screen 2: Policy & Analysis
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert start_res.status_code == 200
    start_data = start_res.json()
    run_id = start_data["run_id"]
    assert start_data["stage"] == "EVALUATED"

    # Verify Screen 3 Review response contract has 4 checks (no scan health / scan coverage)
    snap = start_data["review_snapshot"]
    assert "q1_sla_breach" in snap
    assert "q2_ticket_coverage" in snap
    assert "q3_closure_validity" in snap
    assert "q4_exception_governance" in snap
    assert "q1_scan_health" not in snap
    assert "q2_coverage" not in snap

    # Scope strip
    scope = start_data["scope_summary"]
    assert "reconciliation_message" in scope

    # Screen 4: Tickets (Ticket candidates + Reconciliation on same screen)
    ticket_res = client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    assert ticket_res.status_code == 200
    assert ticket_res.json()["stage"] == "TICKETED"
    assert ticket_res.json()["created_count"] == 4

    verify_res = client.post("/vulnerability/run/verify", json={"run_id": run_id})
    assert verify_res.status_code == 200
    assert verify_res.json()["stage"] == "VERIFIED"
    assert verify_res.json()["passed"] is True
    assert "coverage_pct" not in verify_res.json()

    # Screen 5: Approval Gate
    app_res = client.post("/vulnerability/run/request_approval", json={"run_id": run_id})
    assert app_res.status_code == 200
    assert app_res.json()["stage"] == "APPROVAL_PENDING"
    gate_id = app_res.json()["gate"]["gate_id"]

    # Quick approve auto-applies outcomes atomically and moves stage to APPLIED
    quick_res = client.post(
        "/vulnerability/run/approve",
        json={"run_id": run_id, "gate_id": gate_id, "approver_id": "sec_lead", "comment": "Approved in wizard"},
    )
    assert quick_res.status_code == 200
    assert quick_res.json()["stage"] == "APPLIED"
    assert quick_res.json()["apply_results"]["applied"] is True
    assert quick_res.json()["apply_results"]["applied_exceptions"] >= 1
    assert quick_res.json()["apply_results"]["applied_escalations"] >= 1
    assert "UPDATE" in quick_res.json()["apply_results"]["sql"]

    # Screen 6: Result (Finalize)
    final_res = client.post("/vulnerability/run/finalize", json={"run_id": run_id})
    assert final_res.status_code == 200
    final_data = final_res.json()
    assert final_data["stage"] == "FINALIZED"
    assert final_data["status"] == "completed"

    assessment = final_data["control_assessment"]
    assert assessment["overall_grade"] in ("Effective", "Needs Improvement", "Ineffective")
    assert len(assessment["attributes"]) == 4

    # Real change on fresh seed: ticket_coverage, sla_compliance, exception_governance before != after
    attrs = assessment["attributes"]
    assert attrs["ticket_coverage"]["counts"]["before"] != attrs["ticket_coverage"]["counts"]["after"]
    assert attrs["ticket_coverage"]["counts"]["after"] < attrs["ticket_coverage"]["counts"]["before"]

    assert attrs["sla_compliance"]["counts"]["before"] != attrs["sla_compliance"]["counts"]["after"]
    assert attrs["sla_compliance"]["counts"]["after"] < attrs["sla_compliance"]["counts"]["before"]

    assert attrs["exception_governance"]["counts"]["before"] != attrs["exception_governance"]["counts"]["after"]
    assert attrs["exception_governance"]["counts"]["after"] < attrs["exception_governance"]["counts"]["before"]

    # Closure defect cannot be fixed by this run
    assert attrs["closure_validity"]["counts"]["after"] == 1
    assert attrs["closure_validity"]["status"] == "FAIL"


def test_zero_defect_lifecycle():
    """2. Zero-defect lifecycle runs smoothly to FINALIZED."""
    # Provision tickets for all untracked findings first
    r1 = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    r1_id = r1.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": r1_id})

    # Start run on zero candidate findings
    r2 = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    r2_id = r2.json()["run_id"]
    assert r2.json()["review_snapshot"]["q2_ticket_coverage"]["candidate_count"] == 0

    t2 = client.post("/vulnerability/run/ticket", json={"run_id": r2_id})
    assert t2.status_code == 200
    assert t2.json()["created_count"] == 0

    v2 = client.post("/vulnerability/run/verify", json={"run_id": r2_id})
    assert v2.status_code == 200
    assert v2.json()["passed"] is True

    # Approve and finalize
    ra2 = client.post("/vulnerability/run/request_approval", json={"run_id": r2_id})
    assert ra2.status_code == 200
    if ra2.json()["stage"] == "APPROVAL_PENDING":
        client.post("/vulnerability/run/approve", json={"run_id": r2_id})

    f2 = client.post("/vulnerability/run/finalize", json={"run_id": r2_id})
    assert f2.status_code == 200
    assert f2.json()["stage"] == "FINALIZED"


def test_rejected_gate_applies_nothing():
    """3. A rejected gate applies nothing and blocks stage advancement."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run_id = start_res.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})

    app_res = client.post("/vulnerability/run/request_approval", json={"run_id": run_id})
    gate_id = app_res.json()["gate"]["gate_id"]

    # Reject the gate via /gates/{gate_id}/decision
    headers = {"X-User-Roles": "security_reviewer"}
    dec_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "rejected", "comment": "Policy exception denied by compliance"},
        headers=headers,
    )
    assert dec_res.status_code == 200

    # Verify run is marked REJECTED and blocked
    db_run = get_audit_run(run_id)
    assert db_run["metadata"]["stage"] == "REJECTED"
    assert db_run["status"] == "blocked"

    # Attempting to apply outcomes must return 409 and apply nothing
    apply_res = client.post("/vulnerability/run/apply", json={"run_id": run_id})
    assert apply_res.status_code == 409

    # Verify exception is still PENDING_APPROVAL in db
    conn = get_core_connection()
    cur = conn.cursor()
    cur.execute("SELECT status FROM vuln_exceptions WHERE exception_id = 'EXC-2026-0003'")
    row = cur.fetchone()
    conn.close()
    assert row[0] == "PENDING_APPROVAL"


def test_approval_auto_applies_and_is_idempotent():
    """4. Approval auto-applies outcomes, moves stage to APPLIED, and calling apply again is a no-op."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run_id = start_res.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})

    app_res = client.post("/vulnerability/run/request_approval", json={"run_id": run_id})
    gate_id = app_res.json()["gate"]["gate_id"]

    # Approve
    dec_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "approved", "comment": "Approved"},
        headers={"X-User-Roles": "security_reviewer"},
    )
    assert dec_res.status_code == 200

    db_run = get_audit_run(run_id)
    assert db_run["metadata"]["stage"] == "APPLIED"
    assert "apply_results" in db_run["metadata"]
    applied_count_1 = db_run["metadata"]["apply_results"]["approved_exceptions_applied"]

    # Calling /run/apply directly is an idempotent no-op
    apply_res = client.post("/vulnerability/run/apply", json={"run_id": run_id})
    assert apply_res.status_code == 200
    assert apply_res.json()["stage"] == "APPLIED"
    assert apply_res.json()["apply_results"]["approved_exceptions_applied"] == applied_count_1


def test_resume_from_queue_lands_on_approval_screen():
    """5. Resume from queue after approval returns stage APPLIED (which maps to Screen 5 Approval)."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run_id = start_res.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})

    app_res = client.post("/vulnerability/run/request_approval", json={"run_id": run_id})
    gate_id = app_res.json()["gate"]["gate_id"]

    # Approve gate from Approvals page
    client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "approved", "comment": "Approved"},
        headers={"X-User-Roles": "security_reviewer"},
    )

    # Resume run endpoint
    resume_res = client.get(f"/vulnerability/run/resume/{run_id}")
    assert resume_res.status_code == 200
    resume_data = resume_res.json()

    # Stage is APPLIED, showing what was applied
    assert resume_data["stage"] == "APPLIED"
    assert resume_data["apply_results"] is not None
    assert resume_data["apply_results"]["applied"] is True


def test_no_archival_step_names_written_for_vuln_gates():
    """6. No archival step names (HUMAN_APPROVAL, SOURCE_CLEANUP, ARCHIVAL, MERKLE) written for vuln gates."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run_id = start_res.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})
    app_res = client.post("/vulnerability/run/request_approval", json={"run_id": run_id})
    gate_id = app_res.json()["gate"]["gate_id"]

    client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "approved", "comment": "Approved"},
        headers={"X-User-Roles": "security_reviewer"},
    )
    client.post("/vulnerability/run/finalize", json={"run_id": run_id})

    steps = list_audit_steps(run_id)
    step_names = [s["step_name"] for s in steps]

    archival_prohibited_names = [
        "HUMAN_APPROVAL",
        "SOURCE_CLEANUP",
        "ARCHIVAL",
        "MERKLE_VERIFICATION",
        "PURGE",
    ]
    for prohibited in archival_prohibited_names:
        assert prohibited not in step_names
