from typing import Any
from contracts.models import Citation, PolicyIR


def verify_citation(doc_text: str, citation: Citation, expected_value: Any) -> bool:
    """Deterministic citation verification.

    Checks:
    1. doc_text[char_start:char_end] matches citation.quote
    2. The cited quote contains the extracted value after normalization
    """
    span_text = doc_text[citation.char_start : citation.char_end]
    if span_text != citation.quote:
        # Check if whitespace-normalized match
        if span_text.strip() != citation.quote.strip():
            return False

    if hasattr(expected_value, "value") and hasattr(expected_value, "unit"):
        val_str = f"{expected_value.value} {expected_value.unit}".lower()
    elif isinstance(expected_value, dict) and "value" in expected_value and "unit" in expected_value:
        val_str = f"{expected_value['value']} {expected_value['unit']}".lower()
    else:
        val_str = str(expected_value).lower()

    quote_lower = citation.quote.lower()
    return val_str in quote_lower or str(getattr(expected_value, "value", expected_value)).lower() in quote_lower


def reconcile_extractions(ir_a: PolicyIR, ir_b: PolicyIR) -> tuple[bool, list[str]]:
    """Field-by-field reconciliation between dual extraction models A (reasoner) and B (fast).

    Returns (is_concordant, list_of_disagreements). Any disagreement triggers HITL gate.
    """
    disagreements: list[str] = []

    fields_to_check = [
        "policy_id",
        "entity",
        "source_table",
        "date_column",
        "retention",
        "action",
        "archive_target",
    ]

    for f in fields_to_check:
        val_a = getattr(ir_a, f)
        val_b = getattr(ir_b, f)
        if val_a != val_b:
            disagreements.append(f"Field '{f}' mismatch: Model A='{val_a}' vs Model B='{val_b}'")

    # Exclusions check
    excl_a = {e.predicate_ref for e in ir_a.exclusions}
    excl_b = {e.predicate_ref for e in ir_b.exclusions}
    if excl_a != excl_b:
        disagreements.append(f"Exclusions mismatch: Model A={sorted(excl_a)} vs Model B={sorted(excl_b)}")

    return len(disagreements) == 0, disagreements
