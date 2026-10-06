import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Clock, ArrowRight, ArrowLeft, RefreshCw } from 'lucide-react';
import { VulnSqlViewer } from './VulnSqlViewer';

interface VulnReviewExecutionStepProps {
  reviewSnapshot: {
    q1_scan_health?: any;
    q2_coverage?: any;
    q3_sla_breach?: any;
    q4_ticket_coverage?: any;
    q5_closure_validity?: any;
    q6_exception_governance?: any;
  } | null;
  namedQueries: Record<string, string>;
  onRunQueries: () => void;
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
  const [activeTab, setActiveTab] = useState<string>('Q1');

  const q1 = reviewSnapshot?.q1_scan_health;
  const q3 = reviewSnapshot?.q3_sla_breach;
  const q4 = reviewSnapshot?.q4_ticket_coverage;
  const q6 = reviewSnapshot?.q6_exception_governance;

  const sqlTabs = [
    { id: 'Q1', label: 'Q1: Scan Health', sql: namedQueries['Q1_SCAN_HEALTH'] || '', description: 'Identifies assets missing successful scans within 24 hours.' },
    { id: 'Q2', label: 'Q2: Scope Coverage', sql: namedQueries['Q2_COVERAGE'] || '', description: 'Evaluates scan cadence across all in-scope tier-specific assets.' },
    { id: 'Q3', label: 'Q3: SLA Breaches', sql: namedQueries['Q3_SLA_BREACH'] || '', description: 'Computes open findings past remediation SLA (accounting for KEV and unexpired exceptions).' },
    { id: 'Q4', label: 'Q4: Ticket Coverage', sql: namedQueries['Q4_TICKET_COVERAGE'] || '', description: 'Identifies open Critical/High findings lacking Jira/ServiceNow tracking tickets.' },
    { id: 'Q5', label: 'Q5: Closure Validity', sql: namedQueries['Q5_CLOSURE_VALIDITY'] || '', description: 'Checks for invalid closures lacking rescan verification or with recurring scan findings.' },
    { id: 'Q6', label: 'Q6: Exceptions', sql: namedQueries['Q6_EXCEPTION_GOVERNANCE'] || '', description: 'Audits exceptions for approvals, expiration, and compensating controls.' },
  ];

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
          onClick={onRunQueries}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Executing Queries...' : 'Re-run Review Queries'}
        </button>
      </div>

      {/* 4 Primary Metric Tiles (Analogue to Archival) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Tile 1: Scan Gaps */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Scan Gaps</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {q1?.unhealthy_count ?? 0}
          </div>
          <p className="text-[11px] text-slate-500">
            {q1?.unhealthy_count ? 'Assets with missing or failed scans in last 24h' : 'All assets scanned successfully'}
          </p>
        </div>

        {/* Tile 2: Untracked Findings */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Untracked Crit/High</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {q4?.untracked_count ?? 0}
          </div>
          <p className="text-[11px] text-slate-500">
            Open findings without tracking ticket, assignee or due date
          </p>
        </div>

        {/* Tile 3: SLA Breaches */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>SLA Breaches</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {q3?.breach_count ?? 0}
          </div>
          <p className="text-[11px] text-slate-500">
            Open findings past policy SLA (excl. approved exceptions)
          </p>
        </div>

        {/* Tile 4: Exception Defects */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Exceptions Pending</span>
            <CheckCircle2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {q6?.pending_exceptions_count ?? 0}
          </div>
          <p className="text-[11px] text-slate-500">
            {q6?.expired_exceptions_count ?? 0} expired • {q6?.pending_exceptions_count ?? 0} awaiting approval
          </p>
        </div>
      </div>

      {/* SQL Viewer */}
      <div className="space-y-2">
        <VulnSqlViewer
          tabs={sqlTabs}
          activeTabId={activeTab}
          onTabChange={setActiveTab}
          title="Review SELECT Statements (Q1 - Q6)"
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Scope
        </button>
        <button
          onClick={onProceed}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all"
        >
          Proceed to Ticketing (Action Phase)
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
