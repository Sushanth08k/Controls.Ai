import datetime
from core.hashing import column_atom, compute_row_hash, generate_pg_row_hash_sql, normalize_value
from core.merkle import bisect_breaks, build_merkle_root


def test_hashing_disambiguation_12_3_vs_1_23() -> None:
    """Ensure (12, 3) != (1, 23) due to length-prefixed value atoms."""
    hash_1 = compute_row_hash([(12, "int"), (3, "int")])
    hash_2 = compute_row_hash([(1, "int"), (23, "int")])
    assert hash_1 != hash_2, "Prefix length must disambiguate (12, 3) from (1, 23)"


def test_hashing_null_vs_empty_string() -> None:
    """Ensure NULL produces 'N' while empty string produces 'V0:'."""
    atom_null = column_atom(None, "text")
    atom_empty = column_atom("", "text")

    assert atom_null == "N"
    assert atom_empty == "V0:"
    assert atom_null != atom_empty

    hash_null = compute_row_hash([(None, "text")])
    hash_empty = compute_row_hash([("", "text")])
    assert hash_null != hash_empty, "NULL and empty string must produce different row hashes"


def test_hashing_timezone_equivalences() -> None:
    """Equal instants in different timezones must normalize to same UTC representation."""
    dt_utc = datetime.datetime(2026, 9, 28, 12, 0, 0, tzinfo=datetime.timezone.utc)
    # +05:30 IST equivalent instant
    ist_tz = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
    dt_ist = datetime.datetime(2026, 9, 28, 17, 30, 0, tzinfo=ist_tz)

    hash_utc = compute_row_hash([(dt_utc, "timestamptz")])
    hash_ist = compute_row_hash([(dt_ist, "timestamptz")])

    assert hash_utc == hash_ist, "Equal instants in different timezones must hash equally"


def test_hashing_multibyte_utf8() -> None:
    """Multi-byte characters must use byte length rather than character count."""
    euro = "€"  # 1 char, 3 bytes in UTF-8
    atom_euro = column_atom(euro, "text")
    assert atom_euro == "V3:€"

    emoji = "🚀"  # 1 char, 4 bytes in UTF-8
    atom_emoji = column_atom(emoji, "text")
    assert atom_emoji == "V4:🚀"


def test_merkle_root_determinism_and_odd_node_promotion() -> None:
    """Merkle root is deterministic regardless of input ordering, and handles odd leaf counts."""
    leaves_1 = [("1", "aa" * 32), ("2", "bb" * 32), ("3", "cc" * 32)]
    leaves_2 = [("3", "cc" * 32), ("1", "aa" * 32), ("2", "bb" * 32)]

    root_1 = build_merkle_root(leaves_1)
    root_2 = build_merkle_root(leaves_2)

    assert root_1 == root_2
    assert len(root_1) == 64


def test_merkle_bisect_breaks() -> None:
    """Bisect accurately categorizes missing, extra, and mismatched records."""
    src = [
        ("1", "11" * 32),
        ("2", "22" * 32),
        ("3", "33" * 32),
    ]
    tgt = [
        ("1", "11" * 32),
        ("2", "99" * 32),  # Mismatch
        ("4", "44" * 32),  # Extra in target (3 is missing)
    ]

    breaks = bisect_breaks(src, tgt)
    assert len(breaks) == 3

    break_types = {(b["pk"], b["type"]) for b in breaks}
    assert ("2", "mismatched") in break_types
    assert ("3", "missing_in_target") in break_types
    assert ("4", "extra_in_target") in break_types
