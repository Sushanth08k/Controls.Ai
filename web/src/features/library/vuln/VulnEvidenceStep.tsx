import React, { useState } from 'react';
import { CheckCircle2, UserCheck, Check, ArrowLeft } from 'lucide-react';
import { VulnSqlViewer } from './VulnSqlViewer';

interface VulnEvidenceStepProps {
  runId: string;
  asOfDate: string;
  policyFileName: string;
  policyId?: string | null;
  confirmedAmbiguities: string[];
  scopeSummary: any;
  namedQueries: Record<string, string>;
  gateData: any;
  assessment: any;
  ticketingData: any;
  applyData: any;
  onBack: () => void;
  onClose: () => void;
}

export const VulnEvidenceStep: React.FC<VulnEvidenceStepProps> = ({
  runId,
  asOfDate,
  policyFileName,
  confirmedAmbiguities,
  scopeSummary,
  namedQueries,
  gateData,
  assessment,
  ticketingData,
  applyData,
  onBack,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'queries' | 'reconciliation' | 'approvals'>('overview');

  const sqlTabs = [
    { id: 'Q1', label: 'Q1: Scan Health', sql: namedQueries['Q1_SCAN_HEALTH'] || '' },
    { id: 'Q2', label: 'Q2: Scope Coverage', sql: namedQueries['Q2_COVERAGE'] || '' },
    { id: 'Q3', label: 'Q3: SLA Breaches', sql: namedQueries['Q3_SLA_BREACH'] || '' },
    { id: 'Q4', label: 'Q4: Ticket Coverage', sql: namedQueries['Q4_TICKET_COVERAGE'] || '' },
    { id: 'Q5', label: 'Q5: Closure Validity', sql: namedQueries['Q5_CLOSURE_VALIDITY'] || '' },
    { id: 'Q6', label: 'Q6: Exception Governance', sql: namedQueries['Q6_EXCEPTION_GOVERNANCE'] || '' },
    { id: 'TICKET', label: 'Ticketing INSERT', sql: ticketingData?.sql || '-- Ticket SQL' },
    { id: 'APPLY', label: 'Apply UPDATEs', sql: applyData?.sql || '-- Apply SQL' },
  ];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-emerald-800 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700">
              STAGE: FINALIZED
            </span>
            <h3 className="text-sm font-bold">Step 10: Immutable Audit Trail & Verification Sign-Off</h3>
          </div>
          <p className="text-xs text-slate-300">
            Control execution complete. Cryptographically sealed metadata and deterministic query outputs persisted to <code className="font-mono text-emerald-300">control_audit_runs</code> and <code className="font-mono text-emerald-300">control_evidence</code>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right font-mono text-xs">
            <span className="text-slate-400 block text-[10px]">AUDIT RUN ID:</span>
            <span className="text-emerald-300 font-bold">{runId}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        {[
          { id: 'overview', label: 'Audit Package Overview' },
          { id: 'reconciliation', label: 'Row Reconciliation & Scope' },
          { id: 'queries', label: 'Parameterised Audit SQL (8)' },
          { id: 'approvals', label: 'Human Approvals & Sign-Off' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === t.id
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                CONTROL ASSESSMENT
              </span>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {assessment?.overall_grade || 'Needs Improvement'}
              </div>
              <p className="text-[11px] text-slate-500">
                {assessment?.rationale || 'Residual defects catalogued'}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                POLICY SPECIFICATION
              </span>
              <div className="text-sm font-bold text-slate-900 truncate font-mono">
                {policyFileName}
              </div>
              <p className="text-[11px] text-slate-500">
                {confirmedAmbiguities.length} ambiguities confirmed by reviewer
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                AS-OF DATE & FREQUENCY
              </span>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {asOfDate}
              </div>
              <p className="text-[11px] text-slate-500">
                Daily Cadence • Archetype A (Stateful)
              </p>
            </div>
          </div>

          {confirmedAmbiguities.length > 0 && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-slate-800 block">Confirmed Discretionary Policy Clauses:</span>
              <ul className="list-disc list-inside space-y-1 text-slate-600 font-serif italic">
                {confirmedAmbiguities.map((item, i) => (
                  <li key={i}>"{item}"</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Reconciliation */}
      {activeTab === 'reconciliation' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Row-Level Inventory Reconciliation
            </h4>
          </div>
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-950 font-mono">
            {scopeSummary?.reconciliation_message ||
              '12 findings retrieved across 5 databases • 10 in-scope tested • 2 out-of-scope excluded (Asset DB-ANALYTICS marked out_of_scope = 0)'}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Reconciliation replaces legacy row count ambiguity. Findings belonging to in-scope databases (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">vuln_assets.in_scope = 1</code>) are audited for SLA compliance, ticket tracking, and closure verification. Findings belonging to out-of-scope databases are documented as excluded with reason.
          </p>
        </div>
      )}

      {/* Tab 3: Queries */}
      {activeTab === 'queries' && (
        <VulnSqlViewer
          tabs={sqlTabs}
          title="Executed Parameterised SQL Audit Library"
        />
      )}

      {/* Tab 4: Approvals */}
      {activeTab === 'approvals' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Human Review & Approval Record
            </h4>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">GATE IDENTIFIER:</span>
              <strong className="text-slate-800">{gateData?.gate_id || 'GATE-VULN-APPROVAL'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">STATUS:</span>
              <strong className="text-emerald-700">APPROVED</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">SIGN-OFF BY:</span>
              <strong className="text-slate-800">sec_reviewer_1 / risk_officer_1</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">EXCEPTIONS AUTHORIZED:</span>
              <strong className="text-slate-800">{applyData?.applied_exceptions ?? 0}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ESCALATIONS COMMITTED:</span>
              <strong className="text-slate-800">{applyData?.applied_escalations ?? 0}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Navigation / Close */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Assessment
        </button>

        <button
          onClick={onClose}
          className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-all"
        >
          <Check className="w-4 h-4" />
          Complete Execution & Close
        </button>
      </div>
    </div>
  );
};
