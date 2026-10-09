import json
from pathlib import Path
from api.routers.vulnerability import DEFAULT_VULNERABILITY_POLICY
from core.policy_parser import parse_policy_specification
from core.vulnerability_engine import evaluate_vulnerability_dataset

SNAPSHOT_DIR = Path(__file__).resolve().parent / "golden_snapshots"


def test_vuln_legacy_golden_snapshot():
    """Verify parsing original minimal policy matches the Phase 0 golden snapshot."""
    golden_file = SNAPSHOT_DIR / "vuln_policy_parsed.json"
    assert golden_file.exists(), "Vuln golden snapshot must exist"
    golden_parsed = json.loads(golden_file.read_text(encoding="utf-8"))

    legacy_policy = (
        "VULNERABILITY MANAGEMENT STANDARD v1.0\n\n"
        "1. Critical vulnerabilities must be remediated within 7 days of identification.\n"
        "2. High vulnerabilities must be remediated within 30 days.\n"
        "3. Medium vulnerabilities must be remediated within 60 days.\n"
        "4. Vulnerabilities with status OPEN or IN_PROGRESS are considered unresolved.\n"
        "5. PATCHED or CLOSED vulnerabilities are considered remediated."
    )
    current_parsed = parse_policy_specification(legacy_policy, default_archetype="A")
    assert current_parsed == golden_parsed


def test_vuln_extended_policy_parsing():
    """Verify extended vuln policy parses KEV, exceptions, scan cadence, escalation, and ambiguities."""
    parsed = parse_policy_specification(DEFAULT_VULNERABILITY_POLICY, default_archetype="A")

    rules_by_id = {r["rule_id"]: r for r in parsed["rules"]}
    assert "VULN-RULE-001" in rules_by_id
    assert "VULN-RULE-002" in rules_by_id
    assert "VULN-RULE-003" in rules_by_id
    assert "VULN-RULE-004" in rules_by_id

    # New rules
    assert "VULN-RULE-KEV" in rules_by_id
    assert rules_by_id["VULN-RULE-KEV"]["rule_type"] == "KEV_SLA"
    assert rules_by_id["VULN-RULE-KEV"]["max_age_days"] == 3

    assert "VULN-RULE-EXCEPTION" in rules_by_id
    assert rules_by_id["VULN-RULE-EXCEPTION"]["rule_type"] == "EXCEPTION_GOVERNANCE"
    assert rules_by_id["VULN-RULE-EXCEPTION"]["max_expiry_days"] == 90

    assert "VULN-RULE-SCAN" in rules_by_id
    assert rules_by_id["VULN-RULE-SCAN"]["rule_type"] == "SCAN_CADENCE"
    assert rules_by_id["VULN-RULE-SCAN"]["tier1_cadence"] == "DAILY"

    assert "VULN-RULE-ESCALATION" in rules_by_id
    assert rules_by_id["VULN-RULE-ESCALATION"]["rule_type"] == "ESCALATION"
    assert rules_by_id["VULN-RULE-ESCALATION"]["escalation_days"] == 1

    # Exception item populated
    assert len(parsed["exceptions"]) >= 1
    assert parsed["exceptions"][0]["max_expiry_days"] == 90

    # Ambiguities detected
    assert len(parsed["ambiguities"]) >= 1
    amb = parsed["ambiguities"][0]
    assert "promptly" in amb["hedge_words"]
    assert "where feasible" in amb["hedge_words"]
    assert amb["status"] == "unconfirmed"

    # Verify evaluate_vulnerability_dataset safely handles extended rules
    dummy_records = [
        {
            "vulnerability_id": "V-TEST-001",
            "cve_id": "CVE-2026-9999",
            "severity": "CRITICAL",
            "discovered_at": "2026-09-25",
            "status": "OPEN",
            "cvss_score": 9.0,
        }
    ]
    eval_res = evaluate_vulnerability_dataset(dummy_records, rules=parsed["structured_rules"])
    assert eval_res["summary"]["total_scanned"] == 1
