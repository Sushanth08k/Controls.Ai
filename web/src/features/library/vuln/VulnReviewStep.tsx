import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Code,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { VulnReviewSnapshot, VulnScopeSummary } from '../../../types';
import { VulnSqlViewer } from './VulnSqlViewer';

interface VulnReviewStepProps {
  scopeSummary: VulnScopeSummary | null;
  reviewSnapshot: VulnReviewSnapshot | null;
  namedQueries: Record<string, string>;
  onRunQueries: () => Promise<void>;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
  stage: string;
}

export const VulnReviewStep: React.FC<VulnReviewStepProps> = ({
  scopeSummary,
  reviewSnapshot,
  namedQueries,
  onRunQueries,
  onBack,
  onProceed,
  loading,
  stage,
}) => {
  const [selectedCheck, setSelectedCheck] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [showSqlModal, setShowSqlModal] = useState<string | null>(null);
  const [expandScopeReasons, setExpandScopeReasons] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isExecuted = Boolean(reviewSnapshot?.review_executed);

  const q1 = reviewSnapshot?.q1_sla_breach;
  const q2 = reviewSnapshot?.q2_ticket_coverage;
  const q3 = reviewSnapshot?.q3_closure_validity;
  const q4 = reviewSnapshot?.q4_exception_governance;

  const checks = [
    {
      id: 'Q1' as const,
      num: 'Q1',
      title: 'SLA Breaches',
      description: 'Findings exceeding remediation SLA timeframes (KEV 3d, Critical 7d, High 30d, Medium 60d) without approved exception.',
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
      title: 'Closure Validity',
      description: 'Closed or patched findings audited for verified rescan evidence to prevent premature closure without confirmation.',
      data: q3,
      sqlKey: 'Q3_CLOSURE_VALIDITY',
      count: q3?.row_count,
    },
    {
      id: 'Q4' as const,
      num: 'Q4',
      title: 'Exception Governance',
      description: 'Exception requests audited for pending approvals, expiration, and compensating control verification.',
      data: q4,
      sqlKey: 'Q4_EXCEPTION_GOVERNANCE',
      count: q4?.row_count,
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

  const handleRerun = async () => {
    setErrorMsg(null);
    try {
      await onRunQueries();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to re-run review queries.');
    }
  };

  // Scope counts and strip message
  const inScopeCount = scopeSummary?.counts?.assets_in_scope ?? 0;
  const testedCount = scopeSummary?.findings_reconciliation?.tested ?? 0;
  const excludedCount = scopeSummary?.findings_reconciliation?.excluded ?? 0;
  const excludedItems = scopeSummary?.findings_reconciliation?.excluded_by_reason ?? [];
  const scopeStripMsg = scopeSummary?.reconciliation_message || `${inScopeCount} assets in scope, ${testedCount} findings tested, ${excludedCount} excluded`;

  return (
    <div className="space-y-5">
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
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold">Screen 3: Vulnerability Control Review Checks</h3>
          </div>
          <p className="text-xs text-slate-300">
            Four deterministic governance queries evaluating SLA breaches, ticket coverage, closure validity, and exception governance.
          </p>
        </div>

        <button
          onClick={handleRerun}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-run Review</span>
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 4 Check Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left space-y-1.5 ${
                isSelected
                  ? 'bg-blue-50/80 border-blue-400 shadow-xs ring-1 ring-blue-300'
                  : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[11px] font-mono font-bold text-slate-500 uppercase">{chk.num}</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    !isExecuted
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
            <p className="text-xs text-slate-600 mt-1">{currentCheck.description}</p>
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
          {currentCheck.data?.rows && currentCheck.data.rows.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-700 font-semibold">
                <tr>
                  {Object.keys(currentCheck.data.rows[0])
                    .filter((col) => !['raw', 'payload'].includes(col))
                    .map((header) => (
                      <th key={header} className="p-2.5 whitespace-nowrap uppercase text-[10px] tracking-wider">
                        {header.replace(/_/g, ' ')}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                {currentCheck.data.rows.slice(0, 50).map((row: any, idx: number) => {
                  const firstRow = currentCheck.data?.rows[0] || {};
                  return (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      {Object.keys(firstRow)
                        .filter((col) => !['raw', 'payload'].includes(col))
                        .map((colKey) => (
                          <td key={colKey} className="p-2.5 whitespace-nowrap">
                            {row[colKey] !== null && row[colKey] !== undefined ? String(row[colKey]) : '-'}
                          </td>
                        ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
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
