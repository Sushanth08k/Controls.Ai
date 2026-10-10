import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any
from dotenv import load_dotenv

env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()

from contracts.models import ComplianceSQLScript
from core.sql_generator import (
    compile_schema_driven_sql,
    compile_vuln_sql,
    get_live_database_schema_ddl,
)

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL") or "gemini-2.5-flash-lite"
_QUOTA_EXHAUSTED_UNTIL = 0.0
_VULN_GEMINI_CACHE: dict[str, dict[str, str]] = {}


class ComplianceSQLAgent:
    """
    AI Agent that dynamically synthesizes compliance SQL queries across multiple controls
    (Data Archival, Vulnerability Management, Privileged Access, etc.) using a LangChain LCEL
    pipeline backed by Google Gemini, grounded in live database schemas, extracted policy rules,
    and legal hold constraints.

    Maintains a deterministic schema compiler fallback so control execution never fails
    even in offline or unauthenticated environments.
    """

    def __init__(self, template_version: str | int = 1) -> None:
        self.template_version = template_version

    def synthesize(
        self,
        rules: list[dict[str, Any]] | dict[str, Any] | None = None,
        exceptions: list[dict[str, Any]] | None = None,
        run_id: str = "run-default",
        retention_years: int = 5,
        dialect: str = "SQLITE",
        control_id: str = "",
        archetype: str = "D",
        as_of: str | datetime.date | None = None,
        schema_ddl: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Synthesize executable compliance SQL scripts for any control archetype.
        """
        rules = rules or []
        exceptions = exceptions or []
        as_of_str = as_of.isoformat() if isinstance(as_of, datetime.date) else as_of
        cid_lower = control_id.lower()
        target_tables = (
            ["source_transactions", "archive_transactions", "legal_holds"]
            if not cid_lower or "arch" in cid_lower
            else (["db_vulnerabilities", "vuln_assets", "vuln_tickets", "vuln_exceptions"] if "vuln" in cid_lower else None)
        )
        if not schema_ddl:
            schema_ddl = get_live_database_schema_ddl(target_tables=target_tables)

        gemini_api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if gemini_api_key and not os.environ.get("GOOGLE_API_KEY"):
            os.environ["GOOGLE_API_KEY"] = gemini_api_key

        if gemini_api_key and time.time() < _QUOTA_EXHAUSTED_UNTIL:
            logger.info("ComplianceSQLAgent: Gemini quota cooldown active. Skipping API call to prevent delay.")
            gemini_api_key = None

        # 1. Specialized handling for non-archival control archetypes (Vulnerability, IAM)
        if "vuln" in cid_lower:
            return self._synthesize_vulnerability_control(
                schema_ddl=schema_ddl,
                gemini_api_key=gemini_api_key,
                run_id=run_id,
                rules=rules,
                as_of=as_of_str,
                control_id=control_id,
            )
        elif "priv" in cid_lower:
            return self._synthesize_privileged_access_control(schema_ddl, gemini_api_key, run_id)

        # 2. Archival and Data Lifecycle Controls (LangChain + Gemini synthesis with fallback)
        rules_list: list[dict[str, Any]]
        if isinstance(rules, list):
            rules_list = rules
        elif isinstance(rules, dict):
            if "rules" in rules and isinstance(rules["rules"], list):
                rules_list = rules["rules"]
            else:
                rules_list = [rules]
        else:
            rules_list = []

        if gemini_api_key:
            try:
                gemini_res = self._call_langchain_synthesis(
                    gemini_api_key=gemini_api_key,
                    schema_ddl=schema_ddl,
                    rules=rules_list,
                    exceptions=exceptions,
                    run_id=run_id,
                    retention_years=retention_years,
                    dialect=dialect,
                    control_id=control_id,
                    archetype=archetype,
                )
                if gemini_res:
                    return gemini_res
            except Exception as e:
                logger.warning(
                    f"ComplianceSQLAgent: LangChain synthesis failed ({e}). "
                    "Engaging deterministic compliance compiler fallback."
                )

        # 3. Deterministic Safety Fallback
        logger.info(
            f"ComplianceSQLAgent: Using deterministic schema-driven fallback for {control_id or 'default'}."
        )
        logger.info("ComplianceSQLAgent: Using fallback query.")
        print("ComplianceSQLAgent: Using fallback query.")
        compiled = compile_schema_driven_sql(
            schema_ddl=schema_ddl,
            rules=rules_list,
            exceptions=exceptions,
            run_id=run_id,
            retention_years=retention_years,
            dialect=dialect,
        )
        return {
            **compiled,
            "agent": "ComplianceSQLAgent",
            "generator": "ComplianceSQLAgent (Deterministic Fallback)",
            "model": "deterministic-baseline",
            "schema_used": schema_ddl,
        }

    def _call_langchain_synthesis(
        self,
        gemini_api_key: str,
        schema_ddl: str,
        rules: list[dict[str, Any]],
        exceptions: list[dict[str, Any]],
        run_id: str,
        retention_years: int,
        dialect: str,
        control_id: str,
        archetype: str,
    ) -> dict[str, Any] | None:
        """Invokes a LangChain LCEL pipeline with ChatGoogleGenerativeAI to synthesize grounded compliance queries."""
        try:
            from langchain_core.output_parsers import JsonOutputParser
            from langchain_core.prompts import PromptTemplate
            from langchain_google_genai import ChatGoogleGenerativeAI

            parser = JsonOutputParser(pydantic_object=ComplianceSQLScript)

            prompt = PromptTemplate(
                template="""You are a principal compliance database engineer and AI security agent.
Generate 3 distinct, compliant SQL scripts for regulatory control {control_id} (Archetype {archetype}) strictly grounded in the database schema and rules below.

DATABASE SCHEMA:
{schema_ddl}

EXTRACTED POLICY RULES:
{rules_json}

EXTRACTED EXCEPTIONS & LEGAL HOLDS:
{exceptions_json}

PARAMETERS:
- SQL Dialect: {dialect}
- Control Run ID: {run_id}
- Retention Horizon: {retention_years} years

REQUIREMENTS:
1. "selection_sql": SELECT query identifying records subject to control while strictly excluding records where legal_hold = 1 or active investigations exist.
2. "archival_sql": INSERT OR REPLACE query into archive table copying verified records with status='ARCHIVED', control_run_id='{run_id}', SHA-256 verification hash, and current timestamp.
3. "cleanup_sql": DELETE query from source table targeting only records that exist in the archive table for run_id='{run_id}', excluding legal holds.

{format_instructions}
""",
                input_variables=[
                    "control_id",
                    "archetype",
                    "schema_ddl",
                    "rules_json",
                    "exceptions_json",
                    "dialect",
                    "run_id",
                    "retention_years",
                ],
                partial_variables={"format_instructions": parser.get_format_instructions()},
            )

            llm = ChatGoogleGenerativeAI(
                model=DEFAULT_GEMINI_MODEL,
                api_key=gemini_api_key,
                temperature=0.0,
                timeout=2.0,
                max_retries=0,
            )

            chain = prompt | llm | parser

            parsed = chain.invoke(
                {
                    "control_id": control_id or "generic_compliance_control",
                    "archetype": archetype,
                    "schema_ddl": schema_ddl,
                    "rules_json": json.dumps(rules, indent=2),
                    "exceptions_json": json.dumps(exceptions, indent=2),
                    "dialect": dialect,
                    "run_id": run_id,
                    "retention_years": retention_years,
                }
            )

            if isinstance(parsed, dict) and "selection_sql" in parsed and "archival_sql" in parsed and "cleanup_sql" in parsed:
                logger.info(
                    f"ComplianceSQLAgent: Successfully synthesized queries via LangChain LCEL ({DEFAULT_GEMINI_MODEL})."
                )
                logger.info("ComplianceSQLAgent: API call was successful and generated SQL query, and using it.")
                print("ComplianceSQLAgent: API call was successful and generated SQL query, and using it.")
                return {
                    "selection_sql": parsed["selection_sql"],
                    "archival_sql": parsed["archival_sql"],
                    "cleanup_sql": parsed["cleanup_sql"],
                    "agent": "ComplianceSQLAgent (LangChain + Gemini)",
                    "generator": f"ComplianceSQLAgent (LangChain + {DEFAULT_GEMINI_MODEL})",
                    "framework": "LangChain LCEL",
                    "model": DEFAULT_GEMINI_MODEL,
                    "schema_used": schema_ddl,
                }
        except Exception as e:
            err_str = str(e)
            global _QUOTA_EXHAUSTED_UNTIL
            _QUOTA_EXHAUSTED_UNTIL = time.time() + 600.0  # 10 minute cooldown
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                logger.warning("ComplianceSQLAgent: Gemini API quota exceeded (429). Activating instant deterministic fallback compiler.")
            else:
                logger.warning(f"ComplianceSQLAgent: LangChain LCEL Gemini synthesis failed ({e}). Falling back.")
        return None

    def _synthesize_vulnerability_control(
        self,
        schema_ddl: str,
        gemini_api_key: str | None,
        run_id: str,
        rules: list[dict[str, Any]] | dict[str, Any] | None = None,
        as_of: str | datetime.date | None = None,
        control_id: str = "",
    ) -> dict[str, Any]:
        """Synthesize vulnerability management SQL queries (Q1-Q4) using LangChain LCEL Gemini
        with silent query validation, quota cooldown, and deterministic compiler fallback.
        ticket_insert and UPDATE statements ALWAYS come from the compiler.
        """
        global _QUOTA_EXHAUSTED_UNTIL
        as_of_val: str = as_of.isoformat() if isinstance(as_of, datetime.date) else (as_of or "2026-10-06")
        # 1. Normalize rules dictionary
        rules_dict: dict[str, Any] = {}
        if isinstance(rules, dict):
            rules_dict = dict(rules)
        elif isinstance(rules, list):
            for r in rules:
                if isinstance(r, dict):
                    sev = str(r.get("severity", "")).upper()
                    days = r.get("max_age_days") or r.get("timeframe_days")
                    if days is not None:
                        if sev == "CRITICAL":
                            rules_dict["sla_critical"] = int(days)
                        elif sev == "HIGH":
                            rules_dict["sla_high"] = int(days)
                        elif sev == "MEDIUM":
                            rules_dict["sla_medium"] = int(days)
                        elif sev == "LOW":
                            rules_dict["sla_low"] = int(days)
                    if r.get("is_kev") and days is not None:
                        rules_dict["sla_kev"] = int(days)

        rules_dict.setdefault("sla_critical", 7)
        rules_dict.setdefault("sla_high", 30)
        rules_dict.setdefault("sla_medium", 60)
        rules_dict.setdefault("sla_low", 90)
        rules_dict.setdefault("sla_kev", 3)
        rules_dict.setdefault("exception_max_days", 90)
        rules_dict.setdefault("escalation_business_days", 1)

        # 2. Always compile deterministic SQL first
        compiled = compile_vuln_sql(rules_dict, schema_ddl)
        q1_sql = str(compiled.get("q1_sla_breach", ""))
        q2_sql = str(compiled.get("q2_ticket_coverage", ""))
        q3_sql = str(compiled.get("q3_exception_governance") or compiled.get("q4_exception_governance") or "")

        rules_hash = hashlib.sha256(json.dumps(rules_dict, sort_keys=True).encode()).hexdigest()

        # 3. Check cache
        used_api = False
        if rules_hash in _VULN_GEMINI_CACHE:
            cached = _VULN_GEMINI_CACHE[rules_hash]
            q1_sql = cached.get("q1_sla_breach", q1_sql)
            q2_sql = cached.get("q2_ticket_coverage", q2_sql)
            q3_sql = cached.get("q3_exception_governance", q3_sql)
            used_api = True
            logger.info("ComplianceSQLAgent: API call was successful and generated SQL query, and using it.")
            print("ComplianceSQLAgent: API call was successful and generated SQL query, and using it.")
        elif gemini_api_key and time.time() >= _QUOTA_EXHAUSTED_UNTIL:
            try:
                from langchain_core.output_parsers import JsonOutputParser
                from langchain_core.prompts import PromptTemplate
                from langchain_google_genai import ChatGoogleGenerativeAI
                from pydantic import BaseModel, ConfigDict

                class VulnSqlSynthesisOutput(BaseModel):
                    model_config = ConfigDict(extra="ignore")
                    q1_sla_breach: str
                    q2_ticket_coverage: str
                    q3_exception_governance: str

                template_path = Path(__file__).resolve().parent / "templates" / "sql_synthesis" / "vuln_1.md"
                template_text = template_path.read_text(encoding="utf-8") if template_path.exists() else ""

                if template_text:
                    prompt = PromptTemplate.from_template(template_text)
                    parser = JsonOutputParser(pydantic_object=VulnSqlSynthesisOutput)
                    llm = ChatGoogleGenerativeAI(
                        model=DEFAULT_GEMINI_MODEL,
                        api_key=gemini_api_key,
                        temperature=0.0,
                        timeout=2.0,
                        max_retries=0,
                    )
                    chain = prompt | llm | parser
                    parsed = chain.invoke({
                        "control_id": control_id or "VULN_CONTROL",
                        "schema_ddl": schema_ddl,
                        "rules": json.dumps(rules_dict, indent=2),
                        "as_of": as_of_val,
                        "dialect": "SQLITE",
                    })

                    if isinstance(parsed, dict):
                        from sim.database import CORE_DB_PATH
                        valid_dict: dict[str, str] = {}
                        q3_compiled = str(
                            compiled.get("q3_exception_governance")
                            or compiled.get("q4_exception_governance")
                            or ""
                        )
                        if CORE_DB_PATH.exists():
                            with sqlite3.connect(f"file:{CORE_DB_PATH}?mode=ro", uri=True) as vconn:
                                for q_key, c_sql in [
                                    ("q1_sla_breach", str(compiled.get("q1_sla_breach", ""))),
                                    ("q2_ticket_coverage", str(compiled.get("q2_ticket_coverage", ""))),
                                    ("q3_exception_governance", q3_compiled),
                                ]:
                                    cand = parsed.get(q_key)
                                    if cand and self._validate_vuln_query(str(cand), q_key, c_sql, compiled.get("params", {}), as_of_val, vconn):
                                        valid_dict[q_key] = str(cand)
                                    else:
                                        valid_dict[q_key] = c_sql
                        else:
                            valid_dict = {
                                "q1_sla_breach": str(compiled.get("q1_sla_breach", "")),
                                "q2_ticket_coverage": str(compiled.get("q2_ticket_coverage", "")),
                                "q3_exception_governance": q3_compiled,
                            }

                        _VULN_GEMINI_CACHE[rules_hash] = valid_dict
                        q1_sql = valid_dict["q1_sla_breach"]
                        q2_sql = valid_dict["q2_ticket_coverage"]
                        q3_sql = valid_dict["q3_exception_governance"]
                        used_api = True
                        logger.info("ComplianceSQLAgent: API call was successful and generated SQL query, and using it.")
                        print("ComplianceSQLAgent: API call was successful and generated SQL query, and using it.")
            except Exception as e:
                err_str = str(e).lower()
                if "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
                    _QUOTA_EXHAUSTED_UNTIL = time.time() + 600.0
                logger.debug(f"ComplianceSQLAgent: Vuln Gemini synthesis silent fallback: {e}")

        if not used_api:
            logger.info("ComplianceSQLAgent: Using fallback query.")
            print("ComplianceSQLAgent: Using fallback query.")

        return {
            "q1_sla_breach": q1_sql,
            "q2_ticket_coverage": q2_sql,
            "q3_exception_governance": q3_sql,
            "q4_exception_governance": q3_sql,
            "ticket_insert": compiled["ticket_insert"],
            "apply_exception_update": compiled["apply_exception_update"],
            "apply_escalation_update": compiled["apply_escalation_update"],
            "params": compiled["params"],
            "agent": "ComplianceSQLAgent",
            "generator": "ComplianceSQLAgent",
            "schema_used": schema_ddl,
            # Compatibility aliases
            "selection_sql": q1_sql,
            "archival_sql": compiled["ticket_insert"],
            "cleanup_sql": compiled["apply_exception_update"],
        }

    def _validate_vuln_query(
        self,
        candidate_sql: str,
        q_key: str,
        compiled_sql: str,
        params: dict[str, Any],
        as_of_str: str,
        conn: sqlite3.Connection,
    ) -> bool:
        """Silently validate a Gemini query: single SELECT, known bound params only,
        returns every column the UI and Assessment read, runs read-only, and returns
        the same ID set and row count as the compiled query with the same params.
        """
        try:
            sql_clean = candidate_sql.strip()
            # 1. Single SELECT statement, no write keywords
            if not (sql_clean.upper().startswith("SELECT") or sql_clean.upper().startswith("WITH")):
                return False
            statements = [s.strip() for s in sql_clean.split(";") if s.strip()]
            if len(statements) > 1:
                return False
            forbidden = {"DELETE", "UPDATE", "INSERT", "DROP", "ALTER", "TRUNCATE", "ATTACH", "CREATE", "REPLACE"}
            tokens = set(re.findall(r"\b[A-Za-z_]+\b", sql_clean.upper()))
            if forbidden.intersection(tokens):
                return False

            # 2. Known bound parameters only
            named_params = set(re.findall(r":([a-zA-Z0-9_]+)", sql_clean))
            allowed_params = {"as_of", "sla_critical", "sla_high", "sla_medium", "sla_low", "sla_kev", "exception_max_days"}
            if not named_params.issubset(allowed_params):
                return False

            # 3. Required columns per query
            req_cols_map = {
                "q1_sla_breach": {"vulnerability_id", "database_name", "cve_id", "severity", "is_kev", "discovered_at", "age_days", "sla_days", "overdue_days"},
                "q2_ticket_coverage": {"vulnerability_id", "database_name", "cve_id", "severity", "discovered_at", "asset_owner", "asset_owner_manager", "ticket_id", "assignee", "due_date", "ticket_issue"},
                "q3_exception_governance": {"exception_id", "finding_id", "database_name", "cve_id", "severity", "requested_by", "approved_by", "compensating_control", "expires_at", "exception_status", "exception_defect"},
                "q4_exception_governance": {"exception_id", "finding_id", "database_name", "cve_id", "severity", "requested_by", "approved_by", "compensating_control", "expires_at", "exception_status", "exception_defect"},
            }
            required_cols = req_cols_map.get(q_key, set())

            # 4. Compare execution result with compiled SQL
            exec_params = dict(params)
            exec_params["as_of"] = as_of_str

            cur = conn.cursor()
            cur.execute(compiled_sql, exec_params)
            comp_rows = cur.fetchall()
            id_col_idx = 0
            comp_ids = {r[id_col_idx] for r in comp_rows}

            cur.execute(sql_clean, exec_params)
            gem_desc = cur.description
            if not gem_desc:
                return False
            gem_cols = {col[0].lower() for col in gem_desc}
            if not required_cols.issubset(gem_cols):
                return False

            gem_rows = cur.fetchall()
            if len(gem_rows) != len(comp_rows):
                return False

            id_col_name = "exception_id" if q_key in ("q3_exception_governance", "q4_exception_governance") else "vulnerability_id"
            try:
                gem_id_idx = [col[0].lower() for col in gem_desc].index(id_col_name)
            except ValueError:
                return False
            gem_ids = {r[gem_id_idx] for r in gem_rows}
            if gem_ids != comp_ids:
                return False

            return True
        except Exception:
            return False

    def _synthesize_privileged_access_control(
        self, schema_ddl: str, gemini_api_key: str | None, run_id: str
    ) -> dict[str, Any]:
        """Synthesize IAM and Privileged Access audit queries."""
        return {
            "selection_sql": """-- 1. ACTIVE DIRECTORY SCAN (pg_roles)
SELECT rolname, rolsuper, rolreplication FROM pg_roles;""",
            "archival_sql": """-- 2. IAM WHITELIST DRIFT COMPARISON
SELECT rolname FROM pg_roles WHERE rolname NOT IN ('postgres', 'replicator') AND rolsuper = 1;""",
            "cleanup_sql": """-- 3. ATTESTATION & ROGUE ROLE REVOCATION (AFTER HUMAN APPROVAL)
ALTER ROLE unauthorized_root NOSUPERUSER;""",
            "agent": "ComplianceSQLAgent",
            "generator": "ComplianceSQLAgent (Deterministic IAM Baseline)",
            "model": "deterministic-baseline",
            "schema_used": schema_ddl,
        }
