from typing import Any
from core.ledger import Ledger
from tools.connectors.base import BaseConnector, ConnectorDescription, OperationDescriptor


class EvidenceConnector(BaseConnector):
    """Evidence Ledger Connector implementing append-only audit trail and integrity verification."""

    def __init__(self, ledger: Ledger | None = None) -> None:
        self.ledger = ledger or Ledger()

    def describe(self) -> ConnectorDescription:
        return ConnectorDescription(
            name="evidence",
            version="1.0.0",
            operations=[
                OperationDescriptor(
                    name="append",
                    side_effect="reversible_write",
                    role_template="ledger_appender",
                    description="Append an evidence entry to the immutable hash chain",
                ),
                OperationDescriptor(
                    name="get",
                    side_effect="read",
                    role_template="ledger_reader",
                    description="Retrieve a ledger entry by sequence number or evidence_id",
                ),
                OperationDescriptor(
                    name="verify_chain",
                    side_effect="read",
                    role_template="ledger_reader",
                    description="Verify mathematical integrity of the cryptographic hash chain",
                ),
            ],
        )

    def health(self) -> bool:
        valid, _ = self.ledger.verify_chain()
        return valid

    def execute(self, operation: str, args: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        if operation == "append":
            entry = self.ledger.append(
                control_id=args["control_id"],
                control_version=args["control_version"],
                definition_sha256=args["definition_sha256"],
                run_id=args["run_id"],
                kind=args.get("kind", "evidence"),
                payload=args["payload"],
                payload_ref=args.get("payload_ref", "direct"),
                actor=context.get("actor", "gateway"),
            )
            return {"entry": entry.to_dict(), "entry_hash": entry.entry_hash, "seq": entry.seq}

        elif operation == "get":
            seq = args.get("seq")
            for entry in self.ledger.entries:
                if entry.seq == seq or entry.evidence_id == args.get("evidence_id"):
                    return {"entry": entry.to_dict()}
            return {"entry": None}

        elif operation == "verify_chain":
            valid, error = self.ledger.verify_chain(
                start_seq=args.get("start_seq", 1),
                end_seq=args.get("end_seq"),
            )
            return {"valid": valid, "error": error, "total_entries": len(self.ledger.entries)}

        else:
            raise NotImplementedError(f"Operation '{operation}' not supported by evidence connector")
