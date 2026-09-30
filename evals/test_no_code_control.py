import pytest
from core.definitions import default_registry
from workflows.archetypes.query_review_wf import QueryReviewWorkflow
from core.ledger import Ledger


def test_no_code_privileged_access_control() -> None:
    """Acceptance test: CTL-PRIV-001 runs end-to-end with ZERO code changes outside controls, catalogs, baselines."""
    definitions = default_registry.load_all(approve_existing=True)
    defn = definitions.get("CTL-PRIV-001")
    assert defn is not None, "CTL-PRIV-001 must be loaded dynamically from controls/CTL-PRIV-001.yaml"

    ledger = Ledger()
    wf = QueryReviewWorkflow(ledger=ledger)

    # Simulated targets with dormant roles and unauthorized role admins
    target_evidence = {
        "core_banking_sim": {
            "superusers": {"rows": [{"rolname": "postgres"}]},
            "createrole": {
                "rows": [
                    {"rolname": "user_admin"},
                    {"rolname": "rogue_contractor"},  # Violation of R2
                ]
            },
            "dormant": {
                "rows": [{"rolname": "old_backup_svc"}]  # Violation of R3 (expected 0)
            },
        },
        "archive": {
            "superusers": {"rows": [{"rolname": "postgres"}]},
            "createrole": {"rows": [{"rolname": "user_admin"}]},
            "dormant": {"rows": []},
        },
    }

    result = wf.run(
        definition=defn,
        target_evidence=target_evidence,
        period="2026-M09",
    )

    assert result["status"] == "completed"
    findings = result["findings"]
    # Should catch rogue_contractor and old_backup_svc
    assert len(findings) == 2

    finding_rules = {f.rule_id for f in findings}
    assert "R2" in finding_rules
    assert "R3" in finding_rules

    # Check workpaper citations
    workpaper = result["workpaper"]
    assert workpaper is not None
    assert workpaper.conclusion == "effective_with_exceptions"

    # Verify ledger integrity
    valid, err = ledger.verify_chain()
    assert valid is True
    assert err is None
