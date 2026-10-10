import React, { useState } from 'react';
import { GateItemDTO, UserSessionDTO, RunItemDTO } from '../types';
import { StatusPill } from './StatusPill';
import { ShieldAlert, CheckCircle2, XCircle, User, ArrowRight } from 'lucide-react';
import { isApprover, isAuditor, isExecutor, canExecuteControls } from '../utils/rbac';
import { formatGateTitle, formatApproverRole } from '../utils/vulnDisplayNames';

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

  const userIsAuditor = isAuditor(currentUser);
  const userIsExecutor = isExecutor(currentUser);
  const userIsApprover = isApprover(currentUser);

  const isMaker =
    currentUser.user_id === gate.maker_id ||
    (Boolean(gate.maker_email) && currentUser.email?.toLowerCase() === gate.maker_email?.toLowerCase());

  const canApprove = gate.status === 'pending' && userIsApprover && !isMaker;

  const handleAction = async (decision: 'approved' | 'rejected') => {
    if (!userIsApprover) {
      setError('Access Denied: Only users with the Approver role can approve or reject gates.');
      return;
    }
    if (isMaker) {
      setError('Maker-Checker Violation: The proposer who created this run cannot approve their own gate.');
      return;
    }
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
        onResumeRun({ ...gate, status: 'approved' });
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200/90 hover:border-slate-300 transition-all shadow-xs hover:shadow-md">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
              {gate.run_id}
            </span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
              {gate.control_id}
            </span>
          </div>
          <h4 className="text-sm font-bold text-slate-900 tracking-tight break-words whitespace-normal leading-snug">
            {formatGateTitle(gate.gate_name || gate.gate_type, gate.control_id)}
          </h4>
        </div>
        <StatusPill status={gate.status} />
      </div>

      {gate.payload_summary && (
        <div
          className={`mb-4 px-3.5 py-2.5 rounded-lg border text-xs flex items-center justify-between ${
            gate.status === 'approved'
              ? 'bg-emerald-50/80 border-emerald-200/90 text-emerald-950'
              : gate.status === 'rejected'
              ? 'bg-rose-50/80 border-rose-200/90 text-rose-950'
              : 'bg-amber-50/80 border-amber-200/90 text-amber-900'
          }`}
        >
          <span
            className={`font-medium ${
              gate.status === 'approved'
                ? 'text-emerald-800'
                : gate.status === 'rejected'
                ? 'text-rose-800'
                : 'text-amber-800'
            }`}
          >
            {gate.status === 'approved'
              ? 'Approved Actions Payload:'
              : gate.status === 'rejected'
              ? 'Rejected Actions Payload:'
              : 'Pending Actions Payload:'}
          </span>
          <span
            className={`font-semibold font-mono px-2 py-0.5 rounded ${
              gate.status === 'approved'
                ? 'bg-emerald-100/80 text-emerald-900'
                : gate.status === 'rejected'
                ? 'bg-rose-100/80 text-rose-900'
                : 'bg-amber-100/80 text-amber-900'
            }`}
          >
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
            {formatApproverRole(gate.approver_role)}
          </span>
        </div>
      </div>

      {gate.status === 'pending' ? (
        <div className="space-y-3">
          {userIsAuditor && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Auditor (Read-Only): You have read-only access. Only users with the Approver role can approve or reject gates.</span>
            </div>
          )}

          {userIsExecutor && (
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Executor Role: You can execute controls up to the approval gate, but cannot approve them. Waiting for Approver sign-off.</span>
            </div>
          )}

          {isMaker && userIsApprover && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Maker-Checker Policy: You initiated this run. A distinct Approver must sign off.</span>
            </div>
          )}

          <div>
            <textarea
              placeholder={canApprove ? "Add review comment or rationale (mandatory for rejection)..." : "Decisions disabled for this role..."}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting || !canApprove}
              className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none shadow-xs disabled:bg-slate-100 disabled:text-slate-500"
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
              {canApprove
                ? "Approving authorizes the run to proceed to the next step."
                : "Awaiting sign-off by authorized Approver."}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAction('rejected')}
                disabled={submitting || !canApprove}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                title={!canApprove ? "Requires Approver role" : undefined}
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
              <button
                onClick={() => handleAction('approved')}
                disabled={submitting || !canApprove}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
                title={!canApprove ? "Requires Approver role" : undefined}
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
              ) : onResumeRun && canExecuteControls(currentUser) ? (
                <button
                  onClick={() => onResumeRun(gate)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-all shadow-xs cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {activeResumeLabel}
                </button>
              ) : isAuditor(currentUser) ? (
                <span className="text-[11px] text-slate-400 italic">Awaiting execution continuation (Read-only)</span>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

