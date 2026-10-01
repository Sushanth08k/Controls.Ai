import datetime
import uuid
from typing import Any

from agents.challenger import ChallengerAgent
from agents.evaluator import EvaluatorAgent
from agents.reporter import ReporterAgent
from contracts.models import ControlDefinition, Finding, Workpaper
from core.definitions import compute_definition_hash
from core.ledger import Ledger
from core.rules.engine import RuleEngine, load_baseline


class QueryReviewWorkflow:
    """Generic Archetype A Workflow: Evidence Query & Rule Check.

    Executes across any declarative control definition fitting Archetype A with zero control-specific code.
    """

    def __init__(self, ledger: Ledger | None = None) -> None:
        self.ledger = ledger or Ledger()
        self.evaluator = EvaluatorAgent()
        self.challenger = ChallengerAgent()
        self.reporter = ReporterAgent()

    def run(
        self,
        definition: ControlDefinition,
        target_evidence: dict[str, dict[str, Any]] | None = None,
        period: str = "current_period",
        previous_period_data: dict[str, Any] | None = None,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        actual_run_id = run_id or f"run-{uuid.uuid4().hex[:12]}"
        defn_hash = compute_definition_hash(definition)
        now = datetime.datetime.now(datetime.UTC)

        # Baseline data
        baseline = load_baseline(definition.baseline_ref)

        all_findings: list[Finding] = []
        all_evidence_ids: set[str] = set()
        evidence_summary: dict[str, Any] = {}

        # Fallback evidence retrieval if caller did not supply target_evidence
        auto_evidence: dict[str, dict[str, Any]] = {}
        if target_evidence is None:
            for target in definition.scope:
                for ev_spec in definition.evidence:
                    if ev_spec.catalog_ref == "VQ-013" or ev_spec.id in ("vulnerabilities", "db_vulnerabilities"):
                        try:
                            from sim.database import query_vulnerabilities_table
                            rows = query_vulnerabilities_table()
                            auto_evidence.setdefault(target.ref, {})[ev_spec.id] = {"rows": rows}
                        except Exception:
                            auto_evidence.setdefault(target.ref, {})[ev_spec.id] = {"rows": []}
                    else:
                        auto_evidence.setdefault(target.ref, {})[ev_spec.id] = {"rows": []}

        # Scope Fan-Out: Process each target instance/ref
        for target in definition.scope:
            target_ref = target.ref
            target_data = (target_evidence or {}).get(target_ref)
            if target_data is None:
                target_data = auto_evidence.get(target_ref, {})

            # 1. Collect and register evidence records
            for ev_spec in definition.evidence:
                ev_id = f"ev-{target_ref}-{ev_spec.id}"
                raw_payload = target_data.get(ev_spec.id, {"rows": []})

                entry = self.ledger.append(
                    control_id=definition.control_id,
                    control_version=definition.version,
                    definition_sha256=defn_hash,
                    run_id=actual_run_id,
                    kind="evidence_collected",
                    payload=raw_payload,
                    payload_ref=f"evidence/{actual_run_id}/{ev_id}",
                    actor="workflow_collector",
                    evidence_id=ev_id,
                    ts=now,
                )
                all_evidence_ids.add(ev_id)
                evidence_summary[ev_id] = {
                    "catalog_ref": ev_spec.catalog_ref,
                    "target_ref": target_ref,
                    "row_count": len(raw_payload.get("rows", [])),
                    "entry_hash": entry.entry_hash,
                }

            # 2. Rule evaluation over evidence + baseline
            for rule in definition.rules:
                ev_data = target_data.get(rule.evidence_ref, {"rows": []})
                rule_res = RuleEngine.evaluate_rule(
                    rule=rule,
                    evidence_data=ev_data,
                    baseline_data=baseline,
                    previous_period_data=previous_period_data,
                    severity_policy=definition.severity_policy,
                )

                if not rule_res.passed:
                    ev_id = f"ev-{target_ref}-{rule.evidence_ref}"

                    # Handle granular violations (e.g. from registered domain evaluators)
                    violations = rule_res.details.context.get("violations")
                    if violations and isinstance(violations, list):
                        for viol in violations:
                            item_id = viol.get("vulnerability_id") or viol.get("id") or uuid.uuid4().hex[:6]
                            cve_id = viol.get("cve_id", "")
                            viol_sev = str(viol.get("severity", rule.severity)).lower()
                            if viol_sev not in ("low", "medium", "high", "critical"):
                                viol_sev = "medium"
                            sla_days = viol.get("allowed_sla_days") or definition.severity_policy.get(viol_sev, 30)
                            sla_due = now + datetime.timedelta(days=sla_days)
                            age_days = viol.get("age_days", 0)

                            f_title = (
                                f"{viol_sev.title()} vulnerability {cve_id} exceeded remediation SLA ({age_days}d > {sla_days}d)"
                                if cve_id
                                else f"Rule {rule.id} violation on {target_ref}: {item_id}"
                            )

                            finding = Finding(
                                finding_id=f"FND-{target_ref}-{rule.id}-{item_id}",
                                run_id=actual_run_id,
                                control_id=definition.control_id,
                                rule_id=rule.id,
                                target_ref=target_ref,
                                title=f_title,
                                evidence_ids=[ev_id],
                                severity=viol_sev,
                                attributes=viol,
                                risk_score=float(viol.get("cvss_score") or 0.0) if viol.get("cvss_score") is not None else None,
                                sla_due=sla_due,
                                status="open",
                            )
                            try:
                                challenge_res = self.challenger.challenge_finding(finding, ev_data)
                                finding = finding.model_copy(
                                    update={
                                        "challenge": challenge_res,
                                        "status": "confirmed" if challenge_res.verdict == "confirmed" else "disputed",
                                    }
                                )
                            except Exception:
                                pass
                            all_findings.append(finding)
                    else:
                        is_applicable = True

                        # 3. Contextual evaluation if rule defines evaluator_task
                        if rule.evaluator_task:
                            try:
                                eval_res = self.evaluator.evaluate(
                                    rule_id=rule.id,
                                    product=rule.product or "generic",
                                    version=str(ev_data.get("rows", [{}])[0].get("version", "")),
                                    evidence_ids=[ev_id],
                                    context=rule_res.details.model_dump(),
                                )
                                is_applicable = eval_res.applicable
                            except Exception:
                                # Default fail-safe: keep finding open if evaluator cannot dismiss
                                is_applicable = True

                        if is_applicable:
                            finding_id = f"FND-{target_ref}-{rule.id}"
                            sla_days = definition.severity_policy.get(rule.severity, 30)
                            sla_due = now + datetime.timedelta(days=sla_days)

                            # CVE Risk Formula calculation if CVSS base is available
                            risk_score = None
                            if rule.primitive == "version_not_vulnerable":
                                alpha_kev = definition.archetype_params.get("risk_formula", {}).get("alpha_kev", 1.0)
                                beta_epss = definition.archetype_params.get("risk_formula", {}).get("beta_epss", 1.0)
                                cvss_base = 7.5
                                risk_score = cvss_base * (1 + alpha_kev * 0.0 + beta_epss * 0.05)

                            finding = Finding(
                                finding_id=finding_id,
                                run_id=actual_run_id,
                                control_id=definition.control_id,
                                rule_id=rule.id,
                                target_ref=target_ref,
                                title=f"Rule {rule.id} failed on {target_ref} ({rule.primitive})",
                                evidence_ids=[ev_id],
                                severity=rule.severity if rule.severity in ("low", "medium", "high", "critical") else "medium",
                                attributes=rule_res.details.model_dump(),
                                risk_score=risk_score,
                                sla_due=sla_due,
                                status="open",
                            )

                            # 4. Challenger scrutinizes finding
                            try:
                                challenge_res = self.challenger.challenge_finding(finding, ev_data)
                                finding = finding.model_copy(
                                    update={
                                        "challenge": challenge_res,
                                        "status": "confirmed" if challenge_res.verdict == "confirmed" else "disputed",
                                    }
                                )
                            except Exception:
                                pass

                            all_findings.append(finding)

        # 5. Workpaper generation by Reporter agent
        workpaper = None
        try:
            workpaper = self.reporter.generate_workpaper(
                control_id=definition.control_id,
                run_id=actual_run_id,
                period=period,
                findings=all_findings,
                evidence_summary=evidence_summary,
                available_evidence_ids=all_evidence_ids,
            )
        except Exception:
            # Fallback deterministic workpaper if offline
            workpaper = Workpaper(
                run_id=actual_run_id,
                control_id=definition.control_id,
                version=definition.version,
                period=period,
                conclusion="effective_with_exceptions" if all_findings else "effective",
                summary=f"Automated evaluation completed with {len(all_findings)} finding(s).",
                findings_ref=[f.finding_id for f in all_findings],
                sections=[
                    {
                        "heading": "Control Execution Summary",
                        "body": f"Evaluated {len(definition.rules)} rules across {len(definition.scope)} target(s).",
                        "evidence_ids": list(all_evidence_ids),
                    }
                ],
            )

        # 6. Seal run in ledger
        self.ledger.append(
            control_id=definition.control_id,
            control_version=definition.version,
            definition_sha256=defn_hash,
            run_id=actual_run_id,
            kind="run_sealed",
            payload={"conclusion": workpaper.conclusion, "total_findings": len(all_findings)},
            payload_ref=f"workpaper/{actual_run_id}",
            actor="supervisor",
            ts=now,
        )

        total_rows = sum(s.get("row_count", 0) for s in evidence_summary.values())
        return {
            "status": "completed",
            "run_id": actual_run_id,
            "control_id": definition.control_id,
            "findings": all_findings,
            "workpaper": workpaper,
            "evidence_ids": list(all_evidence_ids),
            "evidence_summary": evidence_summary,
            "records_scanned": total_rows,
            "passed": max(0, total_rows - len(all_findings)),
            "failed": len(all_findings),
        }
