import datetime
import logging
import sqlite3
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DB_DIR = Path(__file__).resolve().parent
CORE_DB_PATH = DB_DIR / "bank_core.db"


def get_core_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(CORE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_vuln_tables(conn: sqlite3.Connection | None = None) -> None:
    """Idempotently create and extend vulnerability tables in bank_core.db."""
    should_close = False
    if conn is None:
        conn = get_core_connection()
        should_close = True

    try:
        cur = conn.cursor()

        # 1. vuln_assets table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS vuln_assets (
            asset_id TEXT PRIMARY KEY,
            database_name TEXT NOT NULL,
            tier TEXT NOT NULL,
            owner TEXT NOT NULL,
            owner_manager TEXT NOT NULL,
            in_scope INTEGER NOT NULL DEFAULT 1,
            internet_facing INTEGER NOT NULL DEFAULT 0,
            scan_frequency TEXT NOT NULL DEFAULT 'DAILY',
            last_scan_date TEXT
        );
        """)

        # 2. vuln_scan_runs table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS vuln_scan_runs (
            scan_id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            scan_name TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            status TEXT NOT NULL,
            assets_scanned INTEGER DEFAULT 1,
            FOREIGN KEY (asset_id) REFERENCES vuln_assets(asset_id)
        );
        """)

        # 3. vuln_tickets table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS vuln_tickets (
            ticket_id TEXT PRIMARY KEY,
            finding_id TEXT UNIQUE NOT NULL,
            assignee TEXT,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            due_date TEXT,
            status TEXT NOT NULL,
            escalated_at TEXT,
            escalated_to TEXT,
            rescan_verified_at TEXT,
            closed_date TEXT,
            run_id TEXT
        );
        """)

        # 4. vuln_exceptions table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS vuln_exceptions (
            exception_id TEXT PRIMARY KEY,
            finding_id TEXT NOT NULL,
            requested_by TEXT NOT NULL,
            requested_at TEXT NOT NULL,
            justification TEXT,
            compensating_control TEXT,
            expires_at TEXT,
            status TEXT NOT NULL,
            approved_by TEXT,
            approved_at TEXT,
            gate_id TEXT
        );
        """)

        # Guarded ALTER TABLE for db_vulnerabilities
        cur.execute("PRAGMA table_info(db_vulnerabilities)")
        vuln_cols = {r[1] for r in cur.fetchall()}
        if "asset_id" not in vuln_cols:
            cur.execute("ALTER TABLE db_vulnerabilities ADD COLUMN asset_id TEXT")
        if "last_seen" not in vuln_cols:
            cur.execute("ALTER TABLE db_vulnerabilities ADD COLUMN last_seen TEXT")

        # Unique index on (database_name, cve_id) if not exists
        cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vuln_db_cve ON db_vulnerabilities(database_name, cve_id);
        """)

        # Guarded ALTER TABLE for control_approvals
        cur.execute("PRAGMA table_info(control_approvals)")
        appr_cols = {r[1] for r in cur.fetchall()}
        if "gate_type" not in appr_cols:
            cur.execute("ALTER TABLE control_approvals ADD COLUMN gate_type TEXT DEFAULT 'archival_signoff'")
        if "payload_json" not in appr_cols:
            cur.execute("ALTER TABLE control_approvals ADD COLUMN payload_json TEXT")

        # Check if vuln_assets is empty or db_vulnerabilities has NULL asset_id
        cur.execute("SELECT COUNT(*) FROM vuln_assets")
        assets_count = cur.fetchone()[0]
        cur.execute("PRAGMA table_info(db_vulnerabilities)")
        has_vuln_tbl = cur.fetchall()
        null_asset_count = 0
        if has_vuln_tbl:
            cur.execute("SELECT COUNT(*) FROM db_vulnerabilities WHERE asset_id IS NULL")
            null_asset_count = cur.fetchone()[0]

        if assets_count == 0 or null_asset_count > 0:
            try:
                _populate_vuln_seed_data(conn, cur)
            except Exception as e:
                logger.warning(f"Auto-seed during init_vuln_tables encountered non-fatal error: {e}")

        conn.commit()
    except Exception as e:
        logger.error(f"Error initializing vuln tables: {e}", exc_info=True)
        raise
    finally:
        if should_close:
            conn.close()


def generate_vuln_seed_data(ref_date: datetime.date | None = None) -> dict[str, list[tuple[Any, ...]]]:
    """Generate deterministic seed rows with intentional compliance defects."""
    if ref_date is None:
        ref_date = datetime.date.today()

    def d(days_ago: int) -> str:
        return (ref_date - datetime.timedelta(days=days_ago)).isoformat()

    assets = [
        ("AST-001", "core_banking_sim", "Tier 1", "db_admin_core", "eng_dir_payments", 1, 1, "DAILY", d(0)),
        ("AST-002", "vuln_target", "Tier 1", "sec_ops_team", "ciso_direct", 1, 1, "DAILY", d(0)),
        ("AST-003", "payments-db", "Tier 1", "payments_lead", "vp_engineering", 1, 0, "DAILY", d(0)),
        ("AST-004", "customer-data-store", "Tier 2", "crm_data_owner", "head_data_ops", 1, 0, "WEEKLY", d(3)),
        ("AST-005", "auth-db", "Tier 1", "identity_team", "head_cyber_sec", 1, 1, "DAILY", d(0)),
        ("AST-006", "reporting-replica", "Tier 2", "analytics_lead", "vp_analytics", 1, 0, "WEEKLY", None),  # Defect: Never scanned
        ("AST-007", "legacy-vault", "Tier 1", "vault_admin", "ciso_direct", 1, 1, "DAILY", d(4)),  # Defect: Failed scan & stale
    ]

    scan_runs = [
        ("SCAN-001", "AST-001", "Daily Automated Vulnerability Scan", f"{d(0)}T02:00:00Z", f"{d(0)}T02:20:00Z", "COMPLETED", 1),
        ("SCAN-002", "AST-002", "Daily Automated Vulnerability Scan", f"{d(0)}T02:30:00Z", f"{d(0)}T02:50:00Z", "COMPLETED", 1),
        ("SCAN-003", "AST-003", "Daily Automated Vulnerability Scan", f"{d(0)}T03:00:00Z", f"{d(0)}T03:15:00Z", "COMPLETED", 1),
        ("SCAN-004", "AST-004", "Weekly Security Assessment", f"{d(3)}T04:00:00Z", f"{d(3)}T04:45:00Z", "COMPLETED", 1),
        ("SCAN-005", "AST-005", "Daily Automated Vulnerability Scan", f"{d(0)}T01:00:00Z", f"{d(0)}T01:25:00Z", "COMPLETED", 1),
        ("SCAN-007", "AST-007", "Daily Scheduled Assessment", f"{d(4)}T05:00:00Z", f"{d(4)}T05:05:00Z", "FAILED", 1),  # Defect: Scan failed
    ]

    # Tickets:
    # VULN-001, VULN-002, VULN-004 intentionally omitted -> Defect: untracked Critical/High findings
    tickets = [
        ("TKT-2026-0003", "VULN-003", None, d(12), "sec_scanner_bot", d(-18), "OPEN", None, None, None, None, None),  # Defect: missing assignee
        ("TKT-2026-0005", "VULN-005", "crm_data_owner", d(25), "sec_scanner_bot", d(5), "CLOSED", None, None, d(7), d(7), None),
        ("TKT-2026-0006", "VULN-006", "db_admin_core", d(50), "sec_scanner_bot", d(20), "CLOSED", None, None, d(12), d(12), None),
        ("TKT-2026-0008", "VULN-008", "crm_data_owner", d(40), "sec_scanner_bot", d(33), "CLOSED", None, None, None, d(38), None),  # Defect: no rescan_verified_at
        ("TKT-2026-0009", "VULN-009", "db_admin_core", d(45), "sec_scanner_bot", d(-45), "OPEN", None, None, None, None, None),
        ("TKT-2026-0010", "VULN-010", "payments_lead", d(35), "sec_scanner_bot", d(-25), "IN_PROGRESS", None, None, None, None, None),
        ("TKT-2026-0011", "VULN-011", "sec_ops_team", d(55), "sec_scanner_bot", d(25), "OPEN", None, None, None, None, None),  # Defect: overdue 25d, no escalation
        ("TKT-2026-0012", "VULN-012", "identity_team", d(2), "sec_scanner_bot", None, "OPEN", None, None, None, None, None),  # Defect: missing due date
    ]

    exceptions = [
        ("EXC-2026-0042", "VULN-007", "ciso_direct", d(20), "Vendor patch causes settlement regression; v2 hotfix scheduled", "WAF virtual patching + isolated auth subnet", d(-30), "APPROVED", "ciso_approval_board", d(19), None),  # Valid approved
        ("EXC-2026-0002", "VULN-004", "sec_ops_team", d(40), "Temporary deferral for maintenance", "IP restricted access", d(5), "EXPIRED", "ciso_approval_board", d(38), None),  # Defect: Expired
        ("EXC-2026-0003", "VULN-002", "sec_ops_team", d(10), "Remediation requires failover test planned next sprint", "Network segmentation applied", d(-45), "PENDING_APPROVAL", None, None, None),  # Defect: Pending approval
        ("EXC-2026-0004", "VULN-003", "payments_lead", d(11), "Legacy library dependency", None, d(-60), "APPROVED", None, d(10), None),  # Defect: Approved without compensating control/approver
    ]

    return {
        "assets": assets,
        "scan_runs": scan_runs,
        "tickets": tickets,
        "exceptions": exceptions,
    }


def _populate_vuln_seed_data(conn: sqlite3.Connection, cur: sqlite3.Cursor, ref_date: datetime.date | None = None) -> dict[str, Any]:
    if ref_date is None:
        ref_date = datetime.date.today()

    def d(days_ago: int) -> str:
        return (ref_date - datetime.timedelta(days=days_ago)).isoformat()

    seed = generate_vuln_seed_data(ref_date)
    cur.executemany("INSERT OR REPLACE INTO vuln_assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", seed["assets"])
    cur.executemany("INSERT OR REPLACE INTO vuln_scan_runs VALUES (?, ?, ?, ?, ?, ?, ?)", seed["scan_runs"])
    cur.executemany("INSERT OR REPLACE INTO vuln_tickets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", seed["tickets"])
    cur.executemany("INSERT OR REPLACE INTO vuln_exceptions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", seed["exceptions"])

    # Update db_vulnerabilities asset_id and last_seen columns
    asset_mapping = {
        "core_banking_sim": "AST-001",
        "vuln_target": "AST-002",
        "payments-db": "AST-003",
        "customer-data-store": "AST-004",
        "auth-db": "AST-005",
    }
    for db_name, ast_id in asset_mapping.items():
        cur.execute("UPDATE db_vulnerabilities SET asset_id = ? WHERE database_name = ?", (ast_id, db_name))

    # Real seed ground truth:
    # Open findings: last_seen is current date (seen by latest scan)
    # Patched / Closed findings: last_seen is patched_at date (not seen since remediated)
    cur.execute("UPDATE db_vulnerabilities SET last_seen = ? WHERE status IN ('OPEN', 'IN_PROGRESS')", (d(0),))
    cur.execute("UPDATE db_vulnerabilities SET last_seen = patched_at WHERE status IN ('PATCHED', 'CLOSED')")

    # Mirror expired exception EXC-2026-0002 on VULN-004
    cur.execute("""
    UPDATE db_vulnerabilities
    SET exception_status = 'EXPIRED',
        exception_id = 'EXC-2026-0002',
        exception_reason = 'Temporary deferral for maintenance',
        exception_approved_by = 'ciso_approval_board',
        exception_expires_at = ?
    WHERE vulnerability_id = 'VULN-004'
    """, (d(5),))

    # Mirror pending exception EXC-2026-0003 on VULN-002
    cur.execute("""
    UPDATE db_vulnerabilities
    SET exception_status = 'PENDING_APPROVAL',
        exception_id = 'EXC-2026-0003',
        exception_reason = 'Remediation requires failover test planned next sprint',
        exception_approved_by = NULL,
        exception_expires_at = ?
    WHERE vulnerability_id = 'VULN-002'
    """, (d(-45),))

    return {
        "status": "reseeded",
        "assets_count": len(seed["assets"]),
        "scan_runs_count": len(seed["scan_runs"]),
        "tickets_count": len(seed["tickets"]),
        "exceptions_count": len(seed["exceptions"]),
    }


def reseed_vulnerability_tables(ref_date: datetime.date | None = None) -> dict[str, Any]:
    """Wipe and reseed vuln_* tables and refresh db_vulnerabilities columns."""
    vuln_control_id = "CTL" + "-" + "VULN-001"
    init_vuln_tables()
    conn = get_core_connection()
    try:
        cur = conn.cursor()

        # Delete existing data in vuln_* tables only
        cur.execute("DELETE FROM vuln_tickets")
        cur.execute("DELETE FROM vuln_exceptions")
        cur.execute("DELETE FROM vuln_scan_runs")
        cur.execute("DELETE FROM vuln_assets")

        # Delete control_approvals / audit items where control_id = vuln_control_id
        cur.execute("DELETE FROM control_approvals WHERE control_id = ?", (vuln_control_id,))
        cur.execute("DELETE FROM control_findings WHERE control_id = ?", (vuln_control_id,))
        cur.execute("DELETE FROM control_evidence WHERE control_id = ?", (vuln_control_id,))
        cur.execute(
            "DELETE FROM control_audit_steps WHERE run_id IN (SELECT run_id FROM control_audit_runs WHERE control_id = ?)",
            (vuln_control_id,),
        )
        cur.execute("DELETE FROM control_audit_runs WHERE control_id = ?", (vuln_control_id,))

        res = _populate_vuln_seed_data(conn, cur, ref_date)
        conn.commit()
        return res
    finally:
        conn.close()
