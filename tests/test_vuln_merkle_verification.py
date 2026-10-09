"""Tests for Merkle-style verification, apply evidence root, run digest, and SQL source removal on CTL-VULN-001."""

import json
import pytest
from fastapi.testclient import TestClient

from agents.sql_agent import ComplianceSQLAgent
from api.main import app
from sim.database import reseed_compliance_databases
from sim.vuln_schema import get_core_connection, reseed_vulnerability_tables
from sim.audit_store import get_audit_run, list_audit_evidence

client = TestClient(app)
VULN_CONTROL_ID = "CTL-VULN-001"


@pytest.fixture(autouse=True)
def clean_seed():
    reseed_compliance_databases()
    reseed_vulnerability_tables()
    yield
    reseed_compliance_databases()
    reseed_vulnerability_tables()


def test_merkle_roots_match_on_normal_run():
    """1. On a normal run with tickets created, source and target Merkle roots match."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert start_res.status_code == 200
    run_id = start_res.json()["run_id"]

    ticket_res = client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    assert ticket_res.status_code == 200
    assert ticket_res.json()["created_count"] > 0

    verify_res = client.post("/vulnerability/run/verify", json={"run_id": run_id})
    assert verify_res.status_code == 200
    vdata = verify_res.json()

    assert "source_root" in vdata
    assert "target_root" in vdata
    assert "roots_match" in vdata
    assert len(vdata["source_root"]) == 64
    assert len(vdata["target_root"]) == 64
    assert vdata["source_root"] == vdata["target_root"]
    assert vdata["roots_match"] is True
    assert vdata["passed"] is True
    assert vdata["mismatches"] == []
    assert vdata["mismatch_count"] == 0


def test_tampering_due_date_produces_mismatch_naming_finding():
    """2. Tampering a ticket's due_date after creation produces a mismatch naming that finding."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert start_res.status_code == 200
    run_id = start_res.json()["run_id"]

    ticket_res = client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    assert ticket_res.status_code == 200
    assert ticket_res.json()["created_count"] > 0

    # Tamper with one ticket's due date in vuln_tickets
    with get_core_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT finding_id, due_date FROM vuln_tickets WHERE run_id = ? LIMIT 1", (run_id,))
        row = cur.fetchone()
        tampered_fid = row[0]
        cur.execute(
            "UPDATE vuln_tickets SET due_date = '2099-12-31' WHERE finding_id = ? AND run_id = ?",
            (tampered_fid, run_id),
        )
        conn.commit()

    verify_res = client.post("/vulnerability/run/verify", json={"run_id": run_id})
    assert verify_res.status_code == 200
    vdata = verify_res.json()

    assert vdata["roots_match"] is False
    assert vdata["passed"] is False
    assert vdata["source_root"] != vdata["target_root"]
    assert tampered_fid in vdata["mismatches"]
    assert vdata["mismatch_count"] >= 1
    assert "Verification Failed" in vdata["verification_results"]["verification_banner"]


def test_zero_ticket_path_passes():
    """3. Zero ticket candidates: both roots equal root of empty list, passed=true, 'Nothing to reconcile'."""
    # Mark all open critical/high findings as PATCHED so 0 candidates exist
    with get_core_connection() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE db_vulnerabilities SET status = 'PATCHED' WHERE severity IN ('CRITICAL', 'HIGH') OR is_kev = 1")
        conn.commit()

    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    assert start_res.status_code == 200
    run_id = start_res.json()["run_id"]

    ticket_res = client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    assert ticket_res.status_code == 200
    assert ticket_res.json()["created_count"] == 0

    verify_res = client.post("/vulnerability/run/verify", json={"run_id": run_id})
    assert verify_res.status_code == 200
    vdata = verify_res.json()

    empty_root = "0" * 64
    assert vdata["source_root"] == empty_root
    assert vdata["target_root"] == empty_root
    assert vdata["roots_match"] is True
    assert vdata["passed"] is True
    assert vdata["required_count"] == 0
    assert vdata["created_count"] == 0
    assert vdata["mismatches"] == []
    assert "Nothing to reconcile" in vdata["verification_results"]["verification_banner"]


def test_repeated_verify_is_idempotent():
    """4. Repeated verify calls return identical Merkle roots and match status."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run_id = start_res.json()["run_id"]

    client.post("/vulnerability/run/ticket", json={"run_id": run_id})

    v1 = client.post("/vulnerability/run/verify", json={"run_id": run_id}).json()
    v2 = client.post("/vulnerability/run/verify", json={"run_id": run_id}).json()

    assert v1["source_root"] == v2["source_root"]
    assert v1["target_root"] == v2["target_root"]
    assert v1["roots_match"] == v2["roots_match"]
    assert v1["mismatches"] == v2["mismatches"]
    assert v1["passed"] == v2["passed"]


def test_resume_returns_stored_roots_and_evidence():
    """5. Resume returns stored roots and run digest; control_audit_runs columns are NOT polluted."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run_id = start_res.json()["run_id"]

    client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    verify_res = client.post("/vulnerability/run/verify", json={"run_id": run_id}).json()
    client.post("/vulnerability/run/request_approval", json={"run_id": run_id})
    approve_res = client.post("/vulnerability/run/approve", json={"run_id": run_id}).json()
    finalize_res = client.post("/vulnerability/run/finalize", json={"run_id": run_id}).json()

    # 1. Resume endpoint checks
    resume_res = client.get(f"/vulnerability/run/resume/{run_id}")
    assert resume_res.status_code == 200
    rdata = resume_res.json()

    assert rdata["source_root"] == verify_res["source_root"]
    assert rdata["target_root"] == verify_res["target_root"]
    assert rdata["roots_match"] is True
    assert "apply_root" in rdata
    assert len(rdata["apply_root"]) == 64
    assert "run_digest" in rdata
    assert len(rdata["run_digest"]) == 64
    assert rdata["run_digest"] == finalize_res["run_digest"]

    # 2. Assert control_audit_runs table has NULL for archival Merkle columns
    run_row = get_audit_run(run_id)
    assert run_row is not None
    assert run_row.get("source_merkle_root") is None
    assert run_row.get("archive_merkle_root") is None
    assert run_row.get("merkle_verified") is None or run_row.get("merkle_verified") == 0
    assert run_row.get("attestation_token") is None

    # Roots and digest are stored in metadata_json
    meta = run_row.get("metadata") or {}
    assert meta.get("source_merkle_root") == verify_res["source_root"]
    assert meta.get("target_merkle_root") == verify_res["target_root"]
    assert meta.get("roots_match") is True
    assert meta.get("apply_root") == approve_res["apply_root"]
    assert meta.get("run_digest") == finalize_res["run_digest"]

    # 3. Assert evidence is persisted in control_evidence
    evidence_list = list_audit_evidence(run_id)
    evidence_types = [e["evidence_type"] for e in evidence_list]
    assert any("Ticket Reconciliation Merkle Verification" in et for et in evidence_types)
    assert any("Applied Exceptions and Escalations Merkle" in et for et in evidence_types)
    assert any("Database Vulnerability Management Control Review Evidence" in et for et in evidence_types)

    # Check evidence payload contains roots and digest
    final_ev = next(e for e in evidence_list if "Review Evidence" in e["evidence_type"])
    final_payload = final_ev.get("payload") or {}
    assert final_payload.get("run_digest") == finalize_res["run_digest"]
    assert final_payload.get("source_merkle_root") == verify_res["source_root"]
    assert final_payload.get("target_merkle_root") == verify_res["target_root"]
    assert final_payload.get("apply_root") == approve_res["apply_root"]


def test_api_responses_and_metadata_contain_no_sql_source_or_fallback_fields():
    """6. API responses and metadata contain no source/fallback fields."""
    start_res = client.post("/vulnerability/run/start", json={"control_id": VULN_CONTROL_ID})
    run_id = start_res.json()["run_id"]
    ticket_res = client.post("/vulnerability/run/ticket", json={"run_id": run_id})
    verify_res = client.post("/vulnerability/run/verify", json={"run_id": run_id})
    app_res = client.post("/vulnerability/run/request_approval", json={"run_id": run_id})
    approve_res = client.post("/vulnerability/run/approve", json={"run_id": run_id})
    fin_res = client.post("/vulnerability/run/finalize", json={"run_id": run_id})
    resume_res = client.get(f"/vulnerability/run/resume/{run_id}")

    responses = [
        start_res.json(),
        ticket_res.json(),
        verify_res.json(),
        app_res.json(),
        approve_res.json(),
        fin_res.json(),
        resume_res.json(),
    ]

    forbidden_substrings = ["gemini", "compiler", "fallback_reason", "generation_method", "sql_source"]

    for resp in responses:
        resp_str = json.dumps(resp).lower()
        for forbidden in forbidden_substrings:
            assert f'"{forbidden}"' not in resp_str, f"Forbidden key '{forbidden}' found in response"

    # Also check run record in DB
    run_row = get_audit_run(run_id)
    meta_str = json.dumps(run_row.get("metadata", {})).lower()
    for forbidden in forbidden_substrings:
        assert f'"{forbidden}"' not in meta_str, f"Forbidden key '{forbidden}' found in metadata_json"

    # Check ComplianceSQLAgent vulnerability synthesis returns neutral generator string
    agent = ComplianceSQLAgent()
    vuln_res = agent.synthesize(control_id="CTL-VULN-001", run_id=run_id)
    assert vuln_res["agent"] == "ComplianceSQLAgent"
    assert vuln_res["generator"] == "ComplianceSQLAgent"
    assert "gemini" not in vuln_res.get("generator", "").lower()
    assert "compiler" not in vuln_res.get("generator", "").lower()
    assert "model" not in vuln_res


def test_archival_merkle_behaviour_and_attestation_unchanged():
    """7. Archival control continues to generate attestation token and Merkle roots unchanged."""
    int_res = client.post("/interactive/interpret", json={"control_id": "CTL-ARCH-001"})
    assert int_res.status_code == 200
    arch_run_id = int_res.json()["run_id"]

    client.post("/interactive/preview", json={"control_id": "CTL-ARCH-001", "run_id": arch_run_id})
    client.post("/interactive/execute_step", json={"control_id": "CTL-ARCH-001", "run_id": arch_run_id})

    ver_res = client.post("/interactive/verify_archival", json={"control_id": "CTL-ARCH-001", "run_id": arch_run_id})
    assert ver_res.status_code == 200
    vdata = ver_res.json()

    assert vdata["status"] == "VERIFIED"
    assert vdata["merkle_roots_match"] is True
    assert "attestation_token" in vdata
    assert len(vdata["attestation_token"]) > 10

    # Archival run populates columns on control_audit_runs
    arch_run = get_audit_run(arch_run_id)
    assert arch_run is not None
    assert arch_run.get("source_merkle_root") is not None
    assert arch_run.get("archive_merkle_root") is not None
    assert arch_run.get("merkle_verified") == 1
    assert arch_run.get("attestation_token") is not None
