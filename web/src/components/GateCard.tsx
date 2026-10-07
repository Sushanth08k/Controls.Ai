import React, { useState } from 'react';
import { GateItemDTO, UserSessionDTO, RunItemDTO } from '../types';
import { StatusPill } from './StatusPill';
import { ShieldAlert, CheckCircle2, XCircle, AlertTriangle, User, ArrowRight } from 'lucide-react';

interface GateCardProps {
  gate: GateItemDTO;
  currentUser: UserSessionDTO;
  onDecide: (gateId: string, decision: 'approved' | 'rejected', comment: string) => Promise<void>;
  onResumeRun?: (gate: GateItemDTO) => void;
  run?: RunItemDTO;
  resumeLabel?: string;
}

export const GateCard: React.FC<GateCardProps> = ({ gate, currentUser, onDecide, onResumeRun, run, resumeLabel }) => {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultResumeLabel =
    gate.gate_type === 'vuln_approval' || gate.control_id.toLowerCase().includes('vuln')
      ? 'Resume Run (Apply Outcomes)'
      : 'Resume Run (Step 5)';
  const activeResumeLabel = resumeLabel || defaultResumeLabel;

  const isVuln = gate.gate_type === 'vuln_approval' || gate.control_id.toLowerCase().includes('vuln');
  const isMaker = !isVuln && currentUser.user_id === gate.maker_id;
  const hasRole = isVuln || currentUser.roles.includes(gate.approver_role);
  const canApprove = (isVuln || (!isMaker && hasRole)) && gate.status === 'pending';

  const handleAction = async (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !comment.trim()) {
      setError('A comment is mandatory when rejecting a gate.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onDecide(gate.gate_id, decision, comment);
      setComment('');
      if (decision === 'approved' && onResumeRun) {
        onResumeRun(gate);
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200/90 hover:border-slate-300 transition-all shadow-xs hover:shadow-md">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              {gate.control_id}
            </span>
            <span className="text-sm font-semibold text-slate-900 tracking-wide">
              {gate.gate_name}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Run ID: <span className="font-mono text-slate-700 font-medium">{gate.run_id}</span>
          </p>
        </div>
        <StatusPill status={gate.status} />
      </div>

      {gate.payload_summary && (
        <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-amber-50/80 border border-amber-200/90 text-xs text-amber-900 flex items-center justify-between">
          <span className="font-medium text-amber-800">Pending Actions Payload:</span>
          <span className="font-semibold font-mono bg-amber-100/80 px-2 py-0.5 rounded text-amber-900">
            {gate.payload_summary.exceptions_count || 0} exception(s), {gate.payload_summary.escalations_count || 0} escalation(s)
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 py-3 px-4 rounded-lg bg-slate-50 border border-slate-200 text-xs mb-4">
        <div>
          <span className="text-slate-500 block mb-0.5 font-medium">Requested by</span>
          <span className="font-mono text-slate-800 flex items-center gap-1 font-semibold">
            <User className="w-3 h-3 text-slate-400" />
            {gate.maker_id}
            {currentUser.user_id === gate.maker_id && <span className="text-amber-700 font-sans text-[10px]">(You)</span>}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block mb-0.5 font-medium">Approval required from</span>
          <span className="font-mono text-blue-700 flex items-center gap-1 font-semibold">
            <ShieldAlert className="w-3 h-3 text-blue-600" />
            {isVuln ? 'Any Authorized User' : gate.approver_role}
          </span>
        </div>
      </div>

      {gate.status === 'pending' ? (
        <div className="space-y-3">
          {!isVuln && isMaker && (
            <div className="flex items-center gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Two-person approval rule: You started this run and cannot approve your own request.</span>
            </div>
          )}

          {!isVuln && !hasRole && !isMaker && (
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
              <ShieldAlert className="w-4 h-4 shrink-0 text-slate-400" />
              <span>You lack the required role (<span className="text-blue-700 font-mono font-medium">{gate.approver_role}</span>) to decide this gate.</span>
            </div>
          )}

          <div>
            <textarea
              placeholder="Add review comment or rationale (mandatory for rejection)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting || (!canApprove && !hasRole)}
              className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none shadow-xs"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-slate-500">
              Approving authorizes the run to proceed to the next step.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAction('rejected')}
                disabled={submitting || (!isVuln && (isMaker || !hasRole))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
              <button
                onClick={() => handleAction('approved')}
                disabled={submitting || !canApprove}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span>Decided by: <span className="font-mono text-slate-800 font-semibold">{gate.decided_by}</span></span>
            <span className="text-[11px] text-slate-500">{gate.decided_at ? new Date(gate.decided_at).toLocaleString() : ''}</span>
          </div>
          {gate.comment && (
            <p className="text-slate-700 italic mt-1 border-t border-slate-200 pt-1.5">
              "{gate.comment}"
            </p>
          )}
          {gate.status === 'approved' && (
            <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Run execution:</span>
              {run?.status === 'completed' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Run Completed
                </span>
              ) : run?.status === 'failed' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  Run Failed
                </span>
              ) : onResumeRun ? (
                <button
                  onClick={() => onResumeRun(gate)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-all shadow-xs cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {activeResumeLabel}
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

