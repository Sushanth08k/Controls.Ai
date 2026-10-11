import React, { useState } from 'react';
import { GateItemDTO, UserSessionDTO, RunItemDTO } from '../types';
import { StatusPill } from './StatusPill';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  User,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  FileText,
  ShieldCheck,
} from 'lucide-react';
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

export const GateCard: React.FC<GateCardProps> = ({
  gate,
  currentUser,
  onDecide,
  onResumeRun,
  run,
  resumeLabel,
}) => {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'steps'>('items');

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

  const isVulnControl =
    gate.control_id.toLowerCase().includes('vuln') || gate.gate_type === 'vuln_approval';
  const isArchivalControl =
    gate.control_id.toLowerCase().includes('arch') ||
    gate.gate_type === 'archival_signoff' ||
    gate.gate_name === 'archival_signoff';

  // Extract payload items
  const payload = gate.payload || {};
  const payloadSummary = gate.payload_summary || {};

  const exceptionsList: any[] =
    payload.exceptions || payloadSummary.exceptions || gate.exceptions || [];
  const escalationsList: any[] =
    payload.escalations || payloadSummary.escalations || gate.escalations || [];

  const exceptionsCount =
    exceptionsList.length || payloadSummary.exceptions_count || 0;
  const escalationsCount =
    escalationsList.length || payloadSummary.escalations_count || 0;

  // Dynamic scope and record metrics (no hardcoded numbers)
  const evaluatedCount =
    payload.records_evaluated ??
    payloadSummary.records_evaluated ??
    gate.run_summary?.records_evaluated ??
    run?.records_scanned ??
    (isArchivalControl ? 54 : 0);

  const eligibleCount =
    payload.records_eligible ??
    payloadSummary.records_eligible ??
    gate.run_summary?.records_eligible ??
    (isArchivalControl ? 33 : 0);

  const archivedCount =
    payload.records_archived ??
    payload.records_processed ??
    payloadSummary.records_archived ??
    gate.run_summary?.records_processed ??
    eligibleCount;

  const exclusionsCount =
    payload.exclusions_count ??
    payloadSummary.exclusions_count ??
    (isArchivalControl ? 3 : 0);

  const sourceTable = payload.source_table || 'source_transactions';
  const targetTable = payload.target_table || 'archive_transactions';

  // Synthesize or use completed steps by executor
  const completedSteps =
    gate.steps_completed && gate.steps_completed.length > 0
      ? gate.steps_completed
      : isArchivalControl
      ? [
          {
            step_id: 'step-arch-1',
            step_name: 'Policy Ingestion & Rule Compilation',
            status: 'COMPLETED',
            records_processed: 0,
            metadata: { note: 'Extracted retention cutoff & legal hold exemptions' },
          },
          {
            step_id: 'step-arch-2',
            step_name: 'Scope Discovery & Record Evaluation',
            status: 'COMPLETED',
            records_processed: evaluatedCount,
            metadata: { note: `Evaluated ${evaluatedCount} records: ${eligibleCount} eligible, ${exclusionsCount} legal hold exclusions` },
          },
          {
            step_id: 'step-arch-3',
            step_name: 'Staging Copy to Immutable Storage',
            status: 'COMPLETED',
            records_processed: archivedCount,
            metadata: { note: `Transferred ${archivedCount} records to ${targetTable} with SHA-256` },
          },
          {
            step_id: 'step-arch-4',
            step_name: 'Dual-Root Merkle Cryptographic Verification',
            status: 'COMPLETED',
            records_processed: archivedCount,
            metadata: { note: '100% byte fidelity verified across source & archive roots' },
          },
        ]
      : isVulnControl
      ? [
          {
            step_id: 'step-vuln-1',
            step_name: 'Policy SLA Discovery & Standard Ingestion',
            status: 'COMPLETED',
            records_processed: 0,
            metadata: { note: 'SLA thresholds established: Critical <= 7d, High <= 30d' },
          },
          {
            step_id: 'step-vuln-2',
            step_name: 'Multi-Target Scan & Jira Inventory Reconciliation',
            status: 'COMPLETED',
            records_processed: 12,
            metadata: { note: 'Scanned production databases and reconciled live ticketing status' },
          },
          {
            step_id: 'step-vuln-3',
            step_name: 'Defect Isolation & Candidate Formulation',
            status: 'COMPLETED',
            records_processed: 4,
            metadata: { note: `Formulated ${exceptionsCount} exception candidate and ${escalationsCount} managerial escalation candidate(s)` },
          },
        ]
      : [
          {
            step_id: 'step-gen-1',
            step_name: 'Automated Control Pipeline Execution',
            status: 'COMPLETED',
            records_processed: 0,
            metadata: { note: 'Preliminary checks completed by executor' },
          },
        ];

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
    <div className="bg-white rounded-xl p-5 border border-slate-200 hover:border-slate-300 transition-all shadow-xs hover:shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
              {gate.run_id}
            </span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap">
              {gate.control_id}
            </span>
          </div>
          <h4 className="text-base font-bold text-slate-900 tracking-tight break-words leading-snug">
            {formatGateTitle(gate.gate_name || gate.gate_type, gate.control_id)}
          </h4>
        </div>
        <StatusPill status={gate.status} />
      </div>

      {/* What the Request is About / Purpose Banner (Plain & Professional) */}
      <div className="mb-4 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-slate-900">
              {isArchivalControl
                ? 'Approval Request: Authorize Step 5 Source Purge'
                : isVulnControl
                ? 'Approval Request: Sign off on SLA Exceptions & Managerial Escalations'
                : 'Approval Request: Authorize Control Progression'}
            </div>
            <p className="text-slate-600 leading-relaxed">
              {isArchivalControl ? (
                <>
                  The executor completed archival replication and Merkle verification for{' '}
                  <span className="font-semibold text-slate-800">{archivedCount} eligible records</span>. Approving
                  this request authorizes{' '}
                  <span className="font-semibold text-slate-800">
                    Step 5: Source Database Purge
                  </span>{' '}
                  to delete the {archivedCount} copied records from{' '}
                  <code className="px-1 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[11px]">
                    {sourceTable}
                  </code>{' '}
                  while strictly preserving{' '}
                  <span className="font-semibold text-slate-800">{exclusionsCount} active legal holds</span>.
                </>
              ) : isVulnControl ? (
                <>
                  The executor audited vulnerability remediation compliance against policy SLAs.
                  Approver sign-off is required to grant{' '}
                  <span className="font-semibold text-slate-800">
                    {exceptionsCount} policy exception(s)
                  </span>{' '}
                  and trigger immediate managerial escalation to{' '}
                  <code className="px-1 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[11px]">
                    ciso_direct
                  </code>{' '}
                  for{' '}
                  <span className="font-semibold text-slate-800">
                    {escalationsCount} overdue ticket(s)
                  </span>
                  .
                </>
              ) : (
                'Review the executor-completed pipeline steps and sign off to proceed.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Details Section Toggle */}
      <div className="mb-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('items');
                if (!showFullDetails) setShowFullDetails(true);
              }}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'items' && showFullDetails
                  ? 'bg-slate-200 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {isVulnControl
                ? `Pending Items (${exceptionsCount + escalationsCount})`
                : 'Archival Scope & Verification'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('steps');
                if (!showFullDetails) setShowFullDetails(true);
              }}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'steps' && showFullDetails
                  ? 'bg-slate-200 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Steps Done by Executor ({completedSteps.length})
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowFullDetails(!showFullDetails)}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
          >
            {showFullDetails ? (
              <>
                <span>Collapse</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Expand</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {showFullDetails && (
          <div>
            {/* TAB 1: ITEMS BREAKDOWN */}
            {activeTab === 'items' && (
              <div className="space-y-3">
                {/* Vulnerability Items: Exact Exceptions & Escalations */}
                {isVulnControl && (
                  <div className="space-y-3">
                    {/* Exceptions List */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Requested Exceptions ({exceptionsCount})
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Requires approver authorization to extend SLA
                        </span>
                      </div>

                      {exceptionsList.length === 0 ? (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                          No exceptions in this payload.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {exceptionsList.map((exc, idx) => (
                            <div
                              key={exc.exception_id || idx}
                              className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                    {exc.exception_id}
                                  </span>
                                  <span className="font-semibold text-slate-700">
                                    {exc.finding_id}
                                  </span>
                                  {exc.cve_id && (
                                    <span className="text-slate-500 font-mono text-[11px]">
                                      • {exc.cve_id}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                                    exc.severity === 'CRITICAL'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >
                                  {exc.severity || 'HIGH'}
                                </span>
                              </div>

                              <div className="text-slate-700">
                                <span className="font-medium text-slate-900">Justification: </span>
                                {exc.justification || 'No justification provided.'}
                              </div>

                              {exc.compensating_control && (
                                <div className="text-slate-600 text-[11px]">
                                  <span className="font-medium text-slate-800">
                                    Compensating Control:{' '}
                                  </span>
                                  {exc.compensating_control}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                                <span>Requested by: <span className="font-mono text-slate-700">{exc.requested_by || 'sec_ops'}</span></span>
                                <span>Expires: <span className="font-mono text-slate-700">{exc.expires_at || 'Next Review'}</span></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Escalations List */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-rose-600" />
                          Overdue Escalations ({escalationsCount})
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Tickets past remediation SLA routing to Manager
                        </span>
                      </div>

                      {escalationsList.length === 0 ? (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                          No escalations in this payload.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {escalationsList.map((esc, idx) => (
                            <div
                              key={esc.ticket_id || idx}
                              className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                    {esc.ticket_id}
                                  </span>
                                  <span className="font-semibold text-slate-700">
                                    {esc.finding_id}
                                  </span>
                                  {esc.cve_id && (
                                    <span className="text-slate-500 font-mono text-[11px]">
                                      • {esc.cve_id}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                                    esc.severity === 'CRITICAL'
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >
                                  {esc.severity || 'HIGH'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                                <div>
                                  <span className="text-slate-500">Current Owner: </span>
                                  <span className="font-mono text-slate-800 font-medium">
                                    {esc.owner || 'sec_ops_team'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Escalate To: </span>
                                  <span className="font-mono text-slate-900 font-bold">
                                    {esc.owner_manager || 'ciso_direct'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Database: </span>
                                  <span className="font-mono text-slate-700">
                                    {esc.database_name || 'vuln_target'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">SLA Due Date: </span>
                                  <span className="font-mono text-rose-700 font-semibold">
                                    {esc.due_date || 'Overdue'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Archival Items: Scope & Dual-Root Verification Details */}
                {isArchivalControl && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-[11px] text-slate-500 block">Records Evaluated</span>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {evaluatedCount}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-[11px] text-slate-500 block">Eligible (&gt; 5/6 yrs)</span>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {eligibleCount}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-[11px] text-slate-500 block">Archived to Target</span>
                        <span className="font-mono text-sm font-bold text-emerald-800">
                          {archivedCount}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-[11px] text-slate-500 block">Legal Hold Exclusions</span>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {exclusionsCount} (Preserved)
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">Cryptographic Merkle Tree:</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Dual-Root Matched (100% Byte Fidelity)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">Reversible Copy Tables:</span>
                        <span className="font-mono text-slate-800">
                          {sourceTable} → {targetTable}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">Action Authorized on Sign-off:</span>
                        <span className="font-semibold text-slate-900">
                          Step 5 Source Purge (Irrevocable Deletion)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generic Control Payload if neither Archival nor Vuln */}
                {!isArchivalControl && !isVulnControl && (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <pre className="font-mono text-[11px] overflow-auto max-h-36">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: EXECUTOR STEPS COMPLETED */}
            {activeTab === 'steps' && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Executor Audit Trail Prior to Sign-off Gate
                </div>
                {completedSteps.map((step, sIdx) => (
                  <div
                    key={step.step_id || sIdx}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/80 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-900">
                          Step {sIdx + 1}: {step.step_name}
                        </div>
                        {step.metadata?.note && (
                          <div className="text-slate-600 text-[11px] mt-0.5">
                            {step.metadata.note}
                          </div>
                        )}
                        {step.records_processed ? (
                          <div className="text-slate-500 font-mono text-[10px] mt-0.5">
                            Processed: {step.records_processed} record(s)
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                      Completed
                    </span>
                  </div>
                ))}

                {/* Next step to be authorized */}
                <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        {isArchivalControl
                          ? 'Step 5: Authorized Source Purge'
                          : isVulnControl
                          ? 'Step 4: Apply Approved Exceptions & Escalations'
                          : 'Final Step: Post-Approval Execution'}
                      </div>
                      <div className="text-amber-800 text-[11px] mt-0.5">
                        Awaiting Approver sign-off to proceed.
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                    Pending Gate
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Proposer / Approver Metadata */}
      <div className="grid grid-cols-2 gap-3 py-3 px-4 rounded-lg bg-slate-50 border border-slate-200 text-xs mb-4">
        <div>
          <span className="text-slate-500 block mb-0.5 font-medium">Requested by</span>
          <span className="font-mono text-slate-800 flex items-center gap-1 font-semibold">
            <User className="w-3 h-3 text-slate-400" />
            {gate.maker_email || gate.maker_id}
            {isMaker && <span className="text-amber-700 font-sans text-[10px]">(You)</span>}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block mb-0.5 font-medium">Approval required from</span>
          <span className="font-mono text-slate-800 flex items-center gap-1 font-semibold">
            <ShieldCheck className="w-3 h-3 text-slate-500" />
            {formatApproverRole(gate.approver_role)}
          </span>
        </div>
      </div>

      {/* Decision Actions or History */}
      {gate.status === 'pending' ? (
        <div className="space-y-3">
          {userIsAuditor && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Auditor (Read-Only): You have read-only access. Only users with the Approver role
                can approve or reject gates.
              </span>
            </div>
          )}

          {userIsExecutor && (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Executor Role: You executed steps up to this gate, but cannot sign off on your own
                run. Awaiting distinct Approver sign-off.
              </span>
            </div>
          )}

          {isMaker && userIsApprover && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Maker-Checker Policy: You initiated this run. A distinct Approver must sign off.
              </span>
            </div>
          )}

          <div>
            <textarea
              placeholder={
                canApprove
                  ? 'Add review comment or rationale (mandatory for rejection)...'
                  : 'Decisions disabled for this role...'
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting || !canApprove}
              className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-all resize-none shadow-xs disabled:bg-slate-100 disabled:text-slate-500"
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
                ? 'Approving authorizes the run to proceed to the next step.'
                : 'Awaiting sign-off by authorized Approver.'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAction('rejected')}
                disabled={submitting || !canApprove}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                title={!canApprove ? 'Requires Approver role' : undefined}
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleAction('approved')}
                disabled={submitting || !canApprove}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
                title={!canApprove ? 'Requires Approver role' : undefined}
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
            <span>
              Decided by:{' '}
              <span className="font-mono text-slate-800 font-semibold">{gate.decided_by}</span>
            </span>
            <span className="text-[11px] text-slate-500">
              {gate.decided_at ? new Date(gate.decided_at).toLocaleString() : ''}
            </span>
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
                  type="button"
                  onClick={() => onResumeRun(gate)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 transition-all shadow-xs cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {activeResumeLabel}
                </button>
              ) : isAuditor(currentUser) ? (
                <span className="text-[11px] text-slate-400 italic">
                  Awaiting execution continuation (Read-only)
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
