import json
from pathlib import Path
from fastapi.testclient import TestClient
from api.main import app
from sim.database import (
    reseed_compliance_databases,
    get_core_connection,
    get_archive_connection,
)
from sim.audit_store import (
    get_audit_run,
    list_audit_steps,
    list_audit_evidence,
    list_audit_approvals,
)
from core.policy_parser import parse_policy_specification

SNAPSHOT_DIR = Path(__file__).resolve().parent / "golden_snapshots"


def test_archival_policy_parser_golden_snapshot():
    """Ensure parse_policy_specification() output for archival policy remains strictly identical."""
    client = TestClient(app)
    arch_defaults = client.get("/interactive/defaults/CTL-ARCH-001").json()
    arch_policy_text = arch_defaults["policy_text"]

    current_parsed = parse_policy_specification(arch_policy_text, default_archetype="D")

    golden_file = SNAPSHOT_DIR / "archival_policy_parsed.json"
    assert golden_file.exists(), "Archival golden snapshot file must exist"
    golden_parsed = json.loads(golden_file.read_text(encoding="utf-8"))

    assert current_parsed == golden_parsed, "Archival policy parser output must strictly match golden baseline"


def test_archival_empirical_lifecycle_baseline():
    """Verify exact empirical counts and audit artifacts of the Archival pipeline."""
    reseed_compliance_databases()
    client = TestClient(app)

    # 1. Interpret
    int_res = client.post("/interactive/interpret", json={"control_id": "CTL-ARCH-001"})
    assert int_res.status_code == 200
    run_id = int_res.json()["run_id"]

    # 2. Preview
    prev_res = client.post("/interactive/preview", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    assert prev_res.status_code == 200
    prev_data = prev_res.json()
    assert prev_data["total_source_records"] == 54
    assert prev_data["eligible_records_count"] == 33
    assert prev_data["excluded_holds_count"] == 3

    # 3. Execute Step 2 (Archival Copy)
    exec_res = client.post("/interactive/execute_step", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    assert exec_res.status_code == 200
    exec_data = exec_res.json()
    assert exec_data["status"] == "ARCHIVED"
    assert exec_data["records_copied"] == 33

    # Check database state during staging
    with get_archive_connection() as conn_a:
        archived_count = conn_a.execute("SELECT COUNT(*) FROM archive_transactions").fetchone()[0]
    assert archived_count == 33

    with get_core_connection() as conn_c:
        source_count_pre_purge = conn_c.execute("SELECT COUNT(*) FROM source_transactions").fetchone()[0]
    assert source_count_pre_purge == 54

    # 4. Verify Archival (Merkle & Attestation)
    ver_res = client.post("/interactive/verify_archival", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    assert ver_res.status_code == 200
    ver_data = ver_res.json()
    assert ver_data["status"] == "VERIFIED"
    assert ver_data["records_verified"] == 33
    assert ver_data["merkle_roots_match"] is True
    attestation_token = ver_data["attestation_token"]

    # 5. Approve Gate
    appr_res = client.post("/interactive/approve_gate", json={
        "control_id": "CTL-ARCH-001",
        "run_id": run_id,
        "attestation_token": attestation_token,
        "operator_comment": "Baseline regression verification approval",
        "operator_id": "sec_reviewer_1",
    })
    assert appr_res.status_code == 200
    assert appr_res.json()["status"] == "APPROVED"

    # 6. Source Cleanup (DELETE)
    clean_res = client.post("/interactive/cleanup", json={
        "control_id": "CTL-ARCH-001",
        "run_id": run_id,
        "attestation_token": attestation_token,
        "operator_comment": "Baseline cleanup",
        "operator_id": "sec_reviewer_1",
    })
    assert clean_res.status_code == 200
    clean_data = clean_res.json()
    assert clean_data["status"] == "completed"
    assert clean_data["deleted_count"] == 33

    # 7. Assert post-cleanup counts
    with get_core_connection() as conn_c:
        remaining_core = conn_c.execute("SELECT COUNT(*) FROM source_transactions").fetchone()[0]
        legal_holds_remaining = conn_c.execute("SELECT COUNT(*) FROM source_transactions WHERE legal_hold = 1").fetchone()[0]
    assert remaining_core == 21
    assert legal_holds_remaining == 3

    # 8. Assert audit tables
    run_audit = get_audit_run(run_id)
    assert run_audit is not None
    assert run_audit["status"] == "completed"

    steps = list_audit_steps(run_id)
    assert len(steps) == 6
    step_names = [s["step_name"] for s in steps]
    assert step_names == [
        "PREVIEW",
        "COPY_TO_ARCHIVE",
        "MERKLE_VERIFY",
        "HUMAN_APPROVAL",
        "SOURCE_PURGE",
        "FINAL_VERIFICATION",
    ]

    evs = list_audit_evidence(run_id)
    assert len(evs) == 2

    gates = list_audit_approvals(run_id)
    assert len(gates) == 1
    assert gates[0]["status"] == "approved"
