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

