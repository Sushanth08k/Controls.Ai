# Connector Card: CVE Intelligence Connector (`cve_intel`)

---

## 1. Overview
The `cve_intel` connector provides local, cached vulnerability enrichment for security and patch-compliance controls (Archetype A, `CTL-VULN-001`). It queries local replicas of the National Vulnerability Database (NVD), CISA Known Exploited Vulnerabilities (KEV), and FIRST Exploit Prediction Scoring System (EPSS).

---

## 2. Capabilities & Operations

| Operation | Side Effect | Role Template | Description |
|---|---|---|---|
| `cpe_lookup` | `read` | `cve_reader` | Looks up known CVEs for a given product and version string. |
| `kev_status` | `read` | `cve_reader` | Returns boolean status indicating whether a CVE is listed in CISA KEV. |
| `epss` | `read` | `cve_reader` | Returns the 30-day exploit probability score (0.0 to 1.0) from FIRST EPSS. |

---

## 3. Security & Operational Invariants

1. **Air-Gapped Operation:** All lookups execute against a frozen snapshot (`cache_snapshot_id`) stored in local SQLite / DuckDB cache. No live queries escape to external third parties during control runs.
2. **Deterministic Version Binding:** Every returned vulnerability payload records the `cache_snapshot_id` to ensure audit reproducibility across time.
3. **Challenger Cross-Verification:** In Archetype A, vulnerability matches undergo cross-examination by the Challenger agent to filter out false positives (e.g., CVEs applicable only to specific builds/extensions).
