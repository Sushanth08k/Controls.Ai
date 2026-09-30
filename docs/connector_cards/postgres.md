# Connector Card: PostgreSQL Connector (`postgres`)

---

## 1. Overview
The `postgres` connector provides controlled, catalog-governed database access to banking infrastructure (`pg_core`, `pg_archive`, `pg_meta`, `pg_vuln_target`). It is the primary data access layer for evidence collection (Archetype A, C) and data lifecycle operations (Archetype D).

---

## 2. Capabilities & Operations

| Operation | Side Effect | Role Template | Description |
|---|---|---|---|
| `execute_query` | `read` | `db_reader` | Executes a pre-approved, cataloged query (e.g. `VQ-001` - `VQ-012`). Direct SQL strings are forbidden. |
| `instance_fingerprint` | `read` | `db_reader` | Computes a SHA-256 fingerprint of the database instance (system identifier + init time). |
| `snapshot_manifest` | `read` | `db_reader` | Computes candidate eligible rows $(pk, row\_hash)$ based on retention policy and active legal holds. |
| `copy_batch` | `reversible_write` | `db_migrator` | Reversibly copies rows from source table to archive table. |
| `delete_by_manifest` | `irreversible_write` | `db_purger` | Deletes rows matching a verified manifest. **Requires valid attestation token and re-verifies legal holds.** |

---

## 3. Security & Policy Enforcement

1. **No Ad-Hoc SQL:** All queries must match an approved entry in `catalogs/queries/postgres.yaml`. Attempting to pass raw SQL text raises a fatal `ValueError`.
2. **OPA Authorization:** Every operation is validated by Open Policy Agent (`infra/opa/policies/controls.rego`).
3. **JIT Credentials:** Dynamic database credentials are generated via OpenBao with a 5-15 minute TTL.
4. **Irreversible Write Gate:** `delete_by_manifest` is rejected unless:
   - $R_{src} == R_{arc}$ (Merkle equality verified)
   - Cryptographic attestation token signature is valid and non-expired
   - No active legal holds exist on target keys at execution instant
