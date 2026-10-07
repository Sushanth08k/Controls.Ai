import React, { useState } from 'react';
import {
  UserCheck,
  ShieldAlert,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Clock,
  CheckCircle2,
  Code,
} from 'lucide-react';
import { VulnSqlViewer } from './VulnSqlViewer';

interface VulnApprovalStepProps {
  gateData: {
    gate_id?: string;
    payload_summary?: {
      exception_count?: number;
      escalation_count?: number;
      exceptions?: any[];
      escalations?: any[];
      [key: string]: any;
    };
    payload?: {
      summary?: {
        exceptions_count?: number;
        escalations_count?: number;
      };
      exceptions?: any[];
      escalations?: any[];
      [key: string]: any;
    };
    gate?: any;
    exceptions?: any[];
    escalations?: any[];
    payload_json?: string;
    [key: string]: any;
  } | null;
  applyData: {
    applied?: boolean;
    applied_exceptions?: number;
    approved_exceptions_applied?: number;
    applied_escalations?: number;
    escalated_tickets_applied?: number;
    expired_mirrors_cleared?: number;
    sql?: string;
    exceptions?: any[];
    escalations?: any[];
    [key: string]: any;
  } | null;
  onKeepInQueue: () => void;
  onQuickApprove: () => Promise<void>;
  onProceed: () => void;
  onBack: () => void;
  loading: boolean;
  stage: string;
}

export const VulnApprovalStep: React.FC<VulnApprovalStepProps> = ({
  gateData,
  applyData,
  onKeepInQueue,
  onQuickApprove,
  onProceed,
  onBack,
  loading,
  stage,
}) => {
  const [showAppliedSql, setShowAppliedSql] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Safely parse gate payload if it is a string
  let parsedPayload: any = gateData?.payload;
  if (typeof parsedPayload === 'string') {
    try {
      parsedPayload = JSON.parse(parsedPayload);
    } catch {
      parsedPayload = null;
    }
  }
  let parsedPayloadJson: any = null;
  if (typeof (gateData as any)?.payload_json === 'string') {
    try {
      parsedPayloadJson = JSON.parse((gateData as any).payload_json);
    } catch {
      parsedPayloadJson = null;
    }
  }

  // Extract exceptions and escalations with comprehensive fallback
  const exceptions: any[] =
    (applyData?.exceptions && applyData.exceptions.length > 0 ? applyData.exceptions : null) ??
    (gateData?.payload_summary?.exceptions && gateData.payload_summary.exceptions.length > 0 ? gateData.payload_summary.exceptions : null) ??
    (parsedPayload?.exceptions && parsedPayload.exceptions.length > 0 ? parsedPayload.exceptions : null) ??
    (gateData?.gate?.payload?.exceptions && gateData.gate.payload.exceptions.length > 0 ? gateData.gate.payload.exceptions : null) ??
    (parsedPayloadJson?.exceptions && parsedPayloadJson.exceptions.length > 0 ? parsedPayloadJson.exceptions : null) ??
    (gateData?.exceptions && gateData.exceptions.length > 0 ? gateData.exceptions : null) ??
    applyData?.exceptions ??
    gateData?.payload_summary?.exceptions ??
    parsedPayload?.exceptions ??
    [];

  const escalations: any[] =
    (applyData?.escalations && applyData.escalations.length > 0 ? applyData.escalations : null) ??
    (gateData?.payload_summary?.escalations && gateData.payload_summary.escalations.length > 0 ? gateData.payload_summary.escalations : null) ??
    (parsedPayload?.escalations && parsedPayload.escalations.length > 0 ? parsedPayload.escalations : null) ??
    (gateData?.gate?.payload?.escalations && gateData.gate.payload.escalations.length > 0 ? gateData.gate.payload.escalations : null) ??
    (parsedPayloadJson?.escalations && parsedPayloadJson.escalations.length > 0 ? parsedPayloadJson.escalations : null) ??
    (gateData?.escalations && gateData.escalations.length > 0 ? gateData.escalations : null) ??
    applyData?.escalations ??
    gateData?.payload_summary?.escalations ??
    parsedPayload?.escalations ??
    [];

  const totalItems = exceptions.length + escalations.length;
  const isApplied = stage === 'APPLIED' || Boolean(applyData?.applied);

  const appliedExceptions =
    applyData?.approved_exceptions_applied ??
    applyData?.applied_exceptions ??
    0;

  const appliedEscalations =
    applyData?.escalated_tickets_applied ??
    applyData?.applied_escalations ??
    0;

  const executedSql = applyData?.sql || '-- Real UPDATE statements executed upon approval';

  const handleApprove = async () => {
    setErrorMsg(null);
    try {
      await onQuickApprove();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve gate.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-amber-800/80 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold">Screen 5: Exception & Escalation Governance Gate</h3>
          </div>
          <p className="text-xs text-slate-300">
            Composite approval gate for exception requests and management escalations. Approval immediately applies verified changes and advances stage to APPLIED.
          </p>
        </div>

        {gateData?.gate_id && (
          <div className="font-mono text-xs bg-slate-950/80 border border-slate-700 px-3 py-1.5 rounded-lg text-slate-300 shrink-0">
            Gate ID: <strong className="text-amber-400">{gateData.gate_id}</strong>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Applied View (After Approval) */}
      {isApplied ? (
        <div className="space-y-4">
          <div className="bg-emerald-50/70 border border-emerald-300 rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <h4 className="text-sm font-bold text-slate-900">
                Approval recorded: changes applied
              </h4>
            </div>

            {/* Section: Exceptions approved (N) */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-emerald-700" />
                Exceptions approved ({appliedExceptions || exceptions.length})
              </div>
              {exceptions.length > 0 ? (
                <div className="space-y-2">
                  {exceptions.map((ex: any, idx: number) => (
                    <div
                      key={ex.exception_id || ex.finding_id || idx}
                      className="p-3 bg-white border border-emerald-200 rounded-lg text-xs space-y-1 shadow-2xs"
                    >
                      <div className="font-mono font-bold text-slate-900 flex items-center justify-between">
                        <span>{ex.finding_id || ex.exception_id}</span>
                        <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          risk accepted until {ex.expiry || ex.expires_at || '90 days'}
                        </span>
                      </div>
                      <div className="text-slate-600 text-[11px]">
                        <strong>Compensating Control:</strong> {ex.compensating_control || 'Applied per policy'}
                      </div>
                      <div className="text-emerald-700 font-semibold text-[11px]">
                        Effect: removed from SLA breach list
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No exceptions were approved.</p>
              )}
            </div>

            {/* Section: Escalated to management (M) */}
            <div className="space-y-2 pt-2 border-t border-emerald-200">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Escalated to management ({appliedEscalations || escalations.length})
              </div>
              {escalations.length > 0 ? (
                <div className="space-y-2">
                  {escalations.map((esc: any, idx: number) => (
                    <div
                      key={esc.finding_id || esc.ticket_id || idx}
                      className="p-3 bg-white border border-amber-200 rounded-lg text-xs space-y-1 shadow-2xs"
                    >
                      <div className="font-mono font-bold text-slate-900 flex items-center justify-between">
                        <span>{esc.finding_id} {esc.ticket_id ? `(${esc.ticket_id})` : ''}</span>
                        <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-semibold">
                          Escalated
                        </span>
                      </div>
                      <div className="text-slate-600 text-[11px]">
                        Escalated to: <strong className="text-slate-900">{esc.escalated_to || esc.owner_manager || 'VP Engineering'}</strong> (Asset Owner: {esc.owner || 'sec_ops_team'})
                      </div>
                      <div className="text-amber-800 font-semibold text-[11px]">
                        Effect: still open, now visible to management
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No findings were escalated.</p>
              )}
            </div>

            {/* Collapsed View database changes (SQL) section, closed by default */}
            <div className="pt-2 border-t border-emerald-200">
              <button
                onClick={() => setShowAppliedSql(!showAppliedSql)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <Code className="w-3.5 h-3.5 text-slate-500" />
                <span>View database changes (SQL)</span>
                <span className="text-[10px] text-slate-400">({showAppliedSql ? 'Hide' : 'Expand'})</span>
              </button>

              {showAppliedSql && (
                <div className="mt-2.5 bg-white rounded-lg border border-slate-200 p-3 shadow-2xs">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Executed UPDATE Statements (Backend Database Writes)
                  </div>
                  <VulnSqlViewer sql={executedSql} title="Applied UPDATE SQL" />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : totalItems === 0 ? (
        /* Zero Items View */
        <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">No Approvals Required</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Zero pending exception requests and zero overdue escalations were identified during this review. You can proceed directly to the result screen.
          </p>
        </div>
      ) : (
        /* Items List View (Pending Approval) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Exceptions Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-blue-600" />
                Pending Exception Requests ({exceptions.length})
              </h4>
              <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-semibold">
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
                        Expires: {ex.expiry || ex.expires_at || '90 days'}
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
              <span className="text-[10px] font-mono bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 font-semibold">
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
                      Owner: <strong>{esc.owner || 'sec_ops_team'}</strong> &rarr; Escalating to: <strong className="text-slate-900">{esc.escalated_to || esc.owner_manager || 'VP Engineering'}</strong>
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 italic py-4 text-center">No overdue findings requiring escalation.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tickets
        </button>

        <div className="flex items-center gap-2.5">
          {isApplied || totalItems === 0 ? (
            <button
              onClick={onProceed}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={onKeepInQueue}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg shadow-2xs transition-all cursor-pointer"
              >
                <Clock className="w-4 h-4 text-amber-600" />
                Keep in Approval Queue
              </button>

              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Approving & Applying...
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    Quick Approve & Continue
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
