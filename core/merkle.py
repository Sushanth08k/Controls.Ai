import hashlib
from typing import Literal


def compute_leaf_hash(pk: str, row_hash_hex: str) -> bytes:
    """Compute leaf hash: SHA256(0x00 || len(pk_bytes)[4B big-endian] || pk_bytes || row_hash_bytes)."""
    pk_bytes = str(pk).encode("utf-8")
    row_bytes = bytes.fromhex(row_hash_hex)
    pk_len_bytes = len(pk_bytes).to_bytes(4, byteorder="big")
    prefix = bytes([0x00])
    return hashlib.sha256(prefix + pk_len_bytes + pk_bytes + row_bytes).digest()


def compute_node_hash(left_bytes: bytes, right_bytes: bytes) -> bytes:
    """Compute intermediate node hash: SHA256(0x01 || L || R)."""
    prefix = bytes([0x01])
    return hashlib.sha256(prefix + left_bytes + right_bytes).digest()


def build_merkle_root(items: list[tuple[str, str]]) -> str:
    """Build Merkle root from list of (pk, row_hash_hex).

    - Leaves are sorted by PK
    - Odd nodes are promoted, not duplicated
    """
    if not items:
        return "0" * 64

    # Sort strictly by PK string
    sorted_items = sorted(items, key=lambda x: str(x[0]))
    current_level = [compute_leaf_hash(pk, r_hash) for pk, r_hash in sorted_items]

    while len(current_level) > 1:
        next_level: list[bytes] = []
        i = 0
        while i < len(current_level):
            if i + 1 < len(current_level):
                # Pair of nodes
                parent = compute_node_hash(current_level[i], current_level[i + 1])
                next_level.append(parent)
                i += 2
            else:
                # Odd node: promoted, not duplicated
                next_level.append(current_level[i])
                i += 1
        current_level = next_level

    return current_level[0].hex()


def bisect_breaks(
    source_items: list[tuple[str, str]],
    target_items: list[tuple[str, str]],
) -> list[dict[str, str]]:
    """Compare source and target items to identify missing, extra, or mismatched rows."""
    src_map = {str(pk): r_hash for pk, r_hash in source_items}
    tgt_map = {str(pk): r_hash for pk, r_hash in target_items}

    breaks: list[dict[str, str]] = []

    # Check for missing in target or mismatched
    for pk, src_hash in src_map.items():
        if pk not in tgt_map:
            breaks.append({"pk": pk, "type": "missing_in_target"})
        elif tgt_map[pk] != src_hash:
            breaks.append({"pk": pk, "type": "mismatched"})

    # Check for extra in target
    for pk in tgt_map:
        if pk not in src_map:
            breaks.append({"pk": pk, "type": "extra_in_target"})

    # Sort breaks by PK for deterministic output
    return sorted(breaks, key=lambda x: x["pk"])
