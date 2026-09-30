import pytest
from core.definitions import default_registry
from workflows.archetypes.query_review_wf import QueryReviewWorkflow
from core.ledger import Ledger


def test_archetype_a_vulnerability_control() -> None:
    """Execute CTL-VULN-001 through generic Archetype A workflow."""
    definitions = default_registry.load_all(approve_existing=True)
    defn = definitions.get("CTL-VULN-001")
    assert defn is not None, "CTL-VULN-001 must be loaded"

    ledger = Ledger()
    wf = QueryReviewWorkflow(ledger=ledger)

    # Simulated evidence data from vulnerable database target
    target_evidence = {
        "vuln_target": {
            "superusers": {
                "rows": [
                    {"rolname": "postgres", "rolsuper": True},
                    {"rolname": "unauthorized_root", "rolsuper": True},  # Violation of R1
                ]
            },
            "public_grants": {
                "rows": [
                    {"grantee": "PUBLIC", "table_name": "customers"}  # Violation of R2 (expected 0)
                ]
            },
            "pw_enc": {
                "rows": [{"setting": "md5"}]  # Violation of R3 (expected scram-sha-256)
            },
            "ssl": {
                "rows": [{"setting": "off"}]  # Violation of R4 (expected on)
            },
            "hba": {
                "rows": []  # Pass R5
            },
            "extensions": {
                "rows": [{"extname": "plpgsql"}]  # Pass R6
            },
            "version": {
                "rows": [{"version": "PostgreSQL 15.1"}]  # Violation of R7 (vulnerable version)
            },
        },
        "core_banking_sim": {
            "superusers": {"rows": [{"rolname": "postgres"}]},
            "public_grants": {"rows": []},
            "pw_enc": {"rows": [{"setting": "scram-sha-256"}]},
            "ssl": {"rows": [{"setting": "on"}]},
            "hba": {"rows": []},
            "extensions": {"rows": [{"extname": "plpgsql"}]},
            "version": {"rows": [{"version": "PostgreSQL 16.3"}]},
        },
    }

    result = wf.run(
        definition=defn,
        target_evidence=target_evidence,
        period="2026-M09",
    )

    assert result["status"] == "completed"
    findings = result["findings"]
    assert len(findings) >= 4, f"Expected at least 4 security findings, got {len(findings)}"

    # Check that all findings have at least one valid resolved evidence ID
    for f in findings:
        assert len(f.evidence_ids) >= 1
        assert all(ev_id in result["evidence_ids"] for ev_id in f.evidence_ids)

    # Check workpaper citations
    workpaper = result["workpaper"]
    assert workpaper is not None
    assert workpaper.conclusion in ("effective_with_exceptions", "ineffective")
    for sec in workpaper.sections:
        assert len(sec.evidence_ids) >= 1

    # Verify ledger integrity
    valid, err = ledger.verify_chain()
    assert valid is True
    assert err is None
