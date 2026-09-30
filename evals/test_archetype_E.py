import hashlib
from pathlib import Path
from contracts.models import Citation, PolicyExclusion, PolicyIR, RetentionSpec
from core.ledger import Ledger
from workflows.archetypes.doc_review_wf import DocReviewWorkflow


def get_sample_policy_ir(retention_years: int = 7) -> PolicyIR:
    doc_path = Path(__file__).resolve().parent.parent / "sim" / "policies" / "retention" / "core_banking_retention.txt"
    doc_text = doc_path.read_text(encoding="utf-8")
    doc_sha256 = hashlib.sha256(doc_text.encode("utf-8")).hexdigest()

    # Locate span for "transactions"
    start_tx = doc_text.index("entity 'transactions'") + len("entity '")
    end_tx = start_tx + len("transactions")

    # Locate span for "7 years"
    start_ret = doc_text.index("period of 7 years") + len("period of ")
    end_ret = start_ret + len("7 years")

    return PolicyIR(
        policy_id="POL-FIN-2024-001",
        version="1.0.0",
        effective_from="2024-01-01",
        source_doc_sha256=doc_sha256,
        entity="transactions",
        source_table="transactions",
        date_column="txn_date",
        retention=RetentionSpec(value=retention_years, unit="years"),
        exclusions=[PolicyExclusion(predicate_ref="legal_hold", reason="Regulatory legal hold")],
        action="archive_then_delete",
        archive_target="transactions_archive",
        citations={
            "entity": Citation(page=1, char_start=start_tx, char_end=end_tx, quote="transactions"),
            "retention": Citation(page=1, char_start=start_ret, char_end=end_ret, quote="7 years"),
        },
    )


def test_doc_review_concordant_dual_extraction() -> None:
    """Archetype E: When dual models agree and citations verify, workflow completes without HITL gate."""
    doc_path = Path(__file__).resolve().parent.parent / "sim" / "policies" / "retention" / "core_banking_retention.txt"
    doc_text = doc_path.read_text(encoding="utf-8")
    doc_sha256 = hashlib.sha256(doc_text.encode("utf-8")).hexdigest()

    ledger = Ledger()
    wf = DocReviewWorkflow(ledger=ledger)

    ir_a = get_sample_policy_ir(retention_years=7)
    ir_b = get_sample_policy_ir(retention_years=7)

    res = wf.run(
        document_content=doc_text,
        doc_sha256=doc_sha256,
        mock_dual_ir=(ir_a, ir_b),
    )

    assert res["status"] == "completed"
    assert res["is_concordant"] is True
    assert res["needs_hitl_gate"] is False
    assert len(res["citation_errors"]) == 0

    valid, err = ledger.verify_chain()
    assert valid is True
    assert err is None


def test_doc_review_interpreter_disagreement_triggers_hitl() -> None:
    """Archetype E: Disagreement between models triggers HITL policy_version gate."""
    doc_path = Path(__file__).resolve().parent.parent / "sim" / "policies" / "retention" / "core_banking_retention.txt"
    doc_text = doc_path.read_text(encoding="utf-8")
    doc_sha256 = hashlib.sha256(doc_text.encode("utf-8")).hexdigest()

    ledger = Ledger()
    wf = DocReviewWorkflow(ledger=ledger)

    # Model A says 7 years, Model B says 10 years
    ir_a = get_sample_policy_ir(retention_years=7)
    ir_b = get_sample_policy_ir(retention_years=10)

    res = wf.run(
        document_content=doc_text,
        doc_sha256=doc_sha256,
        mock_dual_ir=(ir_a, ir_b),
    )

    assert res["status"] == "pending_approval"
    assert res["is_concordant"] is False
    assert res["needs_hitl_gate"] is True
    assert len(res["disagreements"]) >= 1
    assert "retention" in res["disagreements"][0]
