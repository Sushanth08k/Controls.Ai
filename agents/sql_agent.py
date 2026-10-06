import json
import logging
import os
from typing import Any

from contracts.models import ComplianceSQLScript
from core.sql_generator import (
    compile_schema_driven_sql,
    get_live_database_schema_ddl,
)

logger = logging.getLogger(__name__)


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
        rules: list[dict[str, Any]] | None = None,
        exceptions: list[dict[str, Any]] | None = None,
        run_id: str = "run-default",
        retention_years: int = 5,
        dialect: str = "SQLITE",
        control_id: str = "",
        archetype: str = "D",
    ) -> dict[str, Any]:
        """
        Synthesize executable compliance SQL scripts for any control archetype.
        """
        rules = rules or []
        exceptions = exceptions or []
        schema_ddl = get_live_database_schema_ddl()
        cid_lower = control_id.lower()

        gemini_api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

        # 1. Specialized handling for non-archival control archetypes (Vulnerability, IAM)
        if "vuln" in cid_lower:
            return self._synthesize_vulnerability_control(schema_ddl, gemini_api_key, run_id)
        elif "priv" in cid_lower:
            return self._synthesize_privileged_access_control(schema_ddl, gemini_api_key, run_id)

        # 2. Archival and Data Lifecycle Controls (LangChain + Gemini synthesis with fallback)
        if gemini_api_key:
            try:
                gemini_res = self._call_langchain_synthesis(
                    gemini_api_key=gemini_api_key,
                    schema_ddl=schema_ddl,
                    rules=rules,
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
        compiled = compile_schema_driven_sql(
            schema_ddl=schema_ddl,
            rules=rules,
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
                model="gemini-1.5-flash",
                google_api_key=gemini_api_key,
                temperature=0.0,
                timeout=12.0,
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
                    "ComplianceSQLAgent: Successfully synthesized queries via LangChain LCEL (gemini-1.5-flash)."
                )
                return {
                    "selection_sql": parsed["selection_sql"],
                    "archival_sql": parsed["archival_sql"],
                    "cleanup_sql": parsed["cleanup_sql"],
                    "agent": "ComplianceSQLAgent (LangChain + Gemini)",
                    "generator": "ComplianceSQLAgent (LangChain + Google Gemini 1.5 Flash)",
                    "framework": "LangChain LCEL",
                    "model": "gemini-1.5-flash",
                    "schema_used": schema_ddl,
                }
        except Exception as e:
            logger.warning(f"ComplianceSQLAgent: LangChain LCEL Gemini synthesis failed ({e}). Falling back.")
        return None

    def _synthesize_vulnerability_control(
        self, schema_ddl: str, gemini_api_key: str | None, run_id: str
    ) -> dict[str, Any]:
        """Synthesize CIS Benchmark scanning and remediation SQL for vulnerability controls using LangChain."""
        if gemini_api_key:
            try:
                from langchain_core.output_parsers import JsonOutputParser
                from langchain_core.prompts import PromptTemplate
                from langchain_google_genai import ChatGoogleGenerativeAI

                parser = JsonOutputParser(pydantic_object=ComplianceSQLScript)
                prompt = PromptTemplate(
                    template="""You are a principal compliance database engineer and AI security agent.
Generate 3 distinct SQL scripts for a Database Security & Vulnerability Control run (CIS benchmark scanning):
1. "selection_sql": Audit query on database_users and roles to detect unauthorized superusers or weak password hashing.
2. "archival_sql": Audit query on system_config and public_grants to record server SSL configuration and excessive public privileges.
3. "cleanup_sql": Schema remediation script to revoke rogue privileges and restrict public schema.

{format_instructions}
""",
                    input_variables=[],
                    partial_variables={"format_instructions": parser.get_format_instructions()},
                )
                llm = ChatGoogleGenerativeAI(
                    model="gemini-1.5-flash",
                    google_api_key=gemini_api_key,
                    temperature=0.0,
                    timeout=10.0,
                )
                chain = prompt | llm | parser
                parsed = chain.invoke({})

                if isinstance(parsed, dict) and "selection_sql" in parsed and "archival_sql" in parsed and "cleanup_sql" in parsed:
                    return {
                        "selection_sql": parsed["selection_sql"],
                        "archival_sql": parsed["archival_sql"],
                        "cleanup_sql": parsed["cleanup_sql"],
                        "agent": "ComplianceSQLAgent (LangChain + Gemini)",
                        "generator": "ComplianceSQLAgent (LangChain + Google Gemini 1.5 Flash)",
                        "framework": "LangChain LCEL",
                        "model": "gemini-1.5-flash",
                        "schema_used": schema_ddl,
                    }
            except Exception as e:
                logger.warning(f"ComplianceSQLAgent: Vulnerability LangChain synthesis failed ({e}). Falling back.")

        # Deterministic CIS benchmark fallback
        return {
            "selection_sql": """-- 1. ACTIVE SELECTION SQL (SELECT) - CIS BENCHMARK SCAN
-- Target: database_users, system_config
SELECT rolname, rolsuper, rolreplication, password_encryption
FROM database_users
WHERE rolsuper = 1;""",
            "archival_sql": """-- 2. SYSTEM CONFIG & WIRE ENCRYPTION AUDIT
-- Target: system_config, public_grants
SELECT key, value FROM system_config WHERE key IN ('server_version', 'ssl');
SELECT table_name, grantee, privilege_type FROM public_grants WHERE grantee = 'PUBLIC';""",
            "cleanup_sql": """-- 3. REMEDIATION & SCHEMA HARDENING (AFTER HUMAN APPROVAL)
-- Revoke rogue superuser privileges and lock down public schemas
ALTER ROLE unauthorized_root NOSUPERUSER;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;""",
            "agent": "ComplianceSQLAgent",
            "generator": "ComplianceSQLAgent (Deterministic CIS Baseline)",
            "model": "deterministic-baseline",
            "schema_used": schema_ddl,
        }

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
