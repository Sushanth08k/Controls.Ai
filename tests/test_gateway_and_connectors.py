import pytest
from core.ledger import Ledger
from tools.connectors.evidence import EvidenceConnector
from tools.connectors.postgres import PostgresConnector
from tools.gateway import ToolGateway


def test_catalog_query_enforcement() -> None:
    """Ensure catalog query succeeds for approved catalog IDs and fails for unapproved ones."""
    mock_data = {
        "VQ-001": [
            {"rolname": "postgres", "rolsuper": True, "rolcanlogin": True},
            {"rolname": "app_user", "rolsuper": False, "rolcanlogin": True},
        ]
    }
    connector = PostgresConnector(mock_data=mock_data)

    # Approved query VQ-001
    res = connector.execute("catalog_query", {"catalog_ref": "VQ-001"}, {})
    assert res["catalog_ref"] == "VQ-001"
    assert res["row_count"] == 2
    assert "result_sha256" in res
    assert len(res["result_sha256"]) == 64

    # Unapproved query VQ-999 must raise PermissionError
    with pytest.raises(PermissionError) as exc_info:
        connector.execute("catalog_query", {"catalog_ref": "VQ-999"}, {})
    assert "not approved or not found" in str(exc_info.value)


def test_gateway_authorization_denied_and_logged() -> None:
    """Unauthorized operations are denied by OPA policy and logged to the evidence ledger."""
    ledger = Ledger()
    gateway = ToolGateway(ledger=ledger)
    pg = PostgresConnector()
    gateway.register_connector(pg)

    run_id = "test-run-123"

    # Attempt irreversible delete without COMMIT state and without attestation
    with pytest.raises(PermissionError) as exc_info:
        gateway.execute_call(
            connector_name="postgres",
            operation="delete_by_manifest",
            args={"pks": [1, 2, 3]},
            run_id=run_id,
            actor="test_agent",
            workflow_state="ACT",
            control_id="CTL-ARCH-001",
            control_version="1.0.0",
            definition_sha256="def123",
            context={},
        )
    assert "Access Denied by OPA policy" in str(exc_info.value)

    # Verify that the denial was logged to the ledger
    denial_entries = [e for e in ledger.entries if e.kind == "authorization_denied"]
    assert len(denial_entries) == 1
    denial = denial_entries[0]
    assert denial.run_id == run_id
    assert denial.actor == "test_agent"
    assert denial.payload_ref == f"audit/{run_id}/delete_by_manifest/denied"

    # Verify hash chain continuity is preserved even after logged denial
    valid, err = ledger.verify_chain()
    assert valid is True
    assert err is None


def test_gateway_irreversible_write_authorized_with_attestation() -> None:
    """In COMMIT state with valid attestation and gate approval, irreversible write succeeds."""
    ledger = Ledger()
    gateway = ToolGateway(ledger=ledger)
    pg = PostgresConnector()
    gateway.register_connector(pg)

    run_id = "test-run-456"
    valid_context = {
        "attestation": {
            "run_id": run_id,
            "signature": "valid-ed25519-signature-hex",
        },
        "gate_approved": True,
    }

    res = gateway.execute_call(
        connector_name="postgres",
        operation="delete_by_manifest",
        args={"pks": [101, 102]},
        run_id=run_id,
        actor="verifier_worker",
        workflow_state="COMMIT",
        control_id="CTL-ARCH-001",
        control_version="1.0.0",
        definition_sha256="def456",
        context=valid_context,
    )

    assert res["status"] == "deleted"
    assert res["rows_deleted"] == 2

    # Verify execution was audited in the ledger
    invocations = [e for e in ledger.entries if e.kind == "tool_invocation"]
    assert len(invocations) == 1
    assert invocations[0].run_id == run_id


def test_evidence_connector_operations() -> None:
    """Verify evidence connector append and chain verification."""
    ledger = Ledger()
    ev_connector = EvidenceConnector(ledger=ledger)

    append_res = ev_connector.execute(
        "append",
        {
            "control_id": "CTL-VULN-001",
            "control_version": "1.0.0",
            "definition_sha256": "sha123",
            "run_id": "run-001",
            "payload": {"finding": "superusers found"},
        },
        {"actor": "evaluator"},
    )

    assert append_res["seq"] == 1
    assert "entry_hash" in append_res

    verify_res = ev_connector.execute("verify_chain", {}, {})
    assert verify_res["valid"] is True
    assert verify_res["total_entries"] == 1
