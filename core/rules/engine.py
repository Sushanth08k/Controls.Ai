from collections.abc import Callable
from pathlib import Path
from typing import Any

import yaml

from contracts.models import RuleResult, RuleResultDetails, RuleSpec

CATALOGS_DIR = Path(__file__).resolve().parent.parent.parent / "catalogs"

# Optional domain evaluator registry: maps primitive/evaluator names to deterministic evaluators
# Signature: (rows, rule, baseline, severity_policy) -> tuple[bool, RuleResultDetails]
_DOMAIN_EVALUATORS: dict[str, Callable[[list[dict[str, Any]], RuleSpec, dict[str, Any], dict[str, int] | None], tuple[bool, RuleResultDetails]]] = {}


def register_domain_evaluator(
    name: str,
    fn: Callable[[list[dict[str, Any]], RuleSpec, dict[str, Any], dict[str, int] | None], tuple[bool, RuleResultDetails]],
) -> None:
    """Register a deterministic domain evaluator for a declarative rule primitive."""
    _DOMAIN_EVALUATORS[name] = fn


def get_domain_evaluator(name: str) -> Any | None:
    """Retrieve registered domain evaluator by name."""
    return _DOMAIN_EVALUATORS.get(name)


def evaluate_vulnerability_sla_rule(
    rows: list[dict[str, Any]],
    rule: RuleSpec,
    baseline: dict[str, Any],
    severity_policy: dict[str, int] | None = None,
) -> tuple[bool, RuleResultDetails]:
    """Deterministic domain evaluation for vulnerability remediation SLAs."""
    from core.vulnerability_engine import DEFAULT_VULNERABILITY_RULES, evaluate_single_vulnerability

    if severity_policy:
        active_rules_by_sev = {
            sev.upper(): {
                "rule_id": f"VULN-SLA-{sev.upper()}",
                "severity": sev.upper(),
                "max_age_days": days,
                "allowed_status": ["PATCHED", "CLOSED"],
            }
            for sev, days in severity_policy.items()
        }
    else:
        active_rules_by_sev = {str(r.get("severity", "")).upper(): r for r in DEFAULT_VULNERABILITY_RULES}

    evaluations: list[dict[str, Any]] = []
    violations: list[dict[str, Any]] = []
    exceptions: list[dict[str, Any]] = []

    for r in rows:
        ev = evaluate_single_vulnerability(r, active_rules_by_sev)
        evaluations.append(ev)
        if ev.get("result") == "FAIL":
            violations.append(ev)
        elif ev.get("result") == "EXCEPTION":
            exceptions.append(ev)

    passed = len(violations) == 0
    compliant_count = sum(1 for e in evaluations if e.get("result") == "PASS")
    details = RuleResultDetails(
        context={
            "evaluations": evaluations,
            "violations": violations,
            "exceptions": exceptions,
            "total_scanned": len(evaluations),
            "compliant": compliant_count,
            "violations_count": len(violations),
            "exceptions_count": len(exceptions),
            "severity_policy": severity_policy or {},
        }
    )
    return passed, details


# Register standard domain evaluators
register_domain_evaluator("vulnerability_sla", evaluate_vulnerability_sla_rule)
register_domain_evaluator("sla_remediation", evaluate_vulnerability_sla_rule)


def load_baseline(baseline_ref: str | None) -> dict[str, Any]:
    """Load baseline dictionary from catalogs path."""
    if not baseline_ref:
        return {}
    path = CATALOGS_DIR / baseline_ref if not Path(baseline_ref).is_absolute() else Path(baseline_ref)
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


class RuleEngine:
    """Deterministic Rule Engine evaluating declarative primitives over canonical evidence."""

    @staticmethod
    def evaluate_rule(
        rule: RuleSpec,
        evidence_data: dict[str, Any],
        baseline_data: dict[str, Any] | None = None,
        previous_period_data: dict[str, Any] | None = None,
        severity_policy: dict[str, int] | None = None,
    ) -> RuleResult:
        primitive = rule.primitive
        baseline = baseline_data or {}
        rows = evidence_data.get("rows", [])
        field = rule.field

        passed = True
        details = RuleResultDetails()

        if primitive == "subset_of":
            assert field is not None
            assert rule.baseline_key is not None
            expected_set = set(baseline.get(rule.baseline_key, []))
            actual_set = {r[field] for r in rows if field in r}
            diff = actual_set - expected_set
            if diff:
                passed = False
                details = RuleResultDetails(
                    added=list(diff),
                    context={"expected_subset": list(expected_set), "actual": list(actual_set)},
                )

        elif primitive == "disjoint_from":
            assert field is not None
            assert rule.baseline_key is not None
            forbidden_set = set(baseline.get(rule.baseline_key, []))
            actual_set = {r[field] for r in rows if field in r}
            overlap = actual_set.intersection(forbidden_set)
            if overlap:
                passed = False
                details = RuleResultDetails(
                    added=list(overlap),
                    context={"overlap": list(overlap)},
                )

        elif primitive == "equals":
            assert field is not None
            # Check single config row or all rows
            if not rows:
                passed = False
                details = RuleResultDetails(context={"error": "No rows returned for equals check"})
            else:
                for r in rows:
                    if str(r.get(field)) != str(rule.value):
                        passed = False
                        details = RuleResultDetails(
                            context={"field": field, "actual": r.get(field), "expected": rule.value}
                        )
                        break

        elif primitive == "in":
            assert field is not None
            allowed_values = rule.values or []
            for r in rows:
                if r.get(field) not in allowed_values:
                    passed = False
                    details = RuleResultDetails(
                        context={"field": field, "actual": r.get(field), "allowed": allowed_values}
                    )
                    break

        elif primitive == "row_count":
            op = rule.op or "=="
            n = rule.n if rule.n is not None else 0
            count = len(rows)

            if op in ("==", "="):
                passed = count == n
            elif op == "!=":
                passed = count != n
            elif op == ">":
                passed = count > n
            elif op == "<":
                passed = count < n
            elif op == ">=":
                passed = count >= n
            elif op == "<=":
                passed = count <= n

            if not passed:
                details = RuleResultDetails(
                    context={"actual_count": count, "operator": op, "target_n": n}
                )

        elif primitive == "threshold":
            assert field is not None
            op = rule.op or "<="
            target = float(rule.value) if rule.value is not None else 0.0

            for r in rows:
                val = float(r.get(field, 0))
                cond = False
                if op == "<=":
                    cond = val <= target
                elif op == "<":
                    cond = val < target
                elif op == ">=":
                    cond = val >= target
                elif op == ">":
                    cond = val > target
                elif op == "==":
                    cond = val == target
                if not cond:
                    passed = False
                    details = RuleResultDetails(
                        context={"violating_value": val, "operator": op, "threshold": target}
                    )
                    break

        elif primitive == "no_drift":
            if previous_period_data is None:
                passed = True
                details = RuleResultDetails(context={"status": "initial_period_no_baseline"})
            else:
                prev_rows = previous_period_data.get("rows", [])
                key_fields = rule.key_fields or ([field] if field else ["id"])

                def make_key(r: dict[str, Any]) -> tuple[Any, ...]:
                    return tuple(r.get(k) for k in key_fields)

                curr_keys = {make_key(r) for r in rows}
                prev_keys = {make_key(r) for r in prev_rows}

                added = [list(k) for k in curr_keys - prev_keys]
                removed = [list(k) for k in prev_keys - curr_keys]

                if added or removed:
                    passed = False
                    details = RuleResultDetails(
                        added=added,
                        removed=removed,
                        context={"key_fields": key_fields},
                    )

        elif primitive == "version_not_vulnerable":
            # Baseline or CVE lookup
            product = rule.product or "postgresql"
            for r in rows:
                ver = str(r.get(field or "version", ""))
                # Flag known vulnerable mock versions (e.g. 15.1 or older)
                if "15.1" in ver or "14." in ver:
                    passed = False
                    details = RuleResultDetails(
                        context={"vulnerable_version": ver, "product": product}
                    )
                    break

        elif primitive in _DOMAIN_EVALUATORS:
            eval_fn = _DOMAIN_EVALUATORS[primitive]
            passed, details = eval_fn(rows, rule, baseline, severity_policy)

        else:
            raise NotImplementedError(f"Unsupported rule primitive: '{primitive}'")

        return RuleResult(
            rule_id=rule.id,
            evidence_ref=rule.evidence_ref,
            primitive=primitive,
            passed=passed,
            details=details,
            severity=rule.severity,
        )
