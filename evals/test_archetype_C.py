from core.ledger import Ledger
from workflows.archetypes.reconcile_wf import ReconcileWorkflow


def test_reconcile_identical_datasets_merkle_match() -> None:
    """Archetype C: When datasets are identical, Merkle roots match with 0 breaks."""
    ledger = Ledger()
    wf = ReconcileWorkflow(ledger=ledger)

    rows = [
        {"id": 1, "txn_date": "2024-01-01", "amount": 100.50, "currency": "USD"},
        {"id": 2, "txn_date": "2024-01-02", "amount": 250.00, "currency": "USD"},
        {"id": 3, "txn_date": "2024-01-03", "amount": 50.25, "currency": "EUR"},
    ]
    cols = [("id", "int"), ("txn_date", "date"), ("amount", "numeric"), ("currency", "text")]

    res = wf.run(
        source_ref="core_banking.transactions",
        target_ref="archive.transactions_archive",
        source_rows=rows,
        target_rows=rows,
        columns=cols,
        pk_field="id",
    )

    assert res.root_src == res.root_tgt
    assert len(res.breaks) == 0
    assert res.counts.src == 3
    assert res.counts.tgt == 3

    # Ledger audit verification
    valid, err = ledger.verify_chain()
    assert valid is True
    assert err is None


def test_reconcile_fault_detection_bisection() -> None:
    """Archetype C: All integrity faults (mismatch, missing, extra) are bisected and classified."""
    ledger = Ledger()
    wf = ReconcileWorkflow(ledger=ledger)

    cols = [("id", "int"), ("txn_date", "date"), ("amount", "numeric"), ("currency", "text")]

    src_rows = [
        {"id": 1, "txn_date": "2024-01-01", "amount": 100.00, "currency": "USD"},
        {"id": 2, "txn_date": "2024-01-02", "amount": 200.00, "currency": "USD"},
        {"id": 3, "txn_date": "2024-01-03", "amount": 300.00, "currency": "USD"},
    ]

    # Target has:
    # id 1: amount mutated (200.00 instead of 100.00) -> mismatched
    # id 2: missing in target
    # id 4: extra in target
    tgt_rows = [
        {"id": 1, "txn_date": "2024-01-01", "amount": 999.00, "currency": "USD"},  # Mutated
        {"id": 3, "txn_date": "2024-01-03", "amount": 300.00, "currency": "USD"},
        {"id": 4, "txn_date": "2024-01-04", "amount": 400.00, "currency": "USD"},  # Extra
    ]

    res = wf.run(
        source_ref="src",
        target_ref="tgt",
        source_rows=src_rows,
        target_rows=tgt_rows,
        columns=cols,
        pk_field="id",
    )

    assert res.root_src != res.root_tgt
    assert len(res.breaks) == 3

    break_map = {b.pk: b.type for b in res.breaks}
    assert break_map["1"] == "mismatched"
    assert break_map["2"] == "missing_in_target"
    assert break_map["4"] == "extra_in_target"
