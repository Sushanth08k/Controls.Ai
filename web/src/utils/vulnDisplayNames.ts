/**
 * Simple role name and compensating control formatters for Vulnerability Management UI (Option B).
 * Formats database machine slugs into clear, understandable role titles without altering the database.
 */

export const ROLE_NAME_MAP: Record<string, string> = {
  // Asset Owners & Assignees
  db_admin_core: 'Database Administrator',
  sec_ops_team: 'Security Operations',
  payments_lead: 'Payments Lead',
  crm_data_owner: 'CRM Data Owner',
  identity_team: 'Identity & Access Team',
  analytics_lead: 'Analytics Lead',
  vault_admin: 'Key Vault Admin',
  sec_admin: 'Security Admin',
  sec_scanner_bot: 'Automated Scanner',

  // Management & Escalation Roles
  eng_dir_payments: 'Engineering Director (Payments)',
  ciso_direct: 'CISO',
  vp_engineering: 'VP of Engineering',
  head_data_ops: 'Head of Data Operations',
  head_cyber_sec: 'Head of Cybersecurity',
  vp_analytics: 'VP of Analytics',
  ciso_approval_board: 'CISO Approval Board',
};

export const COMPENSATING_CONTROL_MAP: Record<string, string> = {
  'WAF virtual patching + isolated auth subnet': 'Web Application Firewall (WAF) Rule',
  'IP restricted access': 'IP Whitelisting',
  'Network segmentation applied': 'Network Isolation',
  'Applied per policy': 'Standard Compensating Control',
  Applied: 'Standard Compensating Control',
  'Port blocking': 'Port Blocking',
  'Port blocking pattern': 'Port Blocking',
  'WAF rule block pattern + network isolation': 'Web Application Firewall (WAF) Rule',
};

/**
 * Formats machine slugs into simple, understandable role names.
 */
export function formatRoleName(handle?: string | null): string {
  if (!handle) return '-';
  const clean = handle.trim();
  if (ROLE_NAME_MAP[clean]) {
    return ROLE_NAME_MAP[clean];
  }
  if (clean.includes('@')) {
    return clean;
  }
  // Convert unknown snake_case (e.g. data_eng_lead) to Title Case (Data Eng Lead)
  if (clean.includes('_')) {
    return clean
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return clean;
}

/**
 * Formats technical compensating control strings into simple, clear descriptions.
 */
export function formatCompensatingControl(control?: string | null): string {
  if (!control) return 'None specified';
  const clean = control.trim();
  if (COMPENSATING_CONTROL_MAP[clean]) {
    return COMPENSATING_CONTROL_MAP[clean];
  }
  return clean;
}

/**
 * Simple control objective descriptions for Vulnerability and Archival control cards.
 */
export function getControlObjective(controlId: string, title?: string, fallback?: string): string {
  const s = `${controlId} ${title || ''}`.toLowerCase();
  if (s.includes('vuln') || s.includes('vulnerability')) {
    return 'Reviews existing vulnerability records in the database and assess deadlines (SLA) according to rules and exceptions';
  }
  if (s.includes('arch') || s.includes('retention') || s.includes('archive')) {
    return 'Ensures records are archived according to retention rules and exceptions';
  }
  return fallback || '';
}

/**
 * Formats approval gate machine names (vuln_approval, archive_signoff) into clear, understandable titles.
 */
export function formatGateTitle(nameOrType?: string | null, controlId?: string | null): string {
  if (!nameOrType) {
    if (controlId?.toLowerCase().includes('vuln')) return 'Vulnerability Remediation Sign-off';
    if (controlId?.toLowerCase().includes('arch')) return 'Archival Sign-off';
    return 'Approval Sign-off';
  }
  const clean = nameOrType.trim().toLowerCase();
  if (clean === 'vuln_approval' || clean === 'finding_signoff') {
    return 'Vulnerability Remediation Sign-off';
  }
  if (clean === 'archive_signoff' || clean === 'archival_signoff' || clean === 'operator_signoff') {
    return 'Archival Sign-off';
  }
  if (clean.includes('_')) {
    return clean
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return nameOrType;
}

/**
 * Formats approver role label for approval cards.
 * Returns 'Approver' since Approver is the authorized role in the system.
 */
export function formatApproverRole(role?: string | null): string {
  if (!role) return 'Approver';
  const clean = role.trim().toLowerCase();
  if (clean === 'control_reviewer' || clean === 'approver') {
    return 'Approver';
  }
  return 'Approver';
}
