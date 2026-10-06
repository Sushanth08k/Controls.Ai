import React from 'react';
import { UserCheck, ShieldAlert, AlertTriangle, ArrowLeft, Loader2, Clock } from 'lucide-react';

interface VulnApprovalStepProps {
  gateData: {
    gate_id?: string;
    payload_summary?: {
      exception_count: number;
      escalation_count: number;
      exceptions: any[];
      escalations: any[];
    };
  } | null;
  onKeepInQueue: () => void;
  onQuickApprove: () => void;
  onBack: () => void;
  loading: boolean;
  stage: string;
}

export const VulnApprovalStep: React.FC<VulnApprovalStepProps> = ({
  gateData,
  onKeepInQueue,
  onQuickApprove,
  onBack,
  loading,
  stage,
}) => {
  const summary = gateData?.payload_summary;
  const exceptions = summary?.exceptions || [];
  const escalations = summary?.escalations || [];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-amber-800/80 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold">Step 7: Vulnerability Exception & Escalation Sign-Off Gate</h3>
          </div>
          <p className="text-xs text-slate-300">
            Composite approval gate combines pending vulnerability exception requests and management escalation candidates.
          </p>
        </div>

        {gateData?.gate_id && (
          <div className="font-mono text-xs bg-slate-950/80 border border-slate-700 px-3 py-1.5 rounded-lg text-slate-300 shrink-0">
            Gate ID: <strong className="text-amber-400">{gateData.gate_id}</strong>
          </div>
        )}
      </div>

      {/* Decision Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Exceptions Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-blue-600" />
              Pending Exception Requests ({exceptions.length})
            </h4>
            <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
              Requires Sign-Off
            </span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {exceptions.length > 0 ? (
              exceptions.map((ex: any, idx: number) => (
                <div key={ex.exception_id || idx} className="p-3 bg-slate-50 border border-slate-200/90 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono font-bold text-slate-800">
                    <span>{ex.finding_id || ex.exception_id}</span>
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      Expires: {ex.expires_at || '90 days'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    <strong>Justification:</strong> {ex.justification || 'Pending business justification'}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    <strong>Compensating Control:</strong> {ex.compensating_control || 'None specified'}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">No pending exception requests.</p>
            )}
          </div>
        </div>

        {/* Escalations Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              SLA Breach Escalations ({escalations.length})
            </h4>
            <span className="text-[10px] font-mono bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
              Escalate to Manager
            </span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {escalations.length > 0 ? (
              escalations.map((esc: any, idx: number) => (
                <div key={esc.finding_id || idx} className="p-3 bg-amber-50/50 border border-amber-200/80 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono font-bold text-slate-800">
                    <span>{esc.finding_id} ({esc.severity || 'CRITICAL'})</span>
                    <span className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                      OVERDUE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-mono">
                    Owner: <strong>{esc.owner}</strong> &rarr; Escalating to: <strong className="text-slate-900">{esc.owner_manager}</strong>
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic py-4 text-center">No overdue findings requiring escalation.</p>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Verification
        </button>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onKeepInQueue}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-all"
          >
            <Clock className="w-4 h-4 text-amber-600" />
            Keep in Approval Queue
          </button>

          <button
            onClick={onQuickApprove}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Approving Gate...
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4" />
                Quick Approve & Continue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
