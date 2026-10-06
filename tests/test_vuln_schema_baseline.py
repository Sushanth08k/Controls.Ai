from sim.database import reseed_compliance_databases, get_core_connection
from sim.vuln_schema import reseed_vulnerability_tables


def test_vuln_schema_and_reseed_idempotency():
    """Verify vuln schema tables, columns, indexes, and reseed idempotency."""
    # Run reseed twice
    r1 = reseed_compliance_databases()
    r2 = reseed_compliance_databases()
    assert r1["status"] == "reseeded"
    assert r2["status"] == "reseeded"

    conn = get_core_connection()
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]

    # Verify tables
    expected_tables = ["vuln_assets", "vuln_scan_runs", "vuln_tickets", "vuln_exceptions"]
    for t in expected_tables:
        assert t in tables, f"Table {t} must exist in database"
        count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        assert count > 0, f"Table {t} must contain seeded records"

    # Verify columns on db_vulnerabilities
    vuln_cols = [r[1] for r in conn.execute("PRAGMA table_info(db_vulnerabilities)").fetchall()]
    assert "asset_id" in vuln_cols, "asset_id column must exist on db_vulnerabilities"
    assert "last_seen" in vuln_cols, "last_seen column must exist on db_vulnerabilities"

    # Verify unique index
    indexes = [r[1] for r in conn.execute("PRAGMA index_list(db_vulnerabilities)").fetchall()]
    assert "idx_vuln_db_cve" in indexes, "idx_vuln_db_cve must exist on db_vulnerabilities"

    # Verify columns on control_approvals
    appr_cols = [r[1] for r in conn.execute("PRAGMA table_info(control_approvals)").fetchall()]
    assert "gate_type" in appr_cols, "gate_type column must exist on control_approvals"
    assert "payload_json" in appr_cols, "payload_json column must exist on control_approvals"

    conn.close()
