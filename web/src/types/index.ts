export type Archetype = 'A' | 'B' | 'C' | 'D' | 'E';
export type RiskRating = 'low' | 'medium' | 'high' | 'critical';
export type RunStatus = 'running' | 'completed' | 'failed' | 'blocked' | 'verified' | 'ARCHIVED' | 'VERIFIED' | 'APPROVED' | 'CLEANED';
export type GateStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface TargetRef {
  type: string;
  ref: string;
}

export interface ControlDefinitionDTO {
  control_id: string;
  version: string;
  title: string;
  objective?: string;
  owner_role: string;
  reviewer_role: string;
  risk_rating: RiskRating;
  frequency: string;
  archetype: Archetype;
  scope: TargetRef[];
  definition_sha256?: string;
}

export interface GateItemDTO {
  gate_id: string;
  run_id: string;
  control_id: string;
  gate_name: string;
  maker_id: string;
  approver_role: string;
  status: GateStatus;
  created_at: string;
  decided_at?: string;
  decided_by?: string;
  comment?: string;
  gate_type?: string;
  payload?: any;
  exceptions?: any[];
  escalations?: any[];
  payload_summary?: {
    exceptions_count?: number;
    escalations_count?: number;
    exceptions?: any[];
    escalations?: any[];
    [key: string]: any;
  };
}

export interface RunItemDTO {
  run_id: string;
  control_id: string;
  version: string;
  archetype: Archetype;
  status: RunStatus;
  started_at: string;
  completed_at?: string;
  targets: string[];
  records_scanned?: number;
  passed?: number;
  failed?: number;
  evidence_id?: string;
  table?: string;
  policy_id?: string;
  policy_filename?: string;
  policy_used?: {
    policy_id: string;
    filename: string;
    title: string;
    cloudinary_url: string;
    extracted_text?: string;
    rules_summary?: string;
    format?: string;
    file_size?: string;
  };
}

export interface FindingDTO {
  finding_id: string;
  run_id: string;
  control_id: string;
  title: string;
  severity: RiskRating;
  status: string;
  evidence_ids: string[];
}

export interface UserSessionDTO {
  user_id: string;
  roles: string[];
  email: string;
  username?: string;
  displayName?: string;
}

// ==============================================================================
// VULNERABILITY MANAGEMENT CONTROL STATE CONTRACTS
// ==============================================================================

export interface VulnScopeAsset {
  asset_id: string;
  database_name: string;
  tier: string;
  owner: string;
  owner_manager?: string;
  in_scope: number;
  internet_facing?: number;
  scan_frequency: string;
  last_scan_date: string | null;
  last_scan_status: string | null;
  scan_id?: string | null;
  last_scan_start_time?: string | null;
}

export interface VulnScopeCounts {
  assets_total: number;
  assets_in_scope: number;
  tickets_existing: number;
  exceptions_total: number;
  exceptions_by_status: Record<string, number>;
}

export interface VulnExcludedItem {
  vulnerability_id: string;
  database_name: string;
  severity: string;
  status: string;
  reason: string;
}

export interface VulnOutOfScopeAsset {
  asset_id: string;
  database_name: string;
  tier: string;
  owner?: string;
  reason: string;
}

export interface VulnFindingsReconciliation {
  retrieved: number;
  tested: number;
  excluded: number;
  excluded_by_reason: VulnExcludedItem[];
}

export interface VulnScopeSummary {
  assets: VulnScopeAsset[];
  assets_out_of_scope: VulnOutOfScopeAsset[];
  reconciliation_message?: string;
  counts: VulnScopeCounts;
  findings_reconciliation: VulnFindingsReconciliation;
}

export interface VulnTicketCandidate {
  finding_id: string;
  database_name: string;
  cve_id?: string;
  severity: string;
  is_kev: number | boolean;
  discovered_at: string;
  asset_id?: string;
  tier?: string;
  computed_assignee: string;
  computed_due_date: string;
}

export interface VulnDefectiveTicket {
  ticket_id: string;
  finding_id: string;
  database_name: string;
  cve_id?: string;
  severity: string;
  assignee?: string | null;
  due_date?: string | null;
  ticket_status?: string;
  ticket_issue: string;
  note: string;
}

export interface VulnQueryOutput {
  query_id: string;
  title: string;
  description: string;
  sql: string;
  row_count: number;
  total_row_count: number;
  rows: any[];
  candidate_tickets?: VulnTicketCandidate[];
  candidate_rows?: any[];
  candidate_count?: number;
  defective_tickets?: VulnDefectiveTicket[];
  defective_rows?: any[];
  defective_count?: number;
  critical_overdue_count?: number;
  pending_count?: number;
  expired_count?: number;
}

export interface VulnReviewSummary {
  sla_breach_count: number;
  critical_overdue_count: number;
  ticket_candidate_count: number;
  defective_tickets_count: number;
  closure_defects_count: number;
  exception_defects_count: number;
  pending_exceptions_count: number;
  expired_exceptions_count: number;
}

export interface VulnReviewSnapshot {
  as_of?: string;
  as_of_date?: string;
  review_executed: boolean;
  executed_at?: string;
  q1_sla_breach: VulnQueryOutput;
  q2_ticket_coverage: VulnQueryOutput;
  q3_closure_validity: VulnQueryOutput;
  q4_exception_governance: VulnQueryOutput;
  summary: VulnReviewSummary;
  reconciliation?: any;
}

export interface VulnVerificationResult {
  run_id?: string;
  stage?: string;
  verified?: boolean;
  passed?: boolean;
  tickets_verified_count?: number;
  required_count?: number;
  created_count?: number;
  mismatch_count?: number;
  mismatches?: string[];
  verification_banner?: string;
  reconciliation?: {
    required_count: number;
    created_count: number;
    mismatch_count: number;
    mismatches: string[];
    findings_with_tickets?: number;
    open_critical_high_count?: number;
  };
}

export interface AttributeResult {
  attribute_name: string;
  status: 'Pass' | 'Fail' | 'Not Testable';
  defect_type?: 'Design' | 'Operating' | 'None';
  counts: {
    before?: number;
    after?: number;
  };
  details: string;
  fixed?: boolean;
  covered_by_exception?: number;
  escalated_still_open?: number;
  breakdown?: string;
  resolution_label?: string;
  fixed_label?: string;
}

export interface ControlAssessment {
  overall_grade: 'Effective' | 'Effective with follow-ups' | 'Needs Improvement' | 'Ineffective';
  rationale: string;
  attributes: Record<string, AttributeResult>;
  remaining_followups?: any[];
}



