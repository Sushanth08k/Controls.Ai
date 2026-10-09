# Vulnerability Management SQL Synthesis Template v1
Inputs:
- control_id: {{control_id}}
- schema_ddl: {{schema_ddl}}
- rules: {{rules}}
- as_of: {{as_of}}
- dialect: {{dialect}}

You are a principal compliance database engineer and AI security agent.
Generate 4 distinct, compliant SQL SELECT queries for a vulnerability management regulatory control run ({{control_id}}) strictly grounded in the database schema and policy rules provided below.

DATABASE SCHEMA:
{{schema_ddl}}

EXTRACTED POLICY RULES:
{{rules}}

PARAMETERS:
- Control ID: {{control_id}}
- SQL Dialect: {{dialect}}
- Bound Parameters: :as_of, :sla_critical, :sla_high, :sla_medium, :sla_low, :sla_kev, :exception_max_days

REQUIREMENTS:
1. "q1_sla_breach": Single SELECT query on db_vulnerabilities joined to vuln_assets (where in_scope = 1 and status in ('OPEN', 'IN_PROGRESS')) identifying open findings exceeding SLA thresholds (:sla_kev when is_kev = 1, :sla_critical, :sla_high, :sla_medium, :sla_low) excluding active approved exceptions. Must return columns: vulnerability_id, database_name, cve_id, severity, is_kev, cvss_score, status, discovered_at, age_days, sla_days, overdue_days, exception_id, exception_status, exception_expires_at.
2. "q2_ticket_coverage": Single SELECT query on db_vulnerabilities joined to vuln_assets (where in_scope = 1 and status in ('OPEN', 'IN_PROGRESS') and (severity in ('CRITICAL', 'HIGH') or is_kev = 1)) left joined to vuln_tickets identifying untracked or defective tickets. Must return columns: vulnerability_id, database_name, cve_id, severity, is_kev, finding_status, discovered_at, asset_id, tier, asset_owner, asset_owner_manager, ticket_id, assignee, due_date, ticket_status, escalated_at, escalated_to, ticket_issue.
3. "q3_closure_validity": Single SELECT query on db_vulnerabilities joined to vuln_assets left joined to vuln_tickets auditing closed or patched findings for missing rescan verification or reopening. Must return columns: vulnerability_id, database_name, cve_id, severity, status, discovered_at, patched_at, last_seen, ticket_id, rescan_verified_at, closure_defect.
4. "q4_exception_governance": Single SELECT query on vuln_exceptions joined to db_vulnerabilities and vuln_assets auditing exceptions for pending approvals, expiration (< :as_of), missing compensating controls, or duration exceeding :exception_max_days. Must return columns: exception_id, finding_id, requested_by, requested_at, justification, compensating_control, expires_at, exception_status, approved_by, approved_at, database_name, cve_id, severity, mirrored_exception_status, mirrored_expires_at, exception_defect.

Each query MUST be a read-only SELECT query using named bound parameters (e.g. :as_of, :sla_critical, etc.). Never interpolate values directly.

You MUST respond with a JSON object strictly matching this schema:
{
  "q1_sla_breach": "string",
  "q2_ticket_coverage": "string",
  "q3_closure_validity": "string",
  "q4_exception_governance": "string"
}
