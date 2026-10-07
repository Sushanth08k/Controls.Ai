import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code,
  Loader2,
  FileText,
} from 'lucide-react';
import { ControlAssessment } from '../../../types';
import { VulnSqlViewer } from './VulnSqlViewer';

interface VulnResultStepProps {
  runId: string;
  asOfDate: string;
  policyName: string;
  policyVersion?: string;
  assessment: ControlAssessment | null;
  ticketsRaised: number;
  exceptionsApproved: number;
  escalationsRecorded: number;
  approver: string;
  namedQueries: Record<string, string>;
  ticketSql?: string;
  applySql?: string;
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
  ticketsRaised,
  exceptionsApproved,
  escalationsRecorded,
  approver,
  namedQueries,
  ticketSql,
  applySql,
  onCompleteAndClose,
  loading,
  stage,
}) => {
  const [showSqlSection, setShowSqlSection] = useState(false);
  const [selectedSqlKey, setSelectedSqlKey] = useState<string>('Q1_SLA_BREACH');

  const grade = assessment?.overall_grade || 'Needs Improvement';
  const rationale = assessment?.rationale || 'Residual defects identified in vulnerability lifecycle governance.';
  const attributes = assessment?.attributes || {};

  const gradeColors = {
    Effective: {
      bg: 'bg-emerald-50 border-emerald-300 text-emerald-950',
      badge: 'bg-emerald-600 text-white',
      border: 'border-emerald-500',
    },
    'Needs Improvement': {
      bg: 'bg-amber-50 border-amber-300 text-amber-950',
      badge: 'bg-amber-600 text-white',
      border: 'border-amber-500',
    },
    Ineffective: {
      bg: 'bg-rose-50 border-rose-300 text-rose-950',
      badge: 'bg-rose-600 text-white',
      border: 'border-rose-500',
    },
  }[grade] || {
    bg: 'bg-amber-50 border-amber-300 text-amber-950',
    badge: 'bg-amber-600 text-white',
    border: 'border-amber-500',
  };

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
      key: 'closure_validity',
      name: 'Closure Validity',
      data: attributes['closure_validity'],
    },
    {
      key: 'exception_governance',
      name: 'Exception Governance',
      data: attributes['exception_governance'],
    },
  ];

  const sqlItems = [
    { key: 'Q1_SLA_BREACH', label: 'Q1: SLA Breaches', sql: namedQueries['Q1_SLA_BREACH'] || '' },
    { key: 'Q2_TICKET_COVERAGE', label: 'Q2: Ticket Coverage', sql: namedQueries['Q2_TICKET_COVERAGE'] || '' },
    { key: 'Q3_CLOSURE_VALIDITY', label: 'Q3: Closure Validity', sql: namedQueries['Q3_CLOSURE_VALIDITY'] || '' },
    { key: 'Q4_EXCEPTION_GOVERNANCE', label: 'Q4: Exception Governance', sql: namedQueries['Q4_EXCEPTION_GOVERNANCE'] || '' },
    { key: 'TICKETING_INSERT', label: 'Ticketing INSERT', sql: ticketSql || namedQueries['TICKETING_INSERT'] || '' },
    { key: 'APPLY_UPDATE', label: 'Apply UPDATEs', sql: applySql || namedQueries['APPLY_UPDATE'] || '' },
  ];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold">Screen 6: Control Effectiveness Result & Audit Record</h3>
          </div>
          <p className="text-xs text-slate-300">
            Persisted to <code className="font-mono text-emerald-300">control_audit_runs</code> and <code className="font-mono text-emerald-300">control_evidence</code>.
          </p>
        </div>
      </div>

      {/* TOP: Grade and One-Line Rationale */}
      <div className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs ${gradeColors.bg}`}>
        <div className="space-y-1.5 max-w-2xl">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600">
            Control Assessment Grade
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-lg text-sm font-bold shadow-xs ${gradeColors.badge}`}>
              {grade}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-800 pt-1">
            <strong>Rationale:</strong> {rationale}
          </p>
        </div>
      </div>

      {/* MIDDLE: Before / After Table for the Four Attributes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Control Attributes Before vs After Run
          </h4>
          <span className="text-[11px] text-slate-500 font-mono">4 Deterministic Attributes</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold text-[10px] uppercase">
              <tr>
                <th className="p-3">Attribute</th>
                <th className="p-3 text-center">Before (Defects)</th>
                <th className="p-3 text-center">After (Defects)</th>
                <th className="p-3">Resolution Status</th>
                <th className="p-3">Audit Details</th>
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
                const slaBreakdown =
                  attr.data?.breakdown ||
                  `${excCovered} covered by approved exception, ${escOpen} escalated and still open`;

                return (
                  <React.Fragment key={attr.key}>
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{attr.name}</div>
                        {attr.key === 'sla_compliance' && (
                          <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                            {slaBreakdown}
                          </div>
                        )}
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
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isFixed
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : isImproved
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {isFixed ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Fixed
                            </>
                          ) : isImproved ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-blue-600" />
                              Improved
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Still failing
                            </>
                          )}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 text-[11px]">
                        <div>{attr.data?.details || '-'}</div>
                        {attr.key === 'sla_compliance' && (
                          <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                            Breakdown: {slaBreakdown}
                          </div>
                        )}
                      </td>
                    </tr>
                    {attr.key === 'sla_compliance' && (
                      <tr className="bg-slate-50/60 border-b border-slate-100">
                        <td colSpan={5} className="px-3 py-1.5 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-700">SLA Breakdown: </span>
                          {slaBreakdown}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTTOM: Short Run Record */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          Execution Run Record
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-xs">
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
            <div className="font-mono font-bold text-slate-800 truncate" title={approver || 'n/a'}>
              {approver || 'n/a'}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM: Collapsible Executed SQL Section */}
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
            <span>{showSqlSection ? 'Collapse' : 'Expand'}</span>
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
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                    selectedSqlKey === item.key
                      ? 'bg-blue-600 text-white font-bold'
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

      {/* Single Action Button: Complete & Close */}
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
