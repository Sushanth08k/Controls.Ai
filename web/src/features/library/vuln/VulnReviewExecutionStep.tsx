import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Clock, ArrowRight, ArrowLeft, RefreshCw, Code, Database } from 'lucide-react';
import { VulnReviewSnapshot } from '../../../types';

interface VulnReviewExecutionStepProps {
  reviewSnapshot: VulnReviewSnapshot | null;
  namedQueries: Record<string, string>;
  onRunQueries: () => Promise<void>;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
}

export const VulnReviewExecutionStep: React.FC<VulnReviewExecutionStepProps> = ({
  reviewSnapshot,
  namedQueries,
  onRunQueries,
  onBack,
  onProceed,
  loading,
}) => {
  const [activeTab, setActiveTab] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6'>('Q1');
  const [showSql, setShowSql] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isExecuted = Boolean(reviewSnapshot?.review_executed);

  const q1 = reviewSnapshot?.q1_scan_health;
  const q2 = reviewSnapshot?.q2_coverage;
  const q3 = reviewSnapshot?.q3_sla_breach;
  const q4 = reviewSnapshot?.q4_ticket_coverage;
  const q5 = reviewSnapshot?.q5_closure_validity;
  const q6 = reviewSnapshot?.q6_exception_governance;

  const handleRerun = async () => {
    setErrorMsg(null);
    try {
      await onRunQueries();
    } catch (err: any) {
      console.error('Failed to run review queries:', err);
      setErrorMsg(err.message || 'Execution failed. Please check network/server logs.');
    }
  };

  const toggleSql = (tabId: string) => {
    setShowSql((prev) => ({ ...prev, [tabId]: !prev[tabId] }));
  };

  const queriesMeta = [
    {
      id: 'Q1' as const,
      title: 'Scan Health',
      description: 'Identifies in-scope assets missing successful scans within their cadence window or with failed runs.',
      data: q1,
      defaultSql: namedQueries['Q1_SCAN_HEALTH'] || '',
    },
    {
      id: 'Q2' as const,
      title: 'Scan Coverage',
      description: 'Evaluates scan cadence across all in-scope tier-specific assets (Tier 1 daily, Tier 2 weekly).',
      data: q2,
      defaultSql: namedQueries['Q2_COVERAGE'] || '',
    },
    {
      id: 'Q3' as const,
      title: 'SLA Breaches',
      description: 'Computes open findings past remediation SLA (KEV 3d, Crit 7d, High 30d, Med 60d) excluding approved exceptions.',
      data: q3,
      defaultSql: namedQueries['Q3_SLA_BREACH'] || '',
    },
    {
      id: 'Q4' as const,
      title: 'Ticket Coverage',
      description: 'Identifies open Critical/High/KEV findings lacking Jira/ServiceNow tracking tickets or missing assignees/due dates.',
      data: q4,
      defaultSql: namedQueries['Q4_TICKET_COVERAGE'] || '',
    },
    {
      id: 'Q5' as const,
      title: 'Closure Validity',
      description: 'Audits closed or patched findings for rescan verification proof and ensures findings were not seen post-patch.',
      data: q5,
      defaultSql: namedQueries['Q5_CLOSURE_VALIDITY'] || '',
    },
    {
      id: 'Q6' as const,
      title: 'Exceptions',
      description: 'Audits exceptions for approvals, expiration, and compensating control governance.',
      data: q6,
      defaultSql: namedQueries['Q6_EXCEPTION_GOVERNANCE'] || '',
    },
  ];

  const currentQuery = queriesMeta.find((q) => q.id === activeTab) || queriesMeta[0];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
              STAGE: EVALUATED
            </span>
            <h3 className="text-sm font-bold">Step 4: Execute Deterministic Review Queries (Q1 – Q6)</h3>
          </div>
          <p className="text-xs text-slate-300">
            Named queries Q1 through Q6 run directly against the live database to evaluate scan health, SLA compliance, ticket tracking, and exceptions.
          </p>
        </div>
        <button
          onClick={handleRerun}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Executing Queries...' : isExecuted ? 'Re-run Review Queries' : 'Run Review Queries'}
        </button>
      </div>

      {/* Error banner on failure */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 font-bold hover:text-rose-800 ml-2">✕</button>
        </div>
      )}

      {/* 4 Primary Metric Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Tile 1: Scan Gaps */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Scan Gaps</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {isExecuted ? q1?.row_count ?? 0 : '—'}
          </div>
          <p className="text-[11px] text-slate-500">
            {!isExecuted
              ? 'Query not run yet'
              : q1?.row_count
              ? `${q1.row_count} assets with failed or missing scans in window`
              : 'All in-scope assets have healthy scans'}
          </p>
        </div>

        {/* Tile 2: Untracked Findings */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Untracked Crit/High</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {isExecuted ? q4?.candidate_count ?? q4?.row_count ?? 0 : '—'}
          </div>
          <p className="text-[11px] text-slate-500">
            {!isExecuted
              ? 'Query not run yet'
              : `${q4?.candidate_count ?? 0} candidates needing tickets (${q4?.defective_count ?? 0} defective existing)`}
          </p>
        </div>

        {/* Tile 3: SLA Breaches */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>SLA Breaches</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {isExecuted ? q3?.row_count ?? 0 : '—'}
          </div>
          <p className="text-[11px] text-slate-500">
            {!isExecuted
              ? 'Query not run yet'
              : `${q3?.critical_overdue_count ?? 0} Critical/KEV overdue`}
          </p>
        </div>

        {/* Tile 4: Exception Defects */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Exception Governance</span>
            <CheckCircle2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {isExecuted ? q6?.row_count ?? 0 : '—'}
          </div>
          <p className="text-[11px] text-slate-500">
            {!isExecuted
              ? 'Query not run yet'
              : `${q6?.expired_count ?? 0} expired • ${q6?.pending_count ?? 0} pending approval`}
          </p>
        </div>
      </div>

      {/* Query Tabs (Q1 - Q6) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Tab Headers */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50/80 overflow-x-auto p-1.5 gap-1">
          {queriesMeta.map((qm) => {
            const isActive = activeTab === qm.id;
            const count = qm.data?.row_count ?? 0;
            return (
              <button
                key={qm.id}
                onClick={() => setActiveTab(qm.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <span>{qm.id}: {qm.title}</span>
                {isExecuted && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4">
          {/* Query Description & SQL Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-600" />
                {currentQuery.id} — {currentQuery.title}
              </div>
              <p className="text-[11px] text-slate-500">{currentQuery.description}</p>
            </div>
            <button
              onClick={() => toggleSql(currentQuery.id)}
              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md shrink-0 cursor-pointer"
            >
              <Code className="w-3 h-3 text-slate-500" />
              {showSql[currentQuery.id] ? 'Hide Executed SQL' : 'View Executed SQL'}
            </button>
          </div>

          {/* Collapsible SQL Block */}
          {showSql[currentQuery.id] && (
            <div className="bg-slate-900 text-slate-100 rounded-lg p-3.5 font-mono text-xs overflow-x-auto border border-slate-800">
              <pre className="whitespace-pre-wrap">{currentQuery.data?.sql || currentQuery.defaultSql}</pre>
            </div>
          )}

          {/* Results State Display */}
          {!isExecuted ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-600">Review queries have not been executed yet</div>
              <p className="text-[11px] text-slate-400">Click &quot;Run Review Queries&quot; above to execute deterministic queries against the live database.</p>
            </div>
          ) : (() => {
            const rows = currentQuery.data?.rows || [];
            const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
            if (rows.length === 0) {
              return (
                <div className="p-6 text-center bg-emerald-50/60 rounded-xl border border-emerald-200/80 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-900 font-mono">
                    0 rows: no exceptions found by {currentQuery.id}
                  </span>
                </div>
              );
            }
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Showing {rows.length} of {currentQuery.data?.total_row_count || currentQuery.data?.row_count || rows.length} exception records</span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                      <tr>
                        {cols.map((col) => (
                          <th key={col} className="py-2 px-3 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {rows.map((row: any, rIdx: number) => (
                        <tr key={rIdx} className="hover:bg-slate-50/70">
                          {cols.map((col) => (
                            <td key={col} className="py-2 px-3 whitespace-nowrap text-slate-700">
                              {row[col] === null || row[col] === undefined ? (
                                <span className="text-slate-300 italic">null</span>
                              ) : typeof row[col] === 'boolean' ? (
                                row[col] ? 'true' : 'false'
                              ) : (
                                String(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Scope
        </button>
        <div className="flex items-center gap-2">
          {!isExecuted && (
            <span className="text-[11px] text-slate-400 italic">Run review queries before advancing</span>
          )}
          <button
            onClick={onProceed}
            disabled={loading || !isExecuted}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
          >
            Proceed to Ticketing (Action Phase)
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
