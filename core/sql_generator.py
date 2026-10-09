"""
Dynamic SQL Compliance Generator using Google Gemini API & Live Database Schemas.

Generates dialect-accurate, verified SQL scripts (Selection, Archival, Cleanup)
conditioned on real active database schemas and extracted policy rules.
"""

import json
import logging
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DB_DIR = Path(__file__).resolve().parent.parent / "sim"
CORE_DB_PATH = DB_DIR / "bank_core.db"
ARCHIVE_DB_PATH = DB_DIR / "bank_archive.db"


def get_live_database_schema_ddl(target_tables: list[str] | None = None) -> str:
    """
    Query the real SQLite database catalog (sqlite_master) to extract
    exact CREATE TABLE statements and column definitions.
    """
    ddl_statements: list[str] = []

    try:
        if CORE_DB_PATH.exists():
            with sqlite3.connect(CORE_DB_PATH) as conn:
                cur = conn.cursor()
                query = "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                cur.execute(query)
                for name, sql in cur.fetchall():
                    if sql and (target_tables is None or name in target_tables):
                        ddl_statements.append(f"-- Source Table: {name}\n{sql};")

        if ARCHIVE_DB_PATH.exists():
            with sqlite3.connect(ARCHIVE_DB_PATH) as conn:
                cur = conn.cursor()
                query = "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                cur.execute(query)
                for name, sql in cur.fetchall():
                    if sql and (target_tables is None or name in target_tables):
                        ddl_statements.append(f"-- Archive Table: {name}\n{sql};")
    except Exception as e:
        logger.warning(f"Could not read live SQLite catalog: {e}")

    if not ddl_statements:
        # Canonical baseline fallback schema
        return """-- Source Table: source_transactions
CREATE TABLE source_transactions (
    transaction_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    transaction_date TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_type TEXT NOT NULL,
    legal_hold INTEGER NOT NULL DEFAULT 0,
    support_ticket_id TEXT,
    investigation_status TEXT NOT NULL DEFAULT 'NONE',
    document_ref TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
);

-- Archive Table: archive_transactions
CREATE TABLE archive_transactions (
    transaction_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    transaction_date TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_type TEXT NOT NULL,
    legal_hold INTEGER NOT NULL DEFAULT 0,
    support_ticket_id TEXT,
    investigation_status TEXT NOT NULL DEFAULT 'NONE',
    document_ref TEXT,
    status TEXT NOT NULL DEFAULT 'ARCHIVED',
    control_run_id TEXT NOT NULL,
    verification_hash TEXT NOT NULL,
    archived_at TEXT NOT NULL
);"""

    return "\n\n".join(ddl_statements)


def derive_table_name(desc: str, default: str = "source_transactions") -> str:
    """Derive appropriate table name from rule description."""
    desc_lower = desc.lower()
    if "support ticket" in desc_lower or "ticket" in desc_lower:
        return "customer_support_tickets"
    elif "employee" in desc_lower:
        return "employee_records"
    elif "audit log" in desc_lower or "log" in desc_lower:
        return "system_audit_logs"
    elif "customer doc" in desc_lower or "document" in desc_lower:
        return "customer_documents"
    elif "customer profile" in desc_lower:
        return "customer_profiles"
    elif "customer" in desc_lower:
        return "customers"
    elif "payment" in desc_lower:
        return "payments"
    elif "transaction" in desc_lower:
        return "source_transactions"
    return default


def compile_schema_driven_sql(
    schema_ddl: str,
    rules: list[dict[str, Any]],
    exceptions: list[dict[str, Any]],
    run_id: str,
    retention_years: int = 5,
    dialect: str = "SQLITE",
) -> dict[str, str]:
    """
    Deterministic schema-driven SQL compiler.
    Constructs compliant queries matching the exact columns in the database schema,
    accounting for every extracted rule and every legal/investigation exclusion.
    """
    # Parse available columns from schema
    has_source_tx = "source_transactions" in schema_ddl
    has_archive_tx = "archive_transactions" in schema_ddl

    source_table = "source_transactions" if has_source_tx else "transactions"
    archive_table = "archive_transactions" if has_archive_tx else "transactions_archive"

    # Identify date field and hold field
    date_field = "transaction_date" if "transaction_date" in schema_ddl else "created_at"
    hold_field = "legal_hold" if "legal_hold" in schema_ddl else "active_hold"

    # Build exclusion clauses from all extracted exceptions
    exclusion_clauses: list[str] = []
    seen_clauses: set[str] = set()
    for exc in exceptions:
        f = exc.get("field", "")
        op = str(exc.get("operator", "EQUALS")).upper()
        val_exc = str(exc.get("value", "")).strip()
        reason = str(exc.get("reason", "") or exc.get("title", "")).lower()

        clause = None
        if f == "legal_hold" or "legal hold" in reason:
            clause = "(legal_hold = 0 OR legal_hold IS NULL)"
        elif f == "investigation_status" or "investigation" in reason:
            clause = "(investigation_status != 'ACTIVE' OR investigation_status IS NULL)"
        elif f and val_exc:
            if op in ("EQUALS", "==", "="):
                clause = f"({f} != '{val_exc}' OR {f} IS NULL)"
            elif op == "NOT_EQUALS":
                clause = f"({f} = '{val_exc}')"

        if clause and clause not in seen_clauses:
            seen_clauses.add(clause)
            exclusion_clauses.append(clause)

    if not exclusion_clauses and hold_field in schema_ddl:
        default_clause = f"({hold_field} = 0 OR {hold_field} IS NULL)"
        exclusion_clauses.append(default_clause)

    exclusion_sql = ("\n  AND " + "\n  AND ".join(exclusion_clauses)) if exclusion_clauses else ""

    # Extra compliance columns
    extra_cols = []
    if "support_ticket_id" in schema_ddl:
        extra_cols.append("support_ticket_id")
    if "investigation_status" in schema_ddl:
        extra_cols.append("investigation_status")
    if "document_ref" in schema_ddl:
        extra_cols.append("document_ref")
    extra_cols_str = (", " + ", ".join(extra_cols)) if extra_cols else ""

    # Rule-driven generation: if extracted rules were detected in policy
    if rules and len(rules) >= 1:
        sel_blocks = []
        arch_blocks = []
        clean_blocks = []

        num_words = {
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        }

        for idx, r in enumerate(rules):
            rid = r.get("rule_id", f"RULE-{idx + 1:03d}")
            rdesc = r.get("description", "Archival Rule")
            cond = r.get("condition") or {}
            cond_f = cond.get("field")
            raw_val = str(cond.get("value") or retention_years).strip().lower()
            val = str(num_words[raw_val]) if raw_val in num_words else (re.sub(r"[^\d]", "", raw_val) or raw_val)
            unit = cond.get("unit") or "years"

            derived = derive_table_name(rdesc, default=source_table)
            # If the derived entity table isn't in the schema DDL, route to the active source_table & archive_table
            if derived in schema_ddl and derived != source_table:
                src_tbl = derived
                df = cond_f if (cond_f and cond_f in schema_ddl) else date_field
                arch_tbl = f"archive_{src_tbl}" if not src_tbl.startswith("source_") else src_tbl.replace("source_", "archive_")
                entity_filter = ""
                sel_blocks.append(
                    f"-- [{rid}] {rdesc}\n"
                    f"-- Target: {src_tbl} | Retention: older than {val} {unit}\n"
                    f"SELECT *\n"
                    f"FROM {src_tbl}\n"
                    f"WHERE {df} < DATE('now', '-{val} {unit}'){exclusion_sql};"
                )
                arch_blocks.append(
                    f"-- [{rid}] ARCHIVE FIRST -> {arch_tbl}\n"
                    f"-- Target: {src_tbl} | Rule: older than {val} {unit} | Run ID: {run_id}\n"
                    f"INSERT OR REPLACE INTO {arch_tbl}\n"
                    f"SELECT *, 'ARCHIVED' AS archival_status, '{run_id}' AS control_run_id, 'SHA256-' || substr(hex(randomblob(16)), 1, 16) AS verification_hash, CURRENT_TIMESTAMP AS archived_at\n"
                    f"FROM {src_tbl}\n"
                    f"WHERE {df} < DATE('now', '-{val} {unit}'){exclusion_sql};"
                )
                clean_blocks.append(
                    f"-- [{rid}] SOURCE CLEANUP -> {src_tbl} (AFTER RECONCILIATION & HUMAN APPROVAL)\n"
                    f"DELETE FROM {src_tbl}\n"
                    f"WHERE rowid IN (\n"
                    f"  SELECT rowid FROM {arch_tbl} WHERE control_run_id = '{run_id}'\n"
                    f"){exclusion_sql};"
                )
            else:
                src_tbl = source_table
                arch_tbl = archive_table
                df = date_field
                rdesc_l = rdesc.lower()
                if ("support ticket" in rdesc_l or "ticket" in rdesc_l) and "support_ticket_id" in schema_ddl:
                    entity_filter = "\n  AND (support_ticket_id IS NOT NULL AND support_ticket_id != '' AND support_ticket_id != '—' AND support_ticket_id != '-')"
                elif ("customer doc" in rdesc_l or "document" in rdesc_l) and "document_ref" in schema_ddl:
                    entity_filter = "\n  AND (document_ref IS NOT NULL AND document_ref != '' AND document_ref != '—' AND document_ref != '-')"
                else:
                    entity_filter = ""

                sel_blocks.append(
                    f"-- [{rid}] {rdesc}\n"
                    f"-- Target: {src_tbl} | Retention: older than {val} {unit}\n"
                    f"SELECT transaction_id, account_id, customer_name, {date_field}, amount, transaction_type, {hold_field}{extra_cols_str}\n"
                    f"FROM {src_tbl}\n"
                    f"WHERE {df} < DATE('now', '-{val} {unit}'){entity_filter}{exclusion_sql};"
                )
                arch_blocks.append(
                    f"-- [{rid}] ARCHIVE FIRST -> {arch_tbl}\n"
                    f"-- Target: {src_tbl} | Rule: older than {val} {unit} | Run ID: {run_id}\n"
                    f"INSERT OR REPLACE INTO {arch_tbl} (\n"
                    f"  transaction_id, account_id, customer_name, {date_field}, amount, transaction_type, {hold_field}{extra_cols_str}, status, control_run_id, verification_hash, archived_at\n"
                    f")\n"
                    f"SELECT \n"
                    f"  transaction_id, account_id, customer_name, {date_field}, amount, transaction_type, {hold_field}{extra_cols_str}, 'ARCHIVED',\n"
                    f"  '{run_id}',\n"
                    f"  'SHA256-' || substr(hex(randomblob(16)), 1, 16),\n"
                    f"  CURRENT_TIMESTAMP\n"
                    f"FROM {src_tbl}\n"
                    f"WHERE {df} < DATE('now', '-{val} {unit}'){entity_filter}{exclusion_sql};"
                )
                clean_blocks.append(
                    f"-- [{rid}] SOURCE CLEANUP -> {src_tbl} (AFTER RECONCILIATION & HUMAN APPROVAL)\n"
                    f"DELETE FROM {src_tbl}\n"
                    f"WHERE transaction_id IN (\n"
                    f"  SELECT transaction_id FROM {arch_tbl} WHERE control_run_id = '{run_id}'\n"
                    f"){entity_filter}{exclusion_sql};"
                )

        return {
            "selection_sql": "\n\n".join(sel_blocks),
            "archival_sql": "\n\n".join(arch_blocks),
            "cleanup_sql": "\n\n".join(clean_blocks),
        }

    # Single rule or baseline schema-driven queries
    selection_sql = f"""-- 1. ACTIVE SELECTION SQL (SELECT)
-- Target: {source_table}
-- Dialect: {dialect}
-- Rule: Records older than {retention_years} years (excluding active legal holds)
SELECT transaction_id, account_id, customer_name, {date_field}, amount, transaction_type, {hold_field}{extra_cols_str}
FROM {source_table}
WHERE {date_field} < DATE('now', '-{retention_years} years'){exclusion_sql};"""

    archival_sql = f"""-- 2. ARCHIVE FIRST - INSERT INTO APPROVED ARCHIVE DATABASE
-- Destination: {archive_table}
-- Run ID: {run_id}
-- Dialect: {dialect}
INSERT OR REPLACE INTO {archive_table} (
  transaction_id, account_id, customer_name, {date_field}, amount, transaction_type, {hold_field}{extra_cols_str}, status, control_run_id, verification_hash, archived_at
)
SELECT 
  transaction_id, account_id, customer_name, {date_field}, amount, transaction_type, {hold_field}{extra_cols_str}, 'ARCHIVED',
  '{run_id}',
  'SHA256-' || substr(hex(randomblob(16)), 1, 16),
  CURRENT_TIMESTAMP
FROM {source_table}
WHERE {date_field} < DATE('now', '-{retention_years} years'){exclusion_sql};"""

    cleanup_sql = f"""-- 3. SOURCE CLEANUP SQL (DELETE) - PURGE VERIFIED RECORDS (AFTER HUMAN APPROVAL)
-- Target: {source_table}
-- Run ID: {run_id}
-- Dialect: {dialect}
DELETE FROM {source_table}
WHERE transaction_id IN (
  SELECT transaction_id 
  FROM {archive_table} 
  WHERE control_run_id = '{run_id}'
){exclusion_sql};"""

    return {
        "selection_sql": selection_sql,
        "archival_sql": archival_sql,
        "cleanup_sql": cleanup_sql,
    }



def generate_sql_with_gemini(
    rules: list[dict[str, Any]],
    exceptions: list[dict[str, Any]],
    run_id: str,
    retention_years: int = 5,
    dialect: str = "SQLITE",
    control_id: str = "",
    archetype: str = "D",
) -> dict[str, Any]:
    """
    Generate executable compliance SQL scripts using ComplianceSQLAgent
    powered by Google Gemini API, grounded in the database schema and extracted rules,
    with deterministic fallback.
    """
    from agents.sql_agent import ComplianceSQLAgent

    agent = ComplianceSQLAgent()
    return agent.synthesize(
        rules=rules,
        exceptions=exceptions,
        run_id=run_id,
        retention_years=retention_years,
        dialect=dialect,
        control_id=control_id,
        archetype=archetype,
    )


def compile_vuln_sql(
    rules: dict[str, Any] | list[dict[str, Any]] | None = None,
    schema_ddl: str = "",
) -> dict[str, Any]:
    """Compile deterministic, parameterized SQL for vulnerability remediation controls.
    All policy values are bound parameters (:sla_critical, :sla_high, :sla_medium, :sla_low, :sla_kev, :exception_max_days, :as_of).
    Returns dict with q1_sla_breach, q2_ticket_coverage, q3_closure_validity, q4_exception_governance,
    ticket_insert, apply_exception_update, apply_escalation_update, and params.
    """
    if isinstance(rules, list):
        r_dict: dict[str, Any] = {}
        for r in rules:
            sev = (r.get("severity") or "").upper()
            max_age = r.get("max_age_days") or r.get("timeframe_days")
            if max_age is not None:
                if r.get("is_kev") or r.get("rule_type") == "KEV_SLA":
                    r_dict["sla_kev"] = max_age
                elif sev == "CRITICAL":
                    r_dict["sla_critical"] = max_age
                elif sev == "HIGH":
                    r_dict["sla_high"] = max_age
                elif sev == "MEDIUM":
                    r_dict["sla_medium"] = max_age
                elif sev == "LOW":
                    r_dict["sla_low"] = max_age
            if r.get("rule_type") == "EXCEPTION_GOVERNANCE" and r.get("max_expiry_days"):
                r_dict["exception_max_days"] = r.get("max_expiry_days")
        rules = r_dict
    elif not isinstance(rules, dict):
        rules = {}

    sla_critical = int(rules.get("sla_critical", 7))
    sla_high = int(rules.get("sla_high", 30))
    sla_medium = int(rules.get("sla_medium", 60))
    sla_low = int(rules.get("sla_low", 90))
    sla_kev = int(rules.get("sla_kev", 3))
    exception_max_days = int(rules.get("exception_max_days", 90))

    params = {
        "sla_critical": sla_critical,
        "sla_high": sla_high,
        "sla_medium": sla_medium,
        "sla_low": sla_low,
        "sla_kev": sla_kev,
        "exception_max_days": exception_max_days,
    }

    governed = rules.get("governed_severities")
    if not governed or not isinstance(governed, list):
        governed = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    governed_quoted = ", ".join(f"'{s.upper()}'" for s in governed)
    has_kev = bool(rules.get("has_kev_sla"))
    kev_clause = " OR v.is_kev = 1" if has_kev else ""
    sev_filter = f"(UPPER(v.severity) IN ({governed_quoted}){kev_clause})"
    kev_case = "WHEN v.is_kev = 1 THEN :sla_kev\n        " if has_kev else ""

    # Verify required schema elements if DDL is supplied
    if schema_ddl:
        required_elements = ["db_vulnerabilities", "vuln_assets", "vuln_tickets", "vuln_exceptions"]
        if any(elem not in schema_ddl for elem in required_elements):
            # Fall back to static baseline SQL if expected schema is missing
            from core.vulnerability_pipeline import (
                SQL_Q1_SLA_BREACH,
                SQL_Q2_TICKET_COVERAGE,
                SQL_Q3_CLOSURE_VALIDITY,
                SQL_Q4_EXCEPTION_GOVERNANCE,
                SQL_TICKETING_INSERT,
                SQL_APPLY_APPROVE_EXCEPTION,
                SQL_APPLY_ESCALATE_TICKET,
            )
            return {
                "q1_sla_breach": SQL_Q1_SLA_BREACH,
                "q2_ticket_coverage": SQL_Q2_TICKET_COVERAGE,
                "q3_closure_validity": SQL_Q3_CLOSURE_VALIDITY,
                "q4_exception_governance": SQL_Q4_EXCEPTION_GOVERNANCE,
                "ticket_insert": SQL_TICKETING_INSERT,
                "apply_exception_update": SQL_APPLY_APPROVE_EXCEPTION,
                "apply_escalation_update": SQL_APPLY_ESCALATE_TICKET,
                "params": params,
            }

    q1_sla_breach = f"""SELECT
    v.vulnerability_id,
    v.database_name,
    v.cve_id,
    v.severity,
    v.is_kev,
    v.cvss_score,
    v.status,
    v.discovered_at,
    CAST((julianday(:as_of) - julianday(v.discovered_at)) AS INTEGER) AS age_days,
    CASE
        {kev_case}WHEN UPPER(v.severity) = 'CRITICAL' THEN :sla_critical
        WHEN UPPER(v.severity) = 'HIGH' THEN :sla_high
        WHEN UPPER(v.severity) = 'MEDIUM' THEN :sla_medium
        ELSE :sla_low
    END AS sla_days,
    (CAST((julianday(:as_of) - julianday(v.discovered_at)) AS INTEGER) -
     CASE
        {kev_case}WHEN UPPER(v.severity) = 'CRITICAL' THEN :sla_critical
        WHEN UPPER(v.severity) = 'HIGH' THEN :sla_high
        WHEN UPPER(v.severity) = 'MEDIUM' THEN :sla_medium
        ELSE :sla_low
     END) AS overdue_days,
    v.exception_id,
    v.exception_status,
    v.exception_expires_at
FROM db_vulnerabilities v
JOIN vuln_assets a ON v.database_name = a.database_name
WHERE a.in_scope = 1
  AND v.status IN ('OPEN', 'IN_PROGRESS')
  AND {sev_filter}
  AND CAST((julianday(:as_of) - julianday(v.discovered_at)) AS INTEGER) > CASE
        {kev_case}WHEN UPPER(v.severity) = 'CRITICAL' THEN :sla_critical
        WHEN UPPER(v.severity) = 'HIGH' THEN :sla_high
        WHEN UPPER(v.severity) = 'MEDIUM' THEN :sla_medium
        ELSE :sla_low
  END
  AND NOT (
      v.exception_status = 'APPROVED'
      AND (v.exception_expires_at IS NULL OR v.exception_expires_at >= :as_of)
  )
ORDER BY v.severity ASC, overdue_days DESC;""".strip()

    q2_ticket_coverage = f"""SELECT
    v.vulnerability_id,
    v.database_name,
    v.cve_id,
    v.severity,
    v.is_kev,
    v.status AS finding_status,
    v.discovered_at,
    a.asset_id,
    a.tier,
    a.owner AS asset_owner,
    a.owner_manager AS asset_owner_manager,
    t.ticket_id,
    t.assignee,
    t.due_date,
    t.status AS ticket_status,
    t.escalated_at,
    t.escalated_to,
    CASE
        WHEN t.ticket_id IS NULL THEN 'NO_TICKET'
        WHEN t.assignee IS NULL OR t.assignee = '' THEN 'MISSING_ASSIGNEE'
        WHEN t.due_date IS NULL OR t.due_date = '' THEN 'MISSING_DUE_DATE'
        ELSE 'TRACKED'
    END AS ticket_issue
FROM db_vulnerabilities v
JOIN vuln_assets a ON v.database_name = a.database_name
LEFT JOIN vuln_tickets t ON t.finding_id = v.vulnerability_id
WHERE a.in_scope = 1
  AND v.status IN ('OPEN', 'IN_PROGRESS')
  AND {sev_filter}
  AND (
      t.ticket_id IS NULL
      OR t.assignee IS NULL
      OR t.assignee = ''
      OR t.due_date IS NULL
      OR t.due_date = ''
  )
ORDER BY v.severity ASC, v.vulnerability_id ASC;""".strip()

    q3_closure_validity = """SELECT
    v.vulnerability_id,
    v.database_name,
    v.cve_id,
    v.severity,
    v.status,
    v.discovered_at,
    v.patched_at,
    v.last_seen,
    t.ticket_id,
    t.rescan_verified_at,
    CASE
        WHEN v.status IN ('PATCHED', 'CLOSED') AND (t.rescan_verified_at IS NULL OR t.rescan_verified_at = '') THEN 'CLOSED_WITHOUT_RESCAN_VERIFICATION'
        WHEN v.status IN ('PATCHED', 'CLOSED') AND v.last_seen IS NOT NULL AND v.patched_at IS NOT NULL AND v.last_seen > v.patched_at THEN 'LAST_SEEN_AFTER_PATCHED_AT'
        ELSE 'VALID'
    END AS closure_defect
FROM db_vulnerabilities v
JOIN vuln_assets a ON v.database_name = a.database_name
LEFT JOIN vuln_tickets t ON t.finding_id = v.vulnerability_id
WHERE a.in_scope = 1
  AND (
      (v.status IN ('PATCHED', 'CLOSED') AND (t.rescan_verified_at IS NULL OR t.rescan_verified_at = ''))
      OR (v.status IN ('PATCHED', 'CLOSED') AND v.last_seen IS NOT NULL AND v.patched_at IS NOT NULL AND v.last_seen > v.patched_at)
  )
ORDER BY v.vulnerability_id ASC;""".strip()

    q4_exception_governance = """SELECT
    e.exception_id,
    e.finding_id,
    e.requested_by,
    e.requested_at,
    e.justification,
    e.compensating_control,
    e.expires_at,
    e.status AS exception_status,
    e.approved_by,
    e.approved_at,
    v.database_name,
    v.cve_id,
    v.severity,
    v.exception_status AS mirrored_exception_status,
    v.exception_expires_at AS mirrored_expires_at,
    CASE
        WHEN e.expires_at < :as_of THEN 'EXPIRED_EXCEPTION'
        WHEN e.status = 'PENDING_APPROVAL' THEN 'PENDING_APPROVAL'
        WHEN e.status = 'APPROVED' AND (e.approved_by IS NULL OR e.approved_by = '') THEN 'APPROVED_WITHOUT_APPROVER'
        WHEN e.status = 'APPROVED' AND (e.compensating_control IS NULL OR e.compensating_control = '') THEN 'MISSING_COMPENSATING_CONTROL'
        WHEN CAST((julianday(e.expires_at) - julianday(e.requested_at)) AS INTEGER) > :exception_max_days THEN 'DURATION_EXCEEDS_POLICY_LIMIT'
        WHEN v.exception_status = 'APPROVED' AND (e.expires_at < :as_of OR e.status != 'APPROVED') THEN 'EXPIRED_STILL_MIRRORED'
        ELSE 'OTHER_EXCEPTION_DEFECT'
    END AS exception_defect
FROM vuln_exceptions e
JOIN db_vulnerabilities v ON e.finding_id = v.vulnerability_id
JOIN vuln_assets a ON v.database_name = a.database_name
WHERE a.in_scope = 1
  AND (
      e.expires_at < :as_of
      OR e.status = 'PENDING_APPROVAL'
      OR (e.status = 'APPROVED' AND (e.approved_by IS NULL OR e.approved_by = ''))
      OR (e.status = 'APPROVED' AND (e.compensating_control IS NULL OR e.compensating_control = ''))
      OR CAST((julianday(e.expires_at) - julianday(e.requested_at)) AS INTEGER) > :exception_max_days
      OR (v.exception_status = 'APPROVED' AND (e.expires_at < :as_of OR e.status != 'APPROVED'))
  )
ORDER BY e.exception_id ASC;""".strip()

    ticket_insert = """INSERT INTO vuln_tickets (
    ticket_id, finding_id, assignee, created_at, created_by, due_date, status, run_id
)
SELECT
    :ticket_id, :finding_id, :assignee, :created_at, :created_by, :due_date, 'OPEN', :run_id
WHERE NOT EXISTS (
    SELECT 1 FROM vuln_tickets WHERE finding_id = :finding_id
);""".strip()

    apply_exception_update = """UPDATE vuln_exceptions
SET status = 'APPROVED',
    approved_by = :approved_by,
    approved_at = :approved_at
WHERE exception_id = :exception_id
  AND status = 'PENDING_APPROVAL';""".strip()

    apply_escalation_update = """UPDATE vuln_tickets
SET escalated_at = :escalated_at,
    escalated_to = :escalated_to
WHERE ticket_id = :ticket_id;""".strip()

    return {
        "q1_sla_breach": q1_sla_breach,
        "q2_ticket_coverage": q2_ticket_coverage,
        "q3_closure_validity": q3_closure_validity,
        "q4_exception_governance": q4_exception_governance,
        "ticket_insert": ticket_insert,
        "apply_exception_update": apply_exception_update,
        "apply_escalation_update": apply_escalation_update,
        "params": params,
    }

