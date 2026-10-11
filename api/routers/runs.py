import uuid
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, ConfigDict
from core.definitions import default_registry
from api.sse import sse_broker
from sim.audit_store import (
    upsert_audit_run,
    get_audit_run,
    list_audit_runs,
    save_audit_step,
    list_audit_steps,
    list_audit_findings,
    save_audit_evidence,
    list_audit_evidence,
    list_audit_approvals,
    get_full_audit_bundle,
    get_policy_document,
)

router = APIRouter(prefix="/runs", tags=["runs"])

PERSONA_EMAIL_MAP: dict[str, str] = {
    "sec_reviewer_1": "reviewer@bank.internal",
    "sec_owner_1": "owner@bank.internal",
    "release_owner_1": "release@bank.internal",
    "operator_1": "operator@bank.internal",
}


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
    policy_id: str | None = None
    policy_filename: str | None = None
    policy_used: dict[str, Any] | None = None
    operator_email: str | None = None
    executor_email: str | None = None


_RUNS_STORE: dict[str, RunItem] = {}


def _audit_row_to_run_item(row: dict[str, Any]) -> RunItem:
    meta = row.get("metadata") or {}
    targets = meta.get("targets", [row.get("source_db") or "core_banking_sim"])
    pol_id = row.get("policy_id") or meta.get("policy_id")
    pol_fname = meta.get("filename") or row.get("policy_filename")

    policy_used = None
    if pol_id:
        policy_used = get_policy_document(pol_id)
    if not policy_used and pol_fname:
        from sim.audit_store import get_connection
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT * FROM compliance_policy_documents WHERE filename = ? ORDER BY uploaded_at DESC LIMIT 1",
                (pol_fname,),
            )
            r = cur.fetchone()
            if r:
                policy_used = dict(r)
        finally:
            conn.close()

    if policy_used:
        pol_id = policy_used.get("policy_id", pol_id)
        pol_fname = policy_used.get("filename", pol_fname)
        policy_used_summary = {
            "policy_id": policy_used["policy_id"],
            "filename": policy_used["filename"],
            "title": policy_used.get("title") or policy_used["filename"],
            "format": policy_used.get("format", "PDF"),
            "file_size": f"{max(1, policy_used.get('file_size_bytes', 0) // 1024)} KB",
            "cloudinary_url": policy_used.get("cloudinary_url", ""),
            "extracted_text": policy_used.get("extracted_text", ""),
            "rules_summary": policy_used.get("rules_summary", ""),
        }
    elif meta.get("policy_used") and isinstance(meta.get("policy_used"), dict):
        mpu = meta["policy_used"]
        p_text = mpu.get("extracted_text") or meta.get("policy_text") or meta.get("document_text") or ""
        fn = mpu.get("filename") or pol_fname or row.get("policy_filename") or "vulnerability_management_policy_v1.0.txt"
        pol_id = mpu.get("policy_id") or pol_id or f"POL-{row['run_id'][:8]}"
        pol_fname = fn
        policy_used_summary = {
            "policy_id": pol_id,
            "filename": fn,
            "title": mpu.get("title") or fn,
            "format": mpu.get("format", "TXT" if fn.endswith(".txt") else "PDF"),
            "file_size": mpu.get("file_size") or f"{max(1, len(p_text) // 1024)} KB",
            "cloudinary_url": mpu.get("cloudinary_url", ""),
            "extracted_text": p_text,
            "rules_summary": mpu.get("rules_summary", ""),
        }
    elif (pol_fname or row.get("policy_filename") or meta.get("policy_text")) and (pol_id or pol_fname or row.get("policy_filename")):
        p_text = meta.get("policy_text") or meta.get("document_text") or ""
        fn = pol_fname or row.get("policy_filename") or "vulnerability_management_policy_v1.0.txt"
        pol_id = pol_id or f"POL-{row['run_id'][:8]}"
        pol_fname = fn
        policy_used_summary = {
            "policy_id": pol_id,
            "filename": fn,
            "title": fn,
            "format": "TXT" if fn.endswith(".txt") else "PDF",
            "file_size": f"{max(1, len(p_text) // 1024)} KB",
            "cloudinary_url": "",
            "extracted_text": p_text,
            "rules_summary": "",
        }
    else:
        policy_used_summary = None

    return RunItem(
        run_id=row["run_id"],
        control_id=row["control_id"],
        version=row.get("version") or "1.0.0",
        archetype=row.get("archetype") or "A",
        status=row["status"],
        started_at=row["started_at"],
        completed_at=row.get("completed_at"),
        targets=targets if isinstance(targets, list) else [str(targets)],
        records_scanned=row.get("records_evaluated"),
        passed=row.get("records_eligible") if row.get("archetype") == "D" else row.get("records_processed"),
        failed=row.get("records_affected") if row.get("archetype") == "A" else 0,
        critical_failures=meta.get("critical_failures"),
        high_failures=meta.get("high_failures"),
        medium_failures=meta.get("medium_failures"),
        evidence_id=meta.get("evidence_id") or row.get("attestation_token"),
        table=meta.get("table") or ("source_transactions" if row.get("archetype") == "D" else "db_vulnerabilities"),
        policy_id=pol_id,
        policy_filename=pol_fname,
        policy_used=policy_used_summary,
        operator_email=(
            meta.get("operator_email")
            if meta.get("operator_email") and "@" in str(meta.get("operator_email"))
            else (
                meta.get("editor_email")
                if meta.get("editor_email") and "@" in str(meta.get("editor_email"))
                else PERSONA_EMAIL_MAP.get(
                    str(meta.get("operator_email") or meta.get("editor_email") or row.get("operator_id")),
                    str(row.get("operator_id") if row.get("operator_id") and "@" in str(row.get("operator_id")) else "operator@bank.internal")
                )
            )
        ),
        executor_email=(
            meta.get("executor_email")
            if meta.get("executor_email") and "@" in str(meta.get("executor_email"))
            else (
                meta.get("finalized_by")
                if meta.get("finalized_by") and "@" in str(meta.get("finalized_by"))
                else (
                    meta.get("approved_by")
                    if meta.get("approved_by") and "@" in str(meta.get("approved_by"))
                    else (
                        meta.get("decided_by")
                        if meta.get("decided_by") and "@" in str(meta.get("decided_by"))
                        else None
                    )
                )
            )
        ),
    )



class TriggerRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    control_id: str


@router.get("", response_model=list[RunItem])
def list_runs() -> list[RunItem]:
    """List all runs, combining active in-memory sessions with persistent SQLite history."""
    db_runs = list_audit_runs()
    db_items: dict[str, RunItem] = {}
    for r in db_runs:
        item = _audit_row_to_run_item(r)
        db_items[item.run_id] = item

    # Merge in-memory state (in-memory takes precedence for active runs)
    merged = {**db_items, **_RUNS_STORE}
    return sorted(list(merged.values()), key=lambda x: x.started_at, reverse=True)


@router.get("/{run_id}", response_model=RunItem)
def get_run(run_id: str) -> RunItem:
    """Retrieve run by ID, falling back to SQLite persistent audit records."""
    if run_id in _RUNS_STORE:
        return _RUNS_STORE[run_id]

    db_run = get_audit_run(run_id)
    if db_run:
        item = _audit_row_to_run_item(db_run)
        _RUNS_STORE[run_id] = item
        return item

    raise HTTPException(status_code=404, detail="Run not found")


@router.get("/{run_id}/audit")
def get_run_audit(run_id: str) -> dict[str, Any]:
    """Retrieve comprehensive persistent audit bundle including steps, Merkle proofs, evidence, and approvals."""
    bundle = get_full_audit_bundle(run_id)
    if not bundle:
        if run_id in _RUNS_STORE:
            mem_item = _RUNS_STORE[run_id]
            return {
                "run": mem_item.model_dump(),
                "steps": [],
                "findings": [],
                "evidence": [],
                "approvals": [],
                "merkle_verification": None,
            }
        raise HTTPException(status_code=404, detail=f"Audit bundle for run '{run_id}' not found")
    return bundle


@router.get("/{run_id}/steps")
def get_run_steps(run_id: str) -> list[dict[str, Any]]:
    """Retrieve execution lifecycle steps for a run."""
    return list_audit_steps(run_id)


@router.get("/{run_id}/findings")
def get_run_findings(run_id: str) -> list[dict[str, Any]]:
    """Retrieve findings associated with a run."""
    return list_audit_findings(run_id=run_id)


@router.get("/{run_id}/evidence")
def get_run_evidence(run_id: str) -> list[dict[str, Any]]:
    """Retrieve evidence records associated with a run."""
    return list_audit_evidence(run_id)


@router.get("/{run_id}/approvals")
def get_run_approvals(run_id: str) -> list[dict[str, Any]]:
    """Retrieve approvals associated with a run."""
    return list_audit_approvals(run_id=run_id)


@router.post("/trigger", response_model=RunItem)
async def trigger_run(
    req: TriggerRunRequest,
    x_user_email: str | None = Header(default=None),
) -> RunItem:
    defn = default_registry.get_definition(req.control_id)
    version = defn.version if defn else "1.0.0"
    archetype = defn.archetype if defn else "A"
    targets = [t.ref for t in defn.scope] if defn else ["core_banking_sim"]

    new_id = f"run-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    editor_email = x_user_email or "operator@bank.internal"

    item = RunItem(
        run_id=new_id,
        control_id=req.control_id,
        version=version,
        archetype=archetype,
        status="running",
        started_at=now_iso,
        targets=targets,
        operator_email=editor_email,
    )

    # Register initial run in audit store
    upsert_audit_run(
        run_id=new_id,
        control_id=req.control_id,
        version=version,
        archetype=archetype,
        status="running",
        started_at=now_iso,
        metadata_json={"targets": targets, "operator_email": editor_email, "editor_email": editor_email},
    )

    _RUNS_STORE[new_id] = item
    await sse_broker.publish("run.started", item.model_dump())
    return item

