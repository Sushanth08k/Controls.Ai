import pytest
from contracts.models import ControlDefinition, RuleSpec
from core.definitions import DefinitionRegistry, compute_definition_hash
from core.rules.engine import RuleEngine


def get_sample_definition_data() -> dict:
    return {
        "control_id": "CTL-TEST-001",
        "version": "1.0.0",
        "title": "Test Control Definition",
        "owner_role": "sec_owner",
        "reviewer_role": "sec_reviewer",
        "risk_rating": "high",
        "frequency": "0 0 1 * *",
        "archetype": "A",
        "scope": [{"type": "postgres_instance", "ref": "core_sim"}],
        "evidence": [
            {"id": "ev_superusers", "connector": "postgres", "operation": "catalog_query", "catalog_ref": "VQ-001"},
            {"id": "ev_ssl", "connector": "postgres", "operation": "catalog_query", "catalog_ref": "VQ-005"},
        ],
        "rules": [
            {
                "id": "R1",
                "primitive": "subset_of",
                "evidence_ref": "ev_superusers",
                "field": "rolname",
                "baseline_key": "approved_superusers",
                "severity": "high",
                "on_fail": "finding",
            },
            {
                "id": "R2",
                "primitive": "equals",
                "evidence_ref": "ev_ssl",
                "field": "setting",
                "value": "on",
                "severity": "medium",
                "on_fail": "finding",
            },
        ],
        "baseline_ref": "baselines/postgres_cis_min.yaml",
        "agent_tasks": [],
        "archetype_params": {},
        "composition": [],
        "gates": [],
    }


def test_definition_loading_and_hashing() -> None:
    registry = DefinitionRegistry()
    data = get_sample_definition_data()

    defn, d_hash = registry.load_definition_from_dict(data, approve_auto=True)
    assert defn.control_id == "CTL-TEST-001"
    assert len(d_hash) == 64
    assert registry.is_approved(d_hash) is True


def test_referential_integrity_undeclared_evidence_ref() -> None:
    registry = DefinitionRegistry()
    data = get_sample_definition_data()
    # Point rule to non-existent evidence id
    data["rules"][0]["evidence_ref"] = "non_existent_evidence"

    with pytest.raises(ValueError) as exc_info:
        registry.load_definition_from_dict(data)
    assert "references undeclared evidence id" in str(exc_info.value)


def test_raw_sql_in_definition_rejected() -> None:
    registry = DefinitionRegistry()
    data = get_sample_definition_data()
    # Inject raw SQL keyword
    data["metadata"] = {"notes": "SELECT * FROM users"}

    with pytest.raises(ValueError) as exc_info:
        registry.load_definition_from_dict(data)
    assert "Raw SQL keyword" in str(exc_info.value)


def test_rule_primitive_subset_of() -> None:
    rule = RuleSpec(
        id="R1",
        primitive="subset_of",
        evidence_ref="ev1",
        field="rolname",
        baseline_key="approved",
        severity="high",
    )
    baseline = {"approved": ["postgres", "repl_user"]}

    # Clean data (subset)
    pass_ev = {"rows": [{"rolname": "postgres"}]}
    res_pass = RuleEngine.evaluate_rule(rule, pass_ev, baseline)
    assert res_pass.passed is True

    # Violating data (extra role)
    fail_ev = {"rows": [{"rolname": "postgres"}, {"rolname": "unauthorized_admin"}]}
    res_fail = RuleEngine.evaluate_rule(rule, fail_ev, baseline)
    assert res_fail.passed is False
    assert "unauthorized_admin" in res_fail.details.added


def test_rule_primitive_equals() -> None:
    rule = RuleSpec(
        id="R2",
        primitive="equals",
        evidence_ref="ev2",
        field="setting",
        value="on",
        severity="medium",
    )

    res_pass = RuleEngine.evaluate_rule(rule, {"rows": [{"setting": "on"}]})
    assert res_pass.passed is True

    res_fail = RuleEngine.evaluate_rule(rule, {"rows": [{"setting": "off"}]})
    assert res_fail.passed is False


def test_rule_primitive_row_count() -> None:
    rule = RuleSpec(
        id="R3",
        primitive="row_count",
        evidence_ref="ev3",
        op="==",
        n=0,
        severity="critical",
    )

    res_pass = RuleEngine.evaluate_rule(rule, {"rows": []})
    assert res_pass.passed is True

    res_fail = RuleEngine.evaluate_rule(rule, {"rows": [{"finding": 1}]})
    assert res_fail.passed is False


def test_rule_primitive_no_drift() -> None:
    rule = RuleSpec(
        id="R4",
        primitive="no_drift",
        evidence_ref="ev4",
        field="rolname",
        key_fields=["rolname"],
        severity="medium",
    )

    prev_data = {"rows": [{"rolname": "postgres"}, {"rolname": "svc_app"}]}
    # Added new role and removed svc_app
    curr_data = {"rows": [{"rolname": "postgres"}, {"rolname": "new_svc"}]}

    res = RuleEngine.evaluate_rule(rule, curr_data, previous_period_data=prev_data)
    assert res.passed is False
    assert ["new_svc"] in res.details.added
    assert ["svc_app"] in res.details.removed


@pytest.mark.asyncio
async def test_supervisor_workflow_unapproved_definition_refusal() -> None:
    from workflows.supervisor_wf import SupervisorWorkflow

    wf = SupervisorWorkflow()
    data = get_sample_definition_data()

    # When is_approved is False, must refuse
    with pytest.raises(PermissionError) as exc_info:
        await wf.run(data, is_approved=False)
    assert "Supervisor refused unapproved control definition" in str(exc_info.value)

    # When approved, completes fan-out
    res = await wf.run(data, is_approved=True)
    assert res["status"] == "completed"
    assert "core_sim" in res["targets_processed"]
