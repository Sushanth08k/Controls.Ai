import os
import sqlite3
import pytest
from fastapi.testclient import TestClient

from api.main import app
from sim.database import reseed_compliance_databases
from sim.audit_store import get_connection

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    reseed_compliance_databases()
    yield


def test_stateful_vuln_run_in_runs_list_and_audit():
    """Verify that a stateful vuln run appears in /runs and /runs/{id}/audit."""
    # 1. Start run
    start_resp = client.post(
        "/vulnerability/run/start",
        json={"control_id": "CTL-VULN-001", "as_of_date": "2026-10-06"},
    )
    assert start_resp.status_code == 200
    run_id = start_resp.json()["run_id"]

    # Intermediate run should appear in /runs
    runs_resp = client.get("/runs")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    matching_run = next((r for r in runs if r["run_id"] == run_id), None)
    assert matching_run is not None
    assert matching_run["status"] == "running"
    assert matching_run["control_id"] == "CTL-VULN-001"
    assert matching_run["archetype"] == "A"

    # Step through pipeline
    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    client.post("/vulnerability/run/verify", json={"run_id": run_id})
    client.post("/vulnerability/run/request_approval", json={"run_id": run_id, "requested_by": "sec_rev_1"})
    client.post("/vulnerability/run/approve", json={"run_id": run_id, "approver_id": "risk_off_1"})
    client.post("/vulnerability/run/apply", json={"run_id": run_id})
    fin_resp = client.post("/vulnerability/run/finalize", json={"run_id": run_id})
    assert fin_resp.status_code == 200

    # 2. Check /runs completed status
    runs_resp2 = client.get("/runs")
    matching_run2 = next((r for r in runs_resp2.json() if r["run_id"] == run_id), None)
    assert matching_run2 is not None
    assert matching_run2["status"] == "completed"

    # 3. Check /runs/{run_id}/audit has steps, evidence, findings, approvals
    audit_resp = client.get(f"/runs/{run_id}/audit")
    assert audit_resp.status_code == 200
    audit_data = audit_resp.json()
    assert audit_data["run"]["run_id"] == run_id
    assert len(audit_data["steps"]) >= 6
    assert len(audit_data["evidence"]) >= 1
    assert len(audit_data["findings"]) >= 1
    assert len(audit_data["approvals"]) >= 1

    # 4. Check /vulnerability/results/{run_id} returns a superset
    results_resp = client.get(f"/vulnerability/results/{run_id}")
    assert results_resp.status_code == 200
    res = results_resp.json()
    # Legacy keys
    assert "status" in res
    assert "run_id" in res
    assert "evaluations" in res
    assert "findings" in res
    assert "evidence" in res
    assert "summary" in res
    # Stateful keys
    assert "control_assessment" in res
    assert "review_snapshot" in res
    assert res["control_assessment"]["overall_grade"] in ("Effective", "Effective with follow-ups", "Needs Improvement", "Ineffective")


def test_legacy_vulnerability_results_fallback():
    """Verify legacy one-shot execute still produces a valid results payload."""
    exec_resp = client.post("/vulnerability/execute", json={"control_id": "CTL-VULN-001"})
    assert exec_resp.status_code == 200
    run_id = exec_resp.json()["run_id"]

    res_resp = client.get(f"/vulnerability/results/{run_id}")
    assert res_resp.status_code == 200
    res = res_resp.json()
    assert res["run_id"] == run_id
    assert "evaluations" in res
    assert "findings" in res
    assert "evidence" in res
