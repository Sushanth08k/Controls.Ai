# Compliance SQL Synthesis Template v1
Inputs:
- control_id: {control_id}
- archetype: {archetype}
- schema_ddl: {schema_ddl}
- rules_json: {rules_json}
- exceptions_json: {exceptions_json}
- run_id: {run_id}
- retention_years: {retention_years}
- dialect: {dialect}

You are a principal compliance database engineer and AI security agent.
Generate 3 distinct, compliant SQL scripts for a regulatory control run ({control_id}, Archetype {archetype}) strictly grounded in the database schema and policy requirements provided below.

DATABASE SCHEMA:
{schema_ddl}

EXTRACTED POLICY RULES:
{rules_json}

EXTRACTED EXCEPTIONS & LEGAL HOLDS:
{exceptions_json}

PARAMETERS:
- Control ID: {control_id}
- Archetype: {archetype}
- SQL Dialect: {dialect}
- Control Run ID: {run_id}
- Retention Horizon: {retention_years} years

CRITICAL FILTERING & EXCLUSION RULES:
1. Target Tables: Ground queries directly on the primary source table (e.g. source_transactions) and archive table (e.g. archive_transactions).
2. Date Cutoff: In SQLite, use DATE('now', '-{retention_years} years') to match record dates formatted as YYYY-MM-DD.
3. Row-Level Exclusions:
   - Use row-level columns directly: check `(legal_hold = 0 OR legal_hold IS NULL)` and `(investigation_status != 'ACTIVE' OR investigation_status IS NULL)`.
   - Do NOT construct subqueries or joins against auxiliary tables (such as external legal_holds tables) unless explicitly commanded by policy rules, because individual records already carry their legal_hold and investigation flags.
   - Unified WHERE clause: Combine date criteria and all exception conditions in a single unified WHERE clause with AND boolean logic so overlapping exceptions are evaluated at the row level without over-excluding records.

REQUIREMENTS:
1. "selection_sql": SELECT query on source table identifying eligible records meeting the retention cutoff while strictly excluding active legal holds and active investigations directly via row columns.
2. "archival_sql": INSERT OR REPLACE query into the archive table copying all verified records with status='ARCHIVED', control_run_id='{run_id}', SHA-256 verification hash, and current timestamp.
3. "cleanup_sql": DELETE query from source table targeting only records that exist in the archive table for run_id='{run_id}', excluding legal holds.

You MUST respond with a JSON object strictly matching this schema:
{{
  "selection_sql": "string",
  "archival_sql": "string",
  "cleanup_sql": "string"
}}

