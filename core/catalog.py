from pathlib import Path
from typing import Any
import yaml
from pydantic import BaseModel, ConfigDict

CATALOGS_DIR = Path(__file__).resolve().parent.parent / "catalogs"


class CatalogQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    version: int
    title: str
    sql: str
    expected_columns: list[str]
    notes: str | None = None


class CatalogManager:
    """Manages loaded queries and catalog integrity."""

    def __init__(self, catalogs_dir: Path | None = None) -> None:
        self.catalogs_dir = catalogs_dir or CATALOGS_DIR
        self._queries: dict[str, CatalogQuery] = {}
        self.reload_catalogs()

    def reload_catalogs(self) -> None:
        queries_file = self.catalogs_dir / "queries" / "postgres.yaml"
        if queries_file.exists():
            with open(queries_file, encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                raw_queries = data.get("queries", [])
                for q in raw_queries:
                    query = CatalogQuery.model_validate(q)
                    self._queries[query.id] = query

    def get_query(self, query_id: str) -> CatalogQuery | None:
        return self._queries.get(query_id)

    def is_approved_query(self, query_id: str) -> bool:
        return query_id in self._queries


# Global singleton instance
default_catalog = CatalogManager()
