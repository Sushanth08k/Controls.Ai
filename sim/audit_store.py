import datetime
import json
import sqlite3
from typing import Any
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent
CORE_DB_PATH = DB_DIR / "bank_core.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(CORE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_audit_tables(conn: sqlite3.Connection | None = None) -> None:
    """Idempotently create audit tables in bank_core.db."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    try:
        cur = conn.cursor()
        cur.executescript("""
        CREATE TABLE IF NOT EXISTS control_audit_runs (
            run_id TEXT PRIMARY KEY,
            control_id TEXT NOT NULL,
            version TEXT DEFAULT '1.0.0',
            archetype TEXT DEFAULT 'A',
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            records_evaluated INTEGER DEFAULT 0,
            records_eligible INTEGER DEFAULT 0,
            records_processed INTEGER DEFAULT 0,
            records_affected INTEGER DEFAULT 0,
            policy_id TEXT,
            policy_info TEXT,
            error_message TEXT,
            source_db TEXT,
            archive_db TEXT,
            source_merkle_root TEXT,
            archive_merkle_root TEXT,
            merkle_verified INTEGER DEFAULT 0,
            attestation_token TEXT,
            metadata_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS control_audit_steps (
            step_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            step_name TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            records_processed INTEGER DEFAULT 0,
            error_message TEXT,
            metadata_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS control_findings (
            finding_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            control_id TEXT NOT NULL,
            title TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            affected_record TEXT,
            description TEXT,
            risk_score REAL DEFAULT 0.0,
            details_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS control_evidence (
            evidence_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            control_id TEXT NOT NULL,
            step_id TEXT,
            evidence_type TEXT NOT NULL,
            evidence_payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS control_approvals (
            gate_id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            control_id TEXT NOT NULL,
            status TEXT NOT NULL,
            approved_by TEXT,
            approved_at TEXT,
            comment TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS compliance_policy_documents (
            policy_id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            title TEXT NOT NULL,
            control_id TEXT,
            archetype TEXT DEFAULT 'D',
            format TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            file_sha256 TEXT NOT NULL,
            cloudinary_public_id TEXT NOT NULL,
            cloudinary_url TEXT NOT NULL,
            extracted_text TEXT NOT NULL,
            rules_summary TEXT,
            uploaded_at TEXT NOT NULL,
            uploaded_by TEXT,
            status TEXT DEFAULT 'Ready'
        );

        CREATE INDEX IF NOT EXISTS idx_audit_steps_run ON control_audit_steps(run_id);
        CREATE INDEX IF NOT EXISTS idx_audit_findings_run ON control_findings(run_id);
        CREATE INDEX IF NOT EXISTS idx_audit_evidence_run ON control_evidence(run_id);
        CREATE INDEX IF NOT EXISTS idx_audit_approvals_run ON control_approvals(run_id);
        CREATE INDEX IF NOT EXISTS idx_policy_documents_control ON compliance_policy_documents(control_id);
        CREATE INDEX IF NOT EXISTS idx_policy_documents_sha256 ON compliance_policy_documents(file_sha256);
        """)

        # Ensure policy_id column exists on existing control_audit_runs table
        cur.execute("PRAGMA table_info(control_audit_runs)")
        col_names = [col[1] for col in cur.fetchall()]
        if "policy_id" not in col_names:
            cur.execute("ALTER TABLE control_audit_runs ADD COLUMN policy_id TEXT")

        conn.commit()
    finally:
        if should_close:
            conn.close()


def _safe_json_dumps(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, str):
        return val
    return json.dumps(
        val,
        default=lambda o: o.model_dump() if hasattr(o, "model_dump") else (o.dict() if hasattr(o, "dict") else (o.isoformat() if hasattr(o, "isoformat") else str(o))),
    )


def upsert_audit_run(
    run_id: str,
    control_id: str | None = None,
    status: str | None = None,
    started_at: str | None = None,
    completed_at: str | None = None,
    version: str | None = None,
    archetype: str | None = None,
    records_evaluated: int | None = None,
    records_eligible: int | None = None,
    records_processed: int | None = None,
    records_affected: int | None = None,
    policy_id: str | None = None,
    policy_info: str | None = None,
    error_message: str | None = None,
    source_db: str | None = None,
    archive_db: str | None = None,
    source_merkle_root: str | None = None,
    archive_merkle_root: str | None = None,
    merkle_verified: int | bool | None = None,
    attestation_token: str | None = None,
    metadata_json: str | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Insert or update a control run record in SQLite."""
    init_audit_tables()
    conn = get_connection()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    metadata_str = _safe_json_dumps(metadata_json) if metadata_json is not None else None

    if merkle_verified is None:
        merkle_verified_int = None
    elif merkle_verified in (1, True, "1", "true", "True"):
        merkle_verified_int = 1
    else:
        merkle_verified_int = 0

    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM control_audit_runs WHERE run_id = ?", (run_id,))
        existing = cur.fetchone()

        if existing:
            cur.execute("""
            UPDATE control_audit_runs SET
                control_id = COALESCE(?, control_id),
                version = COALESCE(?, version),
                archetype = COALESCE(?, archetype),
                status = COALESCE(?, status),
                started_at = COALESCE(?, started_at),
                completed_at = COALESCE(?, completed_at),
                records_evaluated = CASE WHEN ? IS NOT NULL THEN ? ELSE records_evaluated END,
                records_eligible = CASE WHEN ? IS NOT NULL THEN ? ELSE records_eligible END,
                records_processed = CASE WHEN ? IS NOT NULL THEN ? ELSE records_processed END,
                records_affected = CASE WHEN ? IS NOT NULL THEN ? ELSE records_affected END,
                policy_id = COALESCE(?, policy_id),
                policy_info = COALESCE(?, policy_info),
                error_message = COALESCE(?, error_message),
                source_db = COALESCE(?, source_db),
                archive_db = COALESCE(?, archive_db),
                source_merkle_root = COALESCE(?, source_merkle_root),
                archive_merkle_root = COALESCE(?, archive_merkle_root),
                merkle_verified = CASE WHEN ? IS NOT NULL THEN ? ELSE merkle_verified END,
                attestation_token = COALESCE(?, attestation_token),
                metadata_json = COALESCE(?, metadata_json)
            WHERE run_id = ?
            """, (
                control_id, version, archetype, status, started_at, completed_at,
                records_evaluated, records_evaluated,
                records_eligible, records_eligible,
                records_processed, records_processed,
                records_affected, records_affected,
                policy_id, policy_info, error_message, source_db, archive_db,
                source_merkle_root, archive_merkle_root,
                merkle_verified_int, merkle_verified_int,
                attestation_token, metadata_str,
                run_id,
            ))
        else:
            cur.execute("""
            INSERT INTO control_audit_runs (
                run_id, control_id, version, archetype, status, started_at, completed_at,
                records_evaluated, records_eligible, records_processed, records_affected,
                policy_id, policy_info, error_message, source_db, archive_db,
                source_merkle_root, archive_merkle_root, merkle_verified, attestation_token,
                metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                run_id,
                control_id or "UNKNOWN",
                version or "1.0.0",
                archetype or "A",
                status or "running",
                started_at or now_iso,
                completed_at,
                records_evaluated or 0,
                records_eligible or 0,
                records_processed or 0,
                records_affected or 0,
                policy_id,
                policy_info,
                error_message,
                source_db,
                archive_db,
                source_merkle_root,
                archive_merkle_root,
                merkle_verified_int or 0,
                attestation_token,
                metadata_str,
                now_iso,
            ))
        conn.commit()
        return get_audit_run(run_id) or {}
    finally:
        conn.close()


def get_audit_run(run_id: str) -> dict[str, Any] | None:
    """Retrieve an audit run by ID."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM control_audit_runs WHERE run_id = ?", (run_id,))
        row = cur.fetchone()
        if not row:
            return None
        res = dict(row)
        if res.get("metadata_json"):
            try:
                res["metadata"] = json.loads(res["metadata_json"])
            except Exception:
                res["metadata"] = res["metadata_json"]
        return res
    finally:
        conn.close()


def list_audit_runs(control_id: str | None = None) -> list[dict[str, Any]]:
    """List all audit runs ordered by started_at DESC."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        if control_id:
            cur.execute("SELECT * FROM control_audit_runs WHERE control_id = ? ORDER BY started_at DESC", (control_id,))
        else:
            cur.execute("SELECT * FROM control_audit_runs ORDER BY started_at DESC")
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            if r.get("metadata_json"):
                try:
                    r["metadata"] = json.loads(r["metadata_json"])
                except Exception:
                    r["metadata"] = r["metadata_json"]
        return rows
    finally:
        conn.close()


def save_audit_step(
    step_id: str,
    run_id: str,
    step_name: str,
    status: str,
    started_at: str | None = None,
    completed_at: str | None = None,
    records_processed: int = 0,
    error_message: str | None = None,
    metadata_json: str | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Record or update a step in a control run's lifecycle."""
    init_audit_tables()
    conn = get_connection()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    started_at = started_at or now_iso

    meta_str = _safe_json_dumps(metadata_json) if metadata_json is not None else None

    try:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO control_audit_steps (
            step_id, run_id, step_name, status, started_at, completed_at,
            records_processed, error_message, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(step_id) DO UPDATE SET
            status = excluded.status,
            completed_at = COALESCE(excluded.completed_at, control_audit_steps.completed_at),
            records_processed = excluded.records_processed,
            error_message = excluded.error_message,
            metadata_json = COALESCE(excluded.metadata_json, control_audit_steps.metadata_json)
        """, (
            step_id, run_id, step_name, status, started_at, completed_at,
            records_processed, error_message, meta_str, now_iso,
        ))
        conn.commit()
        return {
            "step_id": step_id,
            "run_id": run_id,
            "step_name": step_name,
            "status": status,
            "started_at": started_at,
            "completed_at": completed_at,
            "records_processed": records_processed,
        }
    finally:
        conn.close()


def list_audit_steps(run_id: str) -> list[dict[str, Any]]:
    """List execution steps for a specific run."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM control_audit_steps WHERE run_id = ? ORDER BY started_at ASC, rowid ASC", (run_id,))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            if r.get("metadata_json"):
                try:
                    r["metadata"] = json.loads(r["metadata_json"])
                except Exception:
                    r["metadata"] = r["metadata_json"]
        return rows
    finally:
        conn.close()


def save_audit_finding(
    finding_id: str,
    run_id: str,
    control_id: str,
    title: str,
    severity: str,
    status: str = "open",
    affected_record: str | None = None,
    description: str | None = None,
    risk_score: float = 0.0,
    details_json: str | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Persist a control evaluation finding."""
    init_audit_tables()
    conn = get_connection()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    det_str = _safe_json_dumps(details_json) if details_json is not None else None

    try:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO control_findings (
            finding_id, run_id, control_id, title, severity, status,
            affected_record, description, risk_score, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(finding_id) DO UPDATE SET
            status = excluded.status,
            risk_score = excluded.risk_score,
            details_json = excluded.details_json
        """, (
            finding_id, run_id, control_id, title, severity, status,
            affected_record, description, risk_score, det_str, now_iso,
        ))
        conn.commit()
        return {
            "finding_id": finding_id,
            "run_id": run_id,
            "control_id": control_id,
            "title": title,
            "severity": severity,
            "status": status,
        }
    finally:
        conn.close()


def list_audit_findings(run_id: str | None = None, control_id: str | None = None) -> list[dict[str, Any]]:
    """List findings with optional filters."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        query = "SELECT * FROM control_findings WHERE 1=1"
        params = []
        if run_id:
            query += " AND run_id = ?"
            params.append(run_id)
        if control_id:
            query += " AND control_id = ?"
            params.append(control_id)
        query += " ORDER BY created_at DESC"
        cur.execute(query, tuple(params))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            if r.get("details_json"):
                try:
                    r["details"] = json.loads(r["details_json"])
                except Exception:
                    r["details"] = r["details_json"]
        return rows
    finally:
        conn.close()


def save_audit_evidence(
    evidence_id: str,
    run_id: str,
    control_id: str,
    evidence_type: str,
    evidence_payload: Any,
    step_id: str | None = None,
) -> dict[str, Any]:
    """Persist structured evidence in SQLite."""
    init_audit_tables()
    conn = get_connection()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    payload_str = _safe_json_dumps(evidence_payload)

    try:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO control_evidence (
            evidence_id, run_id, control_id, step_id, evidence_type, evidence_payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(evidence_id) DO UPDATE SET
            evidence_payload = excluded.evidence_payload
        """, (
            evidence_id, run_id, control_id, step_id, evidence_type, payload_str, now_iso,
        ))
        conn.commit()
        return {
            "evidence_id": evidence_id,
            "run_id": run_id,
            "control_id": control_id,
            "evidence_type": evidence_type,
        }
    finally:
        conn.close()


def get_audit_evidence(evidence_id: str) -> dict[str, Any] | None:
    """Retrieve evidence by ID."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM control_evidence WHERE evidence_id = ?", (evidence_id,))
        row = cur.fetchone()
        if not row:
            return None
        res = dict(row)
        try:
            res["payload"] = json.loads(res["evidence_payload"])
        except Exception:
            res["payload"] = res["evidence_payload"]
        return res
    finally:
        conn.close()


def list_audit_evidence(run_id: str) -> list[dict[str, Any]]:
    """List all evidence records for a run."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM control_evidence WHERE run_id = ? ORDER BY created_at ASC", (run_id,))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            try:
                r["payload"] = json.loads(r["evidence_payload"])
            except Exception:
                r["payload"] = r["evidence_payload"]
        return rows
    finally:
        conn.close()


def save_audit_approval(
    gate_id: str,
    run_id: str,
    control_id: str,
    status: str,
    approved_by: str | None = None,
    approved_at: str | None = None,
    comment: str | None = None,
) -> dict[str, Any]:
    """Persist human approval / gate decision."""
    init_audit_tables()
    conn = get_connection()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    approved_at = approved_at or (now_iso if status == "approved" else None)

    try:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO control_approvals (
            gate_id, run_id, control_id, status, approved_by, approved_at, comment, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gate_id) DO UPDATE SET
            status = excluded.status,
            approved_by = excluded.approved_by,
            approved_at = excluded.approved_at,
            comment = excluded.comment
        """, (
            gate_id, run_id, control_id, status, approved_by, approved_at, comment, now_iso,
        ))
        conn.commit()
        return {
            "gate_id": gate_id,
            "run_id": run_id,
            "control_id": control_id,
            "status": status,
            "approved_by": approved_by,
            "approved_at": approved_at,
            "comment": comment,
        }
    finally:
        conn.close()


def get_audit_approval(gate_id: str | None = None, run_id: str | None = None) -> dict[str, Any] | None:
    """Retrieve an approval gate by gate_id or run_id."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        if gate_id:
            cur.execute("SELECT * FROM control_approvals WHERE gate_id = ?", (gate_id,))
        elif run_id:
            cur.execute("SELECT * FROM control_approvals WHERE run_id = ? ORDER BY created_at DESC LIMIT 1", (run_id,))
        else:
            return None
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_audit_approvals(run_id: str | None = None) -> list[dict[str, Any]]:
    """List all approval records."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        if run_id:
            cur.execute("SELECT * FROM control_approvals WHERE run_id = ? ORDER BY created_at DESC", (run_id,))
        else:
            cur.execute("SELECT * FROM control_approvals ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_full_audit_bundle(run_id: str) -> dict[str, Any] | None:
    """Consolidated audit package for a given run ID."""
    run = get_audit_run(run_id)
    if not run:
        return None

    steps = list_audit_steps(run_id)
    findings = list_audit_findings(run_id=run_id)
    evidence = list_audit_evidence(run_id)
    approvals = list_audit_approvals(run_id)

    meta = run.get("metadata") or {}
    pol_id = run.get("policy_id") or meta.get("policy_id")
    policy_doc = None
    if pol_id:
        policy_doc = get_policy_document(pol_id)
    if not policy_doc and meta.get("filename"):
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT * FROM compliance_policy_documents WHERE filename = ? ORDER BY uploaded_at DESC LIMIT 1",
                (meta.get("filename"),),
            )
            row = cur.fetchone()
            if row:
                policy_doc = dict(row)
        finally:
            conn.close()

    policy_used = None
    if policy_doc:
        policy_used = {
            "policy_id": policy_doc["policy_id"],
            "filename": policy_doc["filename"],
            "title": policy_doc.get("title") or policy_doc["filename"],
            "format": policy_doc.get("format", "PDF"),
            "file_size": f"{max(1, policy_doc.get('file_size_bytes', 0) // 1024)} KB",
            "cloudinary_url": policy_doc.get("cloudinary_url", ""),
            "extracted_text": policy_doc.get("extracted_text", ""),
            "rules_summary": policy_doc.get("rules_summary", ""),
            "uploaded_at": policy_doc.get("uploaded_at", ""),
        }

    return {
        "run": run,
        "policy_used": policy_used,
        "steps": steps,
        "findings": findings,
        "evidence": evidence,
        "approvals": approvals,
        "merkle_verification": {
            "source_merkle_root": run.get("source_merkle_root"),
            "archive_merkle_root": run.get("archive_merkle_root"),
            "merkle_verified": bool(run.get("merkle_verified")),
            "attestation_token": run.get("attestation_token"),
            "records_verified": run.get("records_processed") or run.get("records_eligible"),
        } if run.get("source_merkle_root") else None,
    }


def save_policy_document(doc: dict[str, Any]) -> dict[str, Any]:
    """Persist compliance policy document metadata and extracted text to SQLite."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO compliance_policy_documents (
                policy_id, filename, title, control_id, archetype, format,
                mime_type, file_size_bytes, file_sha256, cloudinary_public_id,
                cloudinary_url, extracted_text, rules_summary, uploaded_at,
                uploaded_by, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                doc["policy_id"],
                doc["filename"],
                doc["title"],
                doc.get("control_id", ""),
                doc.get("archetype", "D"),
                doc["format"],
                doc.get("mime_type", "application/octet-stream"),
                int(doc["file_size_bytes"]),
                doc["file_sha256"],
                doc["cloudinary_public_id"],
                doc["cloudinary_url"],
                doc.get("extracted_text", ""),
                doc.get("rules_summary", ""),
                doc["uploaded_at"],
                doc.get("uploaded_by", "Compliance Analyst"),
                doc.get("status", "Ready"),
            ),
        )
        conn.commit()
        return doc
    finally:
        conn.close()


def get_policy_document(policy_id: str) -> dict[str, Any] | None:
    """Retrieve policy document by policy_id."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM compliance_policy_documents WHERE policy_id = ?", (policy_id,))
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_policy_document_by_sha256(file_sha256: str) -> dict[str, Any] | None:
    """Retrieve policy document by exact content SHA-256 hash."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM compliance_policy_documents WHERE file_sha256 = ?", (file_sha256,))
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_policy_documents(control_id: str | None = None) -> list[dict[str, Any]]:
    """List all persisted policy documents ordered by upload date descending."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        if control_id:
            cur.execute(
                "SELECT * FROM compliance_policy_documents WHERE control_id = ? ORDER BY uploaded_at DESC",
                (control_id,),
            )
        else:
            cur.execute("SELECT * FROM compliance_policy_documents ORDER BY uploaded_at DESC")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def delete_policy_document(policy_id: str) -> bool:
    """Delete policy document record by policy_id."""
    init_audit_tables()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM compliance_policy_documents WHERE policy_id = ?", (policy_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()

