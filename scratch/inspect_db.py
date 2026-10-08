import sqlite3
from pathlib import Path

db_path = Path("sim/bank_core.db").resolve()
print(f"Database path: {db_path} (exists: {db_path.exists()})")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"Tables: {tables}")

for t in ['vuln_assets', 'vuln_scan_runs', 'vuln_tickets', 'vuln_exceptions', 'db_vulnerabilities', 'control_approvals']:
    if t in tables:
        count = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"{t} count: {count}")
    else:
        print(f"{t}: DOES NOT EXIST")

if 'db_vulnerabilities' in tables:
    cols = [col[1] for col in cur.execute("PRAGMA table_info(db_vulnerabilities)").fetchall()]
    print(f"db_vulnerabilities columns: {cols}")
    if 'asset_id' in cols:
        null_asset_ids = cur.execute("SELECT COUNT(*) FROM db_vulnerabilities WHERE asset_id IS NULL").fetchone()[0]
        print(f"db_vulnerabilities with asset_id NULL: {null_asset_ids}")
        rows = cur.execute("SELECT vulnerability_id, database_name, asset_id, severity, status, exception_status FROM db_vulnerabilities").fetchall()
        for r in rows:
            print("  vuln row:", r)

if 'control_approvals' in tables:
    cols = [col[1] for col in cur.execute("PRAGMA table_info(control_approvals)").fetchall()]
    print(f"control_approvals columns: {cols}")
    vuln_gates = cur.execute("SELECT gate_id, control_id, gate_type, status, maker_id, approved_by FROM control_approvals WHERE control_id LIKE '%VULN%'").fetchall()
    print(f"vuln gates in control_approvals ({len(vuln_gates)}):")
    for g in vuln_gates:
        print("  gate:", g)

if 'vuln_tickets' in tables:
    tickets = cur.execute("SELECT * FROM vuln_tickets").fetchall()
    print(f"vuln_tickets rows ({len(tickets)}):")
    for t in tickets:
        print("  ticket:", t)

if 'vuln_exceptions' in tables:
    exceptions = cur.execute("SELECT * FROM vuln_exceptions").fetchall()
    print(f"vuln_exceptions rows ({len(exceptions)}):")
    for e in exceptions:
        print("  exception:", e)

if 'vuln_assets' in tables:
    assets = cur.execute("SELECT * FROM vuln_assets").fetchall()
    print(f"vuln_assets rows ({len(assets)}):")
    for a in assets:
        print("  asset:", a)
