from collections.abc import Generator
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from api.main import app
from sim.audit_store import get_connection, init_audit_tables, get_audit_approval, get_audit_run
from sim.database import reseed_compliance_databases

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_db() -> Generator[None, None, None]:
    init_audit_tables()
    reseed_compliance_databases()
    yield


def _create_archival_run_up_to_verification() -> tuple[str, str]:
    """Helper to run CTL-ARCH-001 through Step 1 (interpret), Step 2 (archival), Step 3 (verify)."""
    # 1. Interpret
    int_res = client.post("/interactive/interpret", json={"control_id": "CTL-ARCH-001"})
    assert int_res.status_code == 200
    run_id = int_res.json()["run_id"]

    # 2. Preview
    prev_res = client.post("/interactive/preview", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    assert prev_res.status_code == 200

    # 3. Archival Execution
    exec_res = client.post("/interactive/execute_step", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    assert exec_res.status_code == 200
    assert exec_res.json()["status"] == "ARCHIVED"

    # 4. Verification
    ver_res = client.post("/interactive/verify_archival", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    assert ver_res.status_code == 200
    ver_data = ver_res.json()
    assert ver_data["status"] == "VERIFIED"
    assert "gate_id" in ver_data
    gate_id = ver_data["gate_id"]

    return run_id, gate_id


def test_a_keep_in_queue() -> None:
    """Test A — Keep in Queue:
    - Start Data Archival and reach verification
    - Verify control_approvals contains pending record
    - Conceptual modal close: GET /gates
    - Verify exact CTL-ARCH-001 + run_id appears as pending in Approval Queue
    """
    run_id, gate_id = _create_archival_run_up_to_verification()

    # Verify pending record in control_approvals
    db_gate = get_audit_approval(gate_id=gate_id)
    assert db_gate is not None
    assert db_gate["run_id"] == run_id
    assert db_gate["control_id"] == "CTL-ARCH-001"
    assert db_gate["status"] == "pending"
    assert db_gate["maker_id"] == "sec_owner_1"
    assert db_gate["approver_role"] == "control_reviewer"

    # Verify visible in /gates (Approval Queue)
    gates_res = client.get("/gates", headers={"X-User-Id": "sec_reviewer_1", "X-User-Roles": "control_reviewer"})
    assert gates_res.status_code == 200
    gates = gates_res.json()
    pending_for_run = [g for g in gates if g["run_id"] == run_id and g["status"] == "pending"]
    assert len(pending_for_run) == 1
    assert pending_for_run[0]["gate_id"] == gate_id
    assert pending_for_run[0]["control_id"] == "CTL-ARCH-001"


def test_b_queue_approval() -> None:
    """Test B — Queue Approval:
    - Create pending approval for a real run
    - Approve it through /gates/{gate_id}/decision ("Review & Approve")
    - Verify approval becomes approved
    - Verify approval does NOT complete run or delete source records prematurely
    - Verify exact run is resumed at Step 5 (stage APPROVED)
    - Verify cleanup executes and source records are deleted ONLY during Step 5 cleanup
    - Verify final status is completed
    """
    run_id, gate_id = _create_archival_run_up_to_verification()

    # Verify source records are NOT yet deleted while pending
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM source_transactions")
        initial_source_count = cur.fetchone()[0]
    assert initial_source_count >= 33

    # Reviewer approves from queue ("Review & Approve")
    appr_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "approved", "comment": "Approved by compliance reviewer"},
        headers={"X-User-Id": "sec_reviewer_1", "X-User-Roles": "control_reviewer"},
    )
    assert appr_res.status_code == 200
    appr_data = appr_res.json()
    assert appr_data["status"] == "ok"
    assert appr_data["gate"]["status"] == "approved"

    # Verify approval state in DB
    db_gate = get_audit_approval(gate_id=gate_id)
    assert db_gate is not None
    assert db_gate["status"] == "approved"
    assert db_gate["approved_by"] == "sec_reviewer_1"

    # CRITICAL: Verify approval decision does NOT mark run completed prematurely!
    run_info = get_audit_run(run_id)
    assert run_info is not None
    assert run_info["status"] == "running"

    # CRITICAL: Verify source records are NOT yet purged upon approval
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM source_transactions")
        during_approval_count = cur.fetchone()[0]
    assert during_approval_count == initial_source_count

    # Resume exact run - verify session stage is APPROVED and next_step is 5
    resume_res = client.get(f"/interactive/resume/{run_id}")
    assert resume_res.status_code == 200
    resume_data = resume_res.json()
    assert resume_data["stage"] == "APPROVED"
    assert resume_data["next_step"] == 5

    # Step 5: Execute Source Cleanup
    clean_res = client.post(
        "/interactive/cleanup",
        json={
            "control_id": "CTL-ARCH-001",
            "run_id": run_id,
            "attestation_token": f"ATTEST-{run_id}",
            "operator_comment": "Approved cleanup execution",
            "operator_id": "sec_reviewer_1",
        },
    )
    assert clean_res.status_code == 200
    assert clean_res.json()["status"] == "completed"
    assert clean_res.json()["deleted_count"] == 33

    # Verify cleanup executed and run is completed
    run_info_after = get_audit_run(run_id)
    assert run_info_after is not None
    assert run_info_after["status"] == "completed"
    assert run_info_after["records_affected"] == 33

    # Verify source records deleted in DB ONLY after cleanup
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM source_transactions")
        remaining_source = cur.fetchone()[0]
    assert remaining_source == initial_source_count - 33


def test_c_rejection() -> None:
    """Test C — Rejection:
    - Create pending approval
    - Reject it with comment
    - Verify status = rejected
    - Verify source records remain untouched (50 records)
    - Verify cleanup does NOT execute
    - Verify run is marked 'blocked'
    """
    run_id, gate_id = _create_archival_run_up_to_verification()

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM source_transactions")
        initial_source_count = cur.fetchone()[0]

    # Reviewer rejects from queue
    rej_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "rejected", "comment": "Rejected due to legal hold audit"},
        headers={"X-User-Id": "sec_reviewer_1", "X-User-Roles": "control_reviewer"},
    )
    assert rej_res.status_code == 200
    assert rej_res.json()["gate"]["status"] == "rejected"

    # Verify DB gate
    db_gate = get_audit_approval(gate_id=gate_id)
    assert db_gate is not None
    assert db_gate["status"] == "rejected"
    assert "legal hold audit" in db_gate["comment"]

    # Verify run marked blocked
    run_info = get_audit_run(run_id)
    assert run_info is not None
    assert run_info["status"] == "blocked"

    # Verify source records remain 100% intact (zero deleted)
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM source_transactions")
        source_count = cur.fetchone()[0]
    assert source_count == initial_source_count


def test_d_quick_approval() -> None:
    """Test D — Quick Approval:
    - Reach Human Approval
    - Quick Approve (/interactive/approve_gate)
    - Verify approval is persisted as approved
    - Verify run remains running and records NOT deleted prematurely
    - Continue to Step 5 (/interactive/cleanup)
    - Verify cleanup executes and completes run
    """
    run_id, gate_id = _create_archival_run_up_to_verification()

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM source_transactions")
        initial_source_count = cur.fetchone()[0]

    # Step 4: Quick Approve
    appr_res = client.post(
        "/interactive/approve_gate",
        json={
            "control_id": "CTL-ARCH-001",
            "run_id": run_id,
            "attestation_token": f"ATTEST-{run_id}",
            "operator_comment": "Quick approval by lead reviewer",
            "operator_id": "sec_reviewer_1",
        },
    )
    assert appr_res.status_code == 200
    assert appr_res.json()["status"] == "APPROVED"

    # Verify gate in DB is approved
    db_gate = get_audit_approval(gate_id=gate_id)
    assert db_gate is not None
    assert db_gate["status"] == "approved"
    assert db_gate["approved_by"] == "sec_reviewer_1"

    # Verify run is STILL running (not prematurely completed)
    run_info = get_audit_run(run_id)
    assert run_info is not None
    assert run_info["status"] == "running"

    # Verify source records untouched before Step 5
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM source_transactions")
        assert cur.fetchone()[0] == initial_source_count

    # Step 5: Continue to cleanup
    clean_res = client.post(
        "/interactive/cleanup",
        json={
            "control_id": "CTL-ARCH-001",
            "run_id": run_id,
            "attestation_token": f"ATTEST-{run_id}",
            "operator_comment": "Quick approval by lead reviewer",
            "operator_id": "sec_reviewer_1",
        },
    )
    assert clean_res.status_code == 200
    assert clean_res.json()["status"] == "completed"
    assert clean_res.json()["deleted_count"] == 33

    run_info = get_audit_run(run_id)
    assert run_info is not None
    assert run_info["status"] == "completed"


def test_e_duplicate_gate_prevention() -> None:
    """Test E — Duplicate Gate Prevention:
    - Trigger verification more than once for the same run
    - Verify only one logical pending approval exists
    """
    int_res = client.post("/interactive/interpret", json={"control_id": "CTL-ARCH-001"})
    run_id = int_res.json()["run_id"]
    client.post("/interactive/execute_step", json={"control_id": "CTL-ARCH-001", "run_id": run_id})

    # Call verify_archival multiple times
    res1 = client.post("/interactive/verify_archival", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    res2 = client.post("/interactive/verify_archival", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    res3 = client.post("/interactive/verify_archival", json={"control_id": "CTL-ARCH-001", "run_id": run_id})

    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res3.status_code == 200

    # Ensure same gate_id was returned
    gate1 = res1.json()["gate_id"]
    gate2 = res2.json()["gate_id"]
    gate3 = res3.json()["gate_id"]
    assert gate1 == gate2 == gate3

    # Check database only has 1 record for this run_id
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM control_approvals WHERE run_id = ?", (run_id,))
        count = cur.fetchone()[0]
    assert count == 1


def test_f_maker_checker() -> None:
    """Test F — Maker Checker:
    - Maker attempts approval -> 403
    - User without required role attempts approval -> 403
    - Rejection without comment -> 422
    """
    run_id, gate_id = _create_archival_run_up_to_verification()

    # 1. Maker attempts approval
    maker_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "approved", "comment": "Maker attempting self-approval"},
        headers={"X-User-Id": "sec_owner_1", "X-User-Roles": "control_reviewer"},
    )
    assert maker_res.status_code == 403
    assert "cannot approve their own gate" in maker_res.json()["detail"]

    # 2. Missing role
    norole_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "approved", "comment": "Unauthorized attempt"},
        headers={"X-User-Id": "developer_1", "X-User-Roles": "developer"},
    )
    assert norole_res.status_code == 403
    assert "lacks required approver role" in norole_res.json()["detail"]

    # 3. Rejection without comment
    nocomm_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "rejected", "comment": ""},
        headers={"X-User-Id": "sec_reviewer_1", "X-User-Roles": "control_reviewer"},
    )
    assert nocomm_res.status_code == 422
    assert "Comment is mandatory" in nocomm_res.json()["detail"]


def test_g_empty_queue() -> None:
    """Test G — Empty Queue:
    - When no real pending approvals exist:
      Approval Queue shows 0 pending approvals
    - No run-dummy-001 appears as pending
    """
    # Ensure no lingering pending gates in DB for clean empty queue test
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM control_approvals WHERE status = 'pending'")
        conn.commit()

    gates_res = client.get("/gates", headers={"X-User-Id": "sec_reviewer_1", "X-User-Roles": "control_reviewer"})
    assert gates_res.status_code == 200
    gates = gates_res.json()

    # Count pending gates
    pending_gates = [g for g in gates if g["status"] == "pending"]
    assert len(pending_gates) == 0

    # Ensure no dummy gate is in pending
    assert not any(g["run_id"] == "run-dummy-001" and g["status"] == "pending" for g in gates)
