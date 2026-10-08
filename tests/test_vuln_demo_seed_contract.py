"""Contract tests for Vulnerability Management Review (CTL-VULN-001) demo seed."""

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


def test_start_endpoint_contract_schema():
    """Verify /vulnerability/run/start returns all required schema fields."""
    resp = client.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": "Sample policy"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Core contract keys
    assert "run_id" in data
    assert data["stage"] == "EVALUATED"
    assert "scope_summary" in data
    assert "review_snapshot" in data
    assert "before_snapshot" in data
    assert "named_queries" in data
    assert "as_of" in data or "as_of_date" in data

    # Scope Summary contract
    scope = data["scope_summary"]
    assert "assets" in scope
    assert "assets_out_of_scope" in scope
    assert "counts" in scope
    assert "findings_reconciliation" in scope

    counts = scope["counts"]
    assert counts["assets_total"] == 7
    assert counts["assets_in_scope"] == 7
    assert len(scope["assets"]) == counts["assets_total"]

    # Findings reconciliation
    recon = scope["findings_reconciliation"]
    assert recon["retrieved"] == 12
    assert recon["tested"] == 12
    assert recon["excluded"] == 0
    assert recon["tested"] + recon["excluded"] == recon["retrieved"]
    assert len(recon["excluded_by_reason"]) == 0


def test_review_snapshot_q1_to_q4_counts_and_planted_defects():
    """Verify Q1-Q4 exact row counts and planted defect semantics."""
    resp = client.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID},
    )
    assert resp.status_code == 200
    snap = resp.json()["review_snapshot"]

    # Q1: SLA Breaches (expected 3 rows)
    q1 = snap["q1_sla_breach"]
    assert q1["row_count"] == 3
    q1_vuln_ids = {r["vulnerability_id"] for r in q1["rows"]}
    assert q1_vuln_ids == {"VULN-002", "VULN-004", "VULN-011"}

    # Q2: Ticket Coverage (total 6 rows: 4 candidates + 2 defective tickets)
    q2 = snap["q2_ticket_coverage"]
    assert q2["row_count"] == 6
    assert q2["candidate_count"] == 4
    assert q2["defective_count"] == 2

    candidate_ids = {c["finding_id"] for c in q2["candidate_tickets"]}
    assert candidate_ids == {"VULN-001", "VULN-002", "VULN-004", "VULN-007"}
    for cand in q2["candidate_tickets"]:
        assert cand["computed_assignee"] is not None
        assert cand["computed_due_date"] is not None

    defective_ids = {d["finding_id"] for d in q2["defective_tickets"]}
    assert defective_ids == {"VULN-003", "VULN-012"}

    # Q3: Closure Validity (expected 1 row: VULN-008 closed without verification)
    q3 = snap["q3_closure_validity"]
    assert q3["row_count"] == 1
    assert q3["rows"][0]["vulnerability_id"] == "VULN-008"
    assert q3["rows"][0]["closure_defect"] == "CLOSED_WITHOUT_RESCAN_VERIFICATION"
    q3_ids = {r["vulnerability_id"] for r in q3["rows"]}
    assert "VULN-004" not in q3_ids
    assert "VULN-005" not in q3_ids

    # Q4: Exception Governance (expected 3 rows: EXC-2026-0002, EXC-2026-0003, EXC-2026-0004)
    q4 = snap["q4_exception_governance"]
    assert q4["row_count"] == 3
    exc_ids = {r["exception_id"] for r in q4["rows"]}
    assert exc_ids == {"EXC-2026-0002", "EXC-2026-0003", "EXC-2026-0004"}
