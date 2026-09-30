import datetime
from decimal import Decimal
import hashlib
import json
from typing import Any
import uuid

HASH_SPEC_VERSION = "1"


def normalize_value(val: Any, val_type: str = "text") -> str | None:
    """Normalize a Python value according to Section 9.4 specification."""
    if val is None:
        return None

    col_type = val_type.lower()

    if "int" in col_type or col_type == "bigint" or col_type == "smallint":
        return str(int(val))

    if "numeric" in col_type or "decimal" in col_type:
        d = Decimal(str(val))
        # Default fixed scale if specified, else normalize as Decimal string
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
            # Parse and convert to UTC
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
        if isinstance(val, uuid.UUID):
            return str(val).lower()
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

    # Default text / string
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
    """Generate PostgreSQL SQL expression for a single column's atom.

    CASE WHEN c IS NULL THEN 'N' ELSE 'V' || octet_length(x) || ':' || x END
    """
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
    """Generate PostgreSQL SQL expression to compute row_hash in-database."""
    atom_expressions = [generate_pg_column_atom_sql(name, t) for name, t in columns]
    joined = " || ".join(atom_expressions)
    return f"encode(sha256(convert_to({joined}, 'UTF8')), 'hex')"
