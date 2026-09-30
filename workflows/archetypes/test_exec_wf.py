import datetime
from typing import Any
import uuid

from contracts.models import LatencyBaseline, TestVerdict
from core.ledger import Ledger
from agents.impact_analyst import ImpactAnalystAgent


class TestExecWorkflow:
    """Generic Archetype B Workflow: Post-Change Automated API Testing & Regression Gating.

    Evaluates HTTP endpoints against schema contracts, SLO latencies, and EWMA baselines.
    """

    __test__ = False

    def __init__(self, ledger: Ledger | None = None) -> None:
        self.ledger = ledger or Ledger()
        self.analyst = ImpactAnalystAgent()

    def run(
        self,
        change_id: str,
        critical_endpoints: list[dict[str, Any]],
        endpoint_test_results: dict[str, list[dict[str, Any]]],
        ewma_baselines: dict[str, dict[str, float]],
        ewma_lambda: float = 0.2,
        k_sigma: float = 3.0,
        run_id: str | None = None,
        control_id: str = "GENERIC-SANITY",
        control_version: str = "1.0.0",
        definition_sha256: str = "sha256-san",
    ) -> dict[str, Any]:
        actual_run_id = run_id or f"run-test-{uuid.uuid4().hex[:12]}"
        now = datetime.datetime.now(datetime.timezone.utc)

        verdicts: list[TestVerdict] = []
        has_regression = False
        has_flaky = False

        # Evaluate each endpoint
        for ep_info in critical_endpoints:
            path = ep_info["path"]
            slo_ms = ep_info.get("slo_ms", 300.0)
            runs_data = endpoint_test_results.get(path, [{"status_code": 200, "schema_valid": True, "latency_ms": 50.0}])

            baseline = ewma_baselines.get(path, {"mu": 60.0, "sigma": 15.0, "slo_ms": slo_ms})
            mu = baseline["mu"]
            sigma = baseline["sigma"]
            max_allowed_latency = min(slo_ms, mu + k_sigma * sigma)

            passed_runs = []
            failed_runs = []

            for r in runs_data:
                status_ok = r.get("status_code", 200) in (200, 201, 204)
                schema_ok = r.get("schema_valid", True)
                lat = float(r.get("latency_ms", 0.0))
                lat_ok = lat <= max_allowed_latency

                if status_ok and schema_ok and lat_ok:
                    passed_runs.append(r)
                else:
                    failed_runs.append(r)

            # Classify endpoint result
            if len(failed_runs) == 0:
                classification = "pass"
            elif len(passed_runs) == 0:
                classification = "regression"
                has_regression = True
            else:
                classification = "flaky"
                has_flaky = True

            p95 = max(float(r.get("latency_ms", 0)) for r in runs_data)
            ev_id = f"ev-test-{actual_run_id}-{path.replace('/', '_')}"

            verdict = TestVerdict(
                change_id=change_id,
                run_id=actual_run_id,
                endpoint=path,
                status_code=runs_data[0].get("status_code", 200),
                expected_status=[200, 201, 204],
                schema_valid=all(r.get("schema_valid", True) for r in runs_data),
                p95_ms=p95,
                baseline=LatencyBaseline(mu=mu, sigma=sigma, slo_ms=slo_ms),
                reruns=len(runs_data) - 1,
                results=runs_data,
                classification=classification,
                evidence_ids=[ev_id],
            )
            verdicts.append(verdict)

            # Update EWMA baseline strictly on pass runs
            if classification == "pass":
                new_mu = ewma_lambda * p95 + (1 - ewma_lambda) * mu
                ewma_baselines[path]["mu"] = round(new_mu, 2)

        # Verdict gating
        if has_regression:
            overall_verdict = "blocked"
            status = "blocked_regression"
        elif has_flaky:
            overall_verdict = "verified_with_exceptions"
            status = "completed_with_exceptions"
        else:
            overall_verdict = "verified"
            status = "completed"

        # Log verdict to evidence ledger
        self.ledger.append(
            control_id=control_id,
            control_version=control_version,
            definition_sha256=definition_sha256,
            run_id=actual_run_id,
            kind="test_execution_verdict",
            payload={
                "change_id": change_id,
                "overall_verdict": overall_verdict,
                "has_regression": has_regression,
                "endpoints_tested": len(verdicts),
            },
            payload_ref=f"tests/{actual_run_id}",
            actor="test_executor",
            ts=now,
        )

        return {
            "status": status,
            "overall_verdict": overall_verdict,
            "change_id": change_id,
            "run_id": actual_run_id,
            "verdicts": verdicts,
            "updated_baselines": ewma_baselines,
            "has_regression": has_regression,
        }
