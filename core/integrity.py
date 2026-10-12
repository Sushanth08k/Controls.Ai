import datetime
from decimal import Decimal
import hashlib
import json
from typing import Any
import uuid

HASH_SPEC_VERSION = "1"


def normalize_value(val: Any, val_type: str = "text") -> str | None:
    """Normalize a Python value according to canonical hashing specification."""
    if val is None:
        return None

    col_type = val_type.lower()

    if "int" in col_type or col_type == "bigint" or col_type == "smallint":
        return str(int(val))

    if "numeric" in col_type or "decimal" in col_type:
        d = Decimal(str(val))
        return str(d)

    if col_type == "boolean" or col_type == "bool":
        if isinstance(val, str):
            return "t" if val.lower() in ("t", "true", "1") else "f"
        return "t" if bool(val) else "f"

    if col_type == "date":
        if isinstance(val, (datetime.date, datetime.datetime)):
            return val.strftime("%Y-%m-%d")
        return str(val)

    if col_type == "timestamptz":
        if isinstance(val, str):
            dt = datetime.datetime.fromisoformat(val)
        else:
            dt = val
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        dt_utc = dt.astimezone(datetime.timezone.utc)
        return dt_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    if col_type == "timestamp":
        if isinstance(val, str):
            dt = datetime.datetime.fromisoformat(val)
        else:
            dt = val
        return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")

    if col_type == "uuid":
        return str(val).lower()

    if col_type == "bytea":
        if isinstance(val, bytes):
            return val.hex().lower()
        return str(val).lower()

    if col_type in ("json", "jsonb"):
        if isinstance(val, str):
            try:
                parsed = json.loads(val)
                return json.dumps(parsed, separators=(",", ":"), sort_keys=True)
            except Exception:
                return val
        return json.dumps(val, separators=(",", ":"), sort_keys=True)

    return str(val)


def column_atom(val: Any, val_type: str = "text") -> str:
    """Format single column value into canonical atom: 'N' or 'V<len>:<val>'."""
    norm = normalize_value(val, val_type)
    if norm is None:
        return "N"
    byte_len = len(norm.encode("utf-8"))
    return f"V{byte_len}:{norm}"


def compute_row_hash(columns: list[tuple[Any, str]]) -> str:
    """Compute canonical SHA-256 row hash for ordered list of (value, type)."""
    atoms = [column_atom(val, col_type) for val, col_type in columns]
    concat_atoms = "".join(atoms)
    return hashlib.sha256(concat_atoms.encode("utf-8")).hexdigest()


def generate_pg_column_atom_sql(col_name: str, col_type: str) -> str:
    """Generate SQL expression for a single column's atom."""
    col_t = col_type.lower()
    if col_t == "timestamptz":
        expr = f"to_char({col_name} AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')"
    elif col_t == "timestamp":
        expr = f"to_char({col_name}, 'YYYY-MM-DD\"T\"HH24:MI:SS.US')"
    elif col_t == "date":
        expr = f"to_char({col_name}, 'YYYY-MM-DD')"
    elif col_t in ("bool", "boolean"):
        expr = f"CASE WHEN {col_name} THEN 't' ELSE 'f' END"
    elif col_t == "uuid":
        expr = f"lower({col_name}::text)"
    elif col_t == "bytea":
        expr = f"encode({col_name}, 'hex')"
    elif col_t in ("json", "jsonb"):
        expr = f"{col_name}::jsonb::text"
    else:
        expr = f"{col_name}::text"

    return f"CASE WHEN {col_name} IS NULL THEN 'N' ELSE 'V' || octet_length({expr}) || ':' || {expr} END"


def generate_pg_row_hash_sql(columns: list[tuple[str, str]]) -> str:
    """Generate SQL expression to compute row_hash in-database."""
    atom_exprs = [generate_pg_column_atom_sql(c_name, c_type) for c_name, c_type in columns]
    concat_sql = " || ".join(atom_exprs)
    return f"encode(sha256(({concat_sql})::bytea), 'hex')"


def compute_leaf_hash(pk: str, row_hash_hex: str) -> bytes:
    """Compute leaf hash: SHA256(0x00 || len(pk_bytes)[4B big-endian] || pk_bytes || row_hash_bytes)."""
    pk_bytes = str(pk).encode("utf-8")
    row_bytes = bytes.fromhex(row_hash_hex)
    pk_len_bytes = len(pk_bytes).to_bytes(4, byteorder="big")
    prefix = bytes([0x00])
    return hashlib.sha256(prefix + pk_len_bytes + pk_bytes + row_bytes).digest()


def compute_node_hash(left_bytes: bytes, right_bytes: bytes) -> bytes:
    """Compute intermediate node hash: SHA256(0x01 || L || R)."""
    prefix = bytes([0x01])
    return hashlib.sha256(prefix + left_bytes + right_bytes).digest()


def build_merkle_root(items: list[tuple[str, str]]) -> str:
    """Build Merkle root from list of (pk, row_hash_hex).

    - Leaves are sorted by PK
    - Odd nodes are promoted, not duplicated
    """
    if not items:
        return "0" * 64

    # Sort strictly by PK string
    sorted_items = sorted(items, key=lambda x: str(x[0]))
    current_level = [compute_leaf_hash(pk, r_hash) for pk, r_hash in sorted_items]

    while len(current_level) > 1:
        next_level: list[bytes] = []
        i = 0
        while i < len(current_level):
            if i + 1 < len(current_level):
                # Pair of nodes
                parent = compute_node_hash(current_level[i], current_level[i + 1])
                next_level.append(parent)
                i += 2
            else:
                # Odd node: promoted, not duplicated
                next_level.append(current_level[i])
                i += 1
        current_level = next_level

    return current_level[0].hex()


def bisect_breaks(
    source_items: list[tuple[str, str]],
    target_items: list[tuple[str, str]],
) -> list[dict[str, str]]:
    """Compare source and target items to identify missing, extra, or mismatched rows."""
    src_map = {str(pk): r_hash for pk, r_hash in source_items}
    tgt_map = {str(pk): r_hash for pk, r_hash in target_items}

    breaks: list[dict[str, str]] = []

    # Check for missing in target or mismatched
    for pk, src_hash in src_map.items():
        if pk not in tgt_map:
            breaks.append({"pk": pk, "type": "missing_in_target"})
        elif tgt_map[pk] != src_hash:
            breaks.append({"pk": pk, "type": "mismatched"})

    # Check for extra in target
    for pk in tgt_map:
        if pk not in src_map:
            breaks.append({"pk": pk, "type": "extra_in_target"})

    # Sort breaks by PK for deterministic output
    return sorted(breaks, key=lambda x: x["pk"])
