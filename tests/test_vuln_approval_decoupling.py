from fastapi.testclient import TestClient
from api.main import app
from sim.database import reseed_compliance_databases
from sim.audit_store import get_audit_run, list_audit_steps, get_audit_approval


def setup_function():
    reseed_compliance_databases()


def test_vuln_gate_decision_never_writes_archival_step_names():
    """Verify vuln gate decision writes VULN_APPROVAL and never archival HUMAN_APPROVAL step-*-4."""
    client = TestClient(app)

    # Start run through approval stage
    start_res = client.post("/vulnerability/run/start", json={"control_id": "CTL-VULN-001"})
    run_id = start_res.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})
    app_res = client.post("/vulnerability/run/request_approval", json={"run_id": run_id, "maker_id": "sec_maker_1"})
    gate_id = app_res.json()["gate"]["gate_id"]

    # Decide gate via shared approval queue /gates/{gate_id}/decision
    headers = {"x-user-id": "sec_reviewer_2", "x-roles": "control_reviewer"}
    dec_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "approved", "comment": "Approved through queue"},
        headers=headers,
    )
    assert dec_res.status_code == 200

    # Verify steps
    steps = list_audit_steps(run_id)
    step_names = [s["step_name"] for s in steps]
    step_ids = [s["step_id"] for s in steps]

    assert "VULN_APPROVAL" in step_names
    assert "HUMAN_APPROVAL" not in step_names
    assert f"step-{run_id}-vuln-approval" in step_ids
    assert f"step-{run_id}-4" not in step_ids

    # Verify run stage is updated to APPROVED
    db_run = get_audit_run(run_id)
    assert db_run["metadata"]["stage"] == "APPROVED"


def test_vuln_maker_checker_bypass():
    """Verify demo simplification: maker-checker is bypassed for vuln gates only."""
    client = TestClient(app)

    start_res = client.post("/vulnerability/run/start", json={"control_id": "CTL-VULN-001"})
    run_id = start_res.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})
    app_res = client.post("/vulnerability/run/request_approval", json={"run_id": run_id, "maker_id": "sec_operator"})
    gate_id = app_res.json()["gate"]["gate_id"]

    # Same user approves (maker == checker)
    headers = {"x-user-id": "sec_operator", "x-roles": "security_reviewer"}
    dec_res = client.post(
        f"/gates/{gate_id}/decision",
        json={"decision": "approved", "comment": "Self-approved for demo"},
        headers=headers,
    )
    assert dec_res.status_code == 200
    gate = get_audit_approval(gate_id)
    assert gate["status"] == "approved"
    assert gate["approved_by"] == "sec_operator"


def test_list_gates_exposes_gate_type_and_payload_summary():
    """Verify GET /gates exposes gate_type and payload_summary."""
    client = TestClient(app)

    start_res = client.post("/vulnerability/run/start", json={"control_id": "CTL-VULN-001"})
    run_id = start_res.json()["run_id"]
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})
    client.post("/vulnerability/run/request_approval", json={"run_id": run_id, "maker_id": "sec_maker"})

    gates_res = client.get("/gates", headers={"x-user-id": "reviewer", "x-roles": "security_reviewer"})
    assert gates_res.status_code == 200
    gates = gates_res.json()

    vuln_gates = [g for g in gates if g["control_id"] == "CTL-VULN-001"]
    assert len(vuln_gates) >= 1
    vg = vuln_gates[0]
    assert vg["gate_type"] == "vuln_approval"
    assert vg["payload_summary"] is not None
    assert "exceptions_count" in vg["payload_summary"]
    assert "escalations_count" in vg["payload_summary"]
