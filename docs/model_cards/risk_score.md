# Model Card: Composite Vulnerability Risk Scoring

---

## 1. Model Overview

* **Model Name:** Composite Control Risk & Vulnerability Scoring Engine (`contracts.models.Finding.risk_score`)
* **Model Type:** Deterministic Multi-Factor Risk Assessment Model
* **Version:** 1.0.0
* **Target Environment:** Bank Infrastructure & Compliance Controls

---

## 2. Intended Purpose & Scope

The composite risk score translates raw technical vulnerabilities, compliance discrepancies, and configuration drift into a standardized, audit-ready risk metric (0.0 to 10.0) with enforceable remediation Service Level Agreements (SLAs).

It eliminates subjective severity inflation by deterministically fusing:
1. **CVSS v3.1 Base Score:** Inherent exploitability and impact metrics.
2. **CISA KEV Catalog:** Known active exploitation in the wild (binary indicator).
3. **FIRST EPSS:** 30-day forward-looking exploitation probability.
4. **Asset Criticality Multiplier:** Target banking tier weighting.

---

## 3. Mathematical Formula & Weighting

The composite score $S_{comp}$ is formulated as:

$$S_{comp} = \min\left(10.0, \left(W_{cvss} \cdot S_{cvss} + W_{kev} \cdot \mathbb{I}_{kev} + W_{epss} \cdot S_{epss} \cdot 10.0\right) \times M_{asset}\right)$$

### Parameter Weights:
* **$W_{cvss} = 0.50$ (50% weight):** Standardized base severity.
* **$W_{kev} = 3.00$ (Active exploitation bonus):** If a CVE appears in CISA KEV ($\mathbb{I}_{kev} = 1$), a +3.0 baseline surge is applied.
* **$W_{epss} = 0.20$ (20% weight on scaled EPSS):** Forward-looking threat intelligence factor.
* **Asset Criticality Multiplier ($M_{asset}$):**
  * `Tier 1` (Core Transaction / Ledger / Payment DB): $1.20$
  * `Tier 2` (Operational / Reporting / Internal API): $1.00$
  * `Tier 3` (Non-Prod / Sandbox): $0.80$

---

## 4. Severity Tiers & Remediation SLAs

| Composite Score ($S_{comp}$) | Severity Rating | SLA (Calendar Days) | Escalation Gate |
|---|---|---|---|
| $9.0 - 10.0$ | **CRITICAL** | 2 days (48 hours) | CISO + VP Engineering |
| $7.0 - 8.9$ | **HIGH** | 14 days | Service Owner + App Sec Lead |
| $4.0 - 6.9$ | **MEDIUM** | 30 days | Engineering Team Lead |
| $0.1 - 3.9$ | **LOW** | 90 days | Backlog Grooming |

---

## 5. Algorithmic Guardrails & Invariants

1. **Deterministic Execution:** The score is calculated deterministically by platform rules or connectors—never by an LLM prompt.
2. **Provenance & Evidence Anchoring:** Every component ($S_{cvss}, \mathbb{I}_{kev}, S_{epss}$) must cite an immutable evidence ID in the run ledger (`evidence_ids`).
3. **Fail-Closed Defaulting:** If threat feeds (KEV/EPSS) are temporarily unreachable, the engine falls back to the local cached snapshot (`cve_cache_sync_wf`) and flags an audit notation rather than failing silently.
