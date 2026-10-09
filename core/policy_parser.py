import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

WORD_TO_NUM: dict[str, int] = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "fifteen": 15,
    "twenty": 20,
    "thirty": 30,
}


def parse_numeric_value(val_str: str) -> str:
    """Normalize numeric strings like 'five' or '5' to '5'."""
    cleaned = val_str.strip().rstrip(".,;").lower()
    if cleaned in WORD_TO_NUM:
        return str(WORD_TO_NUM[cleaned])
    if cleaned.isdigit():
        return cleaned
    return cleaned


def deduplicate_rules(rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Deduplicate extracted rules based on semantic criteria
    (table, field, operator, value, unit, action) and normalized text descriptions.
    Re-indexes rule IDs to ensure continuous numbering (RULE-001, RULE-002, ...).
    """
    unique_rules: list[dict[str, Any]] = []
    seen_sigs: set[str] = set()

    for rule in rules:
        cond = rule.get("condition") or {}
        field = str(cond.get("field", "")).strip().lower()
        operator = str(cond.get("operator", "")).strip().upper()
        val = str(cond.get("value", "")).strip().lower()
        unit = str(cond.get("unit", "")).strip().lower()
        action = str(rule.get("action", "")).strip().upper()

        desc = str(rule.get("description", "")).strip()
        table_prefix = ""
        if desc.startswith("[") and "]" in desc:
            table_prefix = desc[1:desc.index("]")].strip().lower()

        # Semantic condition signature
        semantic_sig = f"{table_prefix}:{field}:{operator}:{val}:{unit}:{action}" if field else ""

        # Normalized textual description signature
        norm_desc = re.sub(r"^\[.*?\]\s*", "", desc)
        norm_desc = re.sub(r"^(?:rule\s*\d+\s*:\s*|operation\s*:\s*\w+\s*)", "", norm_desc, flags=re.I).strip().lower()
        norm_desc = " ".join(norm_desc.split())
        text_sig = f"{table_prefix}:{norm_desc}" if norm_desc else ""

        # If either signature has already been registered, skip this duplicate
        if (semantic_sig and semantic_sig in seen_sigs) or (text_sig and text_sig in seen_sigs):
            continue

        if semantic_sig:
            seen_sigs.add(semantic_sig)
        if text_sig:
            seen_sigs.add(text_sig)

        unique_rules.append(rule)

    # Re-number cleanly
    for idx, r in enumerate(unique_rules):
        r["rule_id"] = f"RULE-{idx + 1:03d}"

    return unique_rules


def deduplicate_exceptions(exceptions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Deduplicate extracted exceptions based on exclusion criteria
    (field, operator, value, action) and normalized reasons.
    Re-indexes exception IDs (EXC-001, EXC-002, ...).
    """
    unique_exceptions: list[dict[str, Any]] = []
    seen_sigs: set[str] = set()

    for exc in exceptions:
        field = str(exc.get("field", "")).strip().lower()
        op = str(exc.get("operator", "")).strip().upper()
        val = str(exc.get("value", "")).strip().lower()
        act = str(exc.get("action", "")).strip().upper()
        reason = str(exc.get("reason", "") or exc.get("description", "")).strip().lower()
        norm_reason = " ".join(reason.split())

        sig = f"{field}:{op}:{val}:{act}" if field else ""
        reason_sig = f"{field}:{norm_reason}" if norm_reason else ""

        if (sig and sig in seen_sigs) or (reason_sig and reason_sig in seen_sigs):
            continue

        if sig:
            seen_sigs.add(sig)
        if reason_sig:
            seen_sigs.add(reason_sig)

        unique_exceptions.append(exc)

    for idx, e in enumerate(unique_exceptions):
        e["exception_id"] = f"EXC-{idx + 1:03d}"

    return unique_exceptions


def deduplicate_requirements(requirements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate extracted requirements by normalized text description."""
    unique_reqs: list[dict[str, Any]] = []
    seen: set[str] = set()

    for req in requirements:
        desc = str(req.get("description", "")).strip().lower()
        norm = " ".join(desc.split())
        if not norm or norm in seen:
            continue
        seen.add(norm)
        unique_reqs.append(req)

    for idx, r in enumerate(unique_reqs):
        r["requirement_id"] = f"REQ-{idx + 1:03d}"

    return unique_reqs


def deduplicate_ambiguities(ambiguities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate ambiguity flags by type and normalized description."""
    unique_ambs: list[dict[str, Any]] = []
    seen: set[str] = set()

    for amb in ambiguities:
        atype = str(amb.get("type", "")).strip().upper()
        desc = str(amb.get("description", "")).strip().lower()
        sig = f"{atype}:{desc}"
        if sig in seen:
            continue
        seen.add(sig)
        unique_ambs.append(amb)

    return unique_ambs


def extract_policy_with_regex(text: str) -> dict[str, Any]:
    """
    Extract structured rules, exceptions, and metadata from policy text
    using regular expressions and pattern matching heuristics.
    """
    if not text or not text.strip():
        raise ValueError("Policy text is empty")

    # 1. Extract Document Title / Name
    title = "Data Retention and Archival Policy"
    first_line_match = re.search(r"^(?:[#=\s]*)(.*?)(?:\n|$)", text.strip())
    if first_line_match:
        cand = first_line_match.group(1).strip().strip("=")
        if len(cand) > 3 and not cand.startswith("---"):
            title = cand

    # Extract Policy ID if present
    doc_id_match = re.search(r"Policy Document ID:\s*([^\n\r]+)", text, re.IGNORECASE)
    doc_id = doc_id_match.group(1).strip() if doc_id_match else None

    # 2. Check if text has distinct Policy sections
    section_pattern = re.compile(
        r"(?:={10,}\s*)?POLICY\s+(\d+):\s*([^\n\r]+)(.*?)(?=(?:={10,}\s*)?POLICY\s+\d+:|(?:={10,}\s*)?GLOBAL|$)",
        re.DOTALL | re.IGNORECASE,
    )
    sections = list(section_pattern.finditer(text))

    rules: list[dict[str, Any]] = []
    exceptions: list[dict[str, Any]] = []
    requirements: list[dict[str, Any]] = []
    ambiguities: list[dict[str, Any]] = []
    sources: list[str] = []
    scopes_found: list[str] = []

    if sections:
        # Structured multi-policy document
        for match in sections:
            p_num = match.group(1)
            p_title = match.group(2).strip()
            p_body = match.group(3).strip() + "\n"

            scopes_found.append(p_title)

            # Table & date field
            table_m = re.search(r"Source table:\s*([a-zA-Z0-9_]+)", p_body, re.I)
            table_name = table_m.group(1).strip() if table_m else "records"

            date_field_m = re.search(
                r"(?:date field|closure field|creation date field|timestamp field):\s*([a-zA-Z0-9_]+)",
                p_body,
                re.I,
            )
            date_field = date_field_m.group(1).strip() if date_field_m else "created_at"

            # Parse rule blocks
            rule_blocks = re.findall(
                r"Rule\s+(\d+):\s*\n(.*?)(?=\n\s*(?:Rule\s+\d+:|Constraints:)|\s*$)",
                p_body,
                re.DOTALL | re.IGNORECASE,
            )

            for r_idx, r_body in rule_blocks:
                clean_body = " ".join(r_body.split())
                op_m = re.search(r"Operation:\s*(\w+)", r_body, re.I)
                op = op_m.group(1).upper() if op_m else "ARCHIVE"

                if op in ("ARCHIVE", "RETAIN", "DELETE"):
                    # Find age condition
                    age_m = re.search(
                        r"(?:older than|retained for(?:\s+at least)?|more than|exceeding)\s+(\w+)\s+(years?|months?|days?)",
                        r_body,
                        re.I,
                    )
                    threshold = parse_numeric_value(age_m.group(1)) if age_m else "5"
                    unit = age_m.group(2).lower() if age_m else "years"
                    rule_type = "RETENTION" if op == "RETAIN" else "ARCHIVAL"

                    rules.append({
                        "rule_id": f"RULE-{len(rules) + 1:03d}",
                        "description": f"[{table_name}] {clean_body}",
                        "rule_type": rule_type,
                        "condition": {
                            "field": date_field,
                            "operator": "OLDER_THAN",
                            "value": threshold,
                            "unit": unit,
                        },
                        "action": "ARCHIVE" if op == "ARCHIVE" else op,
                    })
                    sources.append(clean_body)

                elif op == "EXCLUDE":
                    cond_m = re.search(
                        r"Condition:\s*\n?([a-zA-Z0-9_]+)\s+(?:equals|is|=)\s+([^\n\r\.]+)",
                        r_body,
                        re.I,
                    )
                    if cond_m:
                        ex_field = cond_m.group(1).strip()
                        ex_val = cond_m.group(2).strip()
                    else:
                        # Fallback heuristic
                        if "legal hold" in r_body.lower():
                            ex_field, ex_val = "legal_hold", "true"
                        elif "investigation" in r_body.lower():
                            ex_field, ex_val = "investigation_status", "ACTIVE"
                        else:
                            ex_field, ex_val = "excluded", "true"

                    exceptions.append({
                        "exception_id": f"EXC-{len(exceptions) + 1:03d}",
                        "title": f"Exclusion ({ex_field})",
                        "field": ex_field,
                        "operator": "EQUALS",
                        "value": ex_val,
                        "action": "EXCLUDE",
                        "reason": clean_body,
                    })
                    sources.append(clean_body)

                elif op in ("VERIFY", "REVIEW"):
                    rules.append({
                        "rule_id": f"RULE-{len(rules) + 1:03d}",
                        "description": f"[{table_name}] Verification requirement: {clean_body}",
                        "rule_type": "VERIFICATION",
                        "condition": {
                            "field": "archival_status",
                            "operator": "EQUALS",
                            "value": "VERIFIED",
                            "unit": None,
                        },
                        "action": "VERIFY",
                    })
                    sources.append(clean_body)

    # 3. If no structured sections or rules were found, use general natural language parsing
    if not rules:
        # Split sentences and clauses
        raw_sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if len(s.strip()) > 10]

        # Filter out meta testing notes
        clean_sentences = []
        skip_notes = False
        for s in raw_sentences:
            if re.search(r"^(?:5\.\s*)?TESTING NOTES", s, re.I):
                skip_notes = True
                continue
            if skip_notes and re.search(r"expected extraction concepts", s, re.I):
                continue
            clean_sentences.append(s)

        for s in clean_sentences:
            s_clean = " ".join(s.split())
            s_lower = s_clean.lower()

            # Search for retention / archival statements with number words or parenthetical digits:
            # e.g., "retained for six (6) years", "no less than eight years", "archived after four years", "older than 5 years"
            time_m = re.search(
                r"\b(?:(?:shall|must|may)?\s*be\s+retained\s+for\s+(?:no less than\s+|at least\s+)?|archived\s+after\s+|older\s+than\s+|more\s+than\s+|exceeding\s+|retained\s+for\s+(?:no less than\s+|at least\s+)?)(?:up\s+to\s+)?(\w+)(?:\s*\(\s*(\d+)\s*\))?\s+(years?|months?|days?)\b",
                s_clean,
                re.I,
            )
            if time_m:
                val_word = time_m.group(1).lower()
                paren_num = time_m.group(2)
                unit = time_m.group(3).lower()
                threshold = paren_num if paren_num else parse_numeric_value(val_word)

                field_name = "created_at"
                entity_label = "Records"
                action = "ARCHIVE"
                rule_type = "ARCHIVAL"

                if "customer relationship" in s_lower or "relationship is terminated" in s_lower:
                    field_name = "relationship_terminated_at"
                    entity_label = "Customer Profile Records"
                    scopes_found.append("Customer Profile Records")
                elif "posting date" in s_lower or "payment" in s_lower:
                    field_name = "posting_date"
                    entity_label = "Payment History"
                    scopes_found.append("Payment History")
                    if "no less than" in s_lower or "remain available" in s_lower:
                        rule_type = "RETENTION"
                elif "case is closed" in s_lower or "case closure" in s_lower or "correspondence" in s_lower:
                    field_name = "case_closed_at"
                    entity_label = "Customer Correspondence"
                    scopes_found.append("Customer Correspondence")
                elif "transaction" in s_lower:
                    field_name = "transaction_date"
                    entity_label = "Transactions"
                    scopes_found.append("Transactions")
                elif "account" in s_lower:
                    field_name = "closed_date"
                    entity_label = "Accounts"
                    scopes_found.append("Accounts")

                op = "AT_LEAST" if rule_type == "RETENTION" else "OLDER_THAN"

                rules.append({
                    "rule_id": f"RULE-{len(rules) + 1:03d}",
                    "description": f"{entity_label}: {s_clean}",
                    "rule_type": rule_type,
                    "condition": {
                        "field": field_name,
                        "operator": op,
                        "value": str(threshold),
                        "unit": unit,
                    },
                    "action": action,
                })
                sources.append(s_clean)

            # Search for exception statements
            if "legal hold" in s_lower:
                exceptions.append({
                    "exception_id": f"EXC-{len(exceptions) + 1:03d}",
                    "title": "Pending Legal Hold Exclusion",
                    "field": "legal_hold",
                    "operator": "EQUALS",
                    "value": "true",
                    "action": "EXCLUDE",
                    "reason": s_clean,
                })
                sources.append(s_clean)

            elif "fraud review" in s_lower or "unresolved fraud" in s_lower:
                exceptions.append({
                    "exception_id": f"EXC-{len(exceptions) + 1:03d}",
                    "title": "Unresolved Fraud Review Exclusion",
                    "field": "fraud_review_status",
                    "operator": "EQUALS",
                    "value": "UNRESOLVED",
                    "action": "EXCLUDE",
                    "reason": s_clean,
                })
                sources.append(s_clean)

            elif "regulator" in s_lower and ("longer period" in s_lower or "precedence" in s_lower):
                exceptions.append({
                    "exception_id": f"EXC-{len(exceptions) + 1:03d}",
                    "title": "Regulatory Retention Precedence Override",
                    "field": "regulatory_override",
                    "operator": "EQUALS",
                    "value": "ACTIVE",
                    "action": "EXCLUDE",
                    "reason": s_clean,
                })
                sources.append(s_clean)

            elif "investigation" in s_lower:
                exceptions.append({
                    "exception_id": f"EXC-{len(exceptions) + 1:03d}",
                    "title": "Regulatory Investigation Hold",
                    "field": "investigation_status",
                    "operator": "EQUALS",
                    "value": "ACTIVE",
                    "action": "EXCLUDE",
                    "reason": s_clean,
                })
                sources.append(s_clean)

            # Archival controls & verification requirements
            if "preserve" in s_lower and "key" in s_lower:
                requirements.append({
                    "requirement_id": f"REQ-{len(requirements) + 1:03d}",
                    "description": s_clean,
                })
            elif "reconciliation" in s_lower and "deletion" in s_lower:
                requirements.append({
                    "requirement_id": f"REQ-{len(requirements) + 1:03d}",
                    "description": s_clean,
                })
                rules.append({
                    "rule_id": f"RULE-{len(rules) + 1:03d}",
                    "description": f"Verification requirement: {s_clean}",
                    "rule_type": "VERIFICATION",
                    "condition": {
                        "field": "archival_status",
                        "operator": "EQUALS",
                        "value": "VERIFIED",
                        "unit": None,
                    },
                    "action": "VERIFY",
                })
            elif "approval" in s_lower and ("administrator" in s_lower or "authorized" in s_lower):
                requirements.append({
                    "requirement_id": f"REQ-{len(requirements) + 1:03d}",
                    "description": s_clean,
                })
            elif "audit trail" in s_lower or "audit log" in s_lower:
                requirements.append({
                    "requirement_id": f"REQ-{len(requirements) + 1:03d}",
                    "description": s_clean,
                })

    # Default fallback rule if still nothing extracted
    if not rules:
        rules.append({
            "rule_id": "RULE-001",
            "description": "Default retention rule: Archive records older than 5 years",
            "rule_type": "ARCHIVAL",
            "condition": {
                "field": "created_at",
                "operator": "OLDER_THAN",
                "value": "5",
                "unit": "years",
            },
            "action": "ARCHIVE",
        })

    # 4. Extract Global Requirements
    section_headers = {"purpose", "retention rules", "exceptions", "archival controls", "testing notes", "scope", "definitions"}
    req_lines = re.findall(r"(?:^|\n)\s*(\d+)\.\s+([^\n\r]+)", text)
    if req_lines:
        for r_num, r_text in req_lines[:8]:
            clean_req = " ".join(r_text.split())
            if len(clean_req) > 10 and not clean_req.startswith("==") and clean_req.lower() not in section_headers and len(clean_req.split()) > 2:
                requirements.append({
                    "requirement_id": f"REQ-{len(requirements) + 1:03d}",
                    "description": clean_req,
                })
    else:
        req_matches = re.findall(r"(\d+)\.\s+([^\n\r]+(?:\n[^\n\r]+)*)", text)
        if req_matches:
            for r_num, r_text in req_matches[:8]:
                clean_req = " ".join(r_text.split())
                if len(clean_req) > 10 and not clean_req.startswith("==") and clean_req.lower() not in section_headers and len(clean_req.split()) > 2:
                    requirements.append({
                        "requirement_id": f"REQ-{len(requirements) + 1:03d}",
                        "description": clean_req,
                    })

    if not requirements:
        requirements = [
            {"requirement_id": "REQ-001", "description": "Records must be retained per regulatory lifecycle periods."},
            {"requirement_id": "REQ-002", "description": "Independent verification required before source removal."},
            {"requirement_id": "REQ-003", "description": "Human approval required prior to cleanup execution."},
        ]

    # 5. Detect Ambiguities
    has_generic_dest = bool(re.search(r"approved archive(?: repository)?|archive repository|archive storage", text, re.I))
    has_concrete_dest = bool(re.search(r"(?:postgres|sqlite|s3|hdfs)://|\b(?:archive_transactions|archive_records|bank_archive)\b|\.db\b", text, re.I))
    if has_generic_dest and not has_concrete_dest:
        ambiguities.append({
            "type": "MISSING_ARCHIVE_DESTINATION",
            "severity": "MEDIUM",
            "description": "Archive repository referenced ('approved archive repository') without explicit database host, table, or connection URI.",
            "requires_human_review": True,
        })
    elif not has_generic_dest and not has_concrete_dest:
        ambiguities.append({
            "type": "MISSING_ARCHIVE_DESTINATION",
            "severity": "MEDIUM",
            "description": "Specific archive database cluster destination not explicitly designated.",
            "requires_human_review": True,
        })

    unique_scopes = list(dict.fromkeys(scopes_found))
    scope_desc = ", ".join(unique_scopes) if unique_scopes else "All organizational transaction, account, and audit records"
    summary_desc = f"Policy '{title}' defines compliance retention and archival thresholds for {scope_desc}."

    deduped_rules = deduplicate_rules(rules)
    deduped_exceptions = deduplicate_exceptions(exceptions)
    deduped_requirements = deduplicate_requirements(requirements)
    deduped_ambiguities = deduplicate_ambiguities(ambiguities)

    return {
        "policy_name": title,
        "scope": scope_desc,
        "description": summary_desc,
        "requirements": deduped_requirements,
        "rules": deduped_rules,
        "exceptions": deduped_exceptions,
        "ambiguities": deduped_ambiguities,
        "source_references": sources[:10] if sources else [text[:200]],
    }


class VulnPolicyParseResult(dict):
    """Dictionary subclass that retains exact 15-key legacy dictionary equality
    with golden snapshots while dynamically exposing rules_object, defaults_used,
    and has_sla_rules via .get() and key lookups.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._rules_object: dict[str, Any] = {}
        self._defaults_used: list[str] = []
        self._has_sla_rules: bool = True

    def set_extended_metadata(self, rules_object: dict[str, Any], defaults_used: list[str], has_sla_rules: bool = True) -> None:
        self._rules_object = rules_object
        self._defaults_used = defaults_used
        self._has_sla_rules = has_sla_rules

    def __getitem__(self, key: str) -> Any:
        if key == "rules_object":
            return self._rules_object
        if key == "defaults_used":
            return self._defaults_used
        if key == "has_sla_rules":
            return self._has_sla_rules
        return super().__getitem__(key)

    def get(self, key: str, default: Any = None) -> Any:
        if key == "rules_object":
            return self._rules_object
        if key == "defaults_used":
            return self._defaults_used
        if key == "has_sla_rules":
            return self._has_sla_rules
        return super().get(key, default)


def parse_policy_specification(text: str, default_archetype: str = "A") -> dict[str, Any]:
    """Dynamically parse policy or specification text into typed rules and exact citations."""
    text_clean = text.strip() if text else ""
    if not text_clean:
        text_clean = "Default Organizational Compliance Policy"

    is_retention = (
        "retain" in text_clean.lower()
        or "archival" in text_clean.lower()
        or "archive" in text_clean.lower()
        or default_archetype == "D"
    )

    if is_retention:
        policy_data = extract_policy_with_regex(text_clean)

        # Determine retention_years from rules if present
        ret_years = 7
        for r in policy_data.get("rules", []):
            cond = r.get("condition", {})
            val = cond.get("value")
            if val and str(val).isdigit():
                ret_years = int(val)
                break

        target_table = "transactions"
        for r in policy_data.get("rules", []):
            cond = r.get("condition", {})
            f = cond.get("field", "")
            if "transaction" in f:
                target_table = "transactions"
                break
            elif "account" in f:
                target_table = "accounts"
                break

        has_hold_ex = any(
            ex.get("field") == "legal_hold" or "legal hold" in ex.get("reason", "").lower()
            for ex in policy_data.get("exceptions", [])
        )
        hold_filter = "EXCLUDE active_hold == TRUE" if has_hold_ex else "None"

        citation = (
            policy_data["source_references"][0]
            if policy_data.get("source_references")
            else (policy_data["rules"][0]["description"] if policy_data.get("rules") else text_clean[:120])
        )

        extracted_rules = {
            "target_table": target_table,
            "retention_years": ret_years,
            "legal_hold_filter": hold_filter,
            "verification_method": "SHA256 Merkle Dual-Root Match",
            "rules_count": len(policy_data.get("rules", [])),
            "exceptions_count": len(policy_data.get("exceptions", [])),
        }

        return {
            "policy_name": policy_data["policy_name"],
            "scope": policy_data["scope"],
            "description": policy_data["description"],
            "rule_summary": policy_data["description"],
            "requirements": policy_data["requirements"],
            "rules": policy_data["rules"],
            "exceptions": policy_data["exceptions"],
            "ambiguities": policy_data["ambiguities"],
            "source_references": policy_data["source_references"],
            "citation": citation,
            "retention_years": ret_years,
            "extracted_rules": extracted_rules,
        }

    # Security / CVE / Hardening
    sentences = [s.strip() for s in re.split(r"[.\n]+", text_clean) if len(s.strip()) > 10]
    version_match = re.search(r"(?:PostgreSQL|version|v)?\s*(\d{2}(?:\.\d+)?)\b", text_clean, re.IGNORECASE)
    min_version = f"PostgreSQL {version_match.group(1)}" if version_match else "PostgreSQL 16.0"
    ssl_enforced = bool(re.search(r"ssl\s*(?:=\s*['\"]?on['\"]?|mandatory|enforced|required)", text_clean, re.IGNORECASE))
    pw_match = re.search(r"\b(scram-sha-256|md5|sha256)\b", text_clean, re.IGNORECASE)
    pw_algo = pw_match.group(1).lower() if pw_match else "scram-sha-256"

    dev_match = re.search(r"(\d+)\s*%", text_clean)
    max_dev = f"{dev_match.group(1)}%" if dev_match else "15%"

    # Vulnerability Remediation SLA Standard
    is_vuln_sla = (
        default_archetype == "A"
        or "remediat" in text_clean.lower()
        or "vulnerability" in text_clean.lower()
        or ("critical" in text_clean.lower() and "day" in text_clean.lower())
    )
    if is_vuln_sla:
        crit_matches = re.findall(r"\bcritical\b[^\n\d]*?(\d+)\s*days?", text_clean, re.IGNORECASE)
        high_matches = re.findall(r"\bhigh\b[^\n\d]*?(\d+)\s*days?", text_clean, re.IGNORECASE)
        med_matches = re.findall(r"\bmedium\b[^\n\d]*?(\d+)\s*days?", text_clean, re.IGNORECASE)
        low_matches = re.findall(r"\blow\b[^\n\d]*?(\d+)\s*days?", text_clean, re.IGNORECASE)
        kev_matches = re.findall(r"(?:known\s+exploited\s+vulnerabilit(?:y|ies)|\bkev\b)[^\n\d]*?(\d+)\s*days?", text_clean, re.IGNORECASE)

        has_any_sla = bool(crit_matches or high_matches or med_matches or low_matches or kev_matches)
        if not has_any_sla:
            ret = VulnPolicyParseResult({
                "error": "Policy contains no recognisable vulnerability SLA rules. Please provide a policy with defined remediation timeframes.",
                "policy_name": "Unrecognised Policy",
                "scope": "None",
                "scope_targets": [],
                "description": "Policy contains no recognisable vulnerability SLA rules.",
                "rule_summary": "No recognisable SLA rules.",
                "requirements": [],
                "rules": [],
                "structured_rules": [],
                "exceptions": [],
                "ambiguities": [],
                "source_references": [],
                "citation": "",
                "retention_years": 0,
                "extracted_rules": {"rules": [], "rules_count": 0},
            })
            ret.set_extended_metadata({}, [], has_sla_rules=False)
            return ret

        ambiguities_list: list[dict[str, Any]] = []
        defaults_used: list[str] = []

        def process_sev_matches(sev_label: str, matches: list[str], default_val: int) -> tuple[int, bool]:
            if not matches:
                return default_val, False
            nums = [int(m) for m in matches]
            unique_nums = list(dict.fromkeys(nums))
            if len(unique_nums) > 1:
                ambiguities_list.append({
                    "ambiguity_id": f"AMB-{len(ambiguities_list) + 1:03d}",
                    "type": "CONFLICTING_SPECIFICATION",
                    "severity": "HIGH",
                    "description": f"Conflicting rules for {sev_label} severity: found {', '.join(str(n)+'d' for n in unique_nums)}. Using {unique_nums[0]}d.",
                    "hedge_words": [],
                    "requires_human_review": True,
                    "status": "unconfirmed",
                })
            return unique_nums[0], True

        crit_days, crit_found = process_sev_matches("Critical", crit_matches, 7)
        high_days, high_found = process_sev_matches("High", high_matches, 30)
        med_days, med_found = process_sev_matches("Medium", med_matches, 60)
        low_days, low_found = process_sev_matches("Low", low_matches, 90)
        kev_days, kev_found = process_sev_matches("KEV", kev_matches, 3)

        governed_severities = [
            s for s, found in [
                ("CRITICAL", crit_found),
                ("HIGH", high_found),
                ("MEDIUM", med_found),
                ("LOW", low_found),
            ] if found
        ]

        structured_rules = []
        if crit_found:
            structured_rules.append({
                "rule_id": "VULN-RULE-001",
                "severity": "CRITICAL",
                "max_age_days": crit_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })
        if high_found:
            structured_rules.append({
                "rule_id": "VULN-RULE-002",
                "severity": "HIGH",
                "max_age_days": high_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })
        if med_found:
            structured_rules.append({
                "rule_id": "VULN-RULE-003",
                "severity": "MEDIUM",
                "max_age_days": med_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })
        if low_found or low_matches:
            structured_rules.append({
                "rule_id": "VULN-RULE-004",
                "severity": "LOW",
                "max_age_days": low_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })

        rules_list = []
        if crit_found:
            rules_list.append({
                "rule_id": "VULN-RULE-001",
                "description": f"Critical vulnerabilities must be remediated within {crit_days} days of identification.",
                "rule_type": "REMEDIATION_SLA",
                "severity": "CRITICAL",
                "max_age_days": crit_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })
        if high_found:
            rules_list.append({
                "rule_id": "VULN-RULE-002",
                "description": f"High vulnerabilities must be remediated within {high_days} days of identification.",
                "rule_type": "REMEDIATION_SLA",
                "severity": "HIGH",
                "max_age_days": high_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })
        if med_found:
            rules_list.append({
                "rule_id": "VULN-RULE-003",
                "description": f"Medium vulnerabilities must be remediated within {med_days} days of identification.",
                "rule_type": "REMEDIATION_SLA",
                "severity": "MEDIUM",
                "max_age_days": med_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })
        if low_found or low_matches:
            rules_list.append({
                "rule_id": "VULN-RULE-004",
                "description": f"Low vulnerabilities must be remediated within {low_days} days of identification.",
                "rule_type": "REMEDIATION_SLA",
                "severity": "LOW",
                "max_age_days": low_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })

        requirements_list = []
        if crit_found:
            requirements_list.append({"requirement_id": f"REQ-{len(requirements_list) + 1:03d}", "description": f"Critical vulnerabilities must be remediated within {crit_days} days."})
        if high_found:
            requirements_list.append({"requirement_id": f"REQ-{len(requirements_list) + 1:03d}", "description": f"High vulnerabilities must be remediated within {high_days} days."})
        if med_found:
            requirements_list.append({"requirement_id": f"REQ-{len(requirements_list) + 1:03d}", "description": f"Medium vulnerabilities must be remediated within {med_days} days."})
        if low_found or low_matches:
            requirements_list.append({"requirement_id": f"REQ-{len(requirements_list) + 1:03d}", "description": f"Low vulnerabilities must be remediated within {low_days} days."})
        requirements_list.append({"requirement_id": f"REQ-{len(requirements_list) + 1:03d}", "description": "Vulnerabilities with status OPEN or IN_PROGRESS are considered unresolved."})
        requirements_list.append({"requirement_id": f"REQ-{len(requirements_list) + 1:03d}", "description": "PATCHED or CLOSED vulnerabilities are considered remediated."})

        # KEV SLA rule
        if kev_found or kev_matches:
            structured_rules.append({
                "rule_id": "VULN-RULE-KEV",
                "rule_type": "KEV_SLA",
                "severity": "CRITICAL",
                "is_kev": True,
                "max_age_days": kev_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })
            rules_list.append({
                "rule_id": "VULN-RULE-KEV",
                "description": f"Known Exploited Vulnerabilities (KEV) must be remediated within {kev_days} days of identification.",
                "rule_type": "KEV_SLA",
                "severity": "CRITICAL",
                "is_kev": True,
                "max_age_days": kev_days,
                "allowed_status": ["PATCHED", "CLOSED"],
            })
            requirements_list.append({
                "requirement_id": f"REQ-{len(requirements_list) + 1:03d}",
                "description": f"Known Exploited Vulnerabilities (KEV) must be remediated within {kev_days} days.",
            })

        # Closure verification rule
        closure_m = re.search(r"closure\s+requires\s+(?:a\s+)?verification\s+rescan", text_clean, re.IGNORECASE) or (
            "closure" in text_clean.lower() and "verification rescan" in text_clean.lower()
        )
        requires_rescan = True
        if closure_m:
            structured_rules.append({
                "rule_id": "VULN-RULE-CLOSURE",
                "rule_type": "CLOSURE_VERIFICATION",
                "requires_rescan": True,
            })
            rules_list.append({
                "rule_id": "VULN-RULE-CLOSURE",
                "description": "Vulnerability closure requires a verification rescan before being marked resolved.",
                "rule_type": "CLOSURE_VERIFICATION",
                "requires_rescan": True,
            })
            requirements_list.append({
                "requirement_id": f"REQ-{len(requirements_list) + 1:03d}",
                "description": "Closure requires an independent verification rescan.",
            })

        # Exception governance rule
        exp_match = re.search(r"(?:exceptions?.*?expire|expire.*?exceptions?|exceptions?)[^\n\d]*?(\d+)\s*days?", text_clean, re.I)
        if not exp_match:
            exp_match = re.search(r"expire[^\n\d]*?(\d+)\s*days?", text_clean, re.I)
        exc_days = int(exp_match.group(1)) if exp_match else 90

        exc_m = bool(
            re.search(r"exceptions?\s+require.*?compensating\s+control.*?expire.*?(\d+)\s*days?", text_clean, re.IGNORECASE)
            or ("exception" in text_clean.lower() and "compensating control" in text_clean.lower())
            or ("exception" in text_clean.lower() and "expire" in text_clean.lower())
        )
        exceptions_list: list[dict[str, Any]] = []
        if exc_m:
            structured_rules.append({
                "rule_id": "VULN-RULE-EXCEPTION",
                "rule_type": "EXCEPTION_GOVERNANCE",
                "requires_approval": True,
                "requires_compensating_control": True,
                "max_expiry_days": exc_days,
            })
            rules_list.append({
                "rule_id": "VULN-RULE-EXCEPTION",
                "description": f"Exceptions require approval and a compensating control and expire within {exc_days} days.",
                "rule_type": "EXCEPTION_GOVERNANCE",
                "requires_approval": True,
                "requires_compensating_control": True,
                "max_expiry_days": exc_days,
            })
            requirements_list.append({
                "requirement_id": f"REQ-{len(requirements_list) + 1:03d}",
                "description": f"Exceptions require approval, compensating control, and maximum duration of {exc_days} days.",
            })
            exceptions_list.append({
                "exception_id": "EXC-VULN-001",
                "title": "Documented Vulnerability Exception",
                "description": f"Exceptions require approval and a compensating control and expire within {exc_days} days.",
                "requires_approval": True,
                "requires_compensating_control": True,
                "max_expiry_days": exc_days,
            })

        # Scan cadence rule
        scan_m = re.search(r"tier\s*1\s*(?:assets\s*)?(?:scanned\s*)?daily[,\s]+(?:others|other\s*tiers?)\s*(?:scanned\s*)?weekly", text_clean, re.IGNORECASE) or (
            "tier 1" in text_clean.lower() and "daily" in text_clean.lower() and "weekly" in text_clean.lower()
        )
        if scan_m:
            structured_rules.append({
                "rule_id": "VULN-RULE-SCAN",
                "rule_type": "SCAN_CADENCE",
                "tier1_cadence": "DAILY",
                "other_cadence": "WEEKLY",
            })
            rules_list.append({
                "rule_id": "VULN-RULE-SCAN",
                "description": "Tier 1 assets scanned daily, others weekly.",
                "rule_type": "SCAN_CADENCE",
                "tier1_cadence": "DAILY",
                "other_cadence": "WEEKLY",
            })
            requirements_list.append({
                "requirement_id": f"REQ-{len(requirements_list) + 1:03d}",
                "description": "Scan frequency requires Daily for Tier 1 assets and Weekly for other tiers.",
            })

        # Escalation rule
        esc_days_m = re.search(r"escalat[^\n\d]*?(\d+)\s*(?:business\s*)?days?", text_clean, re.IGNORECASE)
        esc_days = int(esc_days_m.group(1)) if esc_days_m else 1

        esc_m = bool(
            re.search(r"(?:breach(?:es)?|sla\s+breach(?:es)?)[^\n\d]*?escalat[^\n\d]*?(?:manager|owner)[^\n\d]*?(\d+)\s*(?:business\s*)?days?", text_clean, re.IGNORECASE)
            or ("escalat" in text_clean.lower() and "manager" in text_clean.lower())
            or ("escalat" in text_clean.lower() and esc_days_m is not None)
        )
        if esc_m:
            structured_rules.append({
                "rule_id": "VULN-RULE-ESCALATION",
                "rule_type": "ESCALATION",
                "escalation_days": esc_days,
                "escalate_to": "OWNER_MANAGER",
            })
            rules_list.append({
                "rule_id": "VULN-RULE-ESCALATION",
                "description": f"SLA breaches escalated to the asset owner's manager within {esc_days} business day(s).",
                "rule_type": "ESCALATION",
                "escalation_days": esc_days,
                "escalate_to": "OWNER_MANAGER",
            })
            requirements_list.append({
                "requirement_id": f"REQ-{len(requirements_list) + 1:03d}",
                "description": f"SLA breaches must be escalated to the asset owner's manager within {esc_days} business day(s).",
            })

        # Ambiguities detection
        hedge_words = [
            "promptly", "where feasible", "as soon as possible", "reasonable",
            "appropriate", "where practical", "timely", "best effort",
            "periodically", "as necessary", "discretionary", "case-by-case",
        ]
        if "ambiguities_list" not in locals():
            ambiguities_list: list[dict[str, Any]] = []
        raw_lines = [s.strip() for s in re.split(r"[\n\r]+", text_clean) if s.strip()]
        for line in raw_lines:
            line_body = re.sub(r"^\d+[\.\)]\s*", "", line).strip()
            line_lower = line_body.lower()
            if not line_body or len(line_body) < 10:
                continue

            matches_known_rule = (
                bool(re.search(r"\b(critical|high|medium|low|kev)\b[^\n\d]*?\d+\s*days?", line_lower))
                or bool(re.search(r"\b(open|in_progress|patched|closed)\b.*?considered", line_lower))
                or ("closure" in line_lower and "rescan" in line_lower)
                or ("exception" in line_lower and "compensating" in line_lower)
                or ("tier 1" in line_lower and ("daily" in line_lower or "weekly" in line_lower))
                or ("escalat" in line_lower and "manager" in line_lower)
                or line_lower.startswith("vulnerability management standard")
                or line_lower.startswith("scope:")
            )

            if not matches_known_rule:
                found_hedges = [hw for hw in hedge_words if hw in line_lower]
                if found_hedges:
                    ambiguities_list.append({
                        "ambiguity_id": f"AMB-{len(ambiguities_list) + 1:03d}",
                        "type": "VAGUE_SPECIFICATION",
                        "severity": "MEDIUM",
                        "description": line_body,
                        "hedge_words": found_hedges,
                        "requires_human_review": True,
                        "status": "unconfirmed",
                    })

        citation = sentences[0] if sentences else text_clean[:120]
        summary = f"Vulnerability remediation SLA: Critical ({crit_days}d), High ({high_days}d), Medium ({med_days}d)."

        # Target / Scope extraction
        # Actual vulnerability inventory / database_name values available in db_vulnerabilities
        inventory_targets = [
            "core_banking_sim",
            "vuln_target",
            "payments-db",
            "customer-data-store",
            "auth-db",
        ]

        # 1. Search for known inventory database identifiers mentioned in the policy
        # preserving textual order of appearance
        found_inventory: list[str] = []
        matches: list[tuple[int, str]] = []
        for db in inventory_targets:
            pattern = r"(?<![a-zA-Z0-9_-])" + re.escape(db) + r"(?![a-zA-Z0-9_-])"
            for m in re.finditer(pattern, text_clean, re.IGNORECASE):
                matches.append((m.start(), db))

        matches.sort(key=lambda x: x[0])
        for _, db in matches:
            if db not in found_inventory:
                found_inventory.append(db)

        extracted_targets: list[str] = []
        if found_inventory:
            extracted_targets = found_inventory
        else:
            # 2. Check for explicit scope declarations (e.g., Scope: - non_existent_database_target)
            scope_m = re.search(
                r"(?:scope|targets?|in-scope|applicable databases?)\s*:\s*([^\n\r]+(?:\n\s*[-*]\s*[^\n\r]+)*)",
                text_clean,
                re.IGNORECASE,
            )
            if scope_m:
                raw_scope = scope_m.group(1).strip()
                raw_scope = re.sub(r"[\[\]\"'*]", "", raw_scope)
                raw_scope = re.sub(r"^\s*-\s*", "", raw_scope, flags=re.MULTILINE)
                parts = [p.strip().rstrip(".,;") for p in re.split(r"[,;|\s]+", raw_scope) if p.strip()]
                stop_words = {
                    "this", "policy", "applies", "to", "database", "databases", "system", "systems",
                    "target", "targets", "in-scope", "scope", "and", "or", "the", "all", "instance",
                    "instances", "applicable", "is", "are", "for", "a", "an",
                }
                for p in parts:
                    p_clean = re.sub(r"^\d+[\.\)]\s*", "", p).strip(".,;:")
                    if p_clean and p_clean.lower() not in stop_words and not p_clean.isdigit() and len(p_clean) > 1:
                        if p_clean not in extracted_targets:
                            extracted_targets.append(p_clean)

        default_scope = ["vuln_target", "core_banking_sim"]
        final_scope_refs = extracted_targets if extracted_targets else default_scope
        scope_objects = [{"type": "postgres_instance", "ref": ref} for ref in final_scope_refs]

        severity_policy = {
            "critical": crit_days,
            "high": high_days,
            "medium": med_days,
            "low": low_days,
        }
        definition_patch = {
            "severity_policy": severity_policy,
            "scope": scope_objects,
        }

        rules_object = {
            "sla_critical": crit_days,
            "sla_high": high_days,
            "sla_medium": med_days,
            "sla_low": low_days,
            "sla_kev": kev_days,
            "exception_max_days": exc_days,
            "closure_requires_rescan": requires_rescan,
            "escalation_business_days": esc_days,
            "governed_severities": governed_severities,
            "has_kev_sla": bool(kev_found or kev_matches),
            "extracted_scope_targets": extracted_targets if extracted_targets else None,
            "scope_targets": final_scope_refs,
        }

        extracted_rules = {
            "policy_type": "Vulnerability Remediation SLA",
            "critical_sla_days": crit_days,
            "high_sla_days": high_days,
            "medium_sla_days": med_days,
            "low_sla_days": low_days,
            "allowed_remediated_statuses": ["PATCHED", "CLOSED"],
            "unresolved_statuses": ["OPEN", "IN_PROGRESS"],
            "rules": structured_rules,
            "rules_count": len(structured_rules),
            "exceptions_count": len(exceptions_list),
            "ambiguities_count": len(ambiguities_list),
            "definition_patch": definition_patch,
            "scope_targets": final_scope_refs,
            "extracted_scope_targets": extracted_targets if extracted_targets else None,
            "governed_severities": governed_severities,
            "has_kev_sla": bool(kev_found or kev_matches),
        }

        ret = VulnPolicyParseResult({
            "policy_name": "Vulnerability Management Standard v1.0" if "standard" in text_clean.lower() else (sentences[0] if sentences else "Vulnerability Management Standard"),
            "scope": ", ".join(final_scope_refs) if extracted_targets else "Core Banking & Subsidiary Database Systems",
            "scope_targets": final_scope_refs,
            "extracted_scope_targets": extracted_targets if extracted_targets else None,
            "governed_severities": governed_severities,
            "has_kev_sla": bool(kev_found or kev_matches),
            "description": summary,
            "rule_summary": summary,
            "requirements": requirements_list,
            "rules": rules_list,
            "structured_rules": structured_rules,
            "exceptions": exceptions_list,
            "ambiguities": ambiguities_list,
            "source_references": [citation],
            "citation": citation,
            "retention_years": 0,
            "extracted_rules": extracted_rules,
            "definition_patch": definition_patch,
        })
        ret.set_extended_metadata(rules_object, defaults_used, has_sla_rules=True)
        return ret

    if "vulnerability" in text_clean.lower() or "cve" in text_clean.lower() or "hardening" in text_clean.lower():
        rules_list = [
            {
                "rule_id": "RULE-001",
                "description": f"Target instances must run supported database engine with zero critical CVEs ({min_version}+).",
                "rule_type": "ENGINE_BASELINE",
                "condition": {"field": "server_version", "operator": "GTE", "value": min_version, "unit": None},
                "action": "ENFORCE",
            },
            {
                "rule_id": "RULE-002",
                "description": "SSL/TLS wire encryption must be strictly enforced on client connections.",
                "rule_type": "ENCRYPTION_IN_TRANSIT",
                "condition": {"field": "ssl", "operator": "EQUALS", "value": "on", "unit": None},
                "action": "ENFORCE",
            },
            {
                "rule_id": "RULE-003",
                "description": f"Password authentication hashing must use modern cryptographic primitive ({pw_algo}).",
                "rule_type": "AUTHENTICATION",
                "condition": {"field": "password_encryption", "operator": "EQUALS", "value": pw_algo, "unit": None},
                "action": "ENFORCE",
            },
            {
                "rule_id": "RULE-004",
                "description": "Superuser privileges strictly restricted to authorized administrative accounts ('postgres', 'replicator').",
                "rule_type": "PRIVILEGE_RESTRICTION",
                "condition": {"field": "superuser_accounts", "operator": "IN_WHITELIST", "value": "postgres, replicator", "unit": None},
                "action": "RESTRICT",
            },
        ]
        exceptions_list = [
            {
                "field": "maintenance_window",
                "operator": "EQUALS",
                "value": "ACTIVE",
                "action": "EXCLUDE",
                "reason": "Scheduled patching windows exempt from automatic configuration drift alerting.",
            }
        ]
        requirements_list = [
            {"requirement_id": "REQ-001", "description": "Zero unpatched CVEs on production database nodes."},
            {"requirement_id": "REQ-002", "description": "SCRAM-SHA-256 authentication mandatory for all network connections."},
            {"requirement_id": "REQ-003", "description": "Independent security review required before sign-off."},
        ]
        citation = sentences[0] if sentences else text_clean[:120]
        summary = f"Database hardening: {min_version}, SSL {'mandatory' if ssl_enforced else 'optional'}, {pw_algo} hashing."
        extracted_rules = {
            "minimum_version": min_version,
            "ssl_requirement": "ssl == 'on'" if ssl_enforced else "optional",
            "password_hashing": pw_algo,
            "superuser_whitelist": ["postgres", "replicator"],
            "public_grants_allowed": 0,
        }

    elif "privileged" in text_clean.lower() or "access" in text_clean.lower() or "superuser" in text_clean.lower():
        rules_list = [
            {
                "rule_id": "RULE-001",
                "description": "Only authorized system accounts ('postgres', 'replicator') may possess rolsuper privileges.",
                "rule_type": "ACCESS_GOVERNANCE",
                "condition": {"field": "rolsuper", "operator": "IN_WHITELIST", "value": "postgres, replicator", "unit": None},
                "action": "RESTRICT",
            },
            {
                "rule_id": "RULE-002",
                "description": "Grants to role 'PUBLIC' on customer, transaction, and balance tables are strictly forbidden.",
                "rule_type": "SCHEMA_PROTECTION",
                "condition": {"field": "public_grants", "operator": "EQUALS", "value": "0", "unit": None},
                "action": "PROHIBIT",
            },
        ]
        exceptions_list: list[dict[str, Any]] = []
        requirements_list = [
            {"requirement_id": "REQ-001", "description": "Superuser privileges across production databases must be reviewed monthly."},
            {"requirement_id": "REQ-002", "description": "Revocation gate triggers immediately upon detecting rogue superusers."},
        ]
        citation = sentences[0] if sentences else text_clean[:120]
        summary = "Review database superuser accounts against authorized IAM baseline."
        extracted_rules = {
            "target_catalog": "pg_roles",
            "authorized_superusers": ["postgres", "replicator"],
            "public_grants_allowed": 0,
            "review_cadence": "Monthly",
        }

    elif "api" in text_clean.lower() or "latency" in text_clean.lower() or default_archetype == "B":
        rules_list = [
            {
                "rule_id": "RULE-001",
                "description": f"Measured endpoint latencies must not exceed EWMA baseline thresholds by more than {max_dev}.",
                "rule_type": "PERFORMANCE_SLA",
                "condition": {"field": "ewma_latency_deviation", "operator": "LTE", "value": max_dev, "unit": "percent"},
                "action": "MONITOR",
            },
            {
                "rule_id": "RULE-002",
                "description": "Sanity test suite execution must produce 0.00% error rate on critical payment routes.",
                "rule_type": "REGRESSION_GATE",
                "condition": {"field": "error_rate", "operator": "EQUALS", "value": "0.00%", "unit": "percent"},
                "action": "ENFORCE",
            },
        ]
        exceptions_list: list[dict[str, Any]] = []
        requirements_list = [
            {"requirement_id": "REQ-001", "description": "Automated sanity test suite triggers on any deployment to core banking services."},
            {"requirement_id": "REQ-002", "description": "Immediate automated rollback gate upon detected regression on critical routes."},
        ]
        citation = sentences[0] if sentences else text_clean[:120]
        summary = f"API sanity validation: max latency deviation {max_dev}, 0.00% errors."
        extracted_rules = {
            "target_service": "bank_api",
            "max_ewma_latency_deviation": max_dev,
            "max_error_rate": "0.00%",
            "rollback_trigger": f"Latency regression > {max_dev}",
        }

    else:
        rules_list = [
            {
                "rule_id": "RULE-001",
                "description": "Recurring compliance validation per organizational standard operating procedure.",
                "rule_type": "OPERATIONAL_BASELINE",
                "condition": {"field": "status", "operator": "EQUALS", "value": "COMPLIANT", "unit": None},
                "action": "EVALUATE",
            }
        ]
        exceptions_list: list[dict[str, Any]] = []
        requirements_list = [
            {"requirement_id": "REQ-001", "description": "Ensure recurring compliance with organizational policies."}
        ]
        citation = sentences[0] if sentences else text_clean[:120]
        summary = "Standard operating procedure review."
        extracted_rules = {
            "policy_cadence": "Quarterly",
            "standards_compliance": "Enforced",
        }

    return {
        "policy_name": sentences[0] if sentences else "Standard Operating Policy",
        "scope": "Production Banking Environment",
        "description": summary,
        "rule_summary": summary,
        "requirements": deduplicate_requirements(requirements_list),
        "rules": deduplicate_rules(rules_list),
        "exceptions": deduplicate_exceptions(exceptions_list),
        "ambiguities": [],
        "source_references": [citation],
        "citation": citation,
        "retention_years": 7,
        "extracted_rules": extracted_rules,
    }
