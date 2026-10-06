import logging
import os
import sqlite3
from collections.abc import Mapping
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Base directory for SQLite databases (defaults to sim/ unless overridden by DATABASE_DIR env)
_DEFAULT_DB_DIR = Path(__file__).resolve().parent
DATABASE_DIR = Path(os.getenv("DATABASE_DIR") or _DEFAULT_DB_DIR)

CORE_DB_PATH = DATABASE_DIR / "bank_core.db"
ARCHIVE_DB_PATH = DATABASE_DIR / "bank_archive.db"


class TursoRow(Mapping):
    """Drop-in replacement for sqlite3.Row for libSQL / Turso cursor results."""

    def __init__(self, cols: list[str], row: tuple[Any, ...] | list[Any]):
        self._cols = list(cols)
        self._row = tuple(row)
        self._mapping = dict(zip(self._cols, self._row))

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return self._row[key]
        return self._mapping[key]

    def __iter__(self):
        return iter(self._cols)

    def __len__(self) -> int:
        return len(self._cols)

    def keys(self) -> list[str]:
        return self._cols

    def values(self) -> list[Any]:
        return list(self._row)

    def items(self):
        return list(self._mapping.items())

    def get(self, key: str, default: Any = None) -> Any:
        return self._mapping.get(key, default)

    def __repr__(self) -> str:
        return f"<TursoRow {self._mapping}>"


class TursoCursorWrapper:
    """Wraps libSQL Cursor to provide sqlite3.Row-like behavior and helper methods."""

    def __init__(self, cur: Any):
        self._cur = cur

    def execute(self, sql: str, params: Any = ()):
        self._cur.execute(sql, params)
        return self

    def executemany(self, sql: str, seq_of_params: Any):
        self._cur.executemany(sql, seq_of_params)
        return self

    def executescript(self, script: str):
        if hasattr(self._cur, "executescript"):
            self._cur.executescript(script)
        else:
            for statement in script.split(";"):
                stmt = statement.strip()
                if stmt:
                    self._cur.execute(stmt)
        return self

    @property
    def description(self):
        return getattr(self._cur, "description", None)

    @property
    def rowcount(self) -> int:
        return getattr(self._cur, "rowcount", -1)

    def fetchone(self) -> TursoRow | None:
        raw = self._cur.fetchone()
        if raw is None:
            return None
        cols = [c[0] for c in self._cur.description] if self._cur.description else []
        return TursoRow(cols, raw)

    def fetchall(self) -> list[TursoRow]:
        raws = self._cur.fetchall()
        cols = [c[0] for c in self._cur.description] if self._cur.description else []
        return [TursoRow(cols, r) for r in raws]

    def fetchmany(self, size: int = 1) -> list[TursoRow]:
        raws = getattr(self._cur, "fetchmany", lambda s: self.fetchall()[:s])(size)
        cols = [c[0] for c in self._cur.description] if self._cur.description else []
        return [TursoRow(cols, r) for r in raws]

    def __iter__(self):
        for r in self.fetchall():
            yield r

    def close(self):
        if hasattr(self._cur, "close"):
            self._cur.close()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cur, name)


class TursoConnectionWrapper:
    """Wraps libSQL Connection to match standard sqlite3.Connection interfaces."""

    def __init__(self, conn: Any):
        self._conn = conn
        self.row_factory = None  # No-op property for compatibility

    def cursor(self) -> TursoCursorWrapper:
        return TursoCursorWrapper(self._conn.cursor())

    def execute(self, sql: str, params: Any = ()) -> TursoCursorWrapper:
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def executemany(self, sql: str, seq_of_params: Any) -> TursoCursorWrapper:
        cur = self.cursor()
        cur.executemany(sql, seq_of_params)
        return cur

    def executescript(self, script: str) -> TursoCursorWrapper:
        cur = self.cursor()
        cur.executescript(script)
        return cur

    def commit(self):
        if hasattr(self._conn, "commit"):
            self._conn.commit()

    def rollback(self):
        if hasattr(self._conn, "rollback"):
            self._conn.rollback()

    def close(self):
        if hasattr(self._conn, "close"):
            self._conn.close()

    def sync(self):
        if hasattr(self._conn, "sync"):
            self._conn.sync()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self.commit()
        else:
            self.rollback()
        return False

    def __getattr__(self, name: str) -> Any:
        return getattr(self._conn, name)


def is_turso_enabled() -> bool:
    """Returns True if TURSO_DATABASE_URL or TURSO_URL is configured."""
    return bool(os.getenv("TURSO_DATABASE_URL") or os.getenv("TURSO_URL"))


def get_core_connection() -> sqlite3.Connection | TursoConnectionWrapper:
    """
    Returns connection to Core Banking & Audit database.
    If TURSO_DATABASE_URL is set, connects to remote Turso database via libSQL.
    Otherwise, falls back to local SQLite at CORE_DB_PATH.
    """
    turso_url = os.getenv("TURSO_DATABASE_URL") or os.getenv("TURSO_URL")
    turso_token = os.getenv("TURSO_AUTH_TOKEN") or ""

    if turso_url:
        try:
            import libsql
            raw_conn = libsql.connect(database=turso_url, auth_token=turso_token)
            return TursoConnectionWrapper(raw_conn)
        except Exception as e:
            logger.error(f"Failed to connect to Turso database ({turso_url}): {e}. Falling back to SQLite.")

    # Local SQLite fallback
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(CORE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_archive_connection() -> sqlite3.Connection | TursoConnectionWrapper:
    """
    Returns connection to Archive database.
    If TURSO_ARCHIVE_URL (or TURSO_DATABASE_URL) is set, connects via libSQL.
    Otherwise, falls back to local SQLite at ARCHIVE_DB_PATH.
    """
    archive_url = os.getenv("TURSO_ARCHIVE_URL") or os.getenv("TURSO_DATABASE_URL") or os.getenv("TURSO_URL")
    archive_token = os.getenv("TURSO_ARCHIVE_TOKEN") or os.getenv("TURSO_AUTH_TOKEN") or ""

    if archive_url:
        try:
            import libsql
            raw_conn = libsql.connect(database=archive_url, auth_token=archive_token)
            return TursoConnectionWrapper(raw_conn)
        except Exception as e:
            logger.error(f"Failed to connect to Turso Archive database ({archive_url}): {e}. Falling back to SQLite.")

    # Local SQLite fallback
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(ARCHIVE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
