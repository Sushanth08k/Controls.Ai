from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/runs", tags=["runs"])


class RunItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str
    control_id: str
    version: str
    archetype: str
    status: str  # running | completed | failed | blocked
    started_at: str
    completed_at: str | None = None
    targets: list[str] = []
    records_scanned: int | None = None
    passed: int | None = None
    failed: int | None = None
    critical_failures: int | None = None
    high_failures: int | None = None
    medium_failures: int | None = None
    evidence_id: str | None = None
    table: str | None = None


_RUNS_STORE: dict[str, RunItem] = {
    "run-dummy-001": RunItem(
        run_id="run-dummy-001",
        control_id="PILOT-ACCESS-001",
        version="1.0.0",
        archetype="A",
        status="running",
        started_at=datetime.now(timezone.utc).isoformat(),
        targets=["core_banking_sim", "vuln_target"],
    )
}


import uuid
from core.definitions import default_registry
from api.sse import sse_broker


class TriggerRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    control_id: str


@router.get("", response_model=list[RunItem])
def list_runs() -> list[RunItem]:
    return list(_RUNS_STORE.values())


@router.get("/{run_id}", response_model=RunItem)
def get_run(run_id: str) -> RunItem:
    run = _RUNS_STORE.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/trigger", response_model=RunItem)
async def trigger_run(req: TriggerRunRequest) -> RunItem:
    defn = default_registry.get_definition(req.control_id)
    version = defn.version if defn else "1.0.0"
    archetype = defn.archetype if defn else "A"
    targets = [t.ref for t in defn.scope] if defn else ["core_banking_sim"]

    new_id = f"run-{uuid.uuid4().hex[:8]}"
    item = RunItem(
        run_id=new_id,
        control_id=req.control_id,
        version=version,
        archetype=archetype,
        status="running",
        started_at=datetime.now(timezone.utc).isoformat(),
        targets=targets,
    )
    _RUNS_STORE[new_id] = item
    await sse_broker.publish("run.started", item.model_dump())
    return item
