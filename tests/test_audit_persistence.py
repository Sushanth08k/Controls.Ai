from collections.abc import Generator
import pytest
from starlette.testclient import TestClient
from api.main import app
from api.routers.runs import _RUNS_STORE
from api.routers.gates import _GATE_STORE
from api.routers.findings import _FINDINGS_STORE
from api.routers.evidence import _EVIDENCE_STORE
from api.routers.vulnerability import _VULN_RUN_RESULTS
from sim.audit_store import (
    init_audit_tables,
    upsert_audit_run,
    get_audit_run,
    list_audit_runs,
    save_audit_step,
    list_audit_steps,
    save_audit_finding,
    list_audit_findings,
    save_audit_evidence,
    get_audit_evidence,
    save_audit_approval,
    get_full_audit_bundle,
)
from sim.database import reseed_compliance_databases, get_core_connection


@pytest.fixture(autouse=True)
def ensure_db() -> Generator[None, None, None]:
    init_audit_tables()
    yield


def test_audit_run_crud() -> None:
    """Verify control_audit_runs table creation, insertion, retrieval, and status update."""
    run_id = "test-run-001"
    run = upsert_audit_run(
        run_id=run_id,
        control_id="CTL-ARCH-001",
        version="1.0.0",
        archetype="D",
        status="running",
        source_db="bank_core.db",
        archive_db="bank_archive.db",
        records_evaluated=50,
        records_eligible=33,
    )
    assert run["run_id"] == run_id
    assert run["status"] == "running"
    assert run["records_evaluated"] == 50

    # Update to completed
    updated = upsert_audit_run(
        run_id=run_id,
        control_id="CTL-ARCH-001",
        status="completed",
        records_affected=33,
        source_merkle_root="src-root-abc123",
        archive_merkle_root="src-root-abc123",
        merkle_verified=1,
        attestation_token="ATTEST-TEST-001",
    )
    assert updated["status"] == "completed"
    assert updated["merkle_verified"] == 1
    assert updated["attestation_token"] == "ATTEST-TEST-001"
    assert updated["records_affected"] == 33

    fetched = get_audit_run(run_id)
    assert fetched is not None
    assert fetched["status"] == "completed"


def test_audit_steps_and_merkle_persistence() -> None:
    """Verify execution lifecycle steps and Merkle verification persistence."""
    run_id = "test-run-arch-002"
    upsert_audit_run(run_id=run_id, control_id="CTL-ARCH-001", status="running")

    # Record all 6 canonical steps
    save_audit_step(f"step-{run_id}-1", run_id, "PREVIEW", "completed", records_processed=50)
    save_audit_step(f"step-{run_id}-2", run_id, "COPY_TO_ARCHIVE", "completed", records_processed=33)
    save_audit_step(f"step-{run_id}-3", run_id, "MERKLE_VERIFY", "completed", records_processed=33, metadata_json={"merkle_match": True})
    save_audit_step(f"step-{run_id}-4", run_id, "HUMAN_APPROVAL", "completed")
    save_audit_step(f"step-{run_id}-5", run_id, "SOURCE_PURGE", "completed", records_processed=33)
    save_audit_step(f"step-{run_id}-6", run_id, "FINAL_VERIFICATION", "completed")

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


def test_audit_findings_and_evidence_persistence() -> None:
    """Verify findings and evidence persist in SQLite."""
    run_id = "test-run-vuln-003"
    upsert_audit_run(run_id=run_id, control_id="CTL-VULN-001", status="completed")

    finding = save_audit_finding(
        finding_id=f"fnd-{run_id}-1",
        run_id=run_id,
        control_id="CTL-VULN-001",
        title="Critical Overdue Vulnerability CVE-2023-38606",
        severity="critical",
        status="open",
        affected_record="CVE-2023-38606",
        description="SLA exceeded by 14 days without approved exception",
        risk_score=9.8,
    )
    assert finding["finding_id"] == f"fnd-{run_id}-1"

    ev = save_audit_evidence(
        evidence_id=f"ev-{run_id}-1",
        run_id=run_id,
        control_id="CTL-VULN-001",
        evidence_type="query_result",
        evidence_payload={"vulnerabilities_scanned": 12, "overdue_count": 1},
    )
    assert ev["evidence_id"] == f"ev-{run_id}-1"

    loaded_ev = get_audit_evidence(f"ev-{run_id}-1")
    assert loaded_ev is not None
    assert loaded_ev["payload"]["vulnerabilities_scanned"] == 12

    findings = list_audit_findings(run_id=run_id)
    assert len(findings) == 1
    assert findings[0]["severity"] == "critical"


def test_audit_approvals_persistence() -> None:
    """Verify maker-checker human approval gate is stored in SQLite."""
    run_id = "test-run-gate-004"
    gate_id = f"gate-{run_id}-1"
    save_audit_approval(
        gate_id=gate_id,
        run_id=run_id,
        control_id="CTL-ARCH-001",
        status="approved",
        approved_by="sec_reviewer_1",
        comment="Cryptographic Merkle tree match confirmed. Purge authorized.",
    )

    bundle = get_full_audit_bundle(run_id)
    # Even if run wasn't upserted, bundle handles gracefully
    upsert_audit_run(run_id=run_id, control_id="CTL-ARCH-001", status="completed")
    bundle = get_full_audit_bundle(run_id)
    assert bundle is not None
    assert len(bundle["approvals"]) == 1
    assert bundle["approvals"][0]["status"] == "approved"
    assert bundle["approvals"][0]["approved_by"] == "sec_reviewer_1"


def test_ctl_arch_001_full_lifecycle_persistence() -> None:
    """End-to-end test of CTL-ARCH-001 writing persistent audit trail through FastAPI."""
    from sim.database import reseed_compliance_databases
    reseed_compliance_databases()
    client = TestClient(app)

    # 1. Interpret
    res_int = client.post("/interactive/interpret", json={"control_id": "CTL-ARCH-001"})
    assert res_int.status_code == 200
    run_id = res_int.json()["run_id"]

    # 2. Execute step (Copy to archive + Merkle verify)
    res_step = client.post("/interactive/execute_step", json={"control_id": "CTL-ARCH-001", "run_id": run_id})
    assert res_step.status_code == 200
    step_data = res_step.json()
    attestation = step_data["attestation_token"]
    assert step_data["records_copied"] == 33
    assert step_data["source_merkle_root"] is not None
    assert step_data["archive_merkle_root"] is not None

    # 3. Approve Gate
    res_appr = client.post(
        "/interactive/approve_gate",
        json={
            "control_id": "CTL-ARCH-001",
            "run_id": run_id,
            "attestation_token": attestation,
            "operator_comment": "Verified Merkle dual-root match.",
            "operator_id": "sec_reviewer_1",
        },
    )
    assert res_appr.status_code == 200

    # 4. Source Cleanup
    res_clean = client.post(
        "/interactive/cleanup",
        json={
            "control_id": "CTL-ARCH-001",
            "run_id": run_id,
            "attestation_token": attestation,
            "operator_comment": "Purge approved.",
            "operator_id": "sec_reviewer_1",
        },
    )
    assert res_clean.status_code == 200
    assert res_clean.json()["status"] == "completed"

    # Verify persistent audit bundle directly from SQLite
    bundle = get_full_audit_bundle(run_id)
    assert bundle is not None
    assert bundle["run"]["status"] == "completed"
    assert bundle["run"]["records_affected"] == 33
    assert bundle["run"]["attestation_token"] == attestation
    assert bundle["merkle_verification"]["merkle_verified"] is True
    assert bundle["merkle_verification"]["source_merkle_root"] is not None
    assert len(bundle["steps"]) >= 4
    assert len(bundle["approvals"]) >= 1


def test_ctl_vuln_001_persistence() -> None:
    """Verify CTL-VULN-001 persists execution run, findings, and evidence in SQLite."""
    client = TestClient(app)

    res = client.post("/vulnerability/execute", json={"control_id": "CTL-VULN-001"})
    assert res.status_code == 200
    data = res.json()
    run_id = data["run_id"]
    assert run_id is not None
    assert data["records_scanned"] == 6

    # Check that audit store has run
    db_run = get_audit_run(run_id)
    assert db_run is not None
    assert db_run["status"] == "completed"
    assert db_run["records_evaluated"] == 6

    # Check findings in SQLite
    findings = list_audit_findings(run_id=run_id)
    assert len(findings) == len(data["findings"])

    # Check evidence in SQLite
    evs = list_audit_steps(run_id)
    assert len(evs) >= 4


def test_ctl_san_001_persistence() -> None:
    """Verify CTL-SAN-001 executes and persists its test execution audit trail."""
    client = TestClient(app)

    res = client.post("/runs/trigger", json={"control_id": "CTL-SAN-001"})
    assert res.status_code == 200
    run_data = res.json()
    run_id = run_data["run_id"]
    assert run_data["status"] == "completed"

    # Verify audit run in SQLite
    db_run = get_audit_run(run_id)
    assert db_run is not None
    assert db_run["control_id"] == "CTL-SAN-001"
    assert db_run["archetype"] == "B"
    assert db_run["status"] == "completed"

    # Verify execution steps
    steps = list_audit_steps(run_id)
    assert len(steps) >= 4
    step_names = [s["step_name"] for s in steps]
    assert "IMPACT_ANALYSIS" in step_names
    assert "TEST_EXECUTION" in step_names


def test_simulated_backend_restart_retrieval() -> None:
    """SIMULATED BACKEND RESTART: Wipe all in-memory dictionaries and verify full data retrieval from SQLite."""
    client = TestClient(app)

    # Trigger a run to ensure at least one run exists
    res = client.post("/runs/trigger", json={"control_id": "CTL-SAN-001"})
    run_id = res.json()["run_id"]

    # --- SIMULATE FASTAPI BACKEND RESTART ---
    _RUNS_STORE.clear()
    _GATE_STORE.clear()
    _FINDINGS_STORE.clear()
    _EVIDENCE_STORE.clear()
    _VULN_RUN_RESULTS.clear()

    assert len(_RUNS_STORE) == 0
    assert len(_GATE_STORE) == 0

    # 1. Verify GET /runs retrieves historical runs from SQLite
    res_runs = client.get("/runs")
    assert res_runs.status_code == 200
    runs_list = res_runs.json()
    assert len(runs_list) >= 1
    found_run = next((r for r in runs_list if r["run_id"] == run_id), None)
    assert found_run is not None
    assert found_run["control_id"] == "CTL-SAN-001"

    # 2. Verify GET /runs/{run_id} restores from SQLite
    res_single = client.get(f"/runs/{run_id}")
    assert res_single.status_code == 200
    assert res_single.json()["run_id"] == run_id

    # 3. Verify GET /runs/{run_id}/audit returns full audit package after restart
    res_audit = client.get(f"/runs/{run_id}/audit")
    assert res_audit.status_code == 200
    audit_pkg = res_audit.json()
    assert audit_pkg["run"]["run_id"] == run_id
    assert len(audit_pkg["steps"]) >= 4


def test_reseed_preserves_audit_history() -> None:
    """Verify that reseeding business data (source_transactions) does NOT wipe audit tables."""
    run_id = "test-preserve-audit-run"
    upsert_audit_run(run_id=run_id, control_id="CTL-ARCH-001", status="completed")

    # Reseed compliance database
    reseed_res = reseed_compliance_databases()
    assert reseed_res["status"] == "reseeded"

    # Verify audit run is still intact in SQLite
    run = get_audit_run(run_id)
    assert run is not None
    assert run["run_id"] == run_id


def test_failed_runs_persisted_as_failed() -> None:
    """Verify failed runs are recorded as FAILED rather than disappearing."""
    run_id = "test-failed-run-009"
    upsert_audit_run(
        run_id=run_id,
        control_id="CTL-VULN-001",
        status="failed",
        error_message="Connection to target instance timed out after 30000ms",
    )
    save_audit_step(
        step_id=f"step-{run_id}-1",
        run_id=run_id,
        step_name="TARGET_DISCOVERY",
        status="failed",
        error_message="Host unreachable",
    )

    client = TestClient(app)
    res = client.get(f"/runs/{run_id}")
    assert res.status_code == 200
    assert res.json()["status"] == "failed"

    res_audit = client.get(f"/runs/{run_id}/audit")
    assert res_audit.status_code == 200
    assert res_audit.json()["run"]["status"] == "failed"
    assert res_audit.json()["run"]["error_message"] == "Connection to target instance timed out after 30000ms"
