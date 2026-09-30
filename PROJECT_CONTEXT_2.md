# PROJECT_CONTEXT.md — Agentic Control Automation Platform (v2)

> **Purpose of this file.** This is the single source of truth for building this project, written for humans and AI coding agents. Read it fully before writing any code. When a decision here conflicts with a default habit, **this file wins**. If something is ambiguous, stop and ask rather than guess.
>
> **v2 change:** we are building a **platform** that automates *any* control from a declarative definition. We are not building bespoke agents per control. The three assigned controls are **pilots** implemented as control-definition files on top of generic archetype workflows and generic agents.

---

## 0. TL;DR

A bank has ~27,000 controls, and building one agent team per control does not scale. Instead:

- **5 archetype workflows** (generic, deterministic, Temporal) cover how most automatable controls work.
- **~8 generic agents** (LangGraph, parameterized by task templates) do the reasoning. Each is validated **once**.
- **Control definitions** (YAML, schema-validated, versioned, approved) say *what* each control checks. Adding a control = adding a YAML file (plus, occasionally, a catalog entry or connector).
- **Shared platform services:** tool gateway (MCP + OPA + OpenBao), hash-chained evidence ledger, human-in-the-loop (HITL) approvals, observability.
- Everything runs **locally on an NVIDIA DGX Spark**, using **free/open-source software and open-weights models only**.

### Pilots (assigned) + proof of scale

| Control ID | Name | Archetype | Evidence |
|---|---|---|---|
| CTL-ARCH-001 | Data Archival Compliance | **D. Execute-and-verify** (uses **C. Reconcile** + **E. Doc review** internally) | Manifest, Merkle roots, signed attestation, deletion reconciliation |
| CTL-SAN-001 | Post-change Sanity Testing | **B. Test execution** | Per-endpoint verdicts, redacted request/response hashes |
| CTL-VULN-001 | Vulnerability Management Review | **A. Evidence query + rule check** | **Database query results** as hashed, fingerprinted evidence records |
| CTL-PRIV-001 | Privileged DB Users Monthly Review (**no-code demo**) | **A** | Query results. Implemented with **zero new Python**, only YAML + catalog entries |

**Core principle: "Deterministic spine, agentic leaves."**
LLM agents *interpret, plan, evaluate, challenge, and write*. They **never** execute raw SQL, never hold credentials, and never decide to delete. All side effects go through deterministic workflows and a permission-checked tool gateway.

**Scaling principle:** effort grows as $O(k \cdot a) + O(n \cdot d)$ — $k$ archetypes × $a$ agents built and validated once, plus a small definition cost $d$ per control — **not** as $O(n \cdot a)$.

---

## 1. Hard constraints (non-negotiable)

1. **Free tier only.** Self-hosted open-source software and open-weights models only. No paid APIs, SaaS, or cloud accounts. The only outbound network allowed is to the free public feeds NVD API 2.0, CISA KEV, and FIRST EPSS, plus optional RFC 3161 / OpenTimestamps (sending a hash only).
2. **Local inference only.** No prompt or data leaves the DGX Spark.
3. **arm64.** DGX Spark = GB10 Grace Blackwell, 20 Arm cores, 128 GB unified LPDDR5x, DGX OS (Ubuntu 24.04). Every image and wheel must support `linux/arm64`.
4. **No real bank data.** Development uses the synthetic bank (Section 14).
5. **No LLM-generated SQL, shell, URL, or file path is ever executed.** Operations come only from versioned catalogs with whitelisted identifiers and bound parameters.
6. **No destructive action without a valid, signed verifier attestation** (enforced by OPA *and* by OpenBao credential issuance).
7. **Every side effect is logged to the evidence ledger** before the workflow advances.
8. **Humans approve high-risk steps** (Section 12).
9. **Temporal workflow code is deterministic.** All I/O, randomness, and clock reads live in activities.
10. **Controls are data, not code.** No control-specific Python in `workflows/` or `agents/`. If a control can't be expressed as a definition, extend an archetype or the rule/connector library generically. Never special-case a `control_id` in code. CI enforces this with a grep test for `CTL-` in `workflows/`, `agents/`, and `core/`.
11. **Forbidden dependencies:** MinIO (archived/maintenance mode), HashiCorp Vault (BSL), LangSmith / LangGraph Platform, Temporal Cloud, anything under BSL/SSPL/non-commercial terms. A CI license gate fails the build on these.

---

## 2. Technology stack

| Layer | Choice | License | Notes |
|---|---|---|---|
| Language | Python 3.12, `uv` (lockfile committed) | — | `mypy --strict` on `contracts/`, `core/`, `tools/`, `workflows/` |
| LLM serving | **Ollama** (early phases) → **vLLM** (concurrency, Phase 8+) | MIT / Apache-2.0 | Both OpenAI-compatible. Switching engines = model change → re-run evals |
| LLM gateway | **LiteLLM proxy (OSS)** | MIT | Role names → models; per-role token budgets |
| Models | `gpt-oss:120b` (reasoner), `qwen3:30b` A3B MoE (fast + critic), `bge-m3` (embed) | Apache-2.0 / Apache-2.0 / MIT | Verify Ollama tags at setup; record file hashes in model cards |
| Structured output | **Pydantic v2** → JSON Schema → constrained decoding (Ollama `format`, vLLM guided decoding) | MIT | |
| Agent graphs | **LangGraph** (library only) | MIT | Bounded graphs |
| Workflow engine | **Temporal** self-hosted, Python SDK. Dev: `temporal server start-dev`. Later: Postgres persistence | MIT | Durable execution, signals, schedules, replay |
| Tool protocol | **MCP** via **FastMCP** | MIT | One server per connector family |
| Authorization | **OPA** (Rego) | Apache-2.0 | Tool authz + optional control rules escape hatch |
| Secrets / JIT creds / signing | **OpenBao** (Vault-compatible, Linux Foundation): database secrets engine + transit (Ed25519) | MPL-2.0 | |
| Databases | **PostgreSQL 16**: `core_banking_sim`, `archive`, `control_meta` (+ **pgvector**), `vuln_target` | PostgreSQL | Separate instances |
| SQL | `psycopg` v3 (incl. COPY), **SQLAlchemy Core** (no ORM for control SQL) | LGPL / MIT | |
| Object storage (checkpoints) | **RustFS** or **SeaweedFS**. Verify Object Lock on the pinned version; fall back to an append-only volume | Apache-2.0 | |
| Document parsing | **Docling** | MIT | Page + character offsets for citations |
| API testing | **Schemathesis**, pytest, httpx, **oasdiff**, **Locust** | MIT / MIT / BSD / Apache-2.0 / MIT | |
| Vuln intel | NVD API 2.0 (free key, 50 requests/30 s), CISA KEV, FIRST EPSS — cached locally | public | |
| Observability | OpenTelemetry, **Arize Phoenix**, Prometheus + Grafana OSS | Apache-2.0 / ELv2 / Apache-2.0 / AGPL | trace id = `run_id` |
| **Frontend** | **React 18 + TypeScript + Vite** — one operator console (Section 23) | MIT | Not Streamlit. The console is the product surface for control owners, reviewers and engineers |
| Frontend libraries | TanStack Query (server state), React Router 6, Tailwind CSS, shadcn/ui + Radix primitives, lucide-react, Recharts, react-hook-form + Zod, TanStack Table, Monaco (YAML editing), `diff` | MIT | All MIT; vendored locally, no CDN at runtime |
| **BFF / API** | **FastAPI** (`api/`) — the only origin the browser talks to | MIT | Auth, RBAC, Temporal client, ledger reads, definition CRUD, SSE |
| Realtime | **SSE** (`text/event-stream`) from FastAPI | MIT | Run progress + gate notifications; no WebSocket needed |
| API typing | OpenAPI → `openapi-typescript` → generated TS types | MIT | Contracts (Section 10) are the single source of truth end to end |
| Webhook / toy API | FastAPI + Uvicorn | MIT / BSD | |
| CI | Forgejo/Gitea Actions or GitHub Actions with a **self-hosted runner on the Spark** | MIT / GPL | |
| Supply chain | Local registry (`registry:2`), `syft`, `pip-licenses`, `import-linter` | Apache-2.0 / MIT / BSD | Mirror all images + models |

---

## 3. Hardware & memory budget (single DGX Spark, 128 GB unified)

Decode speed is memory-bandwidth-bound (~273 GB/s), so use **MoE models with few active parameters**. Keep LLM calls **off per-row hot paths**: the LLM plans once and deterministic code processes the rows.

| Consumer | Approx. memory |
|---|---|
| gpt-oss-120b (MXFP4) | ~65 GB |
| Qwen3-30B-A3B (Q4) | ~19 GB |
| bge-m3 | ~1–2 GB |
| Postgres ×4 + Temporal | ~5–6 GB |
| OpenBao, OPA, object store, LiteLLM, api (BFF), web (static nginx) | ~2 GB |
| Phoenix + Prometheus + Grafana | ~2 GB |
| OS + Docker | ~6–8 GB |
| **KV cache + headroom** | **~18–20 GB** |

Rules:
- Set `mem_limit` on every Compose service.
- Development may use `gpt-oss:20b` as the reasoner; eval runs use 120b.
- Stop Ollama before building or starting vLLM.
- Add a boot check that `nvidia-smi` succeeds, since DGX OS kernel updates can break NVIDIA modules.

**Throughput planning.** A single gpt-oss-120b stream decodes at roughly 35 tok/s. The LLM cost of a control run is ≈ Σ over agent calls of (prefill/r_prefill + output/35) seconds. Design so that a typical archetype-A run makes ≤ 3 LLM calls **per finding** and **zero per evidence row**.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ REACT OPERATOR CONSOLE (browser)   — Section 23                           │
│ Dashboard · Control Library · Run Detail · Approvals · Findings ·         │
│ Evidence Explorer · Onboarding · Agents & Models · Admin                  │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ HTTPS/JSON + SSE  (the ONLY origin the browser talks to)
┌───────────────▼──────────────────────────────────────────────────────────┐
│ BFF API (FastAPI, `api/`)                                                 │
│ session auth + RBAC · Temporal client (start/signal/query) · ledger reads │
│ · definition CRUD + validate + dry-run · SSE event stream                 │
│ The browser never reaches Temporal, OpenBao, OPA, the DBs or the LLMs.    │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────────────────┐
│ CONTROL LIBRARY (git, data not code)                                      │
│ controls/CTL-*.yaml  ·  catalogs/ (queries, tests, rules, predicates)     │
│ each version approved via maker-checker; definition hash in every run     │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ loaded + validated (ControlDefinition)
┌───────────────▼──────────────────────────────────────────────────────────┐
│ SUPERVISOR (Temporal): schedules per control, event triggers (webhook,    │
│ doc upload), scope fan-out, concurrency limits, cross-control rules        │
└───┬──────────────┬──────────────┬──────────────┬──────────────┬──────────┘
    │ A            │ B            │ C            │ D            │ E
┌───▼────────┐ ┌───▼────────┐ ┌───▼────────┐ ┌───▼────────┐ ┌───▼────────┐
│ query_     │ │ test_      │ │ reconcile  │ │ execute_   │ │ doc_review │
│ review_wf  │ │ exec_wf    │ │ _wf        │ │ verify_wf  │ │ _wf        │
└───┬────────┘ └───┬────────┘ └───┬────────┘ └───┬────────┘ └───┬────────┘
    └──────────────┴──────┬───────┴──────────────┴──────────────┘
                          │ activities call
┌─────────────────────────▼────────────────────────────────────────────────┐
│ GENERIC AGENTS (LangGraph; roles via LiteLLM)                             │
│ Interpreter · Planner · ImpactAnalyst · Evaluator · Challenger ·          │
│ Reporter · Onboarder (+ deterministic RuleEngine, not an agent)           │
└─────────────────────────┬────────────────────────────────────────────────┘
                          │ MCP calls only
┌─────────────────────────▼────────────────────────────────────────────────┐
│ TOOL GATEWAY: MCP → OPA allow? → OpenBao JIT cred → parameterized op →    │
│ hash(req/result) → ledger                                                 │
│ CONNECTORS: postgres · http_api · files/docs · change_mgmt · cve_intel ·  │
│             evidence  (future: oracle, mssql, ldap, ticketing, ...)       │
└─────────────────────────┬────────────────────────────────────────────────┘
      target systems (sim bank DBs, bank API, vuln target, CVE cache)
┌──────────────────────────────────────────────────────────────────────────┐
│ SHARED: Evidence Ledger (hash chain) · signed checkpoints (object store / │
│ append-only + RFC3161) · Approvals store · Model & Prompt Registry ·      │
│ Phoenix ·                                                                  │
│ Prometheus/Grafana                                                         │
└──────────────────────────────────────────────────────────────────────────┘
LLMs on Spark: Ollama/vLLM ← LiteLLM (roles: reasoner, fast, critic, embed)
```

### 4.1 Layered build model (build bottom-up)
```
L9  React operator console (browser)  ← Section 23
L8b BFF API (FastAPI): auth, RBAC, Temporal client, SSE
L8  Control library (YAML definitions, catalogs) + Onboarding agent
L7  Evals + observability
L6  Archetype workflows (5, generic)
L5  Generic agents + deterministic rule engine
L4  Workflow spine (Temporal: state, gates, retries, approvals, schedules)
L3  Tool gateway + connector framework (MCP + OPA + OpenBao)
L2  Contracts (Pydantic) + evidence ledger + hashing
L1  Inference + infrastructure
```

### 4.2 Role separation (applies inside every archetype)
| Role | Nature | Rule |
|---|---|---|
| Planner / Interpreter | LLM | Proposes typed plans or IRs; cannot execute |
| Executor | Deterministic connector ops | Only catalogued, parameterized operations |
| RuleEngine | Deterministic | Pass/fail from rules over evidence. **Always runs before any LLM judgment** |
| Evaluator | LLM | Judgment only where rules can't decide (applicability, compensating controls, explanation) |
| Verifier / Challenger | Deterministic checks + LLM of a **different model family** | Receives only artifacts, never other agents' reasoning; cannot turn a deterministic FAIL into a PASS |
| Reporter | LLM | Every claim cites evidence ids; enforced by a post-hook |

### 4.3 LiteLLM role routing
| Role | Model | Used by |
|---|---|---|
| `reasoner` | gpt-oss-120b | Interpreter (A), Planner, Evaluator, Reporter, Onboarder |
| `fast` | qwen3-30b-a3b | Interpreter (B), ImpactAnalyst, test-result classification narrative |
| `critic` | qwen3-30b-a3b (must differ in family from `reasoner`) | Challenger |
| `embed` | bge-m3 | Doc retrieval |

Agent code references **role names only**.

---

## 5. Control archetypes

Each archetype is **one generic Temporal workflow**. A control definition selects an archetype and supplies all parameters.

| ID | Archetype | Pattern | Typical bank controls | Pilot |
|---|---|---|---|---|
| **A** | Evidence query + rule check | Collect evidence via approved queries → rules vs baseline/prior period → evaluate → challenge → workpaper → sign-off | Access/privileged-user reviews, config baselines, patch levels, backup success, password policy, segregation-of-duties conflicts | CTL-VULN-001, CTL-PRIV-001 |
| **B** | Test execution | Trigger → impact analysis → select suite → run → classify → gate | Post-change testing, interface checks, DR tests, batch-job completion | CTL-SAN-001 |
| **C** | Reconciliation | Two sources → canonical keys + hashes → match → classify breaks → explain | GL vs sub-ledger, nostro, record counts across systems, archive vs source | Used inside CTL-ARCH-001 |
| **D** | Execute-and-verify | Policy → plan → act (reversible) → reconcile/verify (C) → attest → commit (irreversible) → reconcile | Archival, retention purge, access revocation, data masking | CTL-ARCH-001 |
| **E** | Document review | Parse docs → dual extraction to a typed IR with citations → validate → completeness/consistency rules → review | Policy review, KYC completeness, vendor due diligence, sign-off checks | Used inside CTL-ARCH-001 (policy → PolicyIR) |

Archetypes compose: **D invokes E (policy interpretation) and C (verification) as child workflows.** Composition is declared in the definition, not coded.

Controls that fit no archetype stay **human-led**. The platform may still assist them via E (evidence gathering + draft workpaper) but does not conclude on them.

---

## 6. Control definitions (the heart of the platform)

### 6.1 `ControlDefinition` schema (Pydantic, `contracts/control_definition.py`)

| Field | Type | Notes |
|---|---|---|
| `control_id` | str (`CTL-[A-Z]+-\d{3,}`) | Unique |
| `version` | semver | New version ⇒ maker-checker approval |
| `title`, `objective` | str | From the RCM |
| `owner_role`, `reviewer_role` | str | For HITL routing |
| `risk_rating` | low \| medium \| high \| critical | Drives gates |
| `frequency` | cron string \| `on_event` | Temporal Schedule or event trigger |
| `trigger_events` | list[str] | e.g. `change.deployed`, `policy.uploaded` |
| `archetype` | A \| B \| C \| D \| E | |
| `scope` | list[TargetRef] | Instances/entities/APIs; the run fans out per target |
| `evidence` | list[EvidenceSpec] | `{id, connector, operation, catalog_ref, params}` |
| `rules` | list[RuleSpec] | Deterministic checks (Section 6.3) |
| `baseline_ref` | str? | Path in `catalogs/baselines/` |
| `agent_tasks` | list[AgentTaskSpec] | `{agent, template_id, template_version, when}`; the only place LLM work is requested |
| `archetype_params` | archetype-specific model | Discriminated union by archetype (Section 7) |
| `composition` | list[{step, archetype, definition_ref}] | For D → E/C |
| `gates` | list[GateSpec] | `{gate, condition, approver_role}` |
| `outputs` | `{workpaper_template, conclusion_scale}` | |
| `severity_policy` | mapping rule-severity → SLA days | |
| `metadata` | dict | RCM refs, regulation refs |

Validation on load (fail closed):
- every `catalog_ref`, `template_id`, connector, `predicate_ref`, and baseline exists;
- every `rule.evidence_ref` matches a declared evidence id;
- the gate roles exist;
- the archetype-param schema matches the archetype;
- no field contains raw SQL outside a catalog;
- the definition hash (`sha256` of canonical JSON) is recorded at run start.

### 6.2 Governance
- Definitions live in git under `controls/`. Changes go through PR review **plus** an in-platform `definition_change` maker-checker approval recorded in the ledger.
- Only **approved** definition versions are schedulable. The Supervisor refuses unapproved hashes.
- Evidence always records `(control_id, version, definition_sha256)`.

### 6.3 Rule engine (deterministic, `core/rules/`)
Rules are declarative primitives evaluated over canonicalized evidence. They are **not** LLM-evaluated.

| Primitive | Semantics |
|---|---|
| `subset_of(field, baseline_key)` | set(rows.field) ⊆ baseline set |
| `disjoint_from(field, baseline_key)` | no overlap |
| `equals(field, value)` / `in(field, values)` | single-row config checks |
| `threshold(field, op, value)` | numeric |
| `row_count(op, n)` | e.g. zero rows expected |
| `no_drift(evidence_ref, key_fields)` | diff vs previous period's canonical result; reports added/removed/changed |
| `version_not_vulnerable(field, product)` | version → CPE → local CVE cache |
| `match_all(source_ref, target_ref, key, hash)` | reconciliation (archetype C) |
| `rego(package)` | **Escape hatch:** an OPA bundle `controls.rules.<name>` evaluated with evidence as input. Use only when primitives are insufficient; requires approval |

Each rule has `id`, `severity`, `on_fail: finding | exception | block`, and an optional `evaluator_task` (asks the Evaluator agent to judge applicability of a failed rule, e.g. a compensating control).

### 6.4 Example definitions (pilots)

These are illustrative. The schema in 6.1 is authoritative.

**CTL-VULN-001 (Archetype A)**
```yaml
control_id: CTL-VULN-001
version: 1.0.0
title: Database Vulnerability Management Review
archetype: A
frequency: "0 2 1 * *"            # monthly
owner_role: db_security_owner
reviewer_role: control_reviewer
risk_rating: high
scope:
  - {type: postgres_instance, ref: vuln_target}
  - {type: postgres_instance, ref: core_banking_sim}
evidence:
  - {id: superusers,   connector: postgres, operation: catalog_query, catalog_ref: VQ-001}
  - {id: public_grants,connector: postgres, operation: catalog_query, catalog_ref: VQ-003}
  - {id: pw_enc,       connector: postgres, operation: catalog_query, catalog_ref: VQ-004}
  - {id: ssl,          connector: postgres, operation: catalog_query, catalog_ref: VQ-005}
  - {id: hba,          connector: postgres, operation: catalog_query, catalog_ref: VQ-007}
  - {id: extensions,   connector: postgres, operation: catalog_query, catalog_ref: VQ-008}
  - {id: version,      connector: postgres, operation: catalog_query, catalog_ref: VQ-009}
rules:
  - {id: R1, primitive: subset_of, evidence_ref: superusers, field: rolname, baseline_key: approved_superusers, severity: high, on_fail: finding}
  - {id: R2, primitive: row_count, evidence_ref: public_grants, op: "==", n: 0, severity: medium, on_fail: finding}
  - {id: R3, primitive: equals, evidence_ref: pw_enc, field: setting, value: scram-sha-256, severity: medium, on_fail: finding}
  - {id: R4, primitive: equals, evidence_ref: ssl, field: setting, value: "on", severity: high, on_fail: finding}
  - {id: R5, primitive: row_count, evidence_ref: hba, op: "==", n: 0, severity: critical, on_fail: finding}
  - {id: R6, primitive: subset_of, evidence_ref: extensions, field: extname, baseline_key: approved_extensions, severity: low, on_fail: finding}
  - {id: R7, primitive: version_not_vulnerable, evidence_ref: version, field: version, product: postgresql, severity: from_cvss, on_fail: finding,
     evaluator_task: {agent: evaluator, template_id: cve_applicability, template_version: 1}}
  - {id: R8, primitive: no_drift, evidence_ref: superusers, key_fields: [rolname], severity: medium, on_fail: finding}
baseline_ref: baselines/postgres_cis_min.yaml
agent_tasks:
  - {agent: challenger, template_id: finding_challenge, template_version: 1, when: per_finding}
  - {agent: reporter,   template_id: review_workpaper,  template_version: 1, when: end}
archetype_params:
  risk_formula: {alpha_kev: 1.0, beta_epss: 1.0}
gates:
  - {gate: finding_signoff, condition: always, approver_role: db_security_owner}
outputs: {workpaper_template: query_review_v1, conclusion_scale: [effective, effective_with_exceptions, ineffective]}
severity_policy: {critical: 7, high: 30, medium: 60, low: 90}
```

**CTL-PRIV-001 (Archetype A, no-code demo)**
```yaml
control_id: CTL-PRIV-001
version: 1.0.0
title: Privileged Database Users Monthly Review
archetype: A
frequency: "0 3 1 * *"
owner_role: db_security_owner
reviewer_role: control_reviewer
risk_rating: high
scope:
  - {type: postgres_instance, ref: core_banking_sim}
  - {type: postgres_instance, ref: archive}
evidence:
  - {id: superusers, connector: postgres, operation: catalog_query, catalog_ref: VQ-001}
  - {id: createrole, connector: postgres, operation: catalog_query, catalog_ref: VQ-011}
  - {id: dormant,    connector: postgres, operation: catalog_query, catalog_ref: VQ-002}
rules:
  - {id: R1, primitive: subset_of, evidence_ref: superusers, field: rolname, baseline_key: approved_superusers, severity: high, on_fail: finding}
  - {id: R2, primitive: subset_of, evidence_ref: createrole, field: rolname, baseline_key: approved_role_admins, severity: medium, on_fail: finding}
  - {id: R3, primitive: row_count, evidence_ref: dormant, op: "==", n: 0, severity: medium, on_fail: finding}
  - {id: R4, primitive: no_drift, evidence_ref: superusers, key_fields: [rolname], severity: medium, on_fail: finding}
baseline_ref: baselines/privileged_access.yaml
agent_tasks:
  - {agent: challenger, template_id: finding_challenge, template_version: 1, when: per_finding}
  - {agent: reporter,   template_id: review_workpaper,  template_version: 1, when: end}
gates:
  - {gate: finding_signoff, condition: always, approver_role: db_security_owner}
outputs: {workpaper_template: query_review_v1, conclusion_scale: [effective, effective_with_exceptions, ineffective]}
severity_policy: {critical: 7, high: 30, medium: 60, low: 90}
```
**Acceptance for the demo:** CTL-PRIV-001 runs end-to-end with a PR that touches only `controls/`, `catalogs/`, and `baselines/`. The CI check `git diff --name-only` must show no changes under `workflows/`, `agents/`, `core/`, or `tools/`.

**CTL-SAN-001 (Archetype B)**
```yaml
control_id: CTL-SAN-001
version: 1.0.0
title: Post-change Sanity Testing
archetype: B
frequency: on_event
trigger_events: [change.deployed]
owner_role: release_owner
reviewer_role: control_reviewer
risk_rating: high
scope:
  - {type: http_service, ref: bank_api}
archetype_params:
  openapi_ref: bank_api/openapi.json
  critical_set_ref: catalogs/critical_endpoints.yaml
  service_graph_ref: catalogs/service_graph.yaml
  journeys: [J-LOGIN-BAL-XFER]
  reruns_on_fail: 3
  latency: {ewma_lambda: 0.2, k_sigma: 3}
  redaction_profile: pii_default
agent_tasks:
  - {agent: impact_analyst, template_id: change_impact, template_version: 1, when: start}
  - {agent: reporter,       template_id: sanity_workpaper, template_version: 1, when: end}
gates:
  - {gate: rollback, condition: "any(regression)", approver_role: release_owner}
outputs: {workpaper_template: test_exec_v1, conclusion_scale: [verified, blocked, verified_with_exceptions]}
```

**CTL-ARCH-001 (Archetype D composed with E and C)**
```yaml
control_id: CTL-ARCH-001
version: 1.0.0
title: Data Archival Compliance
archetype: D
frequency: "0 1 * * 0"            # weekly
trigger_events: [policy.uploaded]
owner_role: data_governance_owner
reviewer_role: control_reviewer
risk_rating: critical
scope:
  - {type: postgres_table, ref: core_banking_sim.public.transactions}
composition:
  - {step: interpret_policy, archetype: E, params_ref: interpret}
  - {step: verify_copy,      archetype: C, params_ref: verify}
archetype_params:
  policy_source: {connector: files, path_glob: "policies/retention/*.pdf"}
  interpret:
    output_contract: PolicyIR
    dual_extraction: {roles: [reasoner, fast]}
    guardrails: {retention_years: {min: 1, max: 10}}
  plan:
    batch_size: 5000
    volume_anomaly_k_sigma: 3
    volume_cap: 5000000
  copy: {mode: copy_protocol_idempotent}
  verify: {method: merkle_full, hash_spec_version: "1"}
  attest: {transit_key: verifier-attest, ttl_minutes: 30}
  commit: {operation: delete_by_manifest, recheck: [row_hash, exclusions]}
agent_tasks:
  - {agent: planner,    template_id: archival_plan_review, template_version: 1, when: after_plan}
  - {agent: challenger, template_id: verification_review,  template_version: 1, when: after_verify}
  - {agent: reporter,   template_id: archival_workpaper,   template_version: 1, when: end}
gates:
  - {gate: policy_version, condition: "new_policy_version or interpreter_disagreement", approver_role: data_governance_owner}
  - {gate: run_plan,       condition: "first_run or volume_anomaly or fk_cycle", approver_role: data_governance_owner}
  - {gate: deletion,       condition: "run_plan_gate_triggered", approver_role: data_governance_owner}
outputs: {workpaper_template: execute_verify_v1, conclusion_scale: [completed, completed_with_exceptions, failed]}
```

---

## 7. Archetype workflows (Temporal)

General rules for all archetypes:
- All I/O (LLM, DB, HTTP, files) happens in **activities**. LLM outputs are recorded in history, so runs are replayable.
- Retry policies:
  - transient I/O: exponential backoff, max 5;
  - LLM schema-validation failure: re-prompt with the validation error, max 2;
  - OPA deny and attestation failure: **non-retryable**.
- Long activities **heartbeat** checkpoints (e.g. `last_pk`, batch number, test index) and resume from them.
- HITL gates are **signals** with a timeout (default 72 h). On timeout the run goes to `EXPIRED` and nothing destructive happens.
- Idempotency key on every write: `(run_id, step, unit_no)`.
- Every state transition appends a ledger entry.
- **Scope fan-out:** one child workflow per scope target, bounded by `max_parallel` (default 4). Results are aggregated into the parent workpaper.
- Workflow ids: `{control_id}:{version}:{scope_ref}:{period_or_event_id}`. This makes duplicate triggers idempotent.

### 7.A `query_review_wf` (Archetype A)
```
LOAD_DEFINITION (validate + record hash)
→ for each target (fan-out):
    COLLECT  (each EvidenceSpec → connector op → EvidenceRecord)
    RULES    (RuleEngine over evidence + baseline + previous period)
    EVALUATE (only for failed rules with evaluator_task → Evaluator agent)
    FINDINGS (build Finding objects; risk score; SLA from severity_policy)
    CHALLENGE (Challenger per finding; deterministic drop if evidence_ids don't resolve)
→ AGGREGATE → WORKPAPER (Reporter) → GATE finding_signoff → SEAL → DONE
```

Evidence packaging (connector `postgres`, operation `catalog_query`):
- Runs in a `READ ONLY` transaction with `statement_timeout`.
- `instance_fp = SHA256(system_identifier from pg_control_system() ‖ version() ‖ SHA256(sorted pg_settings name=setting))`.
- Result canonicalization: sort rows by all columns → RFC 8785 canonical JSON → `result_sha256`.
- Store the canonical result in `evidence_payloads` and the EvidenceRecord in the ledger.

Risk score for CVE findings:
$$\text{risk} = \text{CVSS}_{base} \times w_{asset} \times w_{exposure} \times (1 + \alpha\cdot\text{KEV} + \beta\cdot\text{EPSS})$$
with α, β from `archetype_params.risk_formula`, documented in `docs/model_cards/risk_score.md`.

### 7.B `test_exec_wf` (Archetype B)
```
EVENT (webhook → signal-with-start, id = change_id)
→ IMPACT (deterministic oasdiff + service graph → I, N(I); then ImpactAnalyst may ADD endpoints with justification)
→ PLAN_SUITE  T = C ∪ I ∪ N(I)   (post-hook: reject if C ⊄ T; agent may add, never remove)
→ EXECUTE     (Schemathesis for endpoints in T + journeys; PII redacted BEFORE hashing)
→ ANALYZE     per endpoint: PASS iff status ∈ expected ∧ schema_valid ∧ p95 ≤ min(SLO, μ + kσ)
              fail → rerun m times: all fail = regression; mixed = flaky; dependency probe failing = environmental
→ GATE        all pass → verdict verified
              regression → verdict blocked + rollback recommendation → HITL rollback gate (pipeline executes, never the agent)
              flaky only → verified_with_exceptions + quarantine item
→ UPDATE_BASELINE (EWMA: μ_t = λx_t + (1−λ)μ_{t−1}; same for variance; only from PASS runs)
→ WORKPAPER → SEAL → DONE
```

### 7.C `reconcile_wf` (Archetype C)
```
LOAD sides (source_ref, target_ref, key, column list via whitelist)
→ HASH both sides with the canonical row-hash generator (Section 9.4), in-database
→ MERKLE roots per side (Section 9.5)
→ COMPARE: equal roots ⇒ MATCH; else bisect to locate breaks: missing_in_target, extra_in_target, mismatched
→ CLASSIFY breaks (deterministic); optional Evaluator explanation of patterns (advisory)
→ RESULT (ReconResult: counts, roots, breaks[], evidence_ids)
```
When invoked inside D, the source side is the **manifest** (frozen $(pk, h)$ set), never a live date predicate.

### 7.D `execute_verify_wf` (Archetype D) — CTL-ARCH-001
```
INTERPRET (child E: dual extraction → PolicyIR with citations)
  ──disagreement or new version──▶ GATE policy_version
→ COMPILE_VALIDATE (whitelist; date column type; archive schema compatibility; guardrails; exclusions exist; no conflicting policies)
→ PLAN
    freeze τ = t0 − Δ (once)
    REPEATABLE READ snapshot: E = {r : d(r) < τ ∧ ¬excl_1(r) ∧ …} → manifest_rows(run_id, pk, row_hash)
    R_src = Merkle root; FK graph (pg_constraint) → Kahn topological order; cycle ⇒ gate
    volume check vs baseline (|E−μ| > kσ, > cap, or first run ⇒ gate run_plan)
    Planner agent reviews plan and explains flags (advisory)
→ ACT (reversible): keyset batches over manifest (pk > last_pk ORDER BY pk LIMIT b), psycopg COPY → INSERT … ON CONFLICT (pk) DO NOTHING, per-batch txn, heartbeat last_pk; parents before children
→ VERIFY (child C with read-only identity): PASS iff R_arc = R_src ∧ counts equal (full compare, never sampling)
    FAIL ⇒ EXCEPTION_REPORT → FAILED (no commit, ever)
    Challenger reviews verification report (advisory; cannot flip FAIL)
→ ATTEST: sign {run_id, τ, R_src, R_arc, n, verifier_id, key_version, issued_at, expires_at} via OpenBao transit
→ [gate deletion if run_plan gate was triggered]
→ COMMIT (irreversible): JIT DELETE credential issued only for a valid attestation;
    per batch, a single statement: DELETE FROM src WHERE pk = ANY(:pks)
       AND row_hash_expr = manifest.row_hash AND NOT exclusion predicates (re-evaluated now)
       RETURNING pk
    rows not returned ⇒ skipped (mutated or newly held), reported
→ RECONCILE_COMMIT: assert |D| + |skipped| = |M| else CRITICAL
→ WORKPAPER → SEAL → DONE
```
**Invariant (property-tested):**
$$D \subseteq \{r \in \mathcal M : h_{src}(r,t_{del}) = h_{\mathcal M}(r) = h_{arc}(r) \wedge \neg\,\text{hold}(r,t_{del})\}$$

### 7.E `doc_review_wf` (Archetype E)
```
INGEST (Docling → text with page + char offsets; source_doc_sha256; chunk + embed into pgvector)
→ EXTRACT_A (reasoner) ∥ EXTRACT_B (fast), both constrained to output_contract, with citations for every field
→ VERIFY_CITATIONS (deterministic: each cited span must contain the extracted value after normalization)
→ RECONCILE (field-by-field diff; any difference ⇒ HITL)
→ RULES (completeness/consistency rules from the definition)
→ RESULT (typed IR + rule results + evidence ids)
```

### 7.S Supervisor
- Loads all **approved** definitions and creates Temporal Schedules per `frequency`.
- Routes events (`change.deployed`, `policy.uploaded`) to controls whose `trigger_events` match.
- Enforces concurrency: max 1 archetype-D run per table; archetype-B runs keyed by `change_id`.
- **Cross-control rules** (declared in `catalogs/cross_control_rules.yaml`), e.g. block an archetype-D run on a target if the latest archetype-A run on the same instance has an open `critical` finding.

---

## 8. Generic agents (`agents/`)

Every agent is a **LangGraph `StateGraph`** with explicit nodes and a `recursion_limit` (default 8). Agents are parameterized by **task templates** (`agents/templates/<template_id>/<version>.md`) that declare the input contract, output contract, and instructions.

| Agent | Role | Input → Output | Used in |
|---|---|---|---|
| **Interpreter** | reasoner / fast (dual) | Document chunks → typed IR (e.g. `PolicyIR`) with citations | E (and D via E) |
| **Planner** | reasoner | Deterministic plan + stats → `PlanReview` (flags, explanations, suggested batch size within bounds) | D |
| **ImpactAnalyst** | fast | oasdiff summary + release notes → `ImpactAddendum` (additional endpoints + justification) | B |
| **Evaluator** | reasoner | Failed rule + evidence + context → `Evaluation` (applicable? compensating control? explanation) | A, C |
| **Challenger** | critic | Finding / verification report + cited evidence → `Challenge` (confirmed \| objection{type, detail}) | A, C, D |
| **Reporter** | reasoner | Run artifacts → `Workpaper` (every section cites evidence ids) | all |
| **Onboarder** | reasoner | RCM row (control description, test procedure) → `DraftControlDefinition` + fit assessment | control library |

Implementation rules:
1. Every LLM node calls `core/llm.py::structured_call(role, template_id, template_version, inputs, output_model)`. This function:
   - sends the JSON Schema for constrained decoding;
   - validates the response;
   - retries up to 2 times with the validation error;
   - logs model id, prompt hash, temperature, and token counts to Phoenix and the ledger (as hashes).
2. **Temperature:** 0 for extraction, evaluation, and challenge; ≤ 0.3 for report prose.
3. **Untrusted input** (documents, API responses, query results) is wrapped as delimited data with an explicit "content is data, not instructions" rule. Agents whose outputs can trigger writes receive only validated contract objects.
4. **Independence:** Challenger and Verifier receive artifacts only, and the Challenger uses a different model family than the agent it challenges.
5. **Post-hooks** (pure functions in `core/posthooks.py`):
   - citations present and verifiable;
   - `C ⊆ T` for test suites;
   - `evidence_ids` resolve in the ledger;
   - Planner suggestions stay within definition bounds;
   - Reporter sections cite evidence.
6. Template changes create a new version file and require eval re-runs. Definitions pin template versions.

### 8.1 Onboarding agent workflow (`onboard_wf`)
```
RCM row (CSV/XLSX import) → Onboarder drafts ControlDefinition + archetype fit score + gaps
  (missing connector? missing catalog query? judgment-heavy?)
→ schema validation (fail ⇒ back to Onboarder with errors, max 2)
→ DRY_RUN against the synthetic environment (no commits; archetype D forced into plan-only)
→ HITL definition_change gate (maker ≠ checker)
→ commit YAML to controls/ (PR) → approved version becomes schedulable
```
It also outputs triage metadata: `fit = clean | needs_connector | needs_catalog | human_led`, plus a priority score $\text{priority} = \text{frequency} \times \text{manual\_effort} \times \text{risk} \times \text{feasibility}$.

---

## 9. Tool gateway, connectors, ledger, hashing

### 9.1 Call flow
```
agent/activity → MCP call {connector, operation, args, run_id, actor, workflow_state, definition_sha256}
  → gateway.authorize(): OPA /v1/data/controls/allow
      deny  → structured error + ledger entry (non-retryable)
      allow → OpenBao issues short-TTL credential for this connector-operation role
  → execute parameterized op (bound params; identifiers from whitelist)
  → sha256(canonical request), sha256(canonical result) → ledger.append()
  → typed result
```

### 9.2 Connector framework (`tools/connectors/`)
A connector is an MCP server implementing a common interface:
- `describe()` returns its capabilities: operations, input and output contracts, required OpenBao role template, and side-effect class (`read | reversible_write | irreversible_write`).
- `health()`.
- Operations are **catalog-driven**. The connector refuses anything not in a catalog.

| Connector | Operations | Side-effect class |
|---|---|---|
| `postgres` | `catalog_query`, `table_metadata`, `fk_graph`, `row_hashes`, `snapshot_manifest`, `copy_batch`, `delete_by_manifest` | read / reversible_write / **irreversible_write** |
| `http_api` | `contract_tests`, `journey`, `probe` | read (synthetic accounts) |
| `files` | `list`, `read_document` (Docling) | read |
| `change_mgmt` | `get_change`, `openapi_diff`, `post_verdict` | read / reversible_write |
| `cve_intel` | `cpe_lookup`, `kev_status`, `epss` (local cache) | read |
| `evidence` | `append`, `get`, `verify_chain` | append-only |

**Adding a connector** (e.g. Oracle, LDAP) is the main way the platform grows. Each new connector requires:
- the interface implementation;
- an OpenBao role template;
- OPA rules for its side-effect classes;
- contract tests;
- a model/connector card in `docs/`.

### 9.3 OPA rules (`infra/opa/policies/`, each with Rego tests)
1. Default deny.
2. `read` operations are allowed only if the operation's catalog ref is in the run's approved `definition_sha256`.
3. `reversible_write` is allowed only in the matching workflow state and only for targets in the definition scope.
4. `irreversible_write` is allowed only if **all** of the following hold:
   - a valid attestation signature (verified via OpenBao transit);
   - `attestation.run_id == run_id`;
   - `now < expires_at`;
   - the state is `COMMIT`;
   - any required gate is approved.
5. Only the gateway talks to OpenBao and OPA admin endpoints.
6. Approvals are valid only if `approver_id ≠ maker_id` and the approver holds the gate's `approver_role`.
7. Only approved definition hashes may start runs (checked at `LOAD_DEFINITION`).

### 9.4 Canonical row hash (`core/hashing.py`, `hash_spec_version = "1"`)
For columns $c_1..c_k$ in catalog ordinal order (recorded in the Manifest/ReconResult):
- NULL → `N`.
- Otherwise → `V` + decimal UTF-8 byte-length of $s$ + `:` + $s$, where $s = \mathrm{norm}(v)$.
- `row_hash = SHA-256(concat)`, as lowercase hex.

| Type | norm |
|---|---|
| integers | base-10 |
| numeric(p,s) | fixed `s` decimals |
| text | as-is |
| boolean | `t`/`f` |
| date | `YYYY-MM-DD` |
| timestamp | `YYYY-MM-DDTHH:MM:SS.ffffff` |
| timestamptz | UTC `…ffffffZ` |
| bytea | lowercase hex |
| uuid | lowercase |
| json/jsonb | `::jsonb::text` |

The hash is computed **in-database** via a generated expression:
- per column: `CASE WHEN c IS NULL THEN 'N' ELSE 'V' || octet_length(x) || ':' || x END`;
- joined with `||` and hashed with `encode(sha256(convert_to(…,'UTF8')),'hex')`.

The same generator is used on both sides. Required tests:
- $(12,3) \ne (1,23)$;
- NULL ≠ `''`;
- equal instants in different time zones hash equal;
- multi-byte UTF-8 lengths are correct.

### 9.5 Merkle tree
- Leaves are sorted by PK: `leaf = SHA256(0x00 ‖ len(pk) ‖ pk ‖ row_hash_bytes)`.
- `node = SHA256(0x01 ‖ L ‖ R)`. An odd node is **promoted, not duplicated**.
- On a root mismatch, bisect to locate breaks in $O(m \log n)$.

### 9.6 Evidence ledger (`control_meta`)
Table `ledger(seq bigserial, evidence_id uuid, control_id, control_version, definition_sha256, run_id, kind, payload_sha256, payload_ref, actor, ts timestamptz, prev_hash, entry_hash)`.
- A trigger blocks `UPDATE`, `DELETE`, and `TRUNCATE`. The application role has INSERT + SELECT only. Appends are serialized with an advisory lock.
- `entry_hash = SHA256(prev_hash ‖ payload_sha256 ‖ ts_iso ‖ actor)`. The genesis `prev_hash` is 64 zeros.
- `verify_chain(a, b)` recomputes entries and compares against the stored values and checkpoints.
- **Checkpoints** every 500 entries or hourly:
  1. Sign `{seq, entry_hash, ts}` via OpenBao transit key `ledger-checkpoint`.
  2. Write it to the object store with Object Lock (if verified), or to an append-only volume (`chattr +a`, separate OS user).
  3. Submit `entry_hash` to a free RFC 3161 TSA or OpenTimestamps (hash only).

### 9.7 OpenBao
- **Database secrets engine:** one role template per `(connector, operation side-effect class, target)`. TTL 10 min, max 30 min. The `irreversible_write` role grants DELETE on exactly one table.
- **Transit:** `verifier-attest` (ed25519, only the verifier AppRole may sign) and `ledger-checkpoint` (ed25519).
- **AppRoles** per service (worker, gateway, UI, verifier). No root token after bootstrap.

---

## 10. Data contracts (`contracts/`)

All contracts are Pydantic v2 with `extra="forbid"`, `frozen=True`, and a `schema_version`. The JSON Schema drives constrained decoding and is re-validated after decoding.

| Contract | Key fields |
|---|---|
| `ControlDefinition` | Section 6.1 |
| `RunContext` | `run_id, control_id, version, definition_sha256, archetype, scope_ref, period_or_event_id, started_at, software_versions{images, models, templates}` |
| `EvidenceRecord` | `evidence_id, control_id, run_id, kind, catalog_ref?, query_sha256?, instance_fp?, executor_id, ts, row_count?, result_sha256, payload_ref, prev_hash, entry_hash` |
| `RuleResult` | `rule_id, evidence_ref, primitive, passed: bool, details{added, removed, violating_rows_ref}, severity` |
| `Evaluation` | `rule_id, applicable: bool, compensating_control?: str, rationale, evidence_ids` |
| `Finding` | `finding_id, run_id, control_id, rule_id, target_ref, title, evidence_ids (min 1), severity, attributes{cve_ids, cvss, kev, epss, …}, risk_score?, sla_due, status, challenge{verdict, objection_type?, detail?}` |
| `Challenge` | `subject_id, verdict: confirmed\|objection, objection_type?: evidence_missing\|not_applicable\|risk_accepted\|other, detail` |
| `PolicyIR` | `policy_id, version, effective_from, source_doc_sha256, entity, source_table, date_column, retention{value, unit}, exclusions[{predicate_ref, reason}], action, archive_target, citations{field → {page, char_start, char_end, quote}}` |
| `RunPlan` | `run_id, policy_ref, cutoff_tau, eligible_count, baseline{mean, std, n}, fk_order[], batch_size, keyset_column, gate_reasons[]` |
| `PlanReview` | `flags[], explanations[], suggested_batch_size (within bounds)` |
| `Manifest` | `run_id, table, hash_spec_version, column_order[], row_count, merkle_root_src, created_at` (rows in `manifest_rows`) |
| `ReconResult` | `run_id, source_ref, target_ref, root_src, root_tgt, counts{src, tgt}, breaks[{pk, type}], evidence_ids` |
| `Attestation` | `run_id, cutoff_tau, merkle_root_src, merkle_root_arc, row_count, verifier_id, key_version, issued_at, expires_at, signature` |
| `ImpactAddendum` | `added_endpoints[{method, path, justification}]` |
| `TestVerdict` | `change_id, run_id, endpoint, status_code, expected_status[], schema_valid, p95_ms, baseline{mu, sigma, slo_ms}, reruns, results[], classification, evidence_ids` |
| `Approval` | `approval_id, run_id, gate, maker_id, approver_id, decision, comment, ts` (approver ≠ maker) |
| `Workpaper` | `run_id, control_id, version, period, conclusion, summary, sections[{heading, body, evidence_ids}], findings_ref[]` |
| `DraftControlDefinition` | `definition (ControlDefinition-shaped), fit, gaps[], priority_inputs{frequency, manual_effort, risk, feasibility}, rcm_ref` |

---

## 11. Catalogs & baselines (`catalogs/`)

- `queries/postgres.yaml`: approved queries. Entry fields: `id, version, title, sql, expected_columns, notes`. Adding or changing a query needs a `catalog_change` approval.
- `exclusion_predicates.yaml`: named SQL predicate templates (e.g. `legal_hold`, `active_account`) with whitelisted identifiers.
- `critical_endpoints.yaml`: set $C$.
- `service_graph.yaml`: endpoint dependency edges.
- `journeys/*.yaml`: scripted API journeys.
- `baselines/*.yaml`: approved lists and expected settings.
- `cross_control_rules.yaml`: Supervisor rules.
- `redaction_profiles.yaml`: PII fields and patterns.

Initial Postgres query catalog:

| ID | Purpose |
|---|---|
| VQ-001 | Superuser roles (`pg_roles.rolsuper`) |
| VQ-002 | Login roles without password expiry / dormant |
| VQ-003 | Privileges granted to `PUBLIC` on non-system objects |
| VQ-004 | `password_encryption` setting |
| VQ-005 | `ssl` setting |
| VQ-006 | Connection/disconnection logging settings |
| VQ-007 | `pg_hba_file_rules` with `trust` or `0.0.0.0/0` |
| VQ-008 | Installed extensions |
| VQ-009 | `version()` |
| VQ-010 | Default/sample databases or roles |
| VQ-011 | Roles with `CREATEROLE`/`CREATEDB` |
| VQ-012 | `SECURITY DEFINER` functions owned by superusers |

CVE cache: a nightly job (Temporal schedule) syncs NVD CPE matches for products in use, using incremental `lastModStartDate` queries and the free API key (50 requests/30 s). It also downloads the daily KEV JSON and EPSS CSV, hashes them, and stores `cache_snapshot_id` to cite in evidence.

---

## 12. HITL & autonomy matrix

| Action | Autonomy |
|---|---|
| Read-only collection, tests, CVE lookups | Automatic |
| New/changed control definition, catalog entry, template version | Maker-checker (`definition_change` / `catalog_change`) |
| Policy interpreter disagreement / new policy version | `policy_version` gate |
| Execute-verify plan on first run / volume anomaly / FK cycle | `run_plan` gate |
| Reversible writes (archive copy) | Automatic after plan gate |
| Irreversible writes (delete) | Valid attestation + JIT credential; plus `deletion` gate when the plan gate triggered |
| Rollback after regression | `rollback` gate; executed by the release pipeline |
| Close/accept findings, sign workpaper | `finding_signoff` by `owner_role` |

Gates are surfaced in the React console's **Approvals** screen (Section 23.5). The flow:

```
workflow reaches gate → awaits signal → BFF exposes it in GET /gates?role=…
  → console shows it in the approvals queue (+ SSE toast)
  → reviewer opens the gate: artifacts, citations, evidence links, diff vs prior version
  → Approve / Reject + mandatory comment
  → POST /gates/{id}/decision → BFF checks RBAC and maker ≠ checker
  → Temporal signal + Approval appended to the ledger
  → SSE `gate.decided` updates every open console
```

Rules the console enforces (and the BFF re-enforces server-side — never trust the client):
- the Approve button is disabled when `current_user == maker` or the user lacks the gate's `approver_role`;
- a comment is mandatory on reject and on any `deletion` or `rollback` gate;
- destructive gates (`deletion`, `rollback`) use a confirm dialog requiring the user to type the `run_id`;
- gates show a countdown to the 72 h timeout, after which the run goes to `EXPIRED`.

---

## 13. Repository layout

```
control-platform/
├── PROJECT_CONTEXT.md
├── pyproject.toml / uv.lock
├── controls/                         # CONTROL LIBRARY (data)
│   ├── CTL-VULN-001.yaml
│   ├── CTL-PRIV-001.yaml
│   ├── CTL-SAN-001.yaml
│   └── CTL-ARCH-001.yaml
├── catalogs/
│   ├── queries/postgres.yaml
│   ├── exclusion_predicates.yaml
│   ├── critical_endpoints.yaml
│   ├── service_graph.yaml
│   ├── journeys/
│   ├── baselines/
│   ├── cross_control_rules.yaml
│   └── redaction_profiles.yaml
├── contracts/                        # Pydantic models (Section 10)
├── core/
│   ├── llm.py                        # structured_call
│   ├── hashing.py  merkle.py
│   ├── ledger.py
│   ├── catalog.py                    # identifier whitelist from information_schema
│   ├── definitions.py                # load + validate + hash ControlDefinitions
│   ├── rules/                        # rule primitives + rego escape hatch
│   └── posthooks.py
├── tools/
│   ├── gateway.py
│   └── connectors/{postgres,http_api,files,change_mgmt,cve_intel,evidence}/
├── agents/
│   ├── interpreter.py planner.py impact_analyst.py evaluator.py
│   ├── challenger.py reporter.py onboarder.py
│   └── templates/<template_id>/<version>.md
├── workflows/
│   ├── supervisor_wf.py
│   ├── archetypes/{query_review_wf,test_exec_wf,reconcile_wf,execute_verify_wf,doc_review_wf}.py
│   ├── onboard_wf.py
│   ├── cve_cache_sync_wf.py
│   ├── activities/
│   └── worker.py
├── sim/
│   ├── schema.sql  generate.py
│   ├── bank_api/                     # FastAPI + openapi.json
│   ├── change_injector.py
│   ├── vuln_target/                  # misconfigured Postgres init
│   ├── policies/retention/           # synthetic policy PDFs/DOCX
│   ├── rcm_sample.csv                # sample RCM rows for onboarding eval
│   └── faults/
├── infra/
│   ├── compose.yaml
│   ├── litellm/config.yaml
│   ├── openbao/
│   ├── opa/policies/
│   ├── postgres/init/
│   └── grafana/dashboards/
├── api/                              # BFF (FastAPI) — the browser's only origin
│   ├── main.py  deps.py  auth.py  rbac.py  sse.py  errors.py
│   ├── routers/{controls,runs,gates,findings,evidence,onboarding,catalogs,
│   │            agents,admin,health}.py
│   ├── services/{temporal_client,ledger_reader,definition_service,
│   │             dryrun_service,metrics_proxy}.py
│   └── schemas/                      # API DTOs; re-export contracts/ where possible
├── web/                              # React operator console — Section 23
│   ├── index.html  vite.config.ts  tailwind.config.ts  tsconfig.json
│   └── src/
│       ├── main.tsx  App.tsx  routes.tsx
│       ├── api/{client.ts, generated-types.ts, queries/*.ts, sse.ts}
│       ├── components/ui/            # shadcn primitives
│       ├── components/{StatusPill,ArchetypeBadge,SeverityTag,RunTimeline,
│       │               EvidenceChip,HashDisplay,MerkleDiff,GateCard,
│       │               DefinitionEditor,CitationViewer,AgentTrace}.tsx
│       ├── features/{dashboard,library,runs,approvals,findings,evidence,
│       │             onboarding,agents,admin}/
│       ├── hooks/{useSSE,useGates,useRun,usePermissions}.ts
│       ├── lib/{format.ts, rbac.ts, theme.ts}
│       └── types/
├── webhook/
├── evals/
│   ├── golden/{policies, findings, regressions, onboarding}/
│   ├── test_archetype_A.py … test_archetype_E.py
│   ├── test_archival_faults.py
│   ├── test_ledger_tamper.py
│   ├── test_no_code_control.py       # CTL-PRIV-001 added with zero code changes
│   └── test_onboarding.py
├── tests/
└── docs/{rcm.md, threat_model.md, runbooks/, model_cards/, connector_cards/}
```

**Import rules (import-linter in CI):**
- `agents/` may import only `contracts/`, `core/llm.py`, and `core/posthooks.py`. It must never import DB drivers, `httpx`, or `tools/` internals.
- Workflow code (not activities) must import no I/O libraries.
- `api/` may import `contracts/` and `core/` read paths (`ledger.py`, `definitions.py`) and the Temporal client. It must **never** import `tools/`, `agents/`, or connector internals; it never executes a control itself.
- The grep test forbids `CTL-` literals in `core/`, `agents/`, `workflows/`, `tools/`, **`api/` and `web/`**. The frontend must have no per-control special cases; it renders whatever the archetype and definition say.

**Frontend lint rules (ESLint, CI):**
- no `fetch` outside `web/src/api/`;
- no hardcoded control ids, archetype names, gate names, or severity lists — all come from typed enums generated from `contracts/`;
- no direct `process.env` reads outside `web/src/lib/config.ts`;
- `@typescript-eslint/no-explicit-any` as an error in `web/src/api/`.

---

## 14. Synthetic environment (`sim/`)

### 14.1 Core-banking schema (`core_banking_sim`)
- `customers(customer_id pk, name, dob, kyc_status, created_at timestamptz, closed_at null)`
- `accounts(account_id pk, customer_id fk, type, status active|dormant|closed, opened_at, closed_at null)`
- `transactions(txn_id bigint pk, account_id fk, txn_date timestamptz, amount numeric(18,2), currency, channel, narrative text null, metadata jsonb null)`
- `loans(loan_id pk, account_id fk, principal numeric(18,2), start_date, end_date null)`
- `legal_holds(hold_id pk, account_id fk, reason, active bool, placed_at, released_at null)`
- `kyc_documents(doc_id pk, customer_id fk, doc_type, uploaded_at, blob_sha256)`

`archive` has matching `*_archive` tables.

**Generator** (seeded, deterministic):
- 10⁶ transactions by default (up to 10⁷) over 10 years;
- ~20% NULL narratives, including multi-byte UTF-8;
- 1–2% of accounts on legal hold.

**Also create:** extra roles in `core_banking_sim` and `archive` (some unapproved) so CTL-PRIV-001 has findings.

### 14.2 Toy bank API (`sim/bank_api`)
- Endpoints: `POST /auth/login`, `GET /accounts/{id}/balance`, `POST /transfers`, `GET /transfers/{id}`, `GET /accounts/{id}/statements`, `GET /health`, plus `openapi.json`.
- `change_injector.py` creates versioned changes: renamed field, 500 on an edge case, +300 ms latency, auth regression, harmless refactor (control case), intermittent failure (flaky).

### 14.3 Vulnerable target (`sim/vuln_target`)
Seeded with: extra superusers, `PUBLIC` grants, md5 roles, `ssl=off`, a `trust` hba rule, logging off, an unapproved extension, and a superuser-owned `SECURITY DEFINER` function. Expected findings are recorded as golden data.

### 14.4 Synthetic policies and RCM
- 20+ retention policy documents (PDF/DOCX), including ambiguous ones, with golden `PolicyIR` files.
- `rcm_sample.csv`: ~50 realistic control descriptions across archetypes A–E plus human-led ones, with golden archetype labels and fit, used for the onboarding eval.

### 14.5 Fault injectors (`sim/faults`)

| Fault | Expected |
|---|---|
| Flip one byte in an archive row | C/D VERIFY FAIL; no commit |
| Drop one archive row | VERIFY FAIL; no commit |
| NULL vs empty-string swap in archive | VERIFY FAIL |
| Timezone representation change, same instant | PASS |
| Mutate source row after VERIFY | Skipped at COMMIT, reported |
| Legal hold added after VERIFY | Skipped at COMMIT, reported |
| Run spans midnight | Same τ; PASS |
| Expired/forged/wrong-run attestation | OPA deny; no delete |
| Ambiguous policy wording | Interpreter disagreement → HITL |
| Direct ledger edit (superuser) | `verify_chain` detects |
| Unapproved control definition hash | Supervisor refuses to start |
| Seeded API regressions | `regression`; change blocked |
| Flaky endpoint | `flaky`, not `regression` |
| Seeded DB misconfigs | Findings = golden |
| CVE for a different build | Challenger objects; finding dropped |

---

## 15. Infrastructure (`infra/compose.yaml`)

| Service | Image (arm64; mirror locally) | Port | mem_limit |
|---|---|---|---|
| ollama | host install or `ollama/ollama` | 11434 | host |
| litellm | LiteLLM proxy | 4000 | 1g |
| pg_core | postgres:16 | 5432 | 1.5g |
| pg_archive | postgres:16 | 5433 | 1.5g |
| pg_meta | pgvector/pgvector:pg16 | 5434 | 1.5g |
| pg_vuln_target | postgres:16 (misconfigured init) | 5435 | 512m |
| temporal | dev server → server with Postgres | 7233 / UI 8233 | 1g |
| openbao | openbao/openbao | 8200 | 256m |
| opa | openpolicyagent/opa | 8181 | 128m |
| objectstore | rustfs/rustfs or seaweedfs | 9000/9001 | 512m |
| phoenix | Arize Phoenix | 6006 | 1g |
| prometheus / grafana | prom/prometheus, grafana/grafana-oss | 9090 / 3000 | 512m each |
| bank_api | local | 8081 | 256m |
| webhook | local | 8082 | 256m |
| api | local (FastAPI BFF) | 8000 | 768m |
| web | local (multi-stage: node build → nginx:alpine serving `web/dist`) | 5173 (dev) / 8080 (prod) | 128m |
| worker | local (Temporal worker + MCP connectors) | — | 2g |

`.env` is never committed. After bootstrap, runtime secrets come only from OpenBao.

---

## 16. Observability

- The OpenTelemetry trace id is `run_id`. Spans cover workflow steps, activities, MCP calls, and DB statements (catalog id, not values).
- Phoenix shows LLM spans: role, model, template id/version, tokens, latency, schema retries.

**Prometheus metrics:**
- `control_runs_total{control_id,archetype,status}`
- `control_run_duration_seconds{archetype}`
- `hitl_wait_seconds{gate}`
- `opa_denies_total{connector,side_effect}`
- `llm_schema_retries_total{agent}`
- `findings_total{control_id,severity}`
- `archive_rows_{eligible,copied,deleted,skipped}`
- `ledger_verify_failures_total`
- `definitions_active_total{archetype}`

**Dashboards:** Platform Health, Control Library Coverage (controls by archetype/fit/status), Agent Quality, Ledger Integrity.

**Alerts:** verify fail, ledger chain break, any OPA deny on `irreversible_write`, a run stuck past its SLA, an unapproved definition start attempt.

---

## 17. Security checklist

- [ ] Per-connector-operation DB roles; verifier read-only; irreversible writes only via JIT credential + attestation.
- [ ] No static secrets after bootstrap.
- [ ] TLS on core, archive, and meta Postgres (the vuln target stays insecure by design).
- [ ] Ledger: trigger + role + signed checkpoints + external timestamp.
- [ ] PII redaction before hashing/logging; no raw payload values in traces.
- [ ] Prompt-injection handling (Section 8, rule 3).
- [ ] Definition/catalog/template changes only via maker-checker; run-time hash check.
- [ ] Image + model mirroring, pinned digests/hashes, SBOM, license gate.
- [ ] `docs/threat_model.md` covers:
  - malicious policy document or RCM row;
  - compromised agent output;
  - insider editing a definition or the ledger;
  - credential leakage;
  - model swap;
  - connector misuse.

---

## 18. Evaluation & acceptance gates

| Area | Metric | Gate |
|---|---|---|
| Archetype E / policy interpretation | Field exact-match vs golden IR | ≥ 98% auto-accepted fields correct; 100% of true ambiguities → HITL |
| Archetype C / D integrity | Detection of all integrity faults | **100%** |
| Archetype D safety | Irreversible ops without valid attestation | **0** |
| Archetype D invariant | Holds on every eval run | **100%** |
| Archetype B | Regression recall / false-regression rate | ≥ 99% / ≤ 2% |
| Archetype A | Finding precision / recall vs golden; findings without evidence | ≥ 95% / ≥ 95%; **0** |
| No-code scalability | CTL-PRIV-001 runs with zero changes outside `controls/`, `catalogs/`, `baselines/` | **Pass** |
| Onboarding | Archetype classification accuracy on `rcm_sample.csv`; drafts passing schema validation | ≥ 85%; ≥ 90% (humans still approve all) |
| Ledger | Tamper detection | **100%** |
| Replay | Temporal history replay without non-determinism errors | **100%** |
| **Frontend — authz** | Playwright: a non-approver and the maker cannot approve any gate (button disabled **and** the API rejects a forged request) | **Pass** |
| **Frontend — a11y** | axe-core: zero serious/critical violations on every route; full keyboard operation of the approvals flow | **Pass** |
| **Frontend — contract drift** | Generated TS types match the live OpenAPI schema | **No diff** |
| **Frontend — archetype generality** | Every archetype renders its run detail with no per-control code (snapshot tests for A–E) | **Pass** |

Evals run in CI on any change to `agents/templates/`, LiteLLM model config, `catalogs/`, `controls/`, `core/hashing.py`, `core/rules/`, `api/`, `web/`, or the serving engine.

---

## 19. Build plan (phases, reuse-first)

**Phase 0 — Platform (week 0–1)**
- Spark checks, Ollama + models, tok/s measurement, LiteLLM roles.
- Compose stack (arm64, mirrored, mem limits), `uv`, pre-commit (ruff, mypy), self-hosted CI runner, license gate, import-linter, `CTL-` grep test.
- **Exit:** services healthy; `structured_call` returns valid objects for each role.

**Phase 1 — Contracts, hashing, ledger, sim (week 1–2)**
- `contracts/` (Section 10); `core/hashing.py` + `merkle.py` with the edge-case tests; ledger + checkpoints; `sim/` (Section 14).
- **Exit:** hashing tests pass; ledger tamper test detects edits; sim data generated deterministically.

**Phase 2 — Gateway + connector framework (week 2–3)**
- OpenBao (roles, transit, AppRoles), OPA policies + tests, `gateway.py`, connector interface, `postgres` connector (read ops), `evidence` connector.
- **Exit:** unauthorized calls are denied and logged; credentials expire; catalog-only enforcement is tested.

**Phase 3 — Spine + definitions + rule engine (week 3–4)**
- Temporal worker; `core/definitions.py` (load, validate, hash, approval check); `core/rules/` primitives; Supervisor with schedules.
- **Exit:** a dummy definition schedules and runs; crash/resume works; replay test passes; an unapproved definition is refused.

**Phase 3b — BFF + console shell (week 4)**
- `api/` skeleton: auth, RBAC, Temporal client, SSE, and the read endpoints in 23.9; OpenAPI → TS type generation.
- `web/` skeleton: Vite + Tailwind + shadcn, app shell (Section 23.3), routing, TanStack Query, SSE hook, Dashboard and Control Library screens, Approvals screen wired to a dummy gate.
- **Exit:** the console lists controls from `controls/`, shows a live run's status via SSE, and approves the dummy gate end to end with maker ≠ checker enforced server-side. Playwright authz test passes.

**Phase 4 — Archetype A + CTL-VULN-001 + CTL-PRIV-001 (week 4–6)**
- `query_review_wf`, Evaluator, Challenger, Reporter, `cve_intel` connector + `cve_cache_sync_wf`.
- Console: archetype-A run detail, Findings screen, Evidence Explorer.
- **Exit:** CTL-VULN-001 findings = golden; **CTL-PRIV-001 added with zero code changes** (`test_no_code_control.py`, which also asserts no diff under `web/` or `api/`); the new control appears in the console automatically.

**Phase 5 — Archetypes C + E (week 6–7)**
- `reconcile_wf` (Merkle + bisect), `doc_review_wf` (Docling, dual extraction, citation verification), `files` connector, Interpreter.
- Console: `CitationViewer` (side-by-side document and extracted IR), interpreter-disagreement gate view, `MerkleDiff` break table.
- **Exit:** reconciliation fault tests pass; policy interpretation eval gates pass; a reviewer can resolve a disagreement entirely in the console.

**Phase 6 — Archetype D + CTL-ARCH-001 (week 7–9)**
- `execute_verify_wf` composing E and C; `postgres` write operations (`snapshot_manifest`, `copy_batch`, `delete_by_manifest`); attestation; Planner.
- Console: archetype-D run detail with the stage rail, live copy progress, verification panel (roots + attestation), and the typed-`run_id` deletion confirm dialog.
- **Exit:** all archival faults behave as expected; invariant holds; zero attestation-less deletes; a VERIFY FAIL shows no Approve path anywhere in the UI.

**Phase 7 — Archetype B + CTL-SAN-001 (week 9–10)**
- `test_exec_wf`, webhook, `http_api` + `change_mgmt` connectors, ImpactAnalyst, baselines.
- Console: archetype-B run detail (endpoint verdict table, latency vs baseline chart, rollback gate).
- **Exit:** regression/flaky/control-case evals pass.

**Phase 8 — Onboarding + integration (week 10–11)**
- Onboarder + `onboard_wf` on `rcm_sample.csv`; cross-control rules; switch to vLLM; re-run all evals; concurrency test (all four controls at once).
- Console: Onboarding screen (RCM upload → draft review → dry run → approve → commit), Agents & Models screen, Admin.
- **Exit:** onboarding gates pass; all Section 18 gates pass on vLLM; a control is onboarded from a spreadsheet row to a scheduled control without leaving the console.

**Phase 9 — Hardening & docs (week 11–12)**
- Threat model, RCM mapping, runbooks, model/connector cards, dashboards, alerts.
- **Mock audit:** reconstruct any run purely from the ledger + checkpoints + definition hash.
- **Exit:** mock audit succeeds.

---

## 20. Coding conventions (humans and AI agents)

1. Python 3.12; `ruff`; `mypy --strict` on core packages; tests for every module; a regression test for every bug.
2. **Never** build SQL with string formatting of values. Identifiers come only from `core/catalog.py` whitelists (`psycopg.sql.Identifier`); values are always bound.
3. **Never** pass LLM output into SQL, shell, file paths, or URLs without a contract model **and** a whitelist.
4. All LLM calls go through `structured_call` with role names; templates are versioned.
5. Side effects only in activities or connectors; every side effect is logged to the ledger before advancing.
6. **No control-specific code.** If you're about to write `if control_id == ...` or add a `CTL-` string in code, stop. Extend an archetype parameter, rule primitive, or connector instead.
7. New archetype parameters, rule primitives, and connectors must be **generic**, documented, and covered by evals.
8. Config over code: catalogs, baselines, thresholds, and gates live in YAML, validated by Pydantic on load.
9. New dependency ⇒ check its license (MIT/Apache/BSD/MPL/PostgreSQL OK; AGPL OK only for standalone internal services; BSL/SSPL/non-commercial not OK) and arm64 support.
10. No paid services; no outbound network except the allowlisted free feeds.
11. Pin everything (uv lock, image digests, model hashes, template versions); record versions in `RunContext` at run start.
12. Small commits; each phase ends with its exit criteria demonstrated by tests.

**Frontend conventions (`web/`, `api/`):**
13. **The browser is never trusted.** Every authorization decision the UI makes (hide a button, disable Approve) is re-made server-side in `api/rbac.py`. A hidden button is a convenience, not a control.
14. **No business logic in React.** Risk scores, verdicts, pass/fail, and eligibility are computed server-side and arrive as data. The frontend formats and displays; it never recomputes.
15. **The API is generated, not hand-written.** `web/src/api/generated-types.ts` comes from the BFF's OpenAPI schema via `openapi-typescript`. CI fails on drift.
16. **Server state lives in TanStack Query**, never in `useState`. Local UI state (open dialogs, filters) may use `useState`/URL params.
17. **Evidence is never summarized in the UI without its id.** Any number, verdict, or finding shown is accompanied by a clickable `EvidenceChip` linking to the ledger entry.
18. **Hashes are displayed truncated but copyable in full** (`HashDisplay`: first 8 + last 8 characters, click to copy the full 64).
19. **Destructive actions require a typed confirmation** of the `run_id` and a mandatory comment.
20. Every screen has explicit loading, empty, error, and forbidden states. No spinner-only screens, and no silent failures.
21. Accessibility is a gate, not a nicety: keyboard-operable approvals, visible focus rings, ARIA labels on icon-only buttons, and colour never as the sole carrier of meaning (a severity tag has a label as well as a colour).

---

## 21. Using this file with an AI coding agent (e.g. Antigravity)

- Keep this file at the repo root. Start every session with:
  > "Read PROJECT_CONTEXT.md fully. We are in Phase N. Do only Phase N tasks. Follow Sections 1, 8, and 20 strictly. Before coding, list the files you will create/change and the tests that prove Phase N's exit criteria."
- One phase at a time. Run the phase's tests yourself before moving on.
- **Reject** any proposal that:
  - uses a paid service or a non-arm64 image;
  - executes LLM-generated SQL;
  - deletes without an attestation;
  - adds control-specific code (backend **or** frontend);
  - puts a business rule, risk score, or verdict computation in React;
  - lets the browser talk to Temporal, OpenBao, OPA, a database, or an LLM directly.

  Point the agent back to Section 1 or Section 20.

Phase prompts:
- **P0:** "Create infra/compose.yaml (Section 15), LiteLLM roles (4.3), uv project, pre-commit, CI with license gate, import-linter rules and the `CTL-` grep test (Section 13). Add a smoke test calling each role via core/llm.py."
- **P1:** "Implement contracts/ (Section 10), core/hashing.py + merkle.py (9.4–9.5) with the edge-case tests, the ledger (9.6), and sim/ (Section 14)."
- **P2:** "Implement OpenBao setup (9.7), OPA policies + Rego tests (9.3), tools/gateway.py (9.1), the connector interface (9.2), and the postgres (read) + evidence connectors."
- **P3:** "Implement core/definitions.py (6.1–6.2), core/rules primitives (6.3), Temporal worker, Supervisor schedules (7.S), and crash/resume + replay tests."
- **P3b:** "Implement the BFF in api/ per Section 23.9 (auth, RBAC, Temporal client, SSE, read endpoints) and the React console shell in web/ per Sections 23.1–23.5: app shell, routing, TanStack Query, the SSE hook, Dashboard, Control Library, and the Approvals screen. Generate TS types from OpenAPI. Prove maker ≠ checker is enforced server-side with a Playwright test that forges the request."
- **P4:** "Implement query_review_wf (7.A), Evaluator/Challenger/Reporter (Section 8), the cve_intel connector + cache sync, and the archetype-A run detail + Findings + Evidence Explorer screens (23.4, 23.6, 23.7). Make CTL-VULN-001 pass evals, then add CTL-PRIV-001 with zero changes outside controls/, catalogs/ and baselines/ — including no changes under web/ or api/."
- **P5–P9:** likewise, per Sections 7.C/7.E, 7.D, 7.B, 8.1, 23, 18, and 19. Each backend phase also builds that archetype's run-detail panel per Section 23.4.

**A useful frontend prompt pattern:** give the agent the screen's section number, its data source (the BFF endpoint), its states (loading/empty/error/forbidden), and its acceptance test. For example:
> "Build the Approvals screen per Section 23.5. Data: `GET /gates`, `POST /gates/{id}/decision`. Use `GateCard` and `EvidenceChip`. Cover all four states. Acceptance: a Playwright test in which the maker sees Approve disabled, a forged POST returns 403, and a valid approval emits `gate.decided` over SSE to a second open session."

---

## 22. Glossary

- **Control:** a recurring procedure that addresses a risk and must produce evidence.
- **RCM:** Risk & Control Matrix.
- **Archetype:** a generic control pattern implemented once as a workflow (A–E).
- **Control definition:** a YAML file specifying what a control checks, over which scope, with which evidence, rules, agent tasks, and gates.
- **Rule primitive:** a deterministic check type used in definitions.
- **Connector:** an MCP server giving catalog-driven, permission-checked access to one kind of system.
- **HITL / maker-checker:** human approval where the approver differs from the proposer.
- **Manifest:** the frozen $(pk, row\_hash)$ set for an execute-and-verify run.
- **Merkle root:** one hash committing to a whole row set.
- **Attestation:** the verifier's signed statement that archive and source match, required for irreversible operations.
- **JIT credential:** a database user created by OpenBao on demand with minimal privileges and a short TTL.
- **Instance fingerprint:** a hash identifying exactly which database produced evidence.
- **KEV / EPSS:** CISA Known Exploited Vulnerabilities / Exploit Prediction Scoring System.
- **Deterministic spine, agentic leaves:** workflows, rules, and connectors hold authority and side effects; LLM agents only propose, interpret, evaluate, challenge, and write.
