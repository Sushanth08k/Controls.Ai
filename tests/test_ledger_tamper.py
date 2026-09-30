from core.ledger import Ledger, LedgerEntry


def test_ledger_append_and_verify_chain() -> None:
    """Verify clean ledger chain passes verification."""
    ledger = Ledger()
    ledger.append("CTL-TEST-001", "1.0.0", "defhash1", "run-1", "evidence", {"key": "val1"}, "ref1")
    ledger.append("CTL-TEST-001", "1.0.0", "defhash1", "run-1", "evidence", {"key": "val2"}, "ref2")
    ledger.append("CTL-TEST-001", "1.0.0", "defhash1", "run-1", "finding", {"key": "val3"}, "ref3")

    valid, error = ledger.verify_chain()
    assert valid is True
    assert error is None
    assert len(ledger.entries) == 3


def test_ledger_tamper_payload_detected() -> None:
    """Modifying a payload/hash in an entry must be caught by verify_chain."""
    ledger = Ledger()
    e1 = ledger.append("CTL-TEST-001", "1.0.0", "defhash1", "run-1", "evidence", "payload1", "ref1")
    e2 = ledger.append("CTL-TEST-001", "1.0.0", "defhash1", "run-1", "evidence", "payload2", "ref2")

    # Tamper with e1 in the internal list
    tampered_e1 = LedgerEntry(
        seq=e1.seq,
        evidence_id=e1.evidence_id,
        control_id=e1.control_id,
        control_version=e1.control_version,
        definition_sha256=e1.definition_sha256,
        run_id=e1.run_id,
        kind=e1.kind,
        payload_sha256="00" * 32,  # Tampered payload hash!
        payload_ref=e1.payload_ref,
        actor=e1.actor,
        ts=e1.ts,
        prev_hash=e1.prev_hash,
        entry_hash=e1.entry_hash,
    )
    ledger._entries[0] = tampered_e1

    valid, error = ledger.verify_chain()
    assert valid is False
    assert "Tamper detected at seq 1" in str(error)


def test_ledger_chain_break_detected() -> None:
    """Deleting or swapping an entry breaks the prev_hash continuity."""
    ledger = Ledger()
    ledger.append("CTL-TEST-001", "1.0.0", "defhash1", "run-1", "evidence", "p1", "ref1")
    e2 = ledger.append("CTL-TEST-001", "1.0.0", "defhash1", "run-1", "evidence", "p2", "ref2")
    ledger.append("CTL-TEST-001", "1.0.0", "defhash1", "run-1", "evidence", "p3", "ref3")

    # Tamper e2's prev_hash
    tampered_e2 = LedgerEntry(
        seq=e2.seq,
        evidence_id=e2.evidence_id,
        control_id=e2.control_id,
        control_version=e2.control_version,
        definition_sha256=e2.definition_sha256,
        run_id=e2.run_id,
        kind=e2.kind,
        payload_sha256=e2.payload_sha256,
        payload_ref=e2.payload_ref,
        actor=e2.actor,
        ts=e2.ts,
        prev_hash="11" * 32,  # Invalid prev_hash
        entry_hash=e2.entry_hash,
    )
    ledger._entries[1] = tampered_e2

    valid, error = ledger.verify_chain()
    assert valid is False
    assert "Chain break at seq 2" in str(error)
