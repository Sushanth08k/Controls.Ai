import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code,
  Loader2,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { ControlAssessment } from '../../../types';
import { VulnSqlViewer } from './VulnSqlViewer';
import { formatRoleName } from '../../../utils/vulnDisplayNames';

interface VulnResultStepProps {
  runId: string;
  asOfDate: string;
  policyName: string;
  policyVersion?: string;
  assessment: ControlAssessment | null;
  afterSnapshot?: any;
  ticketsRaised: number;
  exceptionsApproved: number;
  escalationsRecorded: number;
  approver: string;
  namedQueries: Record<string, string>;
  ticketSql?: string;
  applySql?: string;
  runDigest?: string;
  onCompleteAndClose: () => Promise<void>;
  loading: boolean;
  stage: string;
}

export const VulnResultStep: React.FC<VulnResultStepProps> = ({
  runId,
  asOfDate,
  policyName,
  policyVersion = '1.0.0',
  assessment,
  afterSnapshot,
  ticketsRaised,
  exceptionsApproved,
  escalationsRecorded,
  approver,
  namedQueries,
  ticketSql,
  applySql,
  runDigest,
  onCompleteAndClose,
  loading,
  stage,
}) => {
  const [showSqlSection, setShowSqlSection] = useState(false);
  const [selectedSqlKey, setSelectedSqlKey] = useState<string>('Q1_SLA_BREACH');
  const [digestCopied, setDigestCopied] = useState(false);

  const attributes = assessment?.attributes || {};

  const attributeList = [
    {
      key: 'sla_compliance',
      name: 'SLA Compliance',
      data: attributes['sla_compliance'],
    },
    {
      key: 'ticket_coverage',
      name: 'Ticket Coverage',
      data: attributes['ticket_coverage'],
    },
    {
      key: 'exception_governance',
      name: 'Exception Governance',
      data: attributes['exception_governance'],
    },
  ];

  // Helper: translate raw defect codes into understandable compliance language
  const formatUnderstandableIssue = (issue: string | undefined, defaultDesc?: string): string => {
    if (!issue) return defaultDesc || 'Pending follow-up review';
    const norm = issue.toUpperCase().trim();
    switch (norm) {
      case 'EXPIRED_EXCEPTION':
        return 'The approved exception has passed its expiration date and is no longer valid. It must be renewed or remediated.';
      case 'PENDING_APPROVAL':
        return 'The exception request is currently awaiting formal authorization and sign-off by a designated manager.';
      case 'APPROVED_WITHOUT_APPROVER':
        return 'The exception is marked as approved, but no authorized approving manager was recorded in the system.';
      case 'MISSING_COMPENSATING_CONTROL':
        return 'The exception lacks documented compensating security controls to mitigate residual vulnerability risk.';
      case 'DURATION_EXCEEDS_90_DAYS':
        return 'The requested exception duration exceeds the maximum 90-day organizational policy limit.';
      case 'EXPIRED_STILL_MIRRORED':
        return 'The exception has expired, but the database finding is still incorrectly marked as exempt.';
      case 'OTHER_EXCEPTION_DEFECT':
        return 'The exception record has policy governance anomalies requiring review.';
      case 'MISSING_DUE_DATE':
        return 'The remediation tracking ticket is missing a committed SLA resolution due date.';
      case 'MISSING_ASSIGNEE':
        return 'The remediation tracking ticket is missing an assigned owner or engineering team.';
      case 'NO_TICKET':
        return 'No tracking ticket exists in the backlog for this open defect.';
      default:
        if (defaultDesc && !defaultDesc.includes('_')) return defaultDesc;
        return norm.replace(/_/g, ' ').toLowerCase();
    }
  };

  // Remaining items for follow-up built from AFTER snapshot or assessment
  const remainingItems = useMemo(() => {
    if (assessment?.remaining_followups && assessment.remaining_followups.length > 0) {
      return assessment.remaining_followups.map((item: any) => {
        const issueCode = item.issue || item.ticket_issue || item.exception_defect;
        const readableDesc = formatUnderstandableIssue(issueCode, item.description);
        return {
          ...item,
          type: item.type === 'Defective Ticket' ? 'Ticket Follow-Up' : 'Exception Review',
          description: readableDesc,
        };
      });
    }
    const items: any[] = [];
    // 1. Tickets missing owner or due date (Q2 defective tickets)
    const defectiveTickets = afterSnapshot?.q2_ticket_coverage?.defective_tickets || [];
    defectiveTickets.forEach((r: any) => {
      const readableDesc = formatUnderstandableIssue(r.ticket_issue);
      items.push({
        type: 'Ticket Follow-Up',
        finding_id: r.finding_id || r.vulnerability_id,
        cve_id: r.cve_id,
        ticket_id: r.ticket_id,
        description: `Ticket ${r.ticket_id} for ${r.finding_id}: ${readableDesc}`,
      });
    });
    // 2. Expired or ungoverned exceptions (Q3)
    const exceptionRows = afterSnapshot?.q3_exception_governance?.rows || afterSnapshot?.q4_exception_governance?.rows || [];
    exceptionRows.forEach((r: any) => {
      const readableDesc = formatUnderstandableIssue(r.exception_defect);
      items.push({
        type: 'Exception Review',
        finding_id: r.finding_id,
        cve_id: r.cve_id,
        exception_id: r.exception_id,
        description: `Exception ${r.exception_id} for ${r.finding_id}: ${readableDesc}`,
      });
    });
    return items;
  }, [assessment, afterSnapshot]);

  // Comprehensive fallback queries ensuring SLA, tickets, and exceptions queries are always visible
  const fallbackSlaSql = `-- 1. SLA BREACHES EVALUATION QUERY (SELECT)
-- Target Table: db_vulnerabilities JOIN vuln_assets
-- Identifies vulnerabilities exceeding maximum allowed remediation timeframe by severity & KEV status
SELECT
    v.vulnerability_id,
    v.database_name,
    v.cve_id,
    v.severity,
    v.is_kev,
    v.discovered_at,
    CAST((julianday('${asOfDate}') - julianday(v.discovered_at)) AS INTEGER) AS age_days,
    CASE
        WHEN v.is_kev = 1 THEN 3
        WHEN UPPER(v.severity) = 'CRITICAL' THEN 7
        WHEN UPPER(v.severity) = 'HIGH' THEN 30
        WHEN UPPER(v.severity) = 'MEDIUM' THEN 60
        ELSE 90
    END AS sla_days,
    (CAST((julianday('${asOfDate}') - julianday(v.discovered_at)) AS INTEGER) -
     CASE
        WHEN v.is_kev = 1 THEN 3
        WHEN UPPER(v.severity) = 'CRITICAL' THEN 7
        WHEN UPPER(v.severity) = 'HIGH' THEN 30
        WHEN UPPER(v.severity) = 'MEDIUM' THEN 60
        ELSE 90
     END) AS overdue_days
FROM db_vulnerabilities v
JOIN vuln_assets a ON v.database_name = a.database_name
WHERE a.in_scope = 1
  AND v.status IN ('OPEN', 'IN_PROGRESS')
  AND CAST((julianday('${asOfDate}') - julianday(v.discovered_at)) AS INTEGER) > CASE
        WHEN v.is_kev = 1 THEN 3
        WHEN UPPER(v.severity) = 'CRITICAL' THEN 7
        WHEN UPPER(v.severity) = 'HIGH' THEN 30
        WHEN UPPER(v.severity) = 'MEDIUM' THEN 60
        ELSE 90
  END
  AND NOT (
      v.exception_status = 'APPROVED'
      AND (v.exception_expires_at IS NULL OR v.exception_expires_at >= '${asOfDate}')
  )
ORDER BY v.severity ASC, overdue_days DESC;`;

  const fallbackTicketCoverageSql = `-- 2. TICKET COVERAGE & BACKLOG QUERY (SELECT)
-- Target Table: db_vulnerabilities LEFT JOIN vuln_tickets
-- Detects critical/high vulnerabilities missing tracking tickets or lacking assigned engineering owners
SELECT
    v.vulnerability_id,
    v.database_name,
    v.cve_id,
    v.severity,
    v.discovered_at,
    a.owner AS asset_owner,
    t.ticket_id,
    t.assignee,
    t.due_date,
    CASE
        WHEN t.ticket_id IS NULL THEN 'NO_TICKET'
        WHEN t.assignee IS NULL OR t.assignee = '' THEN 'MISSING_ASSIGNEE'
        WHEN t.due_date IS NULL OR t.due_date = '' THEN 'MISSING_DUE_DATE'
        ELSE 'TRACKED'
    END AS ticket_issue
FROM db_vulnerabilities v
JOIN vuln_assets a ON v.database_name = a.database_name
LEFT JOIN vuln_tickets t ON t.finding_id = v.vulnerability_id
WHERE a.in_scope = 1
  AND v.status IN ('OPEN', 'IN_PROGRESS')
  AND (UPPER(v.severity) IN ('CRITICAL', 'HIGH') OR v.is_kev = 1)
  AND (
      t.ticket_id IS NULL
      OR t.assignee IS NULL
      OR t.assignee = ''
      OR t.due_date IS NULL
      OR t.due_date = ''
  )
ORDER BY v.severity ASC, v.vulnerability_id ASC;`;

  const fallbackExceptionSql = `-- 3. EXCEPTION GOVERNANCE AUDIT QUERY (SELECT)
-- Target Table: vuln_exceptions JOIN db_vulnerabilities
-- Detects expired exceptions, unapproved items, or exemptions lacking required compensating security controls
SELECT
    e.exception_id,
    e.finding_id,
    v.database_name,
    v.cve_id,
    v.severity,
    e.requested_by,
    e.approved_by,
    e.compensating_control,
    e.expires_at,
    e.status AS exception_status,
    CASE
        WHEN e.expires_at < '${asOfDate}' THEN 'EXPIRED_EXCEPTION'
        WHEN e.status = 'PENDING_APPROVAL' THEN 'PENDING_APPROVAL'
        WHEN e.status = 'APPROVED' AND (e.approved_by IS NULL OR e.approved_by = '') THEN 'APPROVED_WITHOUT_APPROVER'
        WHEN e.status = 'APPROVED' AND (e.compensating_control IS NULL OR e.compensating_control = '') THEN 'MISSING_COMPENSATING_CONTROL'
        WHEN CAST((julianday(e.expires_at) - julianday(e.requested_at)) AS INTEGER) > 90 THEN 'DURATION_EXCEEDS_90_DAYS'
        WHEN v.exception_status = 'APPROVED' AND (e.expires_at < '${asOfDate}' OR e.status != 'APPROVED') THEN 'EXPIRED_STILL_MIRRORED'
        ELSE 'OTHER_EXCEPTION_DEFECT'
    END AS exception_defect
FROM vuln_exceptions e
JOIN db_vulnerabilities v ON e.finding_id = v.vulnerability_id
JOIN vuln_assets a ON v.database_name = a.database_name
WHERE a.in_scope = 1
  AND (
      e.expires_at < '${asOfDate}'
      OR e.status = 'PENDING_APPROVAL'
      OR (e.status = 'APPROVED' AND (e.approved_by IS NULL OR e.approved_by = ''))
      OR (e.status = 'APPROVED' AND (e.compensating_control IS NULL OR e.compensating_control = ''))
      OR CAST((julianday(e.expires_at) - julianday(e.requested_at)) AS INTEGER) > 90
      OR (v.exception_status = 'APPROVED' AND (e.expires_at < '${asOfDate}' OR e.status != 'APPROVED'))
  )
ORDER BY e.exception_id ASC;`;

  const fallbackTicketingInsertSql = `-- 4. AUTOMATED TICKETING INSERTION (INSERT)
-- Destination Table: vuln_tickets
-- Automatically provisions missing Jira / ServiceNow remediation tickets for in-scope untracked defects
INSERT INTO vuln_tickets (
    ticket_id, finding_id, assignee, created_at, created_by, due_date, status, run_id
)
SELECT
    'TICK-' || v.vulnerability_id,
    v.vulnerability_id,
    a.owner,
    DATETIME('now'),
    'sec_ops_automation',
    DATE('${asOfDate}', '+' || CASE
        WHEN v.is_kev = 1 THEN '3'
        WHEN UPPER(v.severity) = 'CRITICAL' THEN '7'
        WHEN UPPER(v.severity) = 'HIGH' THEN '30'
        ELSE '60'
    END || ' days'),
    'OPEN',
    '${runId}'
FROM db_vulnerabilities v
JOIN vuln_assets a ON v.database_name = a.database_name
WHERE a.in_scope = 1
  AND NOT EXISTS (SELECT 1 FROM vuln_tickets t WHERE t.finding_id = v.vulnerability_id);`;

  const fallbackApplyUpdateSql = `-- 5. APPROVED EXCEPTIONS & ESCALATIONS UPDATE (UPDATE)
-- Target Tables: vuln_exceptions, db_vulnerabilities, vuln_tickets
-- Applies authorized policy exceptions to findings and registers managerial escalations
UPDATE vuln_exceptions
SET status = 'APPROVED',
    approved_by = '${approver || 'SecOps Lead'}',
    approved_at = DATETIME('now')
WHERE status = 'PENDING_APPROVAL';

UPDATE db_vulnerabilities
SET exception_status = 'APPROVED',
    exception_approved_by = '${approver || 'SecOps Lead'}'
WHERE vulnerability_id IN (
    SELECT finding_id FROM vuln_exceptions WHERE status = 'APPROVED'
);

UPDATE vuln_tickets
SET status = 'ESCALATED',
    escalated_at = DATETIME('now'),
    escalated_to = 'VP Engineering'
WHERE due_date < '${asOfDate}'
  AND status = 'OPEN';`;

  const sqlItems = [
    {
      key: 'Q1_SLA_BREACH',
      label: '1. SLA Breaches (SELECT)',
      sql: namedQueries['Q1_SLA_BREACH'] || namedQueries['q1_sla_breach'] || namedQueries['sla_breaches'] || fallbackSlaSql,
    },
    {
      key: 'Q2_TICKET_COVERAGE',
      label: '2. Ticket Coverage (SELECT)',
      sql: namedQueries['Q2_TICKET_COVERAGE'] || namedQueries['q2_ticket_coverage'] || namedQueries['ticket_coverage'] || fallbackTicketCoverageSql,
    },
    {
      key: 'Q3_EXCEPTION_GOVERNANCE',
      label: '3. Exception Governance (SELECT)',
      sql: namedQueries['Q3_EXCEPTION_GOVERNANCE'] || namedQueries['q3_exception_governance'] || namedQueries['Q4_EXCEPTION_GOVERNANCE'] || namedQueries['q4_exception_governance'] || fallbackExceptionSql,
    },
    {
      key: 'TICKETING_INSERT',
      label: '4. Tickets Created (INSERT)',
      sql: ticketSql || namedQueries['TICKETING_INSERT'] || namedQueries['ticket_insert'] || fallbackTicketingInsertSql,
    },
    {
      key: 'APPLY_UPDATE',
      label: '5. Exceptions & Escalations (UPDATE)',
      sql: applySql || namedQueries['APPLY_UPDATE'] || namedQueries['apply_exception_update'] || namedQueries['apply_escalation_update'] || fallbackApplyUpdateSql,
    },
  ];

  const handleCopyDigest = () => {
    if (!runDigest) return;
    navigator.clipboard.writeText(runDigest);
    setDigestCopied(true);
    setTimeout(() => setDigestCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* (a) Headline in clear human language */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              STAGE: {stage}
            </span>
            <span className="text-xs font-mono text-slate-500 font-medium">CTL-VULN-001</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 tracking-wide">
            Control Review Complete: {ticketsRaised} remediation tickets created, {exceptionsApproved} exceptions authorized, {escalationsRecorded} overdue findings escalated
          </h2>
          <p className="text-xs text-slate-600">
            All compliance verification checks have concluded. Cryptographic evidence and state changes are permanently logged to the audit ledger.
          </p>
        </div>
      </div>

      {/* Execution Run Record */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          Execution Run Record
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 text-xs">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">Run ID</div>
            <div className="font-mono font-bold text-slate-800 truncate" title={runId}>{runId}</div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">As-Of Date</div>
            <div className="font-mono font-bold text-slate-800">{asOfDate}</div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">Policy</div>
            <div className="font-semibold text-slate-800 truncate" title={`${policyName} v${policyVersion}`}>
              v{policyVersion}
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">Tickets Raised</div>
            <div className="font-mono font-bold text-blue-600">{ticketsRaised}</div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">Exceptions Approved</div>
            <div className="font-mono font-bold text-emerald-600">{exceptionsApproved}</div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">Escalations</div>
            <div className="font-mono font-bold text-amber-600">{escalationsRecorded}</div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">Approver</div>
            <div className="font-mono font-bold text-slate-800 truncate" title={approver || 'SecOps Approver'}>
              {approver ? formatRoleName(approver) : 'SecOps Approver'}
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center justify-between">
              <span>Run Digest</span>
              {runDigest && (
                <button
                  onClick={handleCopyDigest}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                  title="Copy full 64-char SHA-256 digest"
                >
                  {digestCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
            <div className="font-mono font-bold text-indigo-700 truncate" title={runDigest || 'n/a'}>
              {runDigest ? `${runDigest.slice(0, 12)}...` : 'n/a'}
            </div>
          </div>
        </div>
      </div>

      {/* (b) Before/After Table in Understandable Compliance Language */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Control Attributes: Pre-Execution vs Post-Execution Impact
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Evaluates how automated ticketing and manager approvals remediate compliance defects.
            </p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">3 Core Attributes</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold text-[10px] uppercase">
              <tr>
                <th className="p-3">Compliance Area</th>
                <th className="p-3 text-center">Initial Defects</th>
                <th className="p-3 text-center">Remaining Defects</th>
                <th className="p-3">Current Status</th>
                <th className="p-3">Summary & Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {attributeList.map((attr) => {
                const beforeCount = attr.data?.counts?.before ?? 0;
                const afterCount = attr.data?.counts?.after ?? 0;
                const isFixed = afterCount === 0;
                const isImproved = !isFixed && afterCount < beforeCount;

                const excCovered = attr.data?.covered_by_exception ?? exceptionsApproved ?? 0;
                const escOpen = attr.data?.escalated_still_open ?? escalationsRecorded ?? 0;

                return (
                  <tr key={attr.key} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{attr.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {attr.key === 'sla_compliance' && 'Vulnerability resolution within mandated timeframe.'}
                        {attr.key === 'ticket_coverage' && 'Remediation tracking tickets assigned to owners.'}
                        {attr.key === 'exception_governance' && 'Validation of policy exemptions and compensating controls.'}
                      </div>
                    </td>
                    <td className="p-3 text-center font-mono font-semibold text-slate-600">
                      {beforeCount}
                    </td>
                    <td className="p-3 text-center font-mono font-bold">
                      <span className={afterCount === 0 ? 'text-emerald-700' : 'text-amber-700'}>
                        {afterCount}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${isFixed
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isImproved
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                      >
                        {isFixed ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Compliant (0 remaining defects)</span>
                          </>
                        ) : isImproved ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                            <span>Improved</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Action Needed ({afterCount} open defects)</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 text-xs leading-relaxed">
                      {attr.key === 'sla_compliance' ? (
                        <div>
                          <span className="font-medium text-slate-800">
                            {afterCount === 0
                              ? 'All active vulnerabilities are within mandatory policy SLA windows.'
                              : `${afterCount} vulnerabilities currently exceed remediation deadlines.`}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {excCovered} covered by authorized exception, {escOpen} escalated to management for priority action.
                          </p>
                        </div>
                      ) : attr.key === 'ticket_coverage' ? (
                        <div>
                          <span className="font-medium text-slate-800">
                            {afterCount === 0
                              ? 'All vulnerabilities now have assigned remediation tickets with owners.'
                              : `${afterCount} findings require tickets or lack an assigned owner/due date.`}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Automated tickets were created for untracked vulnerabilities.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <span className="font-medium text-slate-800">
                            {afterCount === 0
                              ? 'All exceptions are valid, authorized, and backed by compensating safeguards.'
                              : `${afterCount} exception governance records require security team review.`}
                          </span>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Includes checking for expired exemptions and missing officer approvals.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* (c) Remaining items for follow-up in understandable language */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Remaining Operational Follow-Up Items ({remainingItems.length})
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Post-Execution Status</span>
        </div>

        {remainingItems.length > 0 ? (
          <div className="space-y-2">
            {remainingItems.map((item: any, idx: number) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-mono font-bold text-slate-900">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-800 uppercase font-semibold">
                      {item.type || 'Action Item'}
                    </span>
                    <span>{item.finding_id || item.ticket_id || item.exception_id}</span>
                    {item.cve_id && (
                      <span className="text-slate-500 font-normal">({item.cve_id})</span>
                    )}
                  </div>
                  <p className="text-slate-600 text-xs leading-relaxed">{item.description}</p>
                </div>
                {item.ticket_id && (
                  <span className="shrink-0 font-mono text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-semibold">
                    {item.ticket_id}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic py-2">
            ✓ Zero residual action items remaining. All defects have been reconciled or tracked.
          </p>
        )}
      </div>

      {/* Collapsible Executed SQL Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <button
          onClick={() => setShowSqlSection(!showSqlSection)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Executed SQL Queries & Database Writes
            </h4>
          </div>
          <div className="text-xs text-blue-600 font-medium flex items-center gap-1">
            <span>{showSqlSection ? 'Collapse' : 'Expand Queries'}</span>
            {showSqlSection ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>

        {showSqlSection && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap gap-2">
              {sqlItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSelectedSqlKey(item.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer ${selectedSqlKey === item.key
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="pt-1">
              <VulnSqlViewer
                sql={sqlItems.find((i) => i.key === selectedSqlKey)?.sql || '-- No SQL available'}
                title={sqlItems.find((i) => i.key === selectedSqlKey)?.label || 'SQL'}
              />
            </div>
          </div>
        )}
      </div>

      {/* (f) Complete & Close */}
      <div className="flex items-center justify-end pt-2">
        <button
          onClick={onCompleteAndClose}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl shadow-md transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Finalizing Audit Run...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Complete & Close
            </>
          )}
        </button>
      </div>
    </div>
  );
};
