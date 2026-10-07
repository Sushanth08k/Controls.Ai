import React from 'react';
import { Play, CheckCircle2, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { VulnSqlViewer } from './VulnSqlViewer';

interface VulnApplyStepProps {
  applyData: {
    applied_exceptions?: number;
    applied_escalations?: number;
    sql?: string;
  } | null;
  onApply: () => void;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
  stage: string;
}

export const VulnApplyStep: React.FC<VulnApplyStepProps> = ({
  applyData,
  onApply,
  onBack,
  onProceed,
  loading,
  stage,
}) => {
  const isApplied = stage === 'APPLIED' || stage === 'FINALIZED' || applyData?.applied_exceptions !== undefined;
  const exceptionsCount = applyData?.applied_exceptions ?? 0;
  const escalationsCount = applyData?.applied_escalations ?? 0;
  const sql = applyData?.sql || '-- UPDATE vuln_exceptions and vuln_tickets statements';

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-emerald-800 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold">Step 8: Apply Approved Exceptions & Escalations</h3>
          </div>
          <p className="text-xs text-slate-300">
            Executes authorized state mutations in the live database: marks approved exceptions, mirrors exception flags to <code className="font-mono text-emerald-300">db_vulnerabilities</code>, and records management escalations in <code className="font-mono text-emerald-300">vuln_tickets</code>.
          </p>
        </div>

        {!isApplied ? (
          <button
            onClick={onApply}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Applying Decisions...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                Apply Approved Outcomes
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-950/80 border border-emerald-600 rounded-lg text-emerald-300 text-xs font-mono font-semibold shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Outcomes Successfully Committed</span>
          </div>
        )}
      </div>

      {/* Applied Summary Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            APPROVED EXCEPTIONS APPLIED
          </span>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {exceptionsCount} Exceptions
          </div>
          <p className="text-[11px] text-slate-500">
            Updated in vuln_exceptions and mirrored to db_vulnerabilities
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            BREACH ESCALATIONS RECORDED
          </span>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {escalationsCount} Escalations
          </div>
          <p className="text-[11px] text-slate-500">
            Escalated to owner managers in vuln_tickets
          </p>
        </div>
      </div>

      {/* SQL Viewer */}
      <VulnSqlViewer
        tabs={[
          {
            id: 'APPLY_UPDATE',
            label: 'UPDATE Mutations',
            sql: sql,
            description: 'Apply updates for approved exceptions and escalations guarded by gate approval.',
          },
        ]}
        title="Apply Outcomes SQL Script"
      />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Approval
        </button>
        <div className="flex items-center gap-3">
          {!isApplied && (
            <span className="text-xs text-rose-600 font-medium">
              Click "Apply Approved Outcomes" to commit changes before proceeding.
            </span>
          )}
          <button
            onClick={onProceed}
            disabled={loading || !isApplied}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
          >
            Proceed to Control Assessment
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
