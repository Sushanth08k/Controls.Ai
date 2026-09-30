from typing import Any
from fastapi import APIRouter, HTTPException
from core.definitions import default_registry

router = APIRouter(prefix="/controls", tags=["controls"])


@router.get("")
def list_controls() -> list[dict[str, Any]]:
    """List all registered control definitions."""
    definitions = default_registry.load_all(approve_existing=True)
    results = []
    for cid, defn in definitions.items():
        data = defn.model_dump(mode="json")
        data["definition_sha256"] = default_registry.get_hash(cid)
        results.append(data)
    return results


@router.get("/{control_id}")
def get_control(control_id: str) -> dict[str, Any]:
    """Retrieve details of a single control definition."""
    defn = default_registry.get_definition(control_id)
    if not defn:
        raise HTTPException(status_code=404, detail=f"Control '{control_id}' not found")
    data = defn.model_dump(mode="json")
    data["definition_sha256"] = default_registry.get_hash(control_id)
    return data
