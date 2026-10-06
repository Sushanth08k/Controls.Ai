from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class BaseContract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: str = "1.0.0"


# --- Section 6.1 Control Definition Models ---

class TargetRef(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    type: str  # e.g., postgres_instance, http_service, postgres_table
    ref: str


class EvidenceSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    connector: str
    operation: str
    catalog_ref: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)


class EvaluatorTaskSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    agent: str
    template_id: str
    template_version: int | str


class RuleSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    primitive: str  # subset_of, equals, row_count, version_not_vulnerable, no_drift, etc.
    evidence_ref: str
    field: str | None = None
    baseline_key: str | None = None
    value: Any = None
    values: list[Any] | None = None
    op: str | None = None
    n: int | None = None
    key_fields: list[str] | None = None
    product: str | None = None
    severity: str = "medium"  # low | medium | high | critical | from_cvss
    on_fail: Literal["finding", "exception", "block"] = "finding"
    evaluator_task: EvaluatorTaskSpec | None = None


class AgentTaskSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    agent: str
    template_id: str
    template_version: int | str
    when: str  # per_finding, start, end, after_plan, after_verify


class GateSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    gate: str
    condition: str
    approver_role: str


class CompositionStep(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    step: str
    archetype: Literal["A", "B", "C", "D", "E"]
    definition_ref: str | None = None
    params_ref: str | None = None


class OutputSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    workpaper_template: str
    conclusion_scale: list[str]


class ControlDefinition(BaseContract):
    control_id: str = Field(pattern=r"^CTL-[A-Z]+-\d{3,}$")
    version: str
    title: str
    objective: str | None = None
    owner_role: str
    reviewer_role: str
    risk_rating: Literal["low", "medium", "high", "critical"]
    frequency: str  # cron or 'on_event'
    trigger_events: list[str] = Field(default_factory=list)
    archetype: Literal["A", "B", "C", "D", "E"]
    scope: list[TargetRef] = Field(default_factory=list)
    evidence: list[EvidenceSpec] = Field(default_factory=list)
    rules: list[RuleSpec] = Field(default_factory=list)
    baseline_ref: str | None = None
    agent_tasks: list[AgentTaskSpec] = Field(default_factory=list)
    archetype_params: dict[str, Any] = Field(default_factory=dict)
    composition: list[CompositionStep] = Field(default_factory=list)
    gates: list[GateSpec] = Field(default_factory=list)
    outputs: OutputSpec | None = None
    severity_policy: dict[str, int] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


# --- Section 10 Operational Data Contracts ---

class SoftwareVersions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    images: dict[str, str] = Field(default_factory=dict)
    models: dict[str, str] = Field(default_factory=dict)
    templates: dict[str, str] = Field(default_factory=dict)


class RunContext(BaseContract):
    run_id: str
    control_id: str
    version: str
    definition_sha256: str
    archetype: Literal["A", "B", "C", "D", "E"]
    scope_ref: str
    period_or_event_id: str
    started_at: datetime
    software_versions: SoftwareVersions = Field(default_factory=SoftwareVersions)


class EvidenceRecord(BaseContract):
    evidence_id: str
    control_id: str
    run_id: str
    kind: str
    catalog_ref: str | None = None
    query_sha256: str | None = None
    instance_fp: str | None = None
    executor_id: str = "gateway"
    ts: datetime
    row_count: int | None = None
    result_sha256: str
    payload_ref: str
    prev_hash: str
    entry_hash: str


class RuleResultDetails(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    added: list[Any] = Field(default_factory=list)
    removed: list[Any] = Field(default_factory=list)
    violating_rows_ref: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class RuleResult(BaseContract):
    rule_id: str
    evidence_ref: str
    primitive: str
    passed: bool
    details: RuleResultDetails = Field(default_factory=RuleResultDetails)
    severity: str


class Evaluation(BaseContract):
    rule_id: str
    applicable: bool
    compensating_control: str | None = None
    rationale: str
    evidence_ids: list[str] = Field(default_factory=list)

    @classmethod
    def mock_instance(cls) -> "Evaluation":
        return cls(
            rule_id="RULE-EVAL-001",
            applicable=True,
            compensating_control=None,
            rationale="Automated rule evaluation confirms finding applicability against evidence.",
            evidence_ids=[],
        )


class Challenge(BaseContract):
    subject_id: str
    verdict: Literal["confirmed", "objection"]
    objection_type: Literal["evidence_missing", "not_applicable", "risk_accepted", "other"] | None = None
    detail: str

    @classmethod
    def mock_instance(cls) -> "Challenge":
        return cls(
            subject_id="FND-CHALLENGE-MOCK",
            verdict="confirmed",
            objection_type=None,
            detail="The cited evidence confirms the observed finding with zero mitigating factors.",
        )


class Finding(BaseContract):
    finding_id: str
    run_id: str
    control_id: str
    rule_id: str
    target_ref: str
    title: str
    evidence_ids: list[str] = Field(min_length=1)
    severity: Literal["low", "medium", "high", "critical"]
    attributes: dict[str, Any] = Field(default_factory=dict)
    risk_score: float | None = None
    sla_due: datetime | None = None
    status: Literal["open", "confirmed", "disputed", "remediated", "accepted"] = "open"
    challenge: Challenge | None = None


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    page: int
    char_start: int
    char_end: int
    quote: str


class RetentionSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    value: int
    unit: Literal["days", "months", "years"]


class PolicyExclusion(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    predicate_ref: str
    reason: str


class PolicyIR(BaseContract):
    policy_id: str
    version: str
    effective_from: str
    source_doc_sha256: str
    entity: str
    source_table: str
    date_column: str
    retention: RetentionSpec
    exclusions: list[PolicyExclusion] = Field(default_factory=list)
    action: Literal["archive_then_delete", "archive_only", "delete_only"] = "archive_then_delete"
    archive_target: str
    citations: dict[str, Citation] = Field(default_factory=dict)

    @classmethod
    def mock_instance(cls) -> "PolicyIR":
        return cls(
            policy_id="POL-ARCH-DEFAULT",
            version="1.0.0",
            effective_from="2024-01-01",
            source_doc_sha256="0" * 64,
            entity="transactions",
            source_table="source_transactions",
            date_column="transaction_date",
            retention=RetentionSpec(value=5, unit="years"),
            exclusions=[],
            action="archive_then_delete",
            archive_target="archive_transactions",
            citations={},
        )


class BaselineStats(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    mean: float
    std: float
    n: int


class RunPlan(BaseContract):
    run_id: str
    policy_ref: str
    cutoff_tau: datetime
    eligible_count: int
    baseline: BaselineStats
    fk_order: list[str] = Field(default_factory=list)
    batch_size: int
    keyset_column: str
    gate_reasons: list[str] = Field(default_factory=list)


class PlanReview(BaseContract):
    flags: list[str] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list)
    suggested_batch_size: int | None = None

    @classmethod
    def mock_instance(cls) -> "PlanReview":
        return cls(
            flags=[],
            explanations=["Execution plan reviewed: volume matches baseline and FK constraints are met."],
            suggested_batch_size=500,
        )


class Manifest(BaseContract):
    run_id: str
    table: str
    hash_spec_version: str = "1"
    column_order: list[str] = Field(default_factory=list)
    row_count: int
    merkle_root_src: str
    created_at: datetime


class ReconBreak(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    pk: str
    type: Literal["missing_in_target", "extra_in_target", "mismatched"]


class ReconCounts(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    src: int
    tgt: int


class ReconResult(BaseContract):
    run_id: str
    source_ref: str
    target_ref: str
    root_src: str
    root_tgt: str
    counts: ReconCounts
    breaks: list[ReconBreak] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)


class Attestation(BaseContract):
    run_id: str
    cutoff_tau: datetime
    merkle_root_src: str
    merkle_root_arc: str
    row_count: int
    verifier_id: str
    key_version: str
    issued_at: datetime
    expires_at: datetime
    signature: str


class AddedEndpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    method: str
    path: str
    justification: str


class ImpactAddendum(BaseContract):
    added_endpoints: list[AddedEndpoint] = Field(default_factory=list)

    @classmethod
    def mock_instance(cls) -> "ImpactAddendum":
        return cls(added_endpoints=[])


class LatencyBaseline(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    mu: float
    sigma: float
    slo_ms: float


class TestVerdict(BaseContract):
    change_id: str
    run_id: str
    endpoint: str
    status_code: int
    expected_status: list[int]
    schema_valid: bool
    p95_ms: float
    baseline: LatencyBaseline
    reruns: int = 0
    results: list[dict[str, Any]] = Field(default_factory=list)
    classification: Literal["pass", "regression", "flaky", "environmental"]
    evidence_ids: list[str] = Field(default_factory=list)


class Approval(BaseContract):
    approval_id: str
    run_id: str
    gate: str
    maker_id: str
    approver_id: str
    decision: Literal["approved", "rejected"]
    comment: str
    ts: datetime


class WorkpaperSection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    heading: str
    body: str
    evidence_ids: list[str] = Field(default_factory=list)


class Workpaper(BaseContract):
    run_id: str
    control_id: str
    version: str
    period: str
    conclusion: str
    summary: str
    sections: list[WorkpaperSection] = Field(default_factory=list)
    findings_ref: list[str] = Field(default_factory=list)

    @classmethod
    def mock_instance(cls) -> "Workpaper":
        return cls(
            run_id="RUN-MOCK",
            control_id="CTL-MOCK",
            version="1.0.0",
            period="current_period",
            conclusion="effective",
            summary="Automated control verification completed with evidence citations.",
            sections=[],
            findings_ref=[],
        )


class PriorityInputs(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    frequency: float
    manual_effort: float
    risk: float
    feasibility: float


class DraftControlDefinition(BaseContract):
    definition: ControlDefinition
    fit: Literal["clean", "needs_connector", "needs_catalog", "human_led"]
    gaps: list[str] = Field(default_factory=list)
    priority_inputs: PriorityInputs
    rcm_ref: str

    @classmethod
    def mock_instance(cls) -> "DraftControlDefinition":
        defn = ControlDefinition(
            control_id="CTL-ONB-001",
            version="1.0.0",
            title="Drafted Compliance Control",
            owner_role="COMPLIANCE_OFFICER",
            reviewer_role="AUDITOR",
            risk_rating="medium",
            frequency="monthly",
            archetype="A",
        )
        return cls(
            definition=defn,
            fit="clean",
            gaps=[],
            priority_inputs=PriorityInputs(frequency=1.0, manual_effort=2.0, risk=2.0, feasibility=3.0),
            rcm_ref="RCM-001",
        )


class ComplianceSQLScript(BaseModel):
    model_config = ConfigDict(extra="ignore")
    selection_sql: str
    archival_sql: str
    cleanup_sql: str
    generator: str = "ComplianceSQLAgent"
    model: str = "gemini-1.5-flash"
    schema_used: str = ""
