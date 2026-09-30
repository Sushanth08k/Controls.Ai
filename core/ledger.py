from dataclasses import asdict, dataclass
import datetime
import hashlib
import json
from typing import Any
import uuid

GENESIS_PREV_HASH = "0" * 64


def compute_entry_hash(prev_hash: str, payload_sha256: str, ts_iso: str, actor: str) -> str:
    """Compute entry hash per Section 9.6: SHA256(prev_hash || payload_sha256 || ts_iso || actor)."""
    raw = f"{prev_hash}{payload_sha256}{ts_iso}{actor}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


@dataclass(frozen=True)
class LedgerEntry:
    seq: int
    evidence_id: str
    control_id: str
    control_version: str
    definition_sha256: str
    run_id: str
    kind: str
    payload_sha256: str
    payload_ref: str
    actor: str
    ts: datetime.datetime
    prev_hash: str
    entry_hash: str

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["ts"] = self.ts.isoformat()
        return data


class Ledger:
    """Hash-chained append-only evidence ledger manager."""

    def __init__(self) -> None:
        self._entries: list[LedgerEntry] = []

    @property
    def entries(self) -> list[LedgerEntry]:
        return list(self._entries)

    def append(
        self,
        control_id: str,
        control_version: str,
        definition_sha256: str,
        run_id: str,
        kind: str,
        payload: Any,
        payload_ref: str,
        actor: str = "system",
        evidence_id: str | None = None,
        ts: datetime.datetime | None = None,
    ) -> LedgerEntry:
        """Append a new entry with deterministic hash linking."""
        # Canonicalize payload to compute payload_sha256
        if isinstance(payload, (dict, list)):
            canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        elif isinstance(payload, bytes):
            canonical_payload = payload.decode("utf-8", errors="replace")
        else:
            canonical_payload = str(payload)

        payload_sha256 = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

        now = ts or datetime.datetime.now(datetime.timezone.utc)
        ts_iso = now.isoformat()

        if not self._entries:
            prev_hash = GENESIS_PREV_HASH
            seq = 1
        else:
            last = self._entries[-1]
            prev_hash = last.entry_hash
            seq = last.seq + 1

        entry_hash = compute_entry_hash(prev_hash, payload_sha256, ts_iso, actor)
        ev_id = evidence_id or str(uuid.uuid4())

        entry = LedgerEntry(
            seq=seq,
            evidence_id=ev_id,
            control_id=control_id,
            control_version=control_version,
            definition_sha256=definition_sha256,
            run_id=run_id,
            kind=kind,
            payload_sha256=payload_sha256,
            payload_ref=payload_ref,
            actor=actor,
            ts=now,
            prev_hash=prev_hash,
            entry_hash=entry_hash,
        )
        self._entries.append(entry)
        return entry

    def verify_chain(self, start_seq: int = 1, end_seq: int | None = None) -> tuple[bool, str | None]:
        """Verify hash chain integrity between sequence numbers."""
        if not self._entries:
            return True, None

        entries = [e for e in self._entries if e.seq >= start_seq and (end_seq is None or e.seq <= end_seq)]
        if not entries:
            return True, None

        for i, entry in enumerate(entries):
            # Check genesis or continuity
            if i == 0 and entry.seq == 1:
                if entry.prev_hash != GENESIS_PREV_HASH:
                    return False, f"Genesis entry {entry.seq} has invalid prev_hash: {entry.prev_hash}"
            elif i > 0:
                prev_entry = entries[i - 1]
                if entry.prev_hash != prev_entry.entry_hash:
                    return False, f"Chain break at seq {entry.seq}: prev_hash {entry.prev_hash} != {prev_entry.entry_hash}"

            # Check self-integrity
            ts_iso = entry.ts.isoformat()
            recomputed = compute_entry_hash(entry.prev_hash, entry.payload_sha256, ts_iso, entry.actor)
            if recomputed != entry.entry_hash:
                return False, f"Tamper detected at seq {entry.seq}: stored entry_hash {entry.entry_hash} != recomputed {recomputed}"

        return True, None
