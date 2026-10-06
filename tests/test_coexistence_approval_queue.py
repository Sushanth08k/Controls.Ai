import pytest
from fastapi.testclient import TestClient

from api.main import app
from sim.database import reseed_compliance_databases
from sim.audit_store import init_audit_tables

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    init_audit_tables()
    reseed_compliance_databases()
    yield


def test_archival_and_vuln_coexist_in_approval_queue():
    """Verify that an archival run and a vuln run sit together in the approval queue

    and can be approved independently without interfering with each other.
    """
    # 1. Start an archival run and advance to verification (creates gate)
    int_res = client.post("/interactive/interpret", json={"control_id": "CTL-ARCH-001"})
    assert int_res.status_code == 200
    arch_run_id = int_res.json()["run_id"]
    client.post("/interactive/preview", json={"control_id": "CTL-ARCH-001", "run_id": arch_run_id})
    client.post("/interactive/execute_step", json={"control_id": "CTL-ARCH-001", "run_id": arch_run_id})
    ver_res = client.post("/interactive/verify_archival", json={"control_id": "CTL-ARCH-001", "run_id": arch_run_id})
    assert ver_res.status_code == 200
    arch_gate_id = ver_res.json()["gate_id"]

    # 2. Start a vuln run and advance to gate
    vuln_start = client.post("/vulnerability/run/start", json={"control_id": "CTL-VULN-001"})
    assert vuln_start.status_code == 200
    vuln_run_id = vuln_start.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": vuln_run_id})
    client.post("/vulnerability/run/verify", json={"run_id": vuln_run_id})
    vuln_gate_resp = client.post("/vulnerability/run/request_approval", json={"run_id": vuln_run_id, "requested_by": "sec_reviewer_1"})
    assert vuln_gate_resp.status_code == 200
    vuln_gate_id = vuln_gate_resp.json()["gate_id"]

    # 3. List gates -> both must be present in queue as pending
    gates_resp = client.get("/gates")
    assert gates_resp.status_code == 200
    pending_gate_ids = [g["gate_id"] for g in gates_resp.json() if g["status"] == "pending"]
    assert arch_gate_id in pending_gate_ids
    assert vuln_gate_id in pending_gate_ids

    # Check that gate_type and payload_summary are properly differentiated
    vuln_item = next(g for g in gates_resp.json() if g["gate_id"] == vuln_gate_id)
    arch_item = next(g for g in gates_resp.json() if g["gate_id"] == arch_gate_id)
    assert vuln_item["control_id"] == "CTL-VULN-001"
    assert vuln_item["gate_type"] == "vuln_approval"
    assert vuln_item["payload_summary"] is not None

    assert arch_item["control_id"] == "CTL-ARCH-001"
    assert arch_item["gate_type"] == "archival_signoff"

    # 4. Decide vuln gate first (bypass maker-checker: requested_by is sec_reviewer_1, decided_by can also be sec_reviewer_1)
    decide_vuln = client.post(
        f"/gates/{vuln_gate_id}/decision",
        json={"decision": "approved", "comment": "Vuln exceptions authorized"},
        headers={"X-User-Roles": "security_reviewer"},
    )
    assert decide_vuln.status_code == 200

    # Verify vuln gate is approved, archival gate is still pending
    gates_resp2 = client.get("/gates")
    active_gate_ids = [g["gate_id"] for g in gates_resp2.json() if g["status"] == "pending"]
    assert arch_gate_id in active_gate_ids
    assert vuln_gate_id not in active_gate_ids

    # 5. Decide archival gate (must follow strict maker-checker: maker is sec_owner_1, approver must be different)
    decide_arch = client.post(
        f"/gates/{arch_gate_id}/decision",
        json={"decision": "approved", "comment": "Archival approved"},
        headers={"X-User-Id": "sec_reviewer_1", "X-User-Roles": "control_reviewer"},
    )
    assert decide_arch.status_code == 200

    # Verify neither is pending now
    gates_resp3 = client.get("/gates")
    remaining_pending = [g["gate_id"] for g in gates_resp3.json() if g["status"] == "pending"]
    assert arch_gate_id not in remaining_pending
    assert vuln_gate_id not in remaining_pending

    # 6. Apply outcomes on both independently
    # Vuln apply
    apply_vuln = client.post("/vulnerability/run/apply", json={"run_id": vuln_run_id})
    assert apply_vuln.status_code == 200
    # Archival purge
    purge_arch = client.post(
        "/interactive/cleanup",
        json={
            "control_id": "CTL-ARCH-001",
            "run_id": arch_run_id,
            "attestation_token": f"ATTEST-{arch_run_id}",
            "operator_comment": "Approved cleanup execution",
            "operator_id": "sec_reviewer_1",
        },
    )
    assert purge_arch.status_code == 200
