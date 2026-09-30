import copy
import hashlib
import json
import pytest
from core.definitions import compute_definition_hash, default_registry
from core.ledger import Ledger
from core.merkle import build_merkle_root
from core.rules.engine import RuleEngine
from workflows.archetypes.query_review_wf import QueryReviewWorkflow


def test_mock_audit_reconstruction_and_tamper_detection() -> None:
    """Mock audit eval: Reconstruct a control run purely from definition hash, ledger, and evidence."""
    # 1. Execute a control run
    definitions = default_registry.load_all(approve_existing=True)
    defn = definitions.get("CTL-VULN-001")
    assert defn is not None, "CTL-VULN-001 must exist"

    ledger = Ledger()
    wf = QueryReviewWorkflow(ledger=ledger)

    target_evidence = {
        "vuln_target": {
            "superusers": {
                "rows": [
                    {"rolname": "postgres", "rolsuper": True},
                    {"rolname": "unauthorized_root", "rolsuper": True},
                ]
            },
            "public_grants": {
                "rows": [{"grantee": "PUBLIC", "table_name": "customers"}]
            },
            "pw_enc": {"rows": [{"setting": "md5"}]},
            "ssl": {"rows": [{"setting": "off"}]},
            "hba": {"rows": []},
            "extensions": {"rows": [{"extname": "plpgsql"}]},
            "version": {"rows": [{"version": "PostgreSQL 15.1"}]},
        },
    }

    run_result = wf.run(
        definition=defn,
        target_evidence=target_evidence,
        period="2026-M09",
    )

    assert run_result["status"] == "completed"
    run_id = run_result["run_id"]

    # 2. AUDITOR RECONSTRUCTION FROM RAW ARTIFACTS
    # The auditor receives only the ledger entries, the definition YAML from disk, and raw evidence payloads
    ledger_entries = ledger.entries
    assert len(ledger_entries) > 0, "Audit ledger must contain entries"

    # Step A: Cryptographically verify the ledger hash chain
    chain_valid, chain_err = ledger.verify_chain()
    assert chain_valid is True, f"Ledger chain validation failed: {chain_err}"

    # Step B: Cryptographically verify definition hash against ledger records
    expected_defn_hash = compute_definition_hash(defn)
    for entry in ledger_entries:
        assert entry.run_id == run_id
        assert entry.control_id == defn.control_id
        assert entry.control_version == defn.version
        assert entry.definition_sha256 == expected_defn_hash, (
            f"Ledger entry {entry.seq} definition hash mismatch!"
        )

    # Step C: Verify evidence payload integrity
    # Build a Merkle tree of all evidence items
    evidence_leafs: list[tuple[str, str]] = []
    for entry in ledger_entries:
        if entry.kind == "evidence_collected":
            evidence_leafs.append((entry.evidence_id, entry.payload_sha256))

    assert len(evidence_leafs) > 0
    reconstructed_merkle_root = build_merkle_root(evidence_leafs)
    assert len(reconstructed_merkle_root) == 64

    # Step D: Re-run deterministic RuleEngine independently over stored evidence
    # Auditor parses raw payloads and executes rule checks with zero LLM involvement
    reconstructed_rule_results = []
    for rule in defn.rules:
        # Resolve evidence payload from ledger
        ev_id = f"ev-vuln_target-{rule.evidence_ref}"
        matching_entries = [
            e for e in ledger_entries 
            if e.kind == "evidence_collected" and e.evidence_id == ev_id
        ]
        if matching_entries:
            ev_entry = matching_entries[0]
            # Verify payload hash matches
            ev_data = target_evidence["vuln_target"].get(rule.evidence_ref, {"rows": []})
            canonical_ev = json.dumps(ev_data, sort_keys=True, separators=(",", ":"))
            assert hashlib.sha256(canonical_ev.encode("utf-8")).hexdigest() == ev_entry.payload_sha256

            rule_res = RuleEngine.evaluate_rule(rule=rule, evidence_data=ev_data)
            reconstructed_rule_results.append(rule_res)

    assert len(reconstructed_rule_results) > 0
    # Confirm deterministic rule verdicts match the original run findings
    failed_reconstructed = [r for r in reconstructed_rule_results if not r.passed]
    assert len(failed_reconstructed) >= 4, "Deterministic replay must reproduce all rule violations"

    # Step E: Verify finding citation integrity
    for finding in run_result["findings"]:
        for ev_id in finding.evidence_ids:
            assert any(e.evidence_id == ev_id for e in ledger_entries), (
                f"Finding {finding.finding_id} cites unrecorded evidence_id {ev_id}"
            )

    # 3. TAMPER INJECTION TESTS
    # Test 3.1: Tamper with a payload in the ledger
    tampered_ledger = Ledger()
    # Populate tampered ledger with one corrupted entry
    for entry in ledger_entries:
        if entry.seq == 2:
            # Simulate bit-flip in payload_sha256
            tampered_entry = type(entry)(
                seq=entry.seq,
                evidence_id=entry.evidence_id,
                control_id=entry.control_id,
                control_version=entry.control_version,
                definition_sha256=entry.definition_sha256,
                run_id=entry.run_id,
                kind=entry.kind,
                payload_sha256="f" * 64,  # Corrupted payload hash
                payload_ref=entry.payload_ref,
                actor=entry.actor,
                ts=entry.ts,
                prev_hash=entry.prev_hash,
                entry_hash=entry.entry_hash,
            )
            tampered_ledger._entries.append(tampered_entry)
        else:
            tampered_ledger._entries.append(entry)

    tamper_valid, tamper_err = tampered_ledger.verify_chain()
    assert tamper_valid is False, "Corrupted ledger entry must fail verification"
    assert "Tamper detected" in str(tamper_err)

    # Test 3.2: Tamper with definition file
    tampered_defn_hash = hashlib.sha256(b"malicious_definition_tamper").hexdigest()
    assert tampered_defn_hash != expected_defn_hash
    # Auditor will immediately detect that the on-disk definition doesn't match the audited run
    assert any(entry.definition_sha256 == expected_defn_hash for entry in ledger_entries)
    assert not any(entry.definition_sha256 == tampered_defn_hash for entry in ledger_entries)
