import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Code,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { VulnReviewSnapshot, VulnScopeSummary } from '../../../types';
import { VulnSqlViewer } from './VulnSqlViewer';
import { formatRoleName, formatCompensatingControl } from '../../../utils/vulnDisplayNames';

interface VulnReviewStepProps {
  scopeSummary: VulnScopeSummary | null;
  reviewSnapshot: VulnReviewSnapshot | null;
  namedQueries: Record<string, string>;
  onRunQueries?: () => Promise<void>;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
  stage?: string;
  defaultsUsed?: string[];
}

const REQUIRED_COLUMNS_BY_CHECK: Record<string, string[]> = {
  Q1: ['vulnerability_id', 'database_name', 'cve_id', 'severity', 'is_kev', 'discovered_at', 'age_days', 'sla_days', 'overdue_days'],
  Q2: ['vulnerability_id', 'database_name', 'cve_id', 'severity', 'discovered_at', 'asset_owner', 'asset_owner_manager', 'ticket_id', 'assignee', 'due_date', 'ticket_issue'],
  Q3: ['exception_id', 'finding_id', 'database_name', 'cve_id', 'severity', 'requested_by', 'approved_by', 'compensating_control', 'expires_at', 'exception_status', 'exception_defect'],
};

const COLUMN_HEADERS: Record<string, string> = {
  vulnerability_id: 'Vulnerability ID',
  database_name: 'Database Name',
  cve_id: 'CVE ID',
  severity: 'Severity',
  is_kev: 'KEV',
  discovered_at: 'Discovered Date',
  age_days: 'Age (Days)',
  sla_days: 'SLA (Days)',
  overdue_days: 'Overdue (Days)',
  asset_owner: 'Asset Owner',
  asset_owner_manager: 'Asset Owner Manager',
  ticket_id: 'Ticket ID',
  assignee: 'Assignee',
  due_date: 'Due Date',
  ticket_issue: 'Ticket Issue',
  exception_id: 'Exception ID',
  finding_id: 'Finding ID',
  requested_by: 'Requested By',
  approved_by: 'Approved By',
  compensating_control: 'Compensating Control',
  expires_at: 'Expires At',
  exception_status: 'Exception Status',
  exception_defect: 'Exception Defect',
};

export const VulnReviewStep: React.FC<VulnReviewStepProps> = ({
  scopeSummary,
  reviewSnapshot,
  namedQueries,
  onRunQueries: _onRunQueries,
  onBack,
  onProceed,
  loading,
  stage: _stage,
  defaultsUsed,
}) => {
  const [selectedCheck, setSelectedCheck] = useState<'Q1' | 'Q2' | 'Q3'>('Q1');
  const [showSqlModal, setShowSqlModal] = useState<string | null>(null);
  const [expandScopeReasons, setExpandScopeReasons] = useState(false);

  const isExecuted = Boolean(reviewSnapshot?.review_executed);

  const q1 = reviewSnapshot?.q1_sla_breach;
  const q2 = reviewSnapshot?.q2_ticket_coverage;
  const q3 = reviewSnapshot?.q3_exception_governance || reviewSnapshot?.q4_exception_governance;

  const rules: any = (reviewSnapshot as any)?.rules || {};
  const slaKev = rules.sla_kev ?? 3;
  const slaCrit = rules.sla_critical ?? 7;
  const slaHigh = rules.sla_high ?? 30;
  const slaMed = rules.sla_medium ?? 60;
  const slaLow = rules.sla_low ?? 90;
  const excMax = rules.exception_max_days ?? 90;

  const q1Description = q1?.description || `Findings exceeding remediation SLA timeframes (KEV ${slaKev}d, Critical ${slaCrit}d, High ${slaHigh}d, Medium ${slaMed}d, Low ${slaLow}d) without approved exception.`;
  const q4Description = q3?.description || `Exception requests audited for pending approvals, expiration (> ${excMax}d), and compensating control verification.`;

  const checks = [
    {
      id: 'Q1' as const,
      num: 'Q1',
      title: 'SLA Breaches',
      description: q1Description,
      data: q1,
      sqlKey: 'Q1_SLA_BREACH',
      count: q1?.row_count,
    },
    {
      id: 'Q2' as const,
      num: 'Q2',
      title: 'Ticket Coverage',
      description: 'Open Critical/High/KEV findings lacking tracking tickets or tickets with missing owner or due date.',
      data: q2,
      sqlKey: 'Q2_TICKET_COVERAGE',
      count: q2?.row_count,
    },
    {
      id: 'Q3' as const,
      num: 'Q3',
      title: 'Exception Governance',
      description: q4Description,
      data: q3,
      sqlKey: 'Q3_EXCEPTION_GOVERNANCE',
      count: q3?.row_count,
    },
  ];

  const currentCheck = checks.find((c) => c.id === selectedCheck) || checks[0];

  const q2Untracked =
    q2?.candidate_count ??
    q2?.candidate_rows?.length ??
    reviewSnapshot?.summary?.ticket_candidate_count ??
    0;
  const q2Defective =
    q2?.defective_count ??
    q2?.defective_rows?.length ??
    reviewSnapshot?.summary?.defective_tickets_count ??
    0;

  // Scope counts and strip message
  const inScopeCount = scopeSummary?.counts?.assets_in_scope ?? 0;
  const testedCount = scopeSummary?.findings_reconciliation?.tested ?? 0;
  const excludedCount = scopeSummary?.findings_reconciliation?.excluded ?? 0;
  const excludedItems = scopeSummary?.findings_reconciliation?.excluded_by_reason ?? [];
  const scopeStripMsg = scopeSummary?.reconciliation_message || `${inScopeCount} assets in scope, ${testedCount} findings tested, ${excludedCount} excluded`;

  return (
    <div className="space-y-5">
      {/* Defaults Used Banner */}
      {((defaultsUsed && defaultsUsed.length > 0) || ((reviewSnapshot as any)?.defaults_used && (reviewSnapshot as any).defaults_used.length > 0)) && (
        <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col gap-1 shadow-2xs">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Policy Defaults Used</span>
          </div>
          <div className="pl-6 space-y-0.5 text-[11px] text-amber-800">
            {(defaultsUsed || (reviewSnapshot as any)?.defaults_used || []).map((msg: string, idx: number) => (
              <div key={idx}>{msg}</div>
            ))}
          </div>
        </div>
      )}

      {/* Scope Strip */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-2xs">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
              Scope Summary:
            </span>
            <span className="font-medium text-slate-700">{scopeStripMsg}</span>
          </div>
          {excludedCount > 0 ? (
            <button
              onClick={() => setExpandScopeReasons(!expandScopeReasons)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium cursor-pointer"
            >
              <span>{expandScopeReasons ? 'Hide exclusion reasons' : 'View exclusion reasons'}</span>
              {expandScopeReasons ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">All findings in scope</span>
          )}
        </div>

        {expandScopeReasons && excludedCount > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5 text-xs">
            <div className="text-[11px] font-semibold text-slate-600">Excluded Findings ({excludedItems.length}):</div>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {excludedItems.map((ex, idx) => (
                <div key={ex.vulnerability_id || idx} className="p-2 bg-white border border-slate-200 rounded text-[11px] flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-700">{ex.vulnerability_id} ({ex.database_name})</span>
                  <span className="text-slate-500 italic">{ex.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
        <h3 className="text-sm font-bold text-slate-900">Vulnerability Control Review Checks</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Three deterministic governance queries evaluating SLA breaches, ticket coverage, and exception governance.
        </p>
      </div>

      {/* 3 Check Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {checks.map((chk) => {
          const isSelected = selectedCheck === chk.id;
          const isQ2 = chk.id === 'Q2';
          const displayCount = loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : isExecuted ? (
            isQ2 ? (
              `${q2Untracked} untracked, ${q2Defective} defective tickets`
            ) : chk.count !== undefined ? (
              chk.count
            ) : (
              0
            )
          ) : (
            '-'
          );

          const hasDefects = isQ2
            ? q2Untracked + q2Defective > 0
            : Boolean(chk.count && chk.count > 0);

          return (
            <div
              key={chk.id}
              onClick={() => setSelectedCheck(chk.id)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left space-y-1.5 ${isSelected
                ? 'bg-blue-50/80 border-blue-400 shadow-xs ring-1 ring-blue-300'
                : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-300'
                }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[11px] font-mono font-bold text-slate-500 uppercase">{chk.num}</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${!isExecuted
                    ? 'bg-slate-100 text-slate-500'
                    : hasDefects
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                    }`}
                >
                  {displayCount}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900 leading-tight">{chk.title}</div>
              <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug">{chk.description}</p>
            </div>
          );
        })}
      </div>

      {/* Selected Check Details */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                {currentCheck.num}
              </span>
              <h4 className="text-sm font-bold text-slate-900">{currentCheck.title}</h4>
              <span className="text-xs text-slate-500">
                {currentCheck.id === 'Q2' && isExecuted
                  ? `(${q2Untracked} untracked, ${q2Defective} defective tickets)`
                  : `(${currentCheck.data?.row_count ?? 0} ${currentCheck.data?.row_count === 1 ? 'row' : 'rows'} detected)`}
              </span>
            </div>
            {currentCheck.id === 'Q1' ? (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Remediation SLA:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] bg-rose-100 text-rose-800 border border-rose-300">
                  KEV: {slaKev}d
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] bg-red-100 text-red-800 border border-red-300">
                  Critical: {slaCrit}d
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] bg-orange-100 text-orange-800 border border-orange-300">
                  High: {slaHigh}d
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] bg-amber-100 text-amber-800 border border-amber-300">
                  Medium: {slaMed}d
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] bg-blue-100 text-blue-800 border border-blue-300">
                  Low: {slaLow}d
                </span>
                <span className="text-slate-400 text-[11px] ml-1">(unresolved findings without approved exception)</span>
              </div>
            ) : (
              <p className="text-xs text-slate-600 mt-1">{currentCheck.description}</p>
            )}
          </div>

          <button
            onClick={() => setShowSqlModal(currentCheck.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Code className="w-3.5 h-3.5 text-slate-600" />
            <span>View executed SQL</span>
          </button>
        </div>

        {/* Results Table (Capped at 50) */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-72">
          {currentCheck.data?.rows && currentCheck.data.rows.length > 0 ? (() => {
            const firstRow = currentCheck.data.rows[0] || {};
            const reqCols = REQUIRED_COLUMNS_BY_CHECK[currentCheck.id] || [];
            const visibleCols = reqCols.filter((col) => col in firstRow).length > 0
              ? reqCols.filter((col) => col in firstRow)
              : Object.keys(firstRow).filter((col) => !['raw', 'payload', 'is_kev', 'cvss_score', 'status', 'finding_status', 'exception_id', 'exception_status', 'exception_expires_at', 'mirrored_exception_status', 'mirrored_expires_at', 'requested_at', 'approved_at', 'justification', 'tier', 'asset_id', 'ticket_status', 'escalated_at'].includes(col));

            return (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    {visibleCols.map((header) => {
                      const isResultCol = ['overdue_days', 'ticket_issue', 'exception_defect'].includes(header);
                      return (
                        <th
                          key={header}
                          className={`p-2.5 whitespace-nowrap uppercase text-[10px] tracking-wider ${isResultCol
                              ? 'bg-amber-100/80 text-amber-950 font-bold border-x border-amber-200'
                              : ''
                            }`}
                        >
                          {COLUMN_HEADERS[header] || header.replace(/_/g, ' ')}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                  {currentCheck.data.rows.slice(0, 50).map((row: any, idx: number) => {
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        {visibleCols.map((colKey) => {
                          const val = row[colKey];
                          const displayVal = val !== null && val !== undefined ? String(val) : '-';

                          // Highlight Severity
                          if (colKey === 'severity') {
                            const sev = String(val || '').toUpperCase();
                            const badgeColors =
                              sev === 'CRITICAL'
                                ? 'bg-red-100 text-red-800 border-red-300'
                                : sev === 'HIGH'
                                ? 'bg-orange-100 text-orange-800 border-orange-300'
                                : sev === 'MEDIUM'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : sev === 'LOW'
                                ? 'bg-blue-100 text-blue-800 border-blue-300'
                                : 'bg-slate-100 text-slate-700 border-slate-200';

                            return (
                              <td key={colKey} className="p-2.5 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] border shadow-2xs ${badgeColors}`}>
                                  {sev || displayVal}
                                </span>
                              </td>
                            );
                          }

                          // Highlight SLA days
                          if (colKey === 'sla_days') {
                            return (
                              <td key={colKey} className="p-2.5 whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                                  {displayVal}d
                                </span>
                              </td>
                            );
                          }

                          // Highlight KEV status
                          if (colKey === 'is_kev') {
                            const isKev = val === 1 || val === true || val === '1' || val === 'true';
                            return (
                              <td key={colKey} className="p-2.5 whitespace-nowrap">
                                {isKev ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded font-bold text-[10px] bg-rose-100 text-rose-800 border border-rose-300">
                                    KEV
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-xs">No</span>
                                )}
                              </td>
                            );
                          }

                          // Highlight Q1 result: overdue_days
                          if (colKey === 'overdue_days') {
                            const num = Number(val);
                            return (
                              <td key={colKey} className="p-2.5 whitespace-nowrap bg-rose-50/60 border-x border-rose-100">
                                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[11px] bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs">
                                  {num > 0 ? `+${num}d overdue` : `${num}d`}
                                </span>
                              </td>
                            );
                          }

                          // Highlight Q2 result: ticket_issue
                          if (colKey === 'ticket_issue') {
                            const isDefect = displayVal !== 'TRACKED';
                            return (
                              <td key={colKey} className="p-2.5 whitespace-nowrap bg-amber-50/60 border-x border-amber-100">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] border shadow-2xs ${isDefect
                                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    }`}
                                >
                                  {displayVal}
                                </span>
                              </td>
                            );
                          }

                          // Highlight Q3 result: exception_defect
                          if (colKey === 'exception_defect') {
                            return (
                              <td key={colKey} className="p-2.5 whitespace-nowrap bg-purple-50/60 border-x border-purple-100">
                                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] bg-purple-100 text-purple-900 border border-purple-300 shadow-2xs">
                                  {displayVal}
                                </span>
                              </td>
                            );
                          }

                          if (['asset_owner', 'asset_owner_manager', 'assignee', 'escalated_to', 'requested_by', 'approved_by'].includes(colKey)) {
                            return (
                              <td key={colKey} className="p-2.5 whitespace-nowrap">
                                {displayVal !== '-' ? formatRoleName(displayVal) : '-'}
                              </td>
                            );
                          }

                          if (colKey === 'compensating_control') {
                            return (
                              <td key={colKey} className="p-2.5 whitespace-nowrap">
                                {displayVal !== '-' ? formatCompensatingControl(displayVal) : '-'}
                              </td>
                            );
                          }

                          return (
                            <td key={colKey} className="p-2.5 whitespace-nowrap">
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })() : (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-xs text-slate-600 font-medium">No defects detected for this check.</p>
              <p className="text-[11px] text-slate-400">All evaluated records comply with policy specification.</p>
            </div>
          )}
        </div>
        {currentCheck.data?.rows && currentCheck.data.rows.length > 50 && (
          <div className="text-[11px] text-slate-500 text-right italic">
            Displaying first 50 rows of {currentCheck.data.total_row_count || currentCheck.data.rows.length} total rows.
          </div>
        )}
      </div>

      {/* SQL Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Executed SQL: {currentCheck.num} ({currentCheck.title})
                </h4>
              </div>
              <button
                onClick={() => setShowSqlModal(null)}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded"
              >
                ✕ Close
              </button>
            </div>
            <VulnSqlViewer
              sql={currentCheck.data?.sql || namedQueries[currentCheck.sqlKey] || '-- No SQL available'}
              title={`${currentCheck.num}: ${currentCheck.title}`}
            />
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Analysis
        </button>

        <div className="flex items-center gap-3">
          {!isExecuted && (
            <span className="text-[11px] text-amber-700 font-medium">
              Review queries must complete before proceeding
            </span>
          )}
          <button
            onClick={onProceed}
            disabled={!isExecuted || loading}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <span>Proceed to Tickets</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
