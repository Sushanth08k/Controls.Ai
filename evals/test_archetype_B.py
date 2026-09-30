from core.ledger import Ledger
from workflows.archetypes.test_exec_wf import TestExecWorkflow


def get_test_endpoints_and_baselines() -> tuple[list[dict], dict]:
    critical = [
        {"path": "/auth/login", "slo_ms": 250.0},
        {"path": "/accounts/{id}/balance", "slo_ms": 150.0},
        {"path": "/transfers", "slo_ms": 300.0},
    ]
    baselines = {
        "/auth/login": {"mu": 80.0, "sigma": 15.0, "slo_ms": 250.0},
        "/accounts/{id}/balance": {"mu": 50.0, "sigma": 10.0, "slo_ms": 150.0},
        "/transfers": {"mu": 120.0, "sigma": 20.0, "slo_ms": 300.0},
    }
    return critical, baselines


def test_archetype_b_clean_deployment_pass() -> None:
    """Archetype B: When all endpoints conform to contracts and SLOs, verdict is verified."""
    ledger = Ledger()
    wf = TestExecWorkflow(ledger=ledger)
    critical, baselines = get_test_endpoints_and_baselines()

    results = {
        "/auth/login": [{"status_code": 200, "schema_valid": True, "latency_ms": 75.0}],
        "/accounts/{id}/balance": [{"status_code": 200, "schema_valid": True, "latency_ms": 45.0}],
        "/transfers": [{"status_code": 200, "schema_valid": True, "latency_ms": 110.0}],
    }

    res = wf.run(
        change_id="CHG-2024-001",
        critical_endpoints=critical,
        endpoint_test_results=results,
        ewma_baselines=baselines,
    )

    assert res["overall_verdict"] == "verified"
    assert res["status"] == "completed"
    assert res["has_regression"] is False

    valid, err = ledger.verify_chain()
    assert valid is True
    assert err is None


def test_archetype_b_regression_blocks_change() -> None:
    """Archetype B: Regression (500 status across reruns) blocks deployment and recommends rollback."""
    ledger = Ledger()
    wf = TestExecWorkflow(ledger=ledger)
    critical, baselines = get_test_endpoints_and_baselines()

    # /transfers fails consistently with 500 Internal Server Error
    results = {
        "/auth/login": [{"status_code": 200, "schema_valid": True, "latency_ms": 75.0}],
        "/accounts/{id}/balance": [{"status_code": 200, "schema_valid": True, "latency_ms": 45.0}],
        "/transfers": [
            {"status_code": 500, "schema_valid": False, "latency_ms": 20.0},
            {"status_code": 500, "schema_valid": False, "latency_ms": 22.0},
            {"status_code": 500, "schema_valid": False, "latency_ms": 21.0},
        ],
    }

    res = wf.run(
        change_id="CHG-2024-002",
        critical_endpoints=critical,
        endpoint_test_results=results,
        ewma_baselines=baselines,
    )

    assert res["overall_verdict"] == "blocked"
    assert res["status"] == "blocked_regression"
    assert res["has_regression"] is True

    transfers_verdict = next(v for v in res["verdicts"] if v.endpoint == "/transfers")
    assert transfers_verdict.classification == "regression"


def test_archetype_b_flaky_classification() -> None:
    """Archetype B: Mixed pass/fail across reruns is classified as flaky, not regression."""
    ledger = Ledger()
    wf = TestExecWorkflow(ledger=ledger)
    critical, baselines = get_test_endpoints_and_baselines()

    # /transfers fails once, then passes on reruns (flaky)
    results = {
        "/auth/login": [{"status_code": 200, "schema_valid": True, "latency_ms": 75.0}],
        "/accounts/{id}/balance": [{"status_code": 200, "schema_valid": True, "latency_ms": 45.0}],
        "/transfers": [
            {"status_code": 500, "schema_valid": False, "latency_ms": 20.0},
            {"status_code": 200, "schema_valid": True, "latency_ms": 115.0},
            {"status_code": 200, "schema_valid": True, "latency_ms": 118.0},
        ],
    }

    res = wf.run(
        change_id="CHG-2024-003",
        critical_endpoints=critical,
        endpoint_test_results=results,
        ewma_baselines=baselines,
    )

    assert res["overall_verdict"] == "verified_with_exceptions"
    assert res["has_regression"] is False

    transfers_verdict = next(v for v in res["verdicts"] if v.endpoint == "/transfers")
    assert transfers_verdict.classification == "flaky"
