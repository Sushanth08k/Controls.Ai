# Project Progress & Technical Implementation Report

> **Agentic Control Automation Platform**  
> *Autonomous Policy Ingestion, Cryptographic Audit Ledger & Zero-Trust Control Execution*  
> **Last Updated:** October 3, 2026 | **Build Status:** Passing (67/67 Tests) | **Frontend:** Verified & Built

---

## 1. Project Goal

The **Agentic Control Automation Platform** automates internal compliance and regulatory control execution (SOX, PCI-DSS, GDPR, ISO 27001) across enterprise database and application environments. The objective is to scale compliance across thousands of enterprise controls by combining:
- Declarative control definitions (YAML specifications without custom per-control workflow code).
- Five canonical workflow archetypes (Query & Rule Check, Test Execution, Reconciliation, Execute-and-Verify, Document Review).
- Deterministic execution spines with agentic interpretation and challenge.
- Immutable, hash-chained audit ledgers and dual-root Merkle verification.
- Human-in-the-loop (HITL) approval gates enforcing strict maker-checker governance.

---

## 2. Current Architecture

The platform currently implements a hybrid local-first architecture:
- **Frontend (`web/`):** React 18, TypeScript, Vite, Tailwind CSS, Lucide icons. Implements the Operator Console with Dashboard, Control Library, HITL Approvals, Runs Table, Findings Review, and two dedicated execution modals (`ControlExecutionModal` for Archival / Archetype D and `VulnerabilityExecutionModal` for Vulnerability / Archetype A).
- **Backend / BFF (`api/`):** FastAPI application (`api/main.py`) exposing REST endpoints for controls, runs, gates, findings, evidence, policy document uploads, and interactive execution pipelines (`api/routers/interactive.py` and `api/routers/vulnerability.py`), plus Server-Sent Events (`/events`) via Starlette.
- **Workflow & Orchestration Layer (`workflows/`):** 
  - Standard Python synchronous orchestrators (`workflows/archetypes/dispatcher.py`, `query_review_wf.py`, `execute_verify_wf.py`, `reconcile_wf.py`, `test_exec_wf.py`, `doc_review_wf.py`).
  - Temporal scaffolding is present in `workflows/worker.py` and `workflows/supervisor_wf.py` (Supervisor stub), but runtime control execution is currently invoked directly in-process via synchronous Python calls.
- **Control Engine (`core/`):**
  - Heuristic & regex policy parser (`core/policy_parser.py`) for deterministic extraction of retention thresholds, rules, exceptions, and scopes.
  - Multi-format document parser (`core/document_extractor.py`) supporting PDF (PyMuPDF / pypdf) and DOCX (ZIP/XML).
  - Deterministic rule engine (`core/rules/engine.py`) and vulnerability evaluation engine (`core/vulnerability_engine.py`).
  - Cryptographic engine (`core/hashing.py`, `core/merkle.py`, `core/ledger.py`) implementing RFC 8785 canonical JSON row hashing, dual-root Merkle tree bisection, and in-memory SHA-256 hash-chained ledger.
  - Schema-aware SQL generator (`core/sql_generator.py`) using Google Gemini API (`gemini-1.5-flash`) for UI display queries with deterministic fallback.
- **Data & Storage Layer (`sim/`):**
  - Canonical SQLite database engines on disk: `sim/bank_core.db` (source transactions, system configurations, users, `db_vulnerabilities`) and `sim/bank_archive.db` (`archive_transactions`).
  - Containerized multi-database configuration (Postgres ×4, OPA, OpenBao, SeaweedFS) defined in `infra/compose.yaml`.

---

## 3. Controls

### CTL-ARCH-001 — Data Archival Compliance
- **Purpose:** Enforce regulatory retention cutoff policies on financial transactions with cryptographic Merkle verification before source cleanup.
- **Current Implementation:** Fully implemented and genuinely executable end-to-end via `api/routers/interactive.py`, `sim/database.py`, and `web/src/features/library/ControlExecutionModal.tsx`.
- **Data / Input:** 50 seeded records in `source_transactions` (`bank_core.db`); legal holds in `legal_holds`.
- **Processing:** Identifies records older than 5 years (33 records), stages reversible copy into `archive_transactions` (`bank_archive.db`), calculates independent SHA-256 Merkle roots on source and target datasets, requires operator sign-off, and purges eligible rows from `source_transactions` (leaving 17 recent rows).
- **Agents:** Planned for `PlannerAgent`, `ChallengerAgent`, `ReporterAgent`; currently executed via deterministic backend handlers in `interactive.py` and `sim/database.py`.
- **Workflow:** Archetype D (`ExecuteVerifyWorkflow` available in Python; `interactive.py` executes SQL and Merkle logic directly against SQLite).
- **LLM:** Optional Google Gemini API (`gemini-1.5-flash`) in `core/sql_generator.py` for dynamic SQL display queries with deterministic fallback.
- **Output:** Staged copy, dual Merkle roots, attestation token, audit certificate, ledger sign-off entry.
- **Tests:** `evals/test_archetype_D.py`, `tests/test_hashing_and_merkle.py`, `tests/test_ledger_tamper.py`.
- **Frontend:** Interactive 7-step modal with live metric counters, stepper, SQL tabs, and dual database table inspector.
- **Status:** **IMPLEMENTED & WORKING**

### CTL-VULN-001 — Database Vulnerability Management Review
- **Purpose:** Detective review of database vulnerabilities against SLA remediation timeframes (Critical: 7d, High: 30d, Medium: 60d, Low: 90d), verified remediation, approved exceptions, and CVSS/KEV/EPSS risk telemetry.
- **Current Implementation:** Fully implemented and genuinely executable end-to-end via `api/routers/vulnerability.py`, `core/vulnerability_engine.py`, `workflows/archetypes/dispatcher.py`, `workflows/archetypes/query_review_wf.py`, and `web/src/features/library/VulnerabilityExecutionModal.tsx`.
- **Data / Input:** 12 seeded database vulnerability records in `db_vulnerabilities` table (`bank_core.db`) spanning `core_banking_sim` and `vuln_target`.
- **Processing:** Evaluates age vs SLA, status (`OPEN`, `IN_PROGRESS`, `PATCHED`, `CLOSED`), verified remediation evidence, approved exception metadata (`exception_expires_at`), and composite risk prioritization (P1-P4). Dispatches through `WorkflowDispatcher` into `QueryReviewWorkflow`.
- **Agents:** `ChallengerAgent` and `ReporterAgent` instantiated in `QueryReviewWorkflow`; deterministic evaluation executed by `core/vulnerability_engine.py`.
- **Workflow:** Archetype A (`QueryReviewWorkflow` dispatched via `WorkflowDispatcher`).
- **LLM:** Optional LiteLLM/reasoner calls via agent tasks with deterministic fallback workpaper when offline.
- **Output:** Security findings (`FindingSummary`), cryptographically hashed evidence bundle, ledger entries (`evidence_collected`, `run_sealed`), detailed evaluation table.
- **Tests:** `tests/test_vulnerability_control.py` (20 dedicated unit and integration tests), `evals/test_archetype_A.py`.
- **Frontend:** Dedicated 7-step `VulnerabilityExecutionModal` with target discovery, generated inspection SQL, filterable evaluation results table, and findings review.
- **Status:** **IMPLEMENTED & WORKING**

### CTL-SAN-001 — Post-Change Sanity Testing
- **Purpose:** Automated API regression and latency testing following service deployments, verifying latency against EWMA baselines and SLOs.
- **Current Implementation:** Backend workflow logic implemented in `workflows/archetypes/test_exec_wf.py`. In the frontend UI, opening this control triggers `ControlExecutionModal`, which returns simulated/mocked endpoints via `interactive.py`.
- **Data / Input:** Synthetic endpoint test results, critical endpoint catalog (`catalogs/critical_endpoints.yaml`), and EWMA latency baselines.
- **Processing:** Evaluates status codes, contract schema conformance, and EWMA latency thresholds ($k\cdot\sigma$ cutoff). Updates EWMA baseline on passing runs.
- **Agents:** `ImpactAnalystAgent` and `ReporterAgent` referenced.
- **Workflow:** Archetype B (`TestExecWorkflow`).
- **LLM:** Fast model prompt template for change impact analysis (`agents/templates/change_impact/1.md`).
- **Output:** `TestVerdict` list, overall status (`verified`, `blocked`, `verified_with_exceptions`), rollback gate trigger.
- **Tests:** `evals/test_archetype_B.py`.
- **Frontend:** Visible in Control Library; execution modal displays mock/simulated check results.
- **Status:** **IMPLEMENTED BUT INCOMPLETE** (Backend archetype verified in unit tests; runtime API execution is simulated).

### CTL-PRIV-001 — Privileged Database Users Monthly Review
- **Purpose:** Detective review of privileged database accounts (`rolsuper`, `createrole`) and dormant accounts against approved IAM baselines.
- **Current Implementation:** Fully defined declaratively in `controls/CTL-PRIV-001.yaml` using catalog queries (`VQ-001`, `VQ-011`, `VQ-002`) and baseline (`catalogs/baselines/privileged_access.yaml`). Backend engine executes via Archetype A. In UI, it triggers `ControlExecutionModal` with simulated role preview.
- **Data / Input:** `database_users` and `public_grants` in `bank_core.db`; IAM baseline YAML.
- **Processing:** Set difference (`subset_of`), row count (`row_count`), and drift detection (`no_drift`).
- **Agents:** `ChallengerAgent` and `ReporterAgent`.
- **Workflow:** Archetype A (`QueryReviewWorkflow`).
- **LLM:** Workpaper reporting and challenger tasks.
- **Output:** Security findings for unapproved superusers, workpaper, ledger entry.
- **Tests:** `evals/test_archetype_C.py`, `evals/test_no_code_control.py`.
- **Frontend:** Visible in Control Library; runs through `ControlExecutionModal` with mock preview.
- **Status:** **IMPLEMENTED BUT NOT INTEGRATED** into dedicated runtime UI flow (operates via declarative evaluation in tests).

---

## 4. Reusable Agents

| Agent Name | Source File | Purpose | Invocation Status | Fallback Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **InterpreterAgent** | `agents/interpreter.py` | Dual-extraction of policy contracts | Invoked in `DocReviewWorkflow` | Raises if LLM fails; bypassed by regex parser in UI |
| **PlannerAgent** | `agents/planner.py` | Volume anomaly & plan review | Invoked in `ExecuteVerifyWorkflow` | Fallback deterministic plan |
| **EvaluatorAgent** | `agents/evaluator.py` | Contextual CVE applicability review | Referenced in rule evaluator tasks | Fail-safe: retains finding if evaluator offline |
| **ChallengerAgent** | `agents/challenger.py` | Challenges proposed findings | Invoked in `QueryReviewWorkflow` | Wrapped in try/except; skipped if offline |
| **ImpactAnalystAgent**| `agents/impact_analyst.py` | Change impact & endpoint selection | Invoked in `TestExecWorkflow` | Deterministic endpoint list |
| **ReporterAgent** | `agents/reporter.py` | Formal audit workpaper drafting | Invoked in `QueryReviewWorkflow` | Emits deterministic fallback workpaper |
| **OnboarderAgent** | `agents/onboarder.py` | RCM row to YAML control drafting | Invoked in `OnboardWorkflow` | Mock draft support |

---

## 5. Workflows / Orchestration

- **Archetype Workflows (Python Synchronous):**
  - `QueryReviewWorkflow` (`workflows/archetypes/query_review_wf.py`): Genuinely used by `CTL-VULN-001` via `WorkflowDispatcher`.
  - `ExecuteVerifyWorkflow` (`workflows/archetypes/execute_verify_wf.py`): Implemented for Archetype D; tested in `evals/test_archetype_D.py`.
  - `TestExecWorkflow` (`workflows/archetypes/test_exec_wf.py`): Implemented for Archetype B; tested in `evals/test_archetype_B.py`.
  - `ReconcileWorkflow` (`workflows/archetypes/reconcile_wf.py`): Implemented for Archetype C; tested in `evals/test_archetype_C.py`.
  - `DocReviewWorkflow` (`workflows/archetypes/doc_review_wf.py`): Implemented for Archetype E; tested in `evals/test_archetype_E.py`.
  - `WorkflowDispatcher` (`workflows/archetypes/dispatcher.py`): Routes `ControlDefinition` to its corresponding archetype engine.
- **Temporal Infrastructure:**
  - `workflows/worker.py` and `workflows/supervisor_wf.py` define a basic Temporal worker and `SupervisorWorkflow` stub.
  - **Temporal is NOT actively executing controls at runtime.** API endpoints execute workflows directly and synchronously in Python without Temporal client connections.

---

## 6. LLM Integration

- **Google Gemini API (`core/sql_generator.py`):**
  - Model: `gemini-1.5-flash`.
  - Function: When `GEMINI_API_KEY` or `GOOGLE_API_KEY` is configured, issues a zero-shot prompt grounded in live SQLite schema (`sqlite_master`) and extracted rules to generate display SQL scripts.
  - Fallback: Deterministic schema-driven SQL compiler (`compile_schema_driven_sql`).
  - Execution note: The generated SQL is presented in the UI; backend database mutations use parameterized Python/SQLite statements.
- **LiteLLM Gateway (`core/llm.py`):**
  - Configured for `http://localhost:4000` via `litellm.completion`.
  - Used by `structured_call` to enforce Pydantic output schemas across prompt templates in `agents/templates/`.
  - Controlled by `LITELLM_MOCK=1` and `LITELLM_FALLBACK_MOCK=1` in development.

---

## 7. Database / Storage

- **Runtime Database:** SQLite files on disk (`sim/bank_core.db` and `sim/bank_archive.db`).
- **Tables Present:**
  - `bank_core.db`: `source_transactions` (50 canonical rows), `customers`, `accounts`, `legal_holds`, `transactions` (1,200 rows), `database_users`, `system_config`, `public_grants`, `db_vulnerabilities` (12 rows).
  - `bank_archive.db`: `archive_transactions`, `transactions_archive`.
- **Evidence Ledger:** In-memory hash chain (`core/ledger.py`), re-instantiated on process start.
- **In-Memory Store:** `_RUNS_STORE`, `_GATE_STORE`, `_FINDINGS_STORE`, `_EVIDENCE_STORE`, `_INTERACTIVE_SESSIONS`, `_VULN_RUN_RESULTS`.

---

## 8. Testing

- **Total Tests Collected & Passing:** **67 items** (`pytest -v`).
- **Test Modules:**
  - `tests/test_api_rbac.py` (7 tests): API routing, health, maker-checker authorization, RBAC gate rejection.
  - `tests/test_architecture_rules.py` (2 tests): Architectural import boundaries and forbidden dependency checks.
  - `tests/test_definitions_and_rules.py` (8 tests): YAML definition schema validation, referential integrity, rule primitives.
  - `tests/test_gateway_and_connectors.py` (4 tests): ToolGateway OPA authorization, JIT credentials, connector dispatch.
  - `tests/test_hashing_and_merkle.py` (6 tests): Canonical row hashing, dual-root Merkle tree construction, bisection.
  - `tests/test_ledger_tamper.py` (3 tests): Hash chaining, sequence monotonicity, forensic tamper detection.
  - `tests/test_llm_smoke.py` (3 tests): Template rendering, structured output parsing, mock fallback.
  - `tests/test_vulnerability_control.py` (20 tests): Comprehensive SLA compliance, KEV/EPSS prioritization, exception verification, and runtime API integration.
  - `evals/test_archetype_A.py` (1 test): Archetype A query review workflow.
  - `evals/test_archetype_B.py` (3 tests): Archetype B post-change sanity testing and regression rollback.
  - `evals/test_archetype_C.py` (2 tests): Archetype C reconciliation and bisection.
  - `evals/test_archetype_D.py` (3 tests): Archetype D execute-and-verify archival with Merkle match and byte mutation faults.
  - `evals/test_archetype_E.py` (2 tests): Archetype E document review and dual-model concordance.
  - `evals/test_mock_audit.py` (1 test): Simulated SOX audit evidence bundle inspection.
  - `evals/test_no_code_control.py` (1 test): Privileged access control validation without bespoke Python code.
  - `evals/test_onboarding.py` (1 test): Automated RCM row onboarding workflow.

---

## 9. Frontend

- **Status:** Built and verified with zero TypeScript or Vite bundle errors.
- **Components & Features:**
  - `ControlLibraryPage.tsx`: Displays controls and uploaded policy documents with search, format filters, and run triggers.
  - `ControlExecutionModal.tsx`: Complete 7-step studio for Data Archival (`CTL-ARCH-001`) with live metric counters, SQL tabs, live table viewers, and approval gate.
  - `VulnerabilityExecutionModal.tsx`: Dedicated 7-step studio for Vulnerability Review (`CTL-VULN-001`) with target discovery, inspection query, filterable evaluation results table, findings badges, and audit evidence viewer.
  - `DashboardPage.tsx`: KPI cards, active run counters, pending gate alerts, and quick actions.
  - `ApprovalsPage.tsx`: Maker-checker HITL gate review console with role enforcement.
  - `RunsPage.tsx`: Realtime workflow run history table connected to SSE.
  - `FindingsPage.tsx`: Security findings with severity badges and linked evidence IDs.

---

## 10. Completed Work

- [x] Dual-database SQLite compliance simulation (`sim/bank_core.db`, `sim/bank_archive.db`) with 50 canonical financial records and 12 vulnerability records.
- [x] Full end-to-end execution of Data Archival (`CTL-ARCH-001`) with dual-root Merkle verification and HITL approval.
- [x] Full end-to-end execution of Vulnerability Review (`CTL-VULN-001`) with SLA checks, KEV/EPSS risk scoring, verified remediation validation, and findings generation.
- [x] Multi-format document parser (`core/document_extractor.py`) for PDF, DOCX, TXT, and MD.
- [x] Heuristic and regex policy extraction engine (`core/policy_parser.py`) for zero-hallucination rule extraction.
- [x] Hash-chained cryptographic ledger (`core/ledger.py`) with tamper verification.
- [x] Dual-root Merkle tree builder and bisection engine (`core/merkle.py`).
- [x] FastAPI BFF backend with RBAC, gate approvals, and SSE event streaming.
- [x] Vite/React 18 frontend with dedicated execution modals for Archival and Vulnerability controls.
- [x] 67-item automated test suite passing cleanly in CI/local pytest.

---

## 11. Incomplete / Broken Work

- **CTL-SAN-001 (Post-Change Sanity) Runtime Gap:** Backend archetype logic exists, but API `/interactive/preview` and `/execute_step` return hardcoded mock responses for Archetype B. Real HTTP endpoint probing against `bank_api` is not wired up.
- **CTL-PRIV-001 (Privileged Access) Runtime Gap:** Defined in YAML and tested via evals, but lacks a dedicated interactive studio modal; falls back to generic mock cards in `ControlExecutionModal`.
- **Temporal Disconnection:** `SupervisorWorkflow` is a stub; API executes workflows directly in-process rather than dispatching to Temporal task queues.
- **Ledger In-Memory Volatility:** `Ledger` is an in-memory Python structure; audit logs are lost when the FastAPI process terminates.
- **ToolGateway OPA Integration:** `ToolGateway` exists and is tested, but runtime API handlers query SQLite directly rather than mediating calls through the gateway.
- **LLM Output Models Mock Instance Gap:** Contracts in `contracts/models.py` lack `mock_instance()` classmethods, causing `core/llm.py` to fall through to completion retries when `LITELLM_MOCK=1`.

---

## 12. Not Yet Implemented

- Persistent PostgreSQL evidence ledger and control metadata store.
- Real HTTP probing connector for live service sanity testing (`CTL-SAN-001`).
- Dedicated execution modal or dynamic schema-driven view for Privileged Access Review (`CTL-PRIV-001`).
- Live external vulnerability feeds (live NVD API 2.0 incremental sync, CISA KEV fetch, FIRST EPSS CSV ingest).
- Multi-dialect SQL generators for Snowflake, BigQuery, and SQL Server.
- Downloadable cryptographically signed PDF/ZIP audit dossiers.
- Temporal cluster client integration in FastAPI for distributed background task execution.

---

## 13. Immediate Next Steps

1. **Verify Runtime Stability:** Keep all 67 pytest tests green and ensure frontend build remains clean.
2. **Standardize Archetype Dispatching:** Ensure all controls follow the unified `WorkflowDispatcher` pattern established by `CTL-VULN-001`.
3. **Connect Privileged Access (`CTL-PRIV-001`) to Real SQLite Data:** Query `database_users` and `public_grants` in `bank_core.db` instead of returning mock records in `interactive.py`.
4. **Implement Persistent Audit Ledger Storage:** Persist ledger blocks to SQLite or append-only disk files so audit trails survive process restarts.
5. **Add `mock_instance()` to Pydantic Contracts:** Allow `LITELLM_MOCK=1` to reliably return mocked contract instances without network timeouts during offline development.
