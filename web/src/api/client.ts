import { ControlDefinitionDTO, FindingDTO, GateItemDTO, RunItemDTO } from '../types';

export const API_BASE =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : '/api';


export async function fetchControls(): Promise<ControlDefinitionDTO[]> {
  const res = await fetch(`${API_BASE}/controls`);
  if (!res.ok) throw new Error(`Failed to fetch controls: ${res.statusText}`);
  return res.json();
}

export async function fetchGates(userId?: string, roles?: string[]): Promise<GateItemDTO[]> {
  const headers: Record<string, string> = {};
  if (userId) headers['X-User-Id'] = userId;
  if (roles) headers['X-User-Roles'] = roles.join(',');

  const res = await fetch(`${API_BASE}/gates`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch gates: ${res.statusText}`);
  return res.json();
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
  return res.json();
}

export async function fetchFindings(): Promise<FindingDTO[]> {
  const res = await fetch(`${API_BASE}/findings`);
  if (!res.ok) throw new Error(`Failed to fetch findings: ${res.statusText}`);
  return res.json();
}

export async function triggerRun(controlId: string): Promise<RunItemDTO> {
  const res = await fetch(`${API_BASE}/runs/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
}

export async function fetchUploadedPolicies(): Promise<UploadedPolicyDTO[]> {
  const res = await fetch(`${API_BASE}/interactive/uploaded_policies`);
  if (!res.ok) throw new Error(`Failed to fetch uploaded policies: ${res.statusText}`);
  return res.json();
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
  controlId?: string
): Promise<{
  filename: string;
  format: string;
  text: string;
  pages: number;
  size_bytes: number;
  policy_id?: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (controlId) {
    formData.append('control_id', controlId);
  }

  const res = await fetch(`${API_BASE}/interactive/upload_policy_file`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || `Upload failed with status ${res.status}`);
  }
  return res.json();
}


export async function interpretPolicy(controlId: string, documentText?: string, filename?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control_id: controlId,
      document_text: documentText || null,
      filename: filename || null,
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

export async function verifyArchival(controlId: string, runId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/interactive/verify_archival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function interpretVulnerabilityPolicy(controlId: string, documentText?: string, filename?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/vulnerability/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control_id: controlId,
      document_text: documentText || null,
      filename: filename || null,
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
  querySql?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/vulnerability/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      control_id: controlId,
      run_id: runId || null,
      document_text: documentText || null,
      custom_rules: customRules || null,
      query_sql: querySql || null,
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

