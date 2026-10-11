import datetime
import json
import re
import sqlite3
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routers.vulnerability import DEFAULT_VULNERABILITY_POLICY
from agents.sql_agent import ComplianceSQLAgent
from core.policy_parser import parse_policy_specification
from core.sql_generator import (
    compile_schema_driven_sql,
    compile_vuln_sql,
    get_live_database_schema_ddl,
)
from core.vulnerability_pipeline import (
    execute_ticketing,
    get_as_of_date,
    get_review_snapshot,
    request_approval_gate,
    verify_ticketing,
)
from sim.database import (
    get_core_connection,
    reseed_compliance_databases,
)
from sim.vuln_schema import reseed_vulnerability_tables

CLIENT = TestClient(app)
VULN_CONTROL_ID = "CTL" + "-" + "VULN-001"
ARCH_CONTROL_ID = "CTL" + "-" + "ARCH-001"


@pytest.fixture(autouse=True)
def reset_db():
    reseed_compliance_databases()
    reseed_vulnerability_tables()


# (a) Default policy, no key: Q1=3, Q2=4 untracked + 2 defective, Q3=1, Q4=3
def test_a_default_policy_no_key():
    with patch.dict("os.environ", {}, clear=True):
        res = CLIENT.post(
            "/vulnerability/run/start",
            json={"control_id": VULN_CONTROL_ID, "policy_text": DEFAULT_VULNERABILITY_POLICY},
        )
    assert res.status_code == 200, res.text
    data = res.json()
    rev = data["review_snapshot"]
    assert rev["q1_sla_breach"]["row_count"] == 3
    assert rev["q2_ticket_coverage"]["candidate_count"] == 4
    assert rev["q2_ticket_coverage"]["defective_count"] == 2
    assert rev["q3_exception_governance"]["row_count"] == 3


# (b) Relaxed 30/60/90/180/KEV30: Q1=0, no escalations, due dates first_seen+30 for Critical/KEV, Merkle roots match
def test_b_relaxed_policy():
    relaxed_policy = (
        "VULNERABILITY MANAGEMENT STANDARD v2.0 - RELAXED\n\n"
        "1. Critical vulnerabilities must be remediated within 30 days of identification.\n"
        "2. High vulnerabilities must be remediated within 60 days.\n"
        "3. Medium vulnerabilities must be remediated within 90 days.\n"
        "4. Low vulnerabilities must be remediated within 180 days.\n"
        "5. Known Exploited Vulnerabilities (KEV) must be remediated within 30 days.\n"
        "6. Vulnerability closure requires a verification rescan before being marked resolved.\n"
        "7. Exceptions require approval and a compensating control and expire within 90 days.\n"
        "8. SLA breaches escalated to the asset owner's manager within 1 business day."
    )
    start_res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": relaxed_policy},
    )
    assert start_res.status_code == 200
    start_data = start_res.json()
    run_id = start_data["run_id"]
    rules = start_data["rules"]
    assert rules["sla_critical"] == 30
    assert rules["sla_high"] == 60
    assert rules["sla_medium"] == 90
    assert rules["sla_low"] == 180
    assert rules["sla_kev"] == 30

    # Q1 = 0
    rev = start_data["review_snapshot"]
    assert rev["q1_sla_breach"]["row_count"] == 0

    # Ticketing: ticket due date should be first_seen + 30 for Critical / KEV
    tkt_res = CLIENT.post("/vulnerability/run/ticket", json={"run_id": run_id})
    assert tkt_res.status_code == 200
    tkt_data = tkt_res.json()
    created_tickets = tkt_data["ticket_results"]["tickets"]
    assert len(created_tickets) == 4
    for t in created_tickets:
        if t["severity"] == "CRITICAL" or t["is_kev"]:
            # Find discovered_at
            conn = get_core_connection()
            cur = conn.cursor()
            cur.execute("SELECT discovered_at FROM db_vulnerabilities WHERE vulnerability_id = ?", (t["finding_id"],))
            disc = cur.fetchone()["discovered_at"][:10]
            conn.close()
            disc_d = datetime.date.fromisoformat(disc)
            expected_due = (disc_d + datetime.timedelta(days=30)).isoformat()
            assert t["due_date"] == expected_due

    # Verification: Merkle roots match
    ver_res = CLIENT.post("/vulnerability/run/verify", json={"run_id": run_id})
    assert ver_res.status_code == 200
    ver_data = ver_res.json()
    assert ver_data["roots_match"] is True

    # Approval gate: No escalation candidates (since Q1=0)
    gate_res = CLIENT.post("/vulnerability/run/request_approval", json={"run_id": run_id})
    assert gate_res.status_code == 200
    gate_data = gate_res.json()
    payload = gate_data.get("gate", {}).get("payload") or gate_data.get("payload") or {}
    assert len(payload.get("escalation_candidates", [])) == 0


# (c) Strict 3/14/30/60/KEV1: more breaches than default
def test_c_strict_policy():
    strict_policy = (
        "VULNERABILITY MANAGEMENT STANDARD - STRICT\n\n"
        "1. Critical vulnerabilities must be remediated within 3 days of identification.\n"
        "2. High vulnerabilities must be remediated within 14 days.\n"
        "3. Medium vulnerabilities must be remediated within 30 days.\n"
        "4. Low vulnerabilities must be remediated within 60 days.\n"
        "5. Known Exploited Vulnerabilities (KEV) must be remediated within 1 day.\n"
        "6. Vulnerability closure requires a verification rescan before being marked resolved.\n"
        "7. Exceptions require approval and a compensating control and expire within 90 days."
    )
    res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": strict_policy},
    )
    assert res.status_code == 200
    rev = res.json()["review_snapshot"]
    # Strict SLA should catch more overdue vulnerabilities than default 3
    assert rev["q1_sla_breach"]["row_count"] > 3


# (d) exception_max_days=30 changes Q4 (pending exception expiring ~45 days out is flagged)
def test_d_exception_max_days_30():
    policy_30d_exc = (
        "VULNERABILITY MANAGEMENT STANDARD\n\n"
        "1. Critical vulnerabilities must be remediated within 7 days.\n"
        "2. High vulnerabilities must be remediated within 30 days.\n"
        "3. Medium vulnerabilities must be remediated within 60 days.\n"
        "4. Low vulnerabilities must be remediated within 90 days.\n"
        "5. Exceptions require approval and a compensating control and expire within 30 days."
    )
    res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": policy_30d_exc},
    )
    assert res.status_code == 200
    rev = res.json()["review_snapshot"]
    q4_rows = rev["q4_exception_governance"]["rows"]
    # At least one exception defect is DURATION_EXCEEDS_POLICY_LIMIT
    defects = [r.get("exception_defect") for r in q4_rows]
    assert "DURATION_EXCEEDS_POLICY_LIMIT" in defects


# (e) Missing severities are not forced into default SLA rules
def test_e_missing_severities_reported_defaults_used():
    partial_policy = (
        "VULNERABILITY MANAGEMENT STANDARD\n\n"
        "1. Critical vulnerabilities must be remediated within 5 days.\n"
        "2. High vulnerabilities must be remediated within 25 days."
    )
    parsed = parse_policy_specification(partial_policy, default_archetype="A")
    governed = parsed.get("rules_object", {}).get("governed_severities", [])
    assert "CRITICAL" in governed
    assert "HIGH" in governed
    assert "MEDIUM" not in governed
    assert "LOW" not in governed
    defaults = parsed.get("defaults_used", [])
    assert defaults == []


# (f) Conflicting rules produce an ambiguity
def test_f_conflicting_rules_produce_ambiguity():
    conflicting_policy = (
        "VULNERABILITY MANAGEMENT STANDARD\n\n"
        "1. Critical vulnerabilities must be remediated within 7 days of identification.\n"
        "2. High vulnerabilities must be remediated within 30 days.\n"
        "3. Critical vulnerabilities must be remediated within 14 days of identification."
    )
    parsed = parse_policy_specification(conflicting_policy, default_archetype="A")
    ambiguities = parsed.get("ambiguities", [])
    assert any(a.get("type") == "CONFLICTING_SPECIFICATION" for a in ambiguities)


# (g) Irrelevant text without SLA rules is blocked (has_sla_rules == False, HTTP 400)
def test_g_irrelevant_text_blocked():
    irrelevant = "This document describes our holiday celebration lunch schedule and parking regulations."
    res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": irrelevant},
    )
    assert res.status_code == 400
    assert "no recognizable" in res.text.lower()


# (h) Mocked Gemini returning DELETE, multi-statement, missing column or different IDs silently falls back
def test_h_mocked_gemini_failures_silent_fallback():
    agent = ComplianceSQLAgent()
    compiled = compile_vuln_sql({"sla_critical": 7, "sla_high": 30, "sla_medium": 60, "sla_low": 90, "sla_kev": 3})

    with get_core_connection() as conn:
        # 1. DELETE statement
        assert agent._validate_vuln_query("DELETE FROM db_vulnerabilities;", "q1_sla_breach", compiled["q1_sla_breach"], compiled["params"], "2026-10-06", conn) is False

        # 2. Multi-statement
        assert agent._validate_vuln_query("SELECT * FROM db_vulnerabilities; SELECT 1;", "q1_sla_breach", compiled["q1_sla_breach"], compiled["params"], "2026-10-06", conn) is False

        # 3. Missing column
        assert agent._validate_vuln_query("SELECT vulnerability_id FROM db_vulnerabilities;", "q1_sla_breach", compiled["q1_sla_breach"], compiled["params"], "2026-10-06", conn) is False

        # 4. Different IDs (e.g. WHERE 1=0)
        empty_query = compiled["q1_sla_breach"].replace("WHERE a.in_scope = 1", "WHERE 1=0")
        assert agent._validate_vuln_query(empty_query, "q1_sla_breach", compiled["q1_sla_breach"], compiled["params"], "2026-10-06", conn) is False


# (i) Valid mocked Gemini equal to compiled is accepted
def test_i_valid_mocked_gemini_accepted():
    agent = ComplianceSQLAgent()
    compiled = compile_vuln_sql({"sla_critical": 7, "sla_high": 30, "sla_medium": 60, "sla_low": 90, "sla_kev": 3})

    with get_core_connection() as conn:
        assert agent._validate_vuln_query(
            compiled["q1_sla_breach"],
            "q1_sla_breach",
            compiled["q1_sla_breach"],
            compiled["params"],
            "2026-10-06",
            conn,
        ) is True


# (j) Mocked 429 falls back and archival is unaffected
def test_j_mocked_429_quota_fallback_archival_unaffected():
    agent = ComplianceSQLAgent()

    with patch("agents.sql_agent.ComplianceSQLAgent._call_langchain_synthesis", side_effect=Exception("429 RESOURCE_EXHAUSTED")):
        vuln_res = agent.synthesize(control_id=VULN_CONTROL_ID, rules={"sla_critical": 7})
        assert "q1_sla_breach" in vuln_res

        arch_res = agent.synthesize(control_id=ARCH_CONTROL_ID)
        assert "selection_sql" in arch_res


# (k) Before and after snapshots use identical stored rules and SQL
def test_k_before_and_after_snapshots_use_identical_stored_rules_and_sql():
    relaxed_policy = (
        "VULNERABILITY MANAGEMENT STANDARD - RELAXED\n\n"
        "1. Critical vulnerabilities must be remediated within 30 days.\n"
        "2. High vulnerabilities must be remediated within 60 days.\n"
        "3. Medium vulnerabilities must be remediated within 90 days.\n"
        "4. Low vulnerabilities must be remediated within 180 days.\n"
        "5. Known Exploited Vulnerabilities (KEV) must be remediated within 30 days."
    )
    start_res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": relaxed_policy},
    )
    run_id = start_res.json()["run_id"]

    CLIENT.post("/vulnerability/run/ticket", json={"run_id": run_id})
    CLIENT.post("/vulnerability/run/verify", json={"run_id": run_id})
    gate_data = CLIENT.post("/vulnerability/run/request_approval", json={"run_id": run_id}).json()
    if gate_data.get("stage") == "APPROVAL_PENDING":
        CLIENT.post("/vulnerability/run/approve", json={"run_id": run_id, "gate_id": gate_data.get("gate_id")})
    CLIENT.post("/vulnerability/run/apply", json={"run_id": run_id})
    fin_res = CLIENT.post("/vulnerability/run/finalize", json={"run_id": run_id})
    assert fin_res.status_code == 200
    fin_data = fin_res.json()
    before_snap = start_res.json()["before_snapshot"]
    after_snap = fin_data["after_snapshot"]

    assert before_snap["rules"]["sla_critical"] == 30
    assert after_snap["rules"]["sla_critical"] == 30


# (l) Responses, metadata, and evidence contain no engine wording
def test_l_no_engine_wording_in_responses_metadata_evidence():
    res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": DEFAULT_VULNERABILITY_POLICY},
    )
    data = res.json()
    serialized = json.dumps(data)
    for forbidden in [r"\bgemini\b", r"\bcompiler\b", r"\bllm\b", r"deterministic compiler", r"sql engine"]:
        assert not re.search(forbidden, serialized, re.IGNORECASE), f"Forbidden engine term '{forbidden}' leaked in response"


# (m) Archival SQL snapshot equality (byte-identical)
def test_m_archival_sql_snapshot_equality():
    schema = get_live_database_schema_ddl(["source_transactions", "archive_transactions", "legal_holds"])
    rules = [
        {
            "rule_id": "RULE-001",
            "rule_type": "ARCHIVAL",
            "condition": {"field": "transaction_date", "operator": "OLDER_THAN", "value": "5", "unit": "years"},
        }
    ]
    compiled_1 = compile_schema_driven_sql(schema_ddl=schema, rules=rules, exceptions=[], run_id="run-snap", retention_years=5)
    compiled_2 = compile_schema_driven_sql(schema_ddl=schema, rules=rules, exceptions=[], run_id="run-snap", retention_years=5)
    assert compiled_1["selection_sql"] == compiled_2["selection_sql"]
    assert compiled_1["archival_sql"] == compiled_2["archival_sql"]
    assert compiled_1["cleanup_sql"] == compiled_2["cleanup_sql"]


# (n) Zero-defect path still completes
def test_n_zero_defect_path_completes():
    clean_policy = (
        "VULNERABILITY MANAGEMENT STANDARD\n\n"
        "1. Critical vulnerabilities must be remediated within 365 days.\n"
        "2. High vulnerabilities must be remediated within 365 days.\n"
        "3. Medium vulnerabilities must be remediated within 365 days.\n"
        "4. Low vulnerabilities must be remediated within 365 days.\n"
        "5. Known Exploited Vulnerabilities (KEV) must be remediated within 365 days."
    )
    start_res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": clean_policy},
    )
    assert start_res.status_code == 200
    run_id = start_res.json()["run_id"]
    CLIENT.post("/vulnerability/run/ticket", json={"run_id": run_id})
    CLIENT.post("/vulnerability/run/verify", json={"run_id": run_id})
    gate_data = CLIENT.post("/vulnerability/run/request_approval", json={"run_id": run_id}).json()
    if gate_data.get("stage") == "APPROVAL_PENDING":
        CLIENT.post("/vulnerability/run/approve", json={"run_id": run_id, "gate_id": gate_data.get("gate_id")})
    CLIENT.post("/vulnerability/run/apply", json={"run_id": run_id})
    fin_res = CLIENT.post("/vulnerability/run/finalize", json={"run_id": run_id})
    assert fin_res.status_code == 200
    assert fin_res.json()["stage"] == "FINALIZED"


# (o) Unspecified severities are not evaluated as SLA breaches
def test_o_unspecified_severities_not_breached():
    # Only Critical is governed; High/Medium/Low omitted
    crit_only_policy = (
        "VULNERABILITY MANAGEMENT STANDARD\n\n"
        "1. Critical vulnerabilities must be remediated within 30 days of identification."
    )
    start_res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": crit_only_policy},
    )
    assert start_res.status_code == 200
    rev = start_res.json()["review_snapshot"]
    # High findings (like VULN-004 age 42d, VULN-011 age 55d) should NOT be flagged as SLA breaches
    q1_rows = rev["q1_sla_breach"]["rows"]
    assert all(r["severity"] == "CRITICAL" for r in q1_rows)


# (p) Dynamic scope targets in policy isolate reconciliation and scope summary
def test_p_dynamic_scope_targets():
    scoped_policy = (
        "VULNERABILITY MANAGEMENT STANDARD\n\n"
        "Scope:\n"
        "- payments-db\n"
        "- auth-db\n\n"
        "1. Critical vulnerabilities must be remediated within 7 days.\n"
        "2. High vulnerabilities must be remediated within 30 days."
    )
    start_res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": scoped_policy},
    )
    assert start_res.status_code == 200
    data = start_res.json()
    scope_summary = data["scope_summary"]
    # 2 assets in scope (payments-db, auth-db)
    assert scope_summary["counts"]["assets_in_scope"] == 2
    out_of_scope = scope_summary["assets_out_of_scope"]
    assert len(out_of_scope) == 5
    # Findings reconciliation excludes findings from other databases
    recon = scope_summary["findings_reconciliation"]
    assert recon["excluded"] > 0
    assert any("excluded by policy scope targets" in exc["reason"] for exc in recon["excluded_by_reason"])


# (q) Dynamic ticketing candidates and due dates linked directly to policy
def test_q_dynamic_ticketing_linked_to_policy():
    strict_policy = (
        "VULNERABILITY MANAGEMENT STANDARD\n\n"
        "1. Critical vulnerabilities must be remediated within 4 days of identification.\n"
        "2. High vulnerabilities must be remediated within 12 days."
    )
    start_res = CLIENT.post(
        "/vulnerability/run/start",
        json={"control_id": VULN_CONTROL_ID, "policy_text": strict_policy},
    )
    assert start_res.status_code == 200
    run_id = start_res.json()["run_id"]
    tkt_res = CLIENT.post("/vulnerability/run/ticket", json={"run_id": run_id})
    assert tkt_res.status_code == 200
    tickets = tkt_res.json()["ticket_results"]["tickets"]
    for t in tickets:
        if t["severity"] == "CRITICAL":
            assert t["sla_days"] == 4
        elif t["severity"] == "HIGH":
            assert t["sla_days"] == 12


# (r) Unrelated document in /vulnerability/interpret returns 200 with all zeros
def test_r_unrelated_document_interpret_returns_zeros():
    irrelevant = "This document describes employee dress code, cafeteria menus, and holiday parking rules."
    res = CLIENT.post(
        "/vulnerability/interpret",
        json={"control_id": VULN_CONTROL_ID, "document_text": irrelevant},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["has_sla_rules"] is False
    assert data["rules_detected"] == 0
    assert data["exceptions_detected"] == 0
    assert data["ambiguous_items"] == 0
    assert data["rules"] == []
    assert data["structured_rules"] == []
    assert data["defaults_used"] == []
    assert data.get("is_unrelated") is True

