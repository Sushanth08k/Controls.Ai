# End-to-End System Execution & Technical Reference Guide

This document is a technical reference guide detailing how each component, workflow, and lifecycle step executes end-to-end across the platform. It provides the exact file paths, API endpoints, execution handlers, database mutations, and input/output payloads for each stage of operation.

---

## Table of Contents

1. [System Overview & Execution Flow](#1-system-overview--execution-flow)
2. [Data Model & Relational Schemas](#2-data-model--relational-schemas)
3. [Archetype D: 6-Step Archival Lifecycle (Deep Dive)](#3-archetype-d-6-step-archival-lifecycle-deep-dive)
   - [Step 1: Evaluation, Policy Parsing & Selection Dry Run](#step-1-evaluation-policy-parsing--selection-dry-run)
   - [Step 2: Archival Execution (INSERT Destination Copy)](#step-2-archival-execution-insert-destination-copy)
   - [Step 3: Cryptographic Dual-Root Merkle Verification](#step-3-cryptographic-dual-root-merkle-verification)
   - [Step 4: Maker-Checker Dual-Authorization Gate](#step-4-maker-checker-dual-authorization-gate)
   - [Step 5: Controlled Source Cleanup (DELETE)](#step-5-controlled-source-cleanup-delete)
   - [Step 6: Final Verification & Ledger Sealing](#step-6-final-verification--ledger-sealing)
4. [Session Resumption & State Rehydration](#4-session-resumption--state-rehydration)
5. [Archetype A: Vulnerability Remediation SLA Review](#5-archetype-a-vulnerability-remediation-sla-review)
6. [Archetype B & C Workflows](#6-archetype-b--c-workflows)
7. [Cryptographic Primitives Implementation](#7-cryptographic-primitives-implementation)
   - [Canonical Row Hashing Specification](#canonical-row-hashing-specification)
   - [Binary Merkle Tree Generation](#binary-merkle-tree-generation)
   - [Hash-Chained Append-Only Ledger](#hash-chained-append-only-ledger)
8. [File & Endpoint Reference Matrix](#8-file--endpoint-reference-matrix)

---

## 1. System Overview & Execution Flow

The platform coordinates five operational tiers during control execution:

```
[1. User Interface (React / Vite)]
       │  HTTP REST / SSE Events
       ▼
[2. API Layer (FastAPI Routers)]
       │  Pydantic Schemas / RBAC
       ▼
[3. Intelligence & Extraction Tier]
       │  policy_parser.py / document_extractor.py / agents/
       ▼
[4. Relational Database Engine]
       │  bank_core.db (Source) & bank_archive.db (Archive)
       ▼
[5. Cryptographic Ledger & Audit Store]
       core/ledger.py & sim/audit_store.py
```

---

## 2. Data Model & Relational Schemas

### 2.1 Production Core Database: `bank_core.db`
Located at `sim/bank_core.db`, initialized via `sim/database.py:init_real_databases()`.

#### Primary Table: `source_transactions`
Contains 54 canonical banking transaction records:
- **33 Eligible Records:** `transaction_date < DATE('now', '-5 years')`, `legal_hold = 0`, `investigation_status != 'ACTIVE'`.
- **3 Legal Hold Exclusions:** Flagged with `legal_hold = 1` or active investigation (`investigation_status = 'ACTIVE'`).
- **18 Recent Active Records:** `transaction_date` within the last 5 years (2024–2026), retained for operational banking.

| Column | Type | Description |
| :--- | :--- | :--- |
| `transaction_id` | `VARCHAR(64)` PRIMARY KEY | Unique transaction identifier (e.g. `TXN-171786`) |
| `account_id` | `VARCHAR(64)` REFERENCES `accounts` | Customer account identifier (e.g. `ACC-001001`) |
| `customer_name` | `VARCHAR(128)` | Organization or customer entity name |
| `transaction_date` | `DATE` | ISO settlement date (e.g. `2018-02-10`) |
| `amount` | `NUMERIC(18,2)` | Monetary value in USD |
| `transaction_type` | `VARCHAR(32)` | Channel type (`WIRE`, `ACH`, `CHECK`) |
| `legal_hold` | `INTEGER` | `1` if legally frozen, `0` if standard lifecycle |
| `support_ticket_id` | `VARCHAR(64)` | Associated dispute ticket (e.g. `TKT-2020-8841`) |
| `investigation_status` | `VARCHAR(32)` | Status flag (`NONE`, `ACTIVE`, `RESOLVED`) |
| `document_ref` | `VARCHAR(64)` | Regulatory citation ref (e.g. `DOC-KYC-7712`) |
| `status` | `VARCHAR(32)` | Record state (`ACTIVE`, `PURGED_FROM_SOURCE`) |

### 2.2 Archive Database: `bank_archive.db`
Located at `sim/bank_archive.db`.

#### Table: `archive_transactions`
Mirrors all `source_transactions` columns with additional audit metadata:
- `control_run_id`: Links records to the specific execution run (e.g. `RUN-4d237e46`).
- `verification_hash`: SHA-256 leaf digest calculated during migration.
- `archived_at`: UTC ISO timestamp of archival insertion.

### 2.3 Persistent Audit Store: `sim/audit_store.py`
Integrated into SQLite, storing compliance state across server restarts:
- `control_audit_runs`: Master run metadata, timestamps, evaluated row counts, and Merkle roots.
- `control_audit_steps`: Step-by-step audit records (`PREVIEW`, `COPY_TO_ARCHIVE`, `MERKLE_VERIFY`, `HUMAN_APPROVAL`, `SOURCE_PURGE`, `FINAL_VERIFICATION`).
- `control_evidence`: Cryptographic evidence payloads (`merkle_attestation`, `final_signoff`).
- `control_approvals`: Dual-authorization maker-checker records.
- `compliance_policy_documents`: Ingested policy files, text bodies, file hashes, and Cloudinary URLs.

---

## 3. Archetype D: 6-Step Archival Lifecycle (Deep Dive)

### Step 1: Evaluation, Policy Parsing & Selection Dry Run

#### Purpose
Ingests the policy text, extracts the retention period and exemption criteria, generates compliant SQL scripts, and queries `bank_core.db` in read-only mode to calculate eligible records.

#### Source Code Paths
- **Frontend Trigger:** `web/src/features/library/ControlExecutionModal.tsx` (`handleFileUpload`, `handleAnalyzePolicy`, `handleProceedToDbConnect`)
- **Document Text Extractor:** `core/document_extractor.py:extract_document_content()`
- **Compliance Policy Parser:** `core/policy_parser.py:parse_policy_specification()`
- **Backend Endpoints:**
  - `POST /interactive/upload_policy` in `api/routers/interactive.py`
  - `POST /interactive/preview` in `api/routers/interactive.py`
- **Database Query:** `sim/database.py:query_eligible_archival_records()`

#### Execution Flow
1. User uploads a file or inputs text. `core/document_extractor.py` extracts raw text from PDF, DOCX, TXT, or MD formats.
2. `core/policy_parser.py` evaluates regular expressions and semantic rules to extract:
   - Retention threshold: 5 years (1,825 days).
   - Exceptions: `legal_hold = 1`, `investigation_status = 'ACTIVE'`.
3. `api/routers/interactive.py:build_generated_sql_scripts()` generates three queries:
   - **Selection SQL (`SELECT`):** Identifies records matching the retention period while excluding holds.
   - **Archival SQL (`INSERT`):** Prepares destination migration query into `archive_transactions`.
   - **Cleanup SQL (`DELETE`):** Scoped removal query for post-verification purge.
4. `sim/database.py` executes the Selection SQL against `bank_core.db`.
5. The backend stores run state in `_INTERACTIVE_SESSIONS[run_id]` and saves audit step `step-{run_id}-1` (`PREVIEW`).

#### API Request Body (`POST /interactive/preview`)
```json
{
  "control_id": "CTL-ARCH-001",
  "approved_rules": {
    "retention_years": 5,
    "rules": [
      {
        "rule_id": "RULE-001",
        "description": "Transactions older than 5 years must be archived",
        "field": "transaction_date",
        "operator": "OLDER_THAN",
        "value": "5 years",
        "action": "ARCHIVE"
      }
    ],
    "exceptions": [
      {
        "exception_id": "EXC-001",
        "title": "Pending Legal Hold Exclusion",
        "field": "legal_hold",
        "operator": "EQUALS",
        "value": "true",
        "action": "EXCLUDE"
      }
    ]
  },
  "run_id": "RUN-4d237e46"
}
```

#### API Response Body
```json
{
  "control_id": "CTL-ARCH-001",
  "connected_databases": {
    "source": { "instance": "DEFAULT COMPLIANCE DB (SQLITE)", "status": "connected" },
    "target": { "instance": "APPROVED ARCHIVE DATABASE (SQLITE)", "status": "connected" }
  },
  "total_source_records": 54,
  "eligible_records_count": 33,
  "excluded_holds_count": 3,
  "archived_count": 0,
  "verified_count": 0,
  "source_cleaned_count": 0,
  "sample_records": [
    {
      "transaction_id": "TXN-171786",
      "customer_name": "Orion BioTech",
      "transaction_date": "2020-03-28",
      "amount": "$15,427.95",
      "legal_hold": false,
      "eligible": true,
      "status": "ELIGIBLE",
      "row_hash": "a4f81c9e..."
    }
  ],
  "generated_sql": {
    "selection_sql": "SELECT transaction_id, account_id, customer_name, transaction_date, amount, transaction_type, legal_hold, support_ticket_id, investigation_status, document_ref FROM source_transactions WHERE transaction_date < DATE('now', '-5 years') AND legal_hold = 0;",
    "archival_sql": "INSERT OR REPLACE INTO archive_transactions (transaction_id, account_id, customer_name, transaction_date, amount, transaction_type, legal_hold, support_ticket_id, investigation_status, document_ref, status, control_run_id, verification_hash, archived_at) SELECT transaction_id, account_id, customer_name, transaction_date, amount, transaction_type, legal_hold, support_ticket_id, investigation_status, document_ref, 'ARCHIVED', 'RUN-4d237e46', 'SHA256-' || substr(hex(randomblob(16)), 1, 16), datetime('now') FROM source_transactions WHERE transaction_date < DATE('now', '-5 years') AND legal_hold = 0;",
    "cleanup_sql": "DELETE FROM source_transactions WHERE transaction_id IN (SELECT transaction_id FROM archive_transactions WHERE control_run_id = 'RUN-4d237e46');"
  }
}
```

---

### Step 2: Archival Execution (INSERT Destination Copy)

#### Purpose
Executes the archival SQL migration, copying all 33 eligible records into `bank_archive.db` without altering `bank_core.db`.

#### Source Code Paths
- **Frontend Action:** `web/src/features/library/ControlExecutionModal.tsx:handleExecuteArchival()`
- **Backend Endpoint:** `POST /interactive/execute_archival` in `api/routers/interactive.py`
- **Database Function:** `sim/database.py:execute_real_archive_copy()`
- **Persistence:** Saves audit step `step-{run_id}-2` (`COPY_TO_ARCHIVE`) and updates `control_audit_runs` status to `ARCHIVED`.

#### Execution Flow
1. The server reads eligible IDs from `_INTERACTIVE_SESSIONS[run_id]["eligible_ids"]`.
2. Connects to `sim/bank_core.db` and extracts the 33 candidate rows.
3. Connects to `sim/bank_archive.db` and performs an `INSERT OR REPLACE INTO archive_transactions`.
4. Calculates canonical row hashes for each copied row and builds initial Merkle roots.
5. Issues an attestation token:
   $$\text{token\_seed} = \text{run\_id} \,\|\, \text{source\_merkle\_root} \,\|\, \text{timestamp}$$
   $$\text{attestation\_token} = \text{"ATTEST-" + run\_id + "-" + SHA256(token\_seed)[:16]}$$

#### API Response Body (`POST /interactive/execute_archival`)
```json
{
  "status": "archived",
  "run_id": "RUN-4d237e46",
  "copied_count": 33,
  "total_archive_records": 33,
  "source_merkle_root": "04bdf006d36bde7218b9a05457d9e7a8573dc16a850db483e71adb216509efaf",
  "archive_merkle_root": "04bdf006d36bde7218b9a05457d9e7a8573dc16a850db483e71adb216509efaf",
  "merkle_roots_match": true,
  "attestation_token": "ATTEST-RUN-4d237e46-017fd7e1308396c4"
}
```

---

### Step 3: Cryptographic Dual-Root Merkle Verification

#### Purpose
Verifies that destination records match source records with zero data loss or mutation before granting approval for source cleanup.

#### Source Code Paths
- **Hashing Spec:** `core/hashing.py:compute_row_hash()`
- **Merkle Engine:** `core/merkle.py:build_merkle_root()`
- **Break Detection:** `core/merkle.py:bisect_breaks()`
- **Evidence Storage:** `sim/audit_store.py:save_audit_evidence()` (Type: `merkle_attestation`)

#### Execution Flow
1. Reads all eligible source rows and archived destination rows.
2. Canonicalizes each column into typed atoms:
   - `NULL` $\to$ `"N"`
   - Value $\to$ `"V" + byte_len + ":" + string_value`
3. Generates primary-key-bound leaf hashes:
   $$\text{leaf\_hash} = \text{SHA256}(0\text{x}00 \,\|\, \text{len}(PK) \,\|\, PK \,\|\, \text{row\_hash})$$
4. Sorts leaves strictly by Primary Key string.
5. Builds intermediate parent nodes:
   $$\text{parent} = \text{SHA256}(0\text{x}01 \,\|\, \text{left\_child} \,\|\, \text{right\_child})$$
6. Compares roots:
   $$\text{source\_merkle\_root} == \text{archive\_merkle\_root}$$
7. Saves audit evidence bundle `EV-MERKLE-{run_id}` into `control_evidence`.

---

### Step 4: Maker-Checker Dual-Authorization Gate

#### Purpose
Enforces segregation of duties in compliance with SOX Section 404. Destructive deletion cannot execute autonomously; an independent reviewer must authorize the action.

#### Source Code Paths
- **Frontend Action:** `web/src/features/library/ControlExecutionModal.tsx:handleApproveGate()`
- **Backend Endpoint:** `POST /interactive/approve_gate` in `api/routers/interactive.py`
- **Gate Persistence:** Stored in `control_approvals` via `sim/audit_store.py:save_audit_approval()`

#### Execution Flow
1. Reviewer (`sec_reviewer_1`) inspects record counts (33 eligible, 3 holds, 18 retained), Merkle roots, and dry-run queries.
2. Reviewer submits authorization with digital comments.
3. Generates an approval certificate: `APPR-GATE-XXXXXXXX`.
4. Saves audit step `step-{run_id}-4` (`HUMAN_APPROVAL`).
5. Updates run status to `APPROVED`, unlocking Step 5.

#### API Request Body (`POST /interactive/approve_gate`)
```json
{
  "control_id": "CTL-ARCH-001",
  "run_id": "RUN-4d237e46",
  "attestation_token": "ATTEST-RUN-4d237e46-017fd7e1308396c4",
  "comment": "Compliance review completed. 33 eligible records verified with SHA-256 Merkle match.",
  "reviewer_id": "sec_reviewer_1"
}
```

#### API Response Body
```json
{
  "status": "approved",
  "gate_id": "GATE-RUN-4d237e46",
  "approval_certificate": "APPR-GATE-497E94DB",
  "approved_by": "sec_reviewer_1",
  "approved_at": "2026-10-04T23:58:12.185Z",
  "comment": "Compliance review completed. 33 eligible records verified with SHA-256 Merkle match."
}
```

---

### Step 5: Controlled Source Cleanup (DELETE)

#### Purpose
Executes the physical purge from `bank_core.db.source_transactions` strictly for verified archived records.

#### Source Code Paths
- **Frontend Action:** `web/src/features/library/ControlExecutionModal.tsx:handleCommitCleanup()`
- **Backend Endpoint:** `POST /interactive/cleanup` in `api/routers/interactive.py`
- **Database Function:** `sim/database.py:execute_real_source_purge()`
- **Persistence:** Saves audit step `step-{run_id}-5` (`SOURCE_PURGE`) in `sim/audit_store.py`.

#### Execution Flow
1. Re-verifies that `run.status == 'approved'` and confirms the attestation token.
2. Re-checks legal holds to prevent race conditions:
   ```sql
   DELETE FROM source_transactions
   WHERE transaction_id IN (
       SELECT transaction_id FROM archive_transactions WHERE control_run_id = ?
   )
   AND legal_hold = 0;
   ```
3. Purges exactly 33 records from `source_transactions`.
4. Confirms that 21 records remain in source (18 recent + 3 legal holds).

#### API Response Body (`POST /interactive/cleanup`)
```json
{
  "status": "completed",
  "run_id": "RUN-4d237e46",
  "deleted_count": 33,
  "remaining_core_count": 21,
  "certificate_id": "AUD-CERT-C384ACAC4DA8",
  "ledger_seq": 2,
  "ledger_entry_hash": "e300a5ef9008b2f32d94527b94318acb77d1e44b8d7dff4f7242372641e8a1ab",
  "summary": "Source cleanup executed! 33 verified records deleted from source_transactions. 21 recent records safely retained in source."
}
```

---

### Step 6: Final Verification & Ledger Sealing

#### Purpose
Reconciles post-purge database states, commits a permanent entry to the SHA-256 hash-chained ledger, issues the official compliance certificate, and transitions the control run to read-only `COMPLETED` state.

#### Source Code Paths
- **Frontend Trigger:** `web/src/features/library/ControlExecutionModal.tsx:handleFinalVerification()`
- **Backend Execution:** `api/routers/interactive.py:perform_archival_cleanup()`
- **Ledger Engine:** `core/ledger.py:Ledger.append()`
- **Audit Store:** `sim/audit_store.py:upsert_audit_run()`

#### Execution Flow
1. Creates final ledger payload:
   ```python
   payload = {
       "action": "completed",
       "attestation_token": token,
       "operator_id": "sec_reviewer_1",
       "certificate_id": "AUD-CERT-C384ACAC4DA8",
       "deleted_count": 33
   }
   ```
2. Appends entry to `_SHARED_LEDGER`:
   $$\text{entry\_hash} = \text{SHA256}(\text{prev\_hash} \,\|\, \text{payload\_sha256} \,\|\, \text{timestamp} \,\|\, \text{actor})$$
3. Saves audit step `step-{run_id}-6` (`FINAL_VERIFICATION`) with certificate ID and ledger sequence number.
4. Saves evidence package `EV-SIGNOFF-{run_id}` into `control_evidence`.
5. Updates master run state in `control_audit_runs`:
   - `status = "completed"`
   - `records_evaluated = 54`
   - `records_eligible = 33`
   - `records_affected = 33`
6. Broadcasts an SSE event (`sse_broker.publish("run.updated", ...)`) to update dashboard telemetry cards.

---

## 4. Session Resumption & State Rehydration

When reopening a completed or in-progress run from the **Control Runs** explorer (`web/src/features/runs/RunsPage.tsx`), the application rehydrates full state without data loss.

### Flow
```
[User clicks Run row] 
  ──► GET /interactive/resume/{run_id}
  ──► GET /runs/{run_id}/audit
  ──► Rehydrate React State: counts, stage, certificate, ledger hashes
```

### Resume Response Structure (`GET /interactive/resume/{run_id}`)
```json
{
  "run_id": "RUN-4d237e46",
  "control_id": "CTL-ARCH-001",
  "archetype": "D",
  "stage": "COMPLETED",
  "status": "completed",
  "certificate_id": "AUD-CERT-C384ACAC4DA8",
  "ledger_seq": 2,
  "ledger_entry_hash": "e300a5ef9008b2f32d94527b94318acb77d1e44b8d7dff4f7242372641e8a1ab",
  "steps": [
    { "step_name": "PREVIEW", "status": "completed" },
    { "step_name": "COPY_TO_ARCHIVE", "status": "completed" },
    { "step_name": "MERKLE_VERIFY", "status": "completed" },
    { "step_name": "HUMAN_APPROVAL", "status": "completed" },
    { "step_name": "SOURCE_PURGE", "status": "completed" },
    { "step_name": "FINAL_VERIFICATION", "status": "completed" }
  ]
}
```

---

## 5. Archetype A: Vulnerability Remediation SLA Review

Control: `CTL-VULN-001` (Database Vulnerability & Security Configuration Review).

### Execution Flow
1. **Target Evaluation:** Scans `database_users` and `system_config` tables in `bank_core.db`.
2. **Rule Evaluation:**
   - Evaluates CVE patch ages against policy SLAs (Critical: 15 days, High: 30 days, Medium: 60 days).
   - Identifies non-compliant configurations (e.g. unencrypted connections, superusers without MFA).
3. **Challenger Agent Review:** `agents/challenger.py` tests whether compensating controls (e.g. network firewalls or isolated VPCs) negate the finding.
4. **Findings Generation:** Registers findings in `control_findings` with severity, CVSS scores, and remediation recommendations.
5. **Workpaper Creation:** `agents/reporter.py` drafts an audit workpaper citing specific database row IDs.

---

## 6. Archetype B & C Workflows

### Archetype B: Release Sanity & API Regression (`CTL-SAN-001`)
- Compares OpenAPI specs using `oasdiff` schema models.
- `agents/impact_analyst.py` reviews release notes and dependency graphs to identify downstream endpoints requiring regression execution.
- Evaluates p95 and EWMA latency thresholds; triggers deployment gates upon detected regressions.

### Archetype C: Privileged Access Review (`CTL-PRIV-001`)
- Reviews active superusers, inactive admin accounts (> 90 days), and segregation of duties (SoD) conflicts.
- Issues automated revocation tickets and logs ledger audit proofs.

---

## 7. Cryptographic Primitives Implementation

### Canonical Row Hashing Specification
Implemented in `core/hashing.py:compute_row_hash()`:

```python
def normalize_value(val: Any, val_type: str = "text") -> str | None:
    if val is None:
        return None
    # Timestamps are forced to UTC ISO-8601 strings
    if val_type == "timestamptz":
        return val.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    # Numerics use exact decimal string representation
    if val_type in ("numeric", "decimal"):
        return str(Decimal(str(val)))
    return str(val)

def column_atom(val: Any, val_type: str = "text") -> str:
    norm = normalize_value(val, val_type)
    if norm is None:
        return "N"
    byte_len = len(norm.encode("utf-8"))
    return f"V{byte_len}:{norm}"
```

### Binary Merkle Tree Generation
Implemented in `core/merkle.py:build_merkle_root()`:

```python
def build_merkle_root(items: list[tuple[str, str]]) -> str:
    if not items:
        return "0" * 64
    # Strict sort by primary key
    sorted_items = sorted(items, key=lambda x: str(x[0]))
    current_level = [compute_leaf_hash(pk, r_hash) for pk, r_hash in sorted_items]

    while len(current_level) > 1:
        next_level = []
        i = 0
        while i < len(current_level):
            if i + 1 < len(current_level):
                parent = compute_node_hash(current_level[i], current_level[i + 1])
                next_level.append(parent)
                i += 2
            else:
                # Odd node is promoted directly
                next_level.append(current_level[i])
                i += 1
        current_level = next_level

    return current_level[0].hex()
```

### Hash-Chained Append-Only Ledger
Implemented in `core/ledger.py`:

```python
def compute_entry_hash(prev_hash: str, payload_sha256: str, ts_iso: str, actor: str) -> str:
    raw = f"{prev_hash}{payload_sha256}{ts_iso}{actor}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()
```

---

## 8. File & Endpoint Reference Matrix

| Component | File Path | Key Functions / Endpoints | Output / Responsibility |
| :--- | :--- | :--- | :--- |
| **API Entry** | `api/main.py` | FastAPI App, CORS, Exception Handlers | Initializes application and route mounting |
| **Interactive Router** | `api/routers/interactive.py` | `/preview`, `/execute_archival`, `/cleanup`, `/resume/{id}` | Coordinates the 6-step interactive execution lifecycle |
| **Runs Router** | `api/routers/runs.py` | `GET /runs`, `GET /{id}/audit`, `GET /{id}/steps` | Returns execution history, telemetry, and evidence bundles |
| **Policy Parser** | `core/policy_parser.py` | `parse_policy_specification()` | Extracts rules, retention thresholds, and exceptions |
| **Document Extractor** | `core/document_extractor.py` | `extract_document_content()` | Extracts text from PDF, DOCX, TXT, and Markdown files |
| **Hashing Engine** | `core/hashing.py` | `compute_row_hash()`, `column_atom()` | Generates deterministic, canonical SHA-256 row atoms |
| **Merkle Engine** | `core/merkle.py` | `build_merkle_root()`, `bisect_breaks()` | Constructs binary Merkle trees and isolates break locations |
| **Ledger Engine** | `core/ledger.py` | `Ledger.append()`, `Ledger.verify_chain()` | Appends immutable blocks and verifies chain integrity |
| **Database Sim** | `sim/database.py` | `execute_real_archive_copy()`, `execute_real_source_purge()` | Executes SQLite operations on active and archive databases |
| **Audit Store** | `sim/audit_store.py` | `upsert_audit_run()`, `save_audit_step()`, `get_full_audit_bundle()` | SQLite persistence for compliance evidence and approvals |
| **Web Console Modal** | `web/src/features/library/ControlExecutionModal.tsx` | `handleAnalyzePolicy()`, `handleFinalVerification()` | 6-step wizard and live row reconciliation modal |
| **Web Console Runs** | `web/src/features/runs/RunsPage.tsx` | Runs table, expand row, resume modal trigger | Displays historical runs, stages, and sealed audit packages |
