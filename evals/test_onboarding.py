import csv
from pathlib import Path
from contracts.models import ControlDefinition, DraftControlDefinition, PriorityInputs
from core.ledger import Ledger
from workflows.onboard_wf import OnboardWorkflow


def test_onboarding_rcm_workflow() -> None:
    """Test onboarding workflow from sample RCM row to approved definition proposal."""
    rcm_path = Path(__file__).resolve().parent.parent / "sim" / "rcm_sample.csv"
    with open(rcm_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    row = rows[0]  # CTL-SAMPLE-001 (Monthly Superuser Access Review)
    ledger = Ledger()
    wf = OnboardWorkflow(ledger=ledger)

    mock_defn = ControlDefinition(
        control_id="CTL-ONBOARD-001",
        version="1.0.0",
        title=row["title"],
        objective=row["description"],
        owner_role="db_security_owner",
        reviewer_role="control_reviewer",
        risk_rating="high",
        frequency="0 0 1 * *",
        archetype="A",
        scope=[{"type": "postgres_instance", "ref": "core_banking_sim"}],
        evidence=[
            {"id": "superusers", "connector": "postgres", "operation": "catalog_query", "catalog_ref": "VQ-001"}
        ],
        rules=[
            {
                "id": "R1",
                "primitive": "subset_of",
                "evidence_ref": "superusers",
                "field": "rolname",
                "baseline_key": "approved_superusers",
                "severity": "high",
            }
        ],
        baseline_ref="baselines/postgres_cis_min.yaml",
        agent_tasks=[],
        gates=[],
    )

    mock_draft = DraftControlDefinition(
        definition=mock_defn,
        fit="clean",
        gaps=[],
        priority_inputs=PriorityInputs(
            frequency=12.0,       # Monthly = 12 runs/year
            manual_effort=4.0,    # 4 hours per review
            risk=3.0,             # High risk
            feasibility=0.95,     # Clean fit
        ),
        rcm_ref="RCM-2024-DB-001",
    )

    res = wf.run(
        rcm_row=row,
        maker_id="security_architect_1",
        mock_draft=mock_draft,
    )

    assert res["status"] == "pending_approval"
    assert res["control_id"] == "CTL-ONBOARD-001"
    assert res["fit"] == "clean"
    assert res["dry_run_passed"] is True
    # Priority: 12 * 4 * 3 * 0.95 = 136.8
    assert res["priority_score"] == 136.8

    valid, err = ledger.verify_chain()
    assert valid is True
    assert err is None
