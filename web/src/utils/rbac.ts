import { UserSessionDTO } from '../types';

export type AppRole = 'approver' | 'executor' | 'auditor';

export const COMPLIANCE_ROLES: { id: AppRole; label: string; desc: string; badgeColor: string }[] = [
  {
    id: 'approver',
    label: 'Approver',
    desc: 'Full access: execute control runs, review findings, and approve/reject gates',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 'executor',
    label: 'Executor / Operator',
    desc: 'Execution access: run controls up to approval stage; must wait for approver sign-off',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'auditor',
    label: 'Auditor',
    desc: 'Read-only access: inspect controls, audit trails, evidence, and run results',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
  },
];

/**
 * Resolves the user's primary application role from their session.
 */
export function getPrimaryRole(user?: UserSessionDTO | null): AppRole {
  if (!user || !user.roles || user.roles.length === 0) return 'executor';
  const rolesLower = user.roles.map((r) => r.toLowerCase());

  if (
    rolesLower.some((r) =>
      ['approver', 'control_reviewer', 'risk_officer', 'db_security_owner', 'release_owner'].includes(r)
    )
  ) {
    return 'approver';
  }

  if (rolesLower.includes('auditor') || rolesLower.includes('compliance_auditor')) {
    return 'auditor';
  }

  return 'executor';
}

/**
 * Approver: Can execute all control steps AND approve gates.
 */
export function isApprover(user?: UserSessionDTO | null): boolean {
  return getPrimaryRole(user) === 'approver';
}

/**
 * Executor: Can execute control steps up to approval, but cannot approve.
 */
export function isExecutor(user?: UserSessionDTO | null): boolean {
  return getPrimaryRole(user) === 'executor';
}

/**
 * Auditor: Read-only access across the entire platform.
 */
export function isAuditor(user?: UserSessionDTO | null): boolean {
  return getPrimaryRole(user) === 'auditor';
}

/**
 * Whether the user is allowed to initiate or execute control runs.
 * True for Approver and Executor; False for Auditor.
 */
export function canExecuteControls(user?: UserSessionDTO | null): boolean {
  return !isAuditor(user);
}

/**
 * Whether the user is authorized to approve or reject gates.
 * True ONLY for Approver.
 */
export function canApproveGates(user?: UserSessionDTO | null): boolean {
  return isApprover(user);
}
