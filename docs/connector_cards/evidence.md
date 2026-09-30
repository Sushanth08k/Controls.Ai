# Connector Card: Evidence Store Connector (`evidence`)

---

## 1. Overview
The `evidence` connector manages the ingestion, retention, canonicalization, and retrieval of raw audit evidence artifacts. Every evidence artifact collected by any connector is registered in the evidence store and referenced in the immutable audit ledger.

---

## 2. Capabilities & Operations

| Operation | Side Effect | Role Template | Description |
|---|---|---|---|
| `store_artifact` | `write` | `evidence_writer` | Stores an immutable evidence artifact, computes SHA-256 payload hash, and returns an `evidence_id`. |
| `get_artifact` | `read` | `evidence_reader` | Retrieves raw artifact payload by `evidence_id` and verifies its SHA-256 integrity. |
| `list_artifacts` | `read` | `evidence_reader` | Queries stored artifacts associated with a specific `run_id` or `control_id`. |

---

## 3. Security & Operational Invariants

1. **WORM (Write Once, Read Many):** Artifacts cannot be modified or overwritten once registered.
2. **Payload Hash Integrity:** The connector verifies that the SHA-256 digest of stored bytes matches the `payload_hash` recorded in the ledger entry.
3. **No Sensitive PII Leaks:** Connector sanitizes and applies tokenization or hashing to PII fields before archiving payloads to general storage.
