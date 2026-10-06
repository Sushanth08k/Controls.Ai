import os
import pytest
from agents.challenger import ChallengerAgent
from agents.evaluator import EvaluatorAgent
from agents.impact_analyst import ImpactAnalystAgent
from agents.interpreter import InterpreterAgent
from agents.onboarder import OnboarderAgent
from agents.planner import PlannerAgent
from agents.reporter import ReporterAgent
from agents.sql_agent import ComplianceSQLAgent
from contracts.models import (
    Challenge,
    DraftControlDefinition,
    Evaluation,
    Finding,
    ImpactAddendum,
    PlanReview,
    PolicyIR,
    Workpaper,
)


def sample_finding() -> Finding:
    return Finding(
        finding_id="FND-core_banking_sim-VULN-001",
        run_id="run-test-1",
        control_id="CTL-VULN-001",
        rule_id="RULE-SLA",
        target_ref="core_banking_sim",
        title="Critical vulnerability exceeded SLA",
        evidence_ids=["ev-1"],
        severity="critical",
        status="open",
    )


def test_challenger_agent() -> None:
    agent = ChallengerAgent()
    finding = sample_finding()
    res = agent.challenge_finding(
        finding,
        {"cve_id": "CVE-2023-38606", "status": "OPEN", "age_days": 45, "allowed_sla_days": 7},
    )
    assert isinstance(res, Challenge)
    assert res.subject_id == finding.finding_id
    assert res.verdict in ("confirmed", "objection")
    assert len(res.detail) > 0


def test_planner_agent() -> None:
    agent = PlannerAgent()
    res = agent.review_plan(
        run_id="run-arch-1",
        policy_ref="POL-ARCH-001",
        eligible_count=33,
        baseline={"mean": 30.0, "std": 5.0, "n": 10},
        fk_order=["source_transactions"],
        batch_size=500,
    )
    assert isinstance(res, PlanReview)
    assert isinstance(res.flags, list)
    assert isinstance(res.explanations, list)


def test_evaluator_agent() -> None:
    agent = EvaluatorAgent()
    res = agent.evaluate(
        rule_id="RULE-CVE-001",
        product="PostgreSQL",
        version="15.2",
        evidence_ids=["ev-1"],
        context={"cve_id": "CVE-2023-38606", "fixed_in": "15.3"},
    )
    assert isinstance(res, Evaluation)
    assert res.rule_id == "RULE-CVE-001"
    assert isinstance(res.applicable, bool)
    assert len(res.rationale) > 0


def test_impact_analyst_agent() -> None:
    agent = ImpactAnalystAgent()
    res = agent.analyze_change(
        change_id="CHG-001",
        release_notes="Updated payment gateway auth token endpoint and database connection pooling",
        modified_endpoints=["/api/v1/auth/token"],
        dependency_graph={"/api/v1/auth/token": ["/api/v1/payments", "/api/v1/transfers"]},
    )
    assert isinstance(res, ImpactAddendum)
    assert isinstance(res.added_endpoints, list)


def test_onboarder_agent() -> None:
    agent = OnboarderAgent()
    res = agent.onboard_rcm_row(
        control_id="CTL-ONB-001",
        title="Quarterly Access Certification",
        description="Review privileged database superusers quarterly against HR roster.",
        test_procedure="Query database_users and check rolsuper accounts against active employee records.",
        frequency="quarterly",
        risk_rating="high",
    )
    assert isinstance(res, DraftControlDefinition)
    assert res.fit in ("clean", "needs_connector", "needs_catalog", "human_led")
    assert res.definition.control_id == "CTL-ONB-001"


def test_reporter_agent() -> None:
    agent = ReporterAgent()
    finding = sample_finding()
    res = agent.generate_workpaper(
        control_id="CTL-VULN-001",
        run_id="run-vuln-1",
        period="2026-Q4",
        findings=[finding],
        evidence_summary={"ev-1": {"row_count": 10, "catalog_ref": "VQ-013"}},
        available_evidence_ids={"ev-1"},
    )
    assert isinstance(res, Workpaper)
    assert res.control_id == "CTL-VULN-001"
    assert len(res.sections) > 0


def test_interpreter_agent() -> None:
    agent = InterpreterAgent()
    res = agent.extract_with_role(
        role="reasoner",
        document_content="Policy: All transaction records older than 5 years must be moved from source_transactions to archive_transactions and then deleted.",
        doc_sha256="0" * 64,
    )
    assert isinstance(res, PolicyIR)
    assert res.retention.value == 5
    assert "source_transactions" in res.source_table or "transactions" in res.source_table


def test_mock_instances_completeness() -> None:
    models = [
        PolicyIR,
        PlanReview,
        Evaluation,
        Challenge,
        Workpaper,
        ImpactAddendum,
        DraftControlDefinition,
    ]
    for model_cls in models:
        assert hasattr(model_cls, "mock_instance"), f"{model_cls.__name__} missing mock_instance()"
        inst = model_cls.mock_instance()
        assert isinstance(inst, model_cls)


def test_compliance_sql_agent() -> None:
    agent = ComplianceSQLAgent()
    # 1. Test Archival synthesis
    arch_res = agent.synthesize(
        control_id="CTL-ARCH-001",
        run_id="run-test-arch",
        retention_years=5,
    )
    assert arch_res["agent"] == "ComplianceSQLAgent"
    assert "selection_sql" in arch_res
    assert "archival_sql" in arch_res
    assert "cleanup_sql" in arch_res

    # 2. Test Vulnerability synthesis
    vuln_res = agent.synthesize(
        control_id="CTL-VULN-001",
        run_id="run-test-vuln",
    )
    assert vuln_res["agent"] == "ComplianceSQLAgent"
    assert "selection_sql" in vuln_res
    assert "database_users" in vuln_res["selection_sql"] or "SELECT" in vuln_res["selection_sql"]
