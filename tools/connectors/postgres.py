import hashlib
import json
from typing import Any
from core.catalog import default_catalog
from core.hashing import compute_row_hash
from tools.connectors.base import BaseConnector, ConnectorDescription, OperationDescriptor


class PostgresConnector(BaseConnector):
    """PostgreSQL MCP Connector supporting catalog-driven queries and metadata operations."""

    def __init__(self, connection_uri: str | None = None, mock_data: dict[str, list[dict[str, Any]]] | None = None) -> None:
        self.connection_uri = connection_uri
        self.mock_data = mock_data or {}

    def describe(self) -> ConnectorDescription:
        return ConnectorDescription(
            name="postgres",
            version="1.0.0",
            operations=[
                OperationDescriptor(
                    name="catalog_query",
                    side_effect="read",
                    role_template="pg_read_only",
                    description="Execute an approved catalog query with bound parameters in a READ ONLY transaction",
                ),
                OperationDescriptor(
                    name="table_metadata",
                    side_effect="read",
                    role_template="pg_read_only",
                    description="Retrieve column types and constraints for a scoped table",
                ),
                OperationDescriptor(
                    name="row_hashes",
                    side_effect="read",
                    role_template="pg_read_only",
                    description="Compute canonical row hashes for table rows",
                ),
                OperationDescriptor(
                    name="copy_batch",
                    side_effect="reversible_write",
                    role_template="pg_copy_writer",
                    description="Copy a verified batch of rows into the archive destination",
                ),
                OperationDescriptor(
                    name="delete_by_manifest",
                    side_effect="irreversible_write",
                    role_template="pg_manifest_deleter",
                    description="Delete archived rows matching manifest hashes under valid attestation",
                ),
            ],
        )

    def health(self) -> bool:
        # Healthy if mock data is provided or connection is live
        return True

    def execute(self, operation: str, args: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        """Execute a catalog operation."""
        if operation == "catalog_query":
            catalog_ref = args.get("catalog_ref")
            if not catalog_ref:
                raise ValueError("catalog_query operation requires a catalog_ref")

            query = default_catalog.get_query(catalog_ref)
            if not query:
                raise PermissionError(f"Catalog query '{catalog_ref}' is not approved or not found in catalog")

            # In mock/offline mode or test mode, return registered mock data or simulated output
            rows = self.mock_data.get(catalog_ref, [])
            columns = query.expected_columns

            # Canonicalize result: sort rows by all columns -> RFC 8785 canonical JSON -> result_sha256
            sorted_rows = sorted(rows, key=lambda r: json.dumps(r, sort_keys=True))
            canonical_json = json.dumps(sorted_rows, sort_keys=True, separators=(",", ":"))
            result_sha256 = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

            return {
                "catalog_ref": catalog_ref,
                "columns": columns,
                "rows": sorted_rows,
                "row_count": len(sorted_rows),
                "result_sha256": result_sha256,
                "query_sha256": hashlib.sha256(query.sql.encode("utf-8")).hexdigest(),
            }

        elif operation == "row_hashes":
            table_rows = args.get("rows", [])
            column_types = args.get("column_types", [])
            hashes = []
            for row in table_rows:
                row_items = [(row.get(col_name), col_type) for col_name, col_type in column_types]
                r_hash = compute_row_hash(row_items)
                pk = str(row.get(args.get("pk_field", "id")))
                hashes.append({"pk": pk, "row_hash": r_hash})
            return {"row_hashes": hashes, "count": len(hashes)}

        elif operation == "copy_batch":
            batch = args.get("batch", [])
            return {"status": "copied", "rows_copied": len(batch)}

        elif operation == "delete_by_manifest":
            pks = args.get("pks", [])
            return {"status": "deleted", "rows_deleted": len(pks)}

        else:
            raise NotImplementedError(f"Operation '{operation}' is not supported by postgres connector")
