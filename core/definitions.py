import hashlib
import json
from pathlib import Path
from typing import Any
import yaml
from contracts.models import ControlDefinition

CONTROLS_DIR = Path(__file__).resolve().parent.parent / "controls"
BASELINES_DIR = Path(__file__).resolve().parent.parent / "catalogs" / "baselines"


def compute_definition_hash(defn: ControlDefinition) -> str:
    """Compute deterministic SHA-256 hash of canonical definition JSON representation."""
    data = defn.model_dump(mode="json")
    canonical_json = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


class DefinitionRegistry:
    """Manages loaded control definitions, schema validation, and maker-checker approval state."""

    def __init__(self, controls_dir: Path | None = None) -> None:
        self.controls_dir = controls_dir or CONTROLS_DIR
        self._definitions: dict[str, ControlDefinition] = {}
        self._definition_hashes: dict[str, str] = {}  # control_id -> sha256
        self._approved_hashes: set[str] = set()

    def register_approval(self, definition_hash: str) -> None:
        """Mark a definition hash as approved via maker-checker governance."""
        self._approved_hashes.add(definition_hash)

    def is_approved(self, definition_hash: str) -> bool:
        """Check if definition hash is approved."""
        return definition_hash in self._approved_hashes

    def load_definition_from_dict(self, data: dict[str, Any], approve_auto: bool = False) -> tuple[ControlDefinition, str]:
        """Validate and load a control definition from dict."""
        defn = ControlDefinition.model_validate(data)
        self.validate_referential_integrity(defn)

        defn_hash = compute_definition_hash(defn)
        self._definitions[defn.control_id] = defn
        self._definition_hashes[defn.control_id] = defn_hash

        if approve_auto:
            self.register_approval(defn_hash)

        return defn, defn_hash

    def load_definition_from_file(self, file_path: Path, approve_auto: bool = False) -> tuple[ControlDefinition, str]:
        """Load YAML control definition from file."""
        with open(file_path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return self.load_definition_from_dict(data, approve_auto=approve_auto)

    def load_all(self, approve_existing: bool = True) -> dict[str, ControlDefinition]:
        """Load all definitions in controls directory."""
        if not self.controls_dir.exists():
            return {}

        loaded = {}
        for yml_file in self.controls_dir.glob("*.yaml"):
            defn, defn_hash = self.load_definition_from_file(yml_file, approve_auto=approve_existing)
            loaded[defn.control_id] = defn
        return loaded

    def list_all(self, approve_existing: bool = True) -> list[ControlDefinition]:
        """Return a list of all loaded definitions."""
        return list(self.load_all(approve_existing=approve_existing).values())


    def validate_referential_integrity(self, defn: ControlDefinition) -> None:
        """Enforce Section 6.1 fail-closed referential integrity rules."""
        evidence_ids = {ev.id for ev in defn.evidence}

        # 1. Every rule.evidence_ref must match a declared evidence id
        for rule in defn.rules:
            if rule.evidence_ref not in evidence_ids:
                raise ValueError(
                    f"Integrity Error: Rule '{rule.id}' references undeclared evidence id '{rule.evidence_ref}'"
                )

        # 2. Check baseline existence if specified
        if defn.baseline_ref:
            baseline_path = BASELINES_DIR.parent / defn.baseline_ref
            # allow relative to catalogs/
            if not baseline_path.exists():
                raise FileNotFoundError(f"Baseline file '{defn.baseline_ref}' does not exist at {baseline_path}")

        # 3. Disallow raw SQL in control definitions (must use catalog_ref)
        raw_dump = json.dumps(defn.model_dump())
        for keyword in ("SELECT ", "INSERT ", "UPDATE ", "DELETE ", "DROP "):
            if keyword in raw_dump:
                raise ValueError(f"Integrity Error: Raw SQL keyword '{keyword}' found in definition. SQL must reside in catalogs only.")

    def get_definition(self, control_id: str) -> ControlDefinition | None:
        return self._definitions.get(control_id)

    def get_hash(self, control_id: str) -> str | None:
        return self._definition_hashes.get(control_id)


# Global default registry
default_registry = DefinitionRegistry()
