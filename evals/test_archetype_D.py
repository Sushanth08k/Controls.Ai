from pathlib import Path
from contracts.models import Citation, PolicyExclusion, PolicyIR, RetentionSpec
from core.ledger import Ledger
from workflows.archetypes.execute_verify_wf import ExecuteVerifyWorkflow


def get_mock_policy_ir() -> PolicyIR:
    return PolicyIR(
        policy_id="POL-FIN-2024-001",
        version="1.0.0",
        effective_from="2024-01-01",
        source_doc_sha256="mock_sha256",
        entity="transactions",
        source_table="transactions",
        date_column="txn_date",
        retention=RetentionSpec(value=7, unit="years"),
        exclusions=[PolicyExclusion(predicate_ref="legal_hold", reason="Active hold")],
        action="archive_then_delete",
        archive_target="transactions_archive",
        citations={
            "entity": Citation(page=1, char_start=0, char_end=12, quote="transactions"),
            "retention": Citation(page=1, char_start=20, char_end=27, quote="7 years"),
        },
    )


def test_archetype_d_clean_execution() -> None:
    """Archetype D: Clean end-to-end execution of execute-and-verify workflow."""
    ledger = Ledger()
    wf = ExecuteVerifyWorkflow(ledger=ledger)

    # 3 old transactions eligible for 7-year retention purge
    source_rows = [
        {"txn_id": "101", "account_id": "ACC-1", "txn_date": "2015-01-01T00:00:00Z", "amount": 100.0, "currency": "USD"},
        {"txn_id": "102", "account_id": "ACC-2", "txn_date": "2016-01-01T00:00:00Z", "amount": 200.0, "currency": "USD"},
        # Modern transaction: not eligible
        {"txn_id": "103", "account_id": "ACC-3", "txn_date": "2025-01-01T00:00:00Z", "amount": 300.0, "currency": "USD"},
    ]
    cols = [("txn_id", "text"), ("account_id", "text"), ("txn_date", "timestamptz"), ("amount", "numeric"), ("currency", "text")]

    res = wf.run(
        policy_document_content="mock",
        policy_doc_sha256="mock",
        source_rows=source_rows,
        archive_target_rows=[],  # Initially empty, ACT will copy
        columns=cols,
        mock_policy_ir=get_mock_policy_ir(),
    )

    assert res["status"] == "completed"
    assert res["manifest_count"] == 2
    assert res["verification_passed"] is True
    assert res["merkle_root_src"] == res["merkle_root_arc"]
    assert res["rows_deleted"] == 2
    assert res["rows_skipped"] == 0

    valid, err = ledger.verify_chain()
    assert valid is True
    assert err is None


def test_archetype_d_fault_byte_flipped_in_archive() -> None:
    """Fault: Mutated byte in archive causes VERIFY FAIL -> zero commit, zero deletes."""
    ledger = Ledger()
    wf = ExecuteVerifyWorkflow(ledger=ledger)

    source_rows = [
        {"txn_id": "101", "account_id": "ACC-1", "txn_date": "2015-01-01T00:00:00Z", "amount": 100.0, "currency": "USD"},
    ]
    cols = [("txn_id", "text"), ("account_id", "text"), ("txn_date", "timestamptz"), ("amount", "numeric"), ("currency", "text")]

    # Archive already has corrupted/modified amount
    corrupted_archive = [
        {"txn_id": "101", "account_id": "ACC-1", "txn_date": "2015-01-01T00:00:00Z", "amount": 999.0, "currency": "USD"},
    ]

    res = wf.run(
        policy_document_content="mock",
        policy_doc_sha256="mock",
        source_rows=source_rows,
        archive_target_rows=corrupted_archive,
        columns=cols,
        mock_policy_ir=get_mock_policy_ir(),
    )

    assert res["status"] == "failed"
    assert res["stage"] == "VERIFY"
    assert res["verification_passed"] is False
    assert res["rows_deleted"] == 0  # CRITICAL SAFETY INVARIANT: ZERO DELETIONS


def test_archetype_d_fault_mutated_and_held_during_commit() -> None:
    """Fault: Rows mutated or placed on legal hold after VERIFY are skipped during commit."""
    ledger = Ledger()
    wf = ExecuteVerifyWorkflow(ledger=ledger)

    source_rows = [
        {"txn_id": "201", "account_id": "ACC-A", "txn_date": "2015-01-01T00:00:00Z", "amount": 100.0, "currency": "USD"},
        {"txn_id": "202", "account_id": "ACC-B", "txn_date": "2015-01-01T00:00:00Z", "amount": 200.0, "currency": "USD"},
        {"txn_id": "203", "account_id": "ACC-C", "txn_date": "2015-01-01T00:00:00Z", "amount": 300.0, "currency": "USD"},
    ]
    cols = [("txn_id", "text"), ("account_id", "text"), ("txn_date", "timestamptz"), ("amount", "numeric"), ("currency", "text")]

    res = wf.run(
        policy_document_content="mock",
        policy_doc_sha256="mock",
        source_rows=source_rows,
        archive_target_rows=[],
        columns=cols,
        mutated_rows_during_commit={"201"},  # Row 201 mutated in DB between verify and commit
        new_holds_during_commit={"ACC-B"},    # Account ACC-B placed on legal hold between verify and commit
        mock_policy_ir=get_mock_policy_ir(),
    )

    assert res["status"] == "completed"
    assert res["manifest_count"] == 3
    # 201 skipped due to mutation, 202 skipped due to hold, 203 successfully deleted
    assert res["rows_deleted"] == 1
    assert res["rows_skipped"] == 2

    # Invariant: |D| + |skipped| == |M|
    assert res["rows_deleted"] + res["rows_skipped"] == res["manifest_count"]

    skipped_reasons = {s["pk"]: s["reason"] for s in res["skipped_details"]}
    assert skipped_reasons["201"] == "row_mutated_post_verify"
    assert skipped_reasons["202"] == "legal_hold_placed_post_verify"
