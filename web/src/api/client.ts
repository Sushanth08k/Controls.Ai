import { ControlDefinitionDTO, FindingDTO, GateItemDTO, RunItemDTO } from '../types';

const envApiBase = (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const API_BASE =
  envApiBase ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : '');


export const isTargetControl = (val?: string): boolean => {
  if (!val) return false;
  const s = val.toLowerCase();
  return s.includes('arch') || s.includes('vuln') || s.includes('vulnerability');
};

export async function fetchControls(): Promise<ControlDefinitionDTO[]> {
  const res = await fetch(`${API_BASE}/controls`);
  if (!res.ok) throw new Error(`Failed to fetch controls: ${res.statusText}`);
  const data: ControlDefinitionDTO[] = await res.json();
  return data.filter((c) => isTargetControl(c.control_id) || isTargetControl(c.title));
}

export async function fetchGates(userId?: string, roles?: string[]): Promise<GateItemDTO[]> {
  const headers: Record<string, string> = {};
  if (userId) headers['X-User-Id'] = userId;
  if (roles) headers['X-User-Roles'] = roles.join(',');

  const res = await fetch(`${API_BASE}/gates`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch gates: ${res.statusText}`);
  const data: GateItemDTO[] = await res.json();
  return data.filter((g) => !g.control_id || isTargetControl(g.control_id));
}

export async function decideGate(
  gateId: string,
  decision: 'approved' | 'rejected',
  comment: string,
  userId: string,
  roles: string[]
): Promise<any> {
  const res = await fetch(`${API_BASE}/gates/${gateId}/decision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      'X-User-Roles': roles.join(','),
    },
    body: JSON.stringify({ decision, comment }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Request failed with ${res.status}`);
  }
  return res.json();
}

export async function fetchRuns(): Promise<RunItemDTO[]> {
  const res = await fetch(`${API_BASE}/runs`);
  if (!res.ok) throw new Error(`Failed to fetch runs: ${res.statusText}`);
  const data: RunItemDTO[] = await res.json();
  return data.filter((r) => !r.control_id || isTargetControl(r.control_id));
}

export async function fetchFindings(): Promise<FindingDTO[]> {
  const res = await fetch(`${API_BASE}/findings`);
  if (!res.ok) throw new Error(`Failed to fetch findings: ${res.statusText}`);
  const data: FindingDTO[] = await res.json();
  return data.filter((f) => !f.control_id || isTargetControl(f.control_id));
}

export async function triggerRun(controlId: string, userEmail?: string): Promise<RunItemDTO> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userEmail) {
    headers['X-User-Email'] = userEmail;
    headers['X-User-Id'] = userEmail;
  }
  const res = await fetch(`${API_BASE}/runs/trigger`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ control_id: controlId }),
  });
  if (!res.ok) throw new Error(`Failed to trigger run: ${res.statusText}`);
  return res.json();
}

export async function fetchControlDefaults(controlId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/defaults/${controlId}`);
  if (!res.ok) throw new Error(`Failed to fetch defaults: ${res.statusText}`);
  return res.json();
}

export interface UploadedPolicyDTO {
  policy_id: string;
  filename: string;
  title: string;
  control_id: string;
  archetype: string;
  risk_rating: string;
  frequency: string;
  uploaded_at: string;
  uploaded_by: string;
  file_size: string;
  format: string;
  rules_summary: string;
  policy_text: string;
  status: string;
  cloudinary_url?: string;
  file_sha256?: string;
  mime_type?: string;
}

export interface UploadPolicyResponse {
  filename: string;
  format: string;
  text: string;
  pages: number;
  size_bytes: number;
  policy_id?: string;
  cloudinary_url?: string;
  file_sha256?: string;
  is_duplicate?: boolean;
  message?: string;
  title?: string;
  control_id?: string;
  uploaded_at?: string;
}

export async function fetchUploadedPolicies(): Promise<UploadedPolicyDTO[]> {
  const res = await fetch(`${API_BASE}/interactive/uploaded_policies`);
  if (!res.ok) throw new Error(`Failed to fetch uploaded policies: ${res.statusText}`);
  const data: UploadedPolicyDTO[] = await res.json();
  return data.filter((p) => !p.control_id || isTargetControl(p.control_id) || isTargetControl(p.title));
}

export async function fetchPolicyDocument(policyId: string): Promise<UploadedPolicyDTO> {
  const res = await fetch(`${API_BASE}/interactive/uploaded_policies/${policyId}`);
  if (!res.ok) throw new Error(`Failed to fetch policy: ${res.statusText}`);
  return res.json();
}

export function getPolicyDocumentFileUrl(policyId: string): string {
  return `${API_BASE}/interactive/uploaded_policies/${policyId}/file`;
}

export function getPolicyDocumentDownloadUrl(policyId: string): string {
  return `${API_BASE}/interactive/uploaded_policies/${policyId}/download`;
}

export async function deleteUploadedPolicy(policyId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/uploaded_policies/${policyId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete uploaded policy: ${res.statusText}`);
  return res.json();
}

export async function uploadPolicyDocument(
  file: File,
  controlId?: string,
  userEmail?: string
): Promise<UploadPolicyResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (controlId) {
    formData.append('control_id', controlId);
  }
  if (userEmail) {
    formData.append('uploaded_by', userEmail);
  }

  const headers: Record<string, string> = {};
  if (userEmail) {
    headers['X-User-Email'] = userEmail;
    headers['X-User-Id'] = userEmail;
  }

  const res = await fetch(`${API_BASE}/interactive/upload_policy_file`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Upload failed with status ${res.status}`);
  }
  return res.json();
}


export async function interpretPolicy(
  controlId: string,
  documentText?: string,
  filename?: string,
  policyId?: string,
  operatorEmail?: string
): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (operatorEmail) {
    headers['X-User-Email'] = operatorEmail;
  }
  const res = await fetch(`${API_BASE}/interactive/interpret`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      control_id: controlId,
      document_text: documentText || null,
      filename: filename || null,
      policy_id: policyId || null,
      operator_email: operatorEmail || null,
    }),
  });
  if (!res.ok) throw new Error(`Failed to interpret policy: ${res.statusText}`);
  return res.json();
}

export async function previewDatabase(controlId: string, approvedRules: any): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ control_id: controlId, approved_rules: approvedRules }),
  });
  if (!res.ok) throw new Error(`Failed to preview database: ${res.statusText}`);
  return res.json();
}

export async function executeStep(controlId: string, runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/execute_step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ control_id: controlId, run_id: runId }),
  });
  if (!res.ok) throw new Error(`Failed to execute step: ${res.statusText}`);
  return res.json();
}

export async function verifyArchival(controlId: string, runId: string, userEmail?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userEmail) {
    headers['X-User-Email'] = userEmail;
  }
  const res = await fetch(`${API_BASE}/interactive/verify_archival`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ control_id: controlId, run_id: runId }),
  });
  if (!res.ok) throw new Error(`Failed to verify archival: ${res.statusText}`);
  return res.json();
}

export async function approveGate(
  controlId: string,
  runId: string,
  attestationToken: string,
  comment: string,
  operatorId?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/approve_gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control_id: controlId,
      run_id: runId,
      attestation_token: attestationToken,
      operator_comment: comment,
      operator_id: operatorId || 'sec_reviewer_1',
    }),
  });
  if (!res.ok) throw new Error(`Failed to record approval: ${res.statusText}`);
  return res.json();
}

export async function reseedDatabase(): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/reseed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to reseed database: ${res.statusText}`);
  return res.json();
}

export async function commitCleanup(
  controlId: string,
  runId: string,
  attestationToken: string,
  comment: string,
  operatorId?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control_id: controlId,
      run_id: runId,
      attestation_token: attestationToken,
      operator_comment: comment,
      operator_id: operatorId || 'sec_reviewer_1',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to commit cleanup');
  }
  return res.json();
}

export async function fetchLiveDb(tableName: string): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/live_db/${tableName}`);
  if (!res.ok) throw new Error(`Failed to fetch live database: ${res.statusText}`);
  return res.json();
}

export async function fetchVulnerabilityDefaults(controlId?: string): Promise<any> {
  const url = controlId ? `${API_BASE}/vulnerability/defaults?control_id=${encodeURIComponent(controlId)}` : `${API_BASE}/vulnerability/defaults`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch vulnerability defaults: ${res.statusText}`);
  return res.json();
}

export async function interpretVulnerabilityPolicy(
  controlId: string,
  documentText?: string,
  filename?: string,
  policyId?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/vulnerability/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control_id: controlId,
      document_text: documentText || null,
      filename: filename || null,
      policy_id: policyId || null,
    }),
  });
  if (!res.ok) throw new Error(`Failed to interpret vulnerability policy: ${res.statusText}`);
  return res.json();
}

export async function previewVulnerabilityTargets(controlId: string, approvedRules?: any): Promise<any> {
  const res = await fetch(`${API_BASE}/vulnerability/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control_id: controlId,
      approved_rules: approvedRules || null,
    }),
  });
  if (!res.ok) throw new Error(`Failed to preview vulnerability targets: ${res.statusText}`);
  return res.json();
}

export async function executeVulnerabilityControl(
  controlId: string,
  runId?: string,
  documentText?: string,
  customRules?: any,
  querySql?: string,
  policyId?: string,
  filename?: string,
  userEmail?: string
): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userEmail) {
    headers['X-User-Email'] = userEmail;
    headers['X-User-Id'] = userEmail;
  }
  const res = await fetch(`${API_BASE}/vulnerability/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      control_id: controlId,
      run_id: runId || null,
      document_text: documentText || null,
      custom_rules: customRules || null,
      query_sql: querySql || null,
      policy_id: policyId || null,
      filename: filename || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Vulnerability execution failed with ${res.status}`);
  }
  return res.json();
}

export async function fetchVulnerabilityResults(runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/vulnerability/results/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(`Failed to fetch results: ${res.statusText}`);
  return res.json();
}

export async function fetchVulnerabilityFindings(runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/vulnerability/findings/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(`Failed to fetch findings: ${res.statusText}`);
  return res.json();
}

export async function fetchVulnerabilityEvidence(runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/vulnerability/evidence/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(`Failed to fetch evidence: ${res.statusText}`);
  return res.json();
}

export async function fetchRunAudit(runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/audit`);
  if (!res.ok) throw new Error(`Failed to fetch run audit: ${res.statusText}`);
  return res.json();
}

export async function resumeInteractiveRun(runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/resume/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(`Failed to resume run: ${res.statusText}`);
  return res.json();
}



