from typing import Any
from tools.connectors.base import BaseConnector, ConnectorDescription, OperationDescriptor


class CveIntelConnector(BaseConnector):
    """CVE Intelligence connector providing local cached NVD, CISA KEV, and FIRST EPSS lookup."""

    def __init__(self, cache_snapshot_id: str = "cache-v1-snapshot") -> None:
        self.cache_snapshot_id = cache_snapshot_id
        # Seeded mock vulnerability intelligence data
        self._vulns = {
            "postgresql:15.1": [
                {
                    "cve_id": "CVE-2022-41862",
                    "cvss": 7.5,
                    "kev": False,
                    "epss": 0.05,
                    "description": "PostgreSQL client memory disclosure flaw",
                }
            ],
            "postgresql:14.0": [
                {
                    "cve_id": "CVE-2021-3677",
                    "cvss": 6.5,
                    "kev": False,
                    "epss": 0.02,
                    "description": "PostgreSQL memory disclosure via partition tree",
                }
            ],
        }

    def describe(self) -> ConnectorDescription:
        return ConnectorDescription(
            name="cve_intel",
            version="1.0.0",
            operations=[
                OperationDescriptor(
                    name="cpe_lookup",
                    side_effect="read",
                    role_template="cve_reader",
                    description="Look up known CVEs for a given product and version",
                ),
                OperationDescriptor(
                    name="kev_status",
                    side_effect="read",
                    role_template="cve_reader",
                    description="Check if a CVE ID is active on CISA Known Exploited Vulnerabilities",
                ),
                OperationDescriptor(
                    name="epss",
                    side_effect="read",
                    role_template="cve_reader",
                    description="Retrieve EPSS exploit probability score for a CVE ID",
                ),
            ],
        )

    def health(self) -> bool:
        return True

    def execute(self, operation: str, args: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        if operation == "cpe_lookup":
            product = args.get("product", "").lower()
            version = args.get("version", "").strip()
            key = f"{product}:{version}"
            matches = self._vulns.get(key, [])
            return {
                "product": product,
                "version": version,
                "matches": matches,
                "match_count": len(matches),
                "cache_snapshot_id": self.cache_snapshot_id,
            }

        elif operation == "kev_status":
            cve_id = args.get("cve_id")
            return {"cve_id": cve_id, "in_kev": False, "cache_snapshot_id": self.cache_snapshot_id}

        elif operation == "epss":
            cve_id = args.get("cve_id")
            return {"cve_id": cve_id, "epss_score": 0.01, "cache_snapshot_id": self.cache_snapshot_id}

        else:
            raise NotImplementedError(f"Operation '{operation}' not supported by cve_intel connector")
