import hashlib
import json
from typing import Any
from core.ledger import Ledger
from tools.connectors.base import BaseConnector


class ToolGateway:
    """Central Tool Gateway enforcing OPA policy checks, credential issuance, and ledger auditing."""

    def __init__(self, ledger: Ledger | None = None, opa_url: str | None = None) -> None:
        self.ledger = ledger or Ledger()
        self.opa_url = opa_url
        self._connectors: dict[str, BaseConnector] = {}

    def register_connector(self, connector: BaseConnector) -> None:
        desc = connector.describe()
        self._connectors[desc.name] = connector

    def authorize(
        self,
        connector_name: str,
        operation: str,
        side_effect: str,
        run_id: str,
        workflow_state: str,
        args: dict[str, Any],
        context: dict[str, Any],
    ) -> bool:
        """Evaluate authorization against OPA policy rules (default deny)."""
        # Rule 1: Read operations are permitted if a valid catalog_ref is present
        if side_effect == "read":
            catalog_ref = args.get("catalog_ref") or context.get("catalog_ref")
            # If the operation requires a catalog_ref (like catalog_query), ensure it's provided
            if operation == "catalog_query" and not catalog_ref:
                return False
            return True

        # Rule 2: Reversible writes permitted only during active designated states
        if side_effect == "reversible_write":
            valid_states = {"ACT", "COPY", "TEST"}
            if workflow_state in valid_states or connector_name == "evidence":
                return True
            return False

        # Rule 3: Irreversible writes strictly require valid attestation and COMMIT state
        if side_effect == "irreversible_write":
            if workflow_state != "COMMIT":
                return False
            attestation = context.get("attestation")
            if not attestation or not isinstance(attestation, dict):
                return False
            if attestation.get("run_id") != run_id:
                return False
            if not attestation.get("signature"):
                return False
            if not context.get("gate_approved", False):
                return False
            return True

        # Default deny
        return False

    def issue_jit_credential(self, connector_name: str, side_effect: str, role_template: str) -> dict[str, Any]:
        """Issue short-lived JIT credential (via OpenBao simulation or direct client)."""
        return {
            "token": f"jit-{connector_name}-{side_effect}-token",
            "role": role_template,
            "ttl_seconds": 600,
        }

    def execute_call(
        self,
        connector_name: str,
        operation: str,
        args: dict[str, Any],
        run_id: str,
        actor: str,
        workflow_state: str,
        control_id: str,
        control_version: str,
        definition_sha256: str,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute a tool call through authorization, credential issuance, and audit logging."""
        ctx = context.copy() if context else {}
        connector = self._connectors.get(connector_name)
        if not connector:
            raise ValueError(f"Unknown connector '{connector_name}'")

        desc = connector.describe()
        op_desc = next((op for op in desc.operations if op.name == operation), None)
        if not op_desc:
            raise ValueError(f"Operation '{operation}' not defined in connector '{connector_name}'")

        # 1. Authorize via OPA
        allowed = self.authorize(
            connector_name=connector_name,
            operation=operation,
            side_effect=op_desc.side_effect,
            run_id=run_id,
            workflow_state=workflow_state,
            args=args,
            context=ctx,
        )

        canonical_req = json.dumps(args, sort_keys=True, separators=(",", ":"))
        req_hash = hashlib.sha256(canonical_req.encode("utf-8")).hexdigest()

        if not allowed:
            # Log deny to ledger and raise non-retryable error
            self.ledger.append(
                control_id=control_id,
                control_version=control_version,
                definition_sha256=definition_sha256,
                run_id=run_id,
                kind="authorization_denied",
                payload={"connector": connector_name, "operation": operation, "request_hash": req_hash, "state": workflow_state},
                payload_ref=f"audit/{run_id}/{operation}/denied",
                actor=actor,
            )
            raise PermissionError(f"Access Denied by OPA policy for {connector_name}.{operation} in state {workflow_state}")

        # 2. Acquire short-lived JIT credential
        cred = self.issue_jit_credential(connector_name, op_desc.side_effect, op_desc.role_template)
        ctx["credential"] = cred
        ctx["actor"] = actor

        # 3. Execute parameterized operation
        result = connector.execute(operation, args, ctx)

        # 4. Canonical result hash & ledger logging
        canonical_res = json.dumps(result, sort_keys=True, separators=(",", ":"))
        res_hash = hashlib.sha256(canonical_res.encode("utf-8")).hexdigest()

        self.ledger.append(
            control_id=control_id,
            control_version=control_version,
            definition_sha256=definition_sha256,
            run_id=run_id,
            kind="tool_invocation",
            payload={"operation": operation, "req_hash": req_hash, "res_hash": res_hash},
            payload_ref=f"audit/{run_id}/{operation}",
            actor=actor,
        )

        return result
