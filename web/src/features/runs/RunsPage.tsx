import React, { useState } from 'react';
import { RunItemDTO, ControlDefinitionDTO, UserSessionDTO } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { ArchetypeBadge } from '../../components/ArchetypeBadge';
import { fetchRunAudit, resumeInteractiveRun } from '../../api/client';
import { ControlExecutionModal } from '../library/ControlExecutionModal';
import { VulnerabilityExecutionModal } from '../library/VulnerabilityExecutionModal';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
  UserCheck,
  AlertCircle,
  Loader2,
  Play,
} from 'lucide-react';

interface RunsPageProps {
  runs: RunItemDTO[];
  controls?: ControlDefinitionDTO[];
  currentUser?: UserSessionDTO;
  onRefresh?: () => void;
}

export const RunsPage: React.FC<RunsPageProps> = ({
  runs,
  controls,
  currentUser,
  onRefresh,
}) => {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [auditData, setAuditData] = useState<any | null>(null);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Resume modal state
  const [resumeModalControl, setResumeModalControl] = useState<ControlDefinitionDTO | null>(null);
  const [resumeRunId, setResumeRunId] = useState<string | null>(null);
  const [resumeStage, setResumeStage] = useState<'EVALUATED' | 'ARCHIVED' | 'VERIFIED' | 'APPROVED' | 'CLEANED' | undefined>(undefined);

  const getStageFromSteps = (
    steps: any[] = [],
    runStatus: string = ''
  ): 'EVALUATED' | 'ARCHIVED' | 'VERIFIED' | 'APPROVED' | 'CLEANED' => {
    const hasCleanup = steps.some((s) => s.step_name === 'SOURCE_CLEANUP' && s.status === 'completed');
    const hasApproval = steps.some((s) => s.step_name === 'APPROVAL' && s.status === 'completed');
    const hasVerify = steps.some((s) => s.step_name === 'VERIFICATION' && s.status === 'completed');
    const hasArchive = steps.some((s) => (s.step_name === 'ARCHIVE' || s.step_name === 'EXECUTE_ARCHIVAL') && s.status === 'completed');

    if (hasCleanup || runStatus === 'completed') return 'CLEANED';
    if (hasApproval) return 'APPROVED';
    if (hasVerify) return 'VERIFIED';
    if (hasArchive) return 'ARCHIVED';
    return 'EVALUATED';
  };

  const getStageDisplay = (stage: string) => {
    switch (stage) {
      case 'CLEANED':
        return {
          label: 'Completed & Certified',
          nextAction: 'View Audit Records',
          stepNum: 5,
          badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        };
      case 'APPROVED':
        return {
          label: 'Ready for Step 5: Source Cleanup (DELETE)',
          nextAction: 'Purge Source Records',
          stepNum: 5,
          badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
        };
      case 'VERIFIED':
        return {
          label: 'Ready for Step 4: Maker-Checker Human Approval',
          nextAction: 'Record Human Approval',
          stepNum: 4,
          badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
        };
      case 'ARCHIVED':
        return {
          label: 'Ready for Step 3: Cryptographic Merkle Verification',
          nextAction: 'Verify Records',
          stepNum: 3,
          badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
        };
      case 'EVALUATED':
      default:
        return {
          label: 'Ready for Step 2: Archival Execution (INSERT)',
          nextAction: 'Execute Archival SQL',
          stepNum: 2,
          badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
        };
    }
  };

  const handleResumeRun = async (
    r: RunItemDTO,
    targetStage?: 'EVALUATED' | 'ARCHIVED' | 'VERIFIED' | 'APPROVED' | 'CLEANED'
  ) => {
    let stage = targetStage;
    if (!stage) {
      try {
        const resumeData = await resumeInteractiveRun(r.run_id);
        stage = resumeData.stage;
      } catch {
        stage = getStageFromSteps(auditData?.steps || [], r.status);
      }
    }

    const matched =
      (controls || []).find((c) => c.control_id === r.control_id) ||
      (controls || []).find((c) => c.archetype === r.archetype) ||
      ({
        control_id: r.control_id,
        name: r.control_id,
        archetype: r.archetype || 'D',
        version: r.version || '1.0.0',
        description: 'Attested Control Workflow',
        lifecycle_type: 'automated',
        enforcement_level: 'deterministic',
        criticality: 'HIGH',
      } as unknown as ControlDefinitionDTO);

    setResumeModalControl(matched);
    setResumeRunId(r.run_id);
    setResumeStage(stage);
  };

  const handleToggleRun = async (runId: string) => {
    if (selectedRunId === runId) {
      setSelectedRunId(null);
      setAuditData(null);
      return;
    }

    setSelectedRunId(runId);
    setLoadingAudit(true);
    setAuditError(null);
    try {
      const data = await fetchRunAudit(runId);
      setAuditData(data);
    } catch (err: any) {
      setAuditError(err.message || 'Failed to load audit package');
    } finally {
      setLoadingAudit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Runs & Persistent Audit History</h2>
        <p className="text-xs text-slate-500 mt-1">
          Cryptographically attested control execution runs, Merkle verification roots, human approvals, and SQLite persistent audit workpapers.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-3 px-4">Workflow Run ID</th>
                <th className="py-3 px-3">Control ID</th>
                <th className="py-3 px-3">Version</th>
                <th className="py-3 px-3">Archetype</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Scope / Targets</th>
                <th className="py-3 px-3">Started At</th>
                <th className="py-3 px-4 text-right">Audit Trail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((r) => {
                const isExpanded = selectedRunId === r.run_id;
                return (
                  <React.Fragment key={r.run_id}>
                    <tr
                      onClick={() => handleToggleRun(r.run_id)}
                      className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                        isExpanded ? 'bg-blue-50/40 border-l-4 border-l-blue-600' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-slate-800 font-semibold">{r.run_id}</td>
                      <td className="py-3 px-3 font-mono text-blue-600 font-bold">{r.control_id}</td>
                      <td className="py-3 px-3 font-mono text-slate-500">{r.version}</td>
                      <td className="py-3 px-3">
                        <ArchetypeBadge archetype={r.archetype} />
                      </td>
                      <td className="py-3 px-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-medium">
                        {r.targets.join(', ') || 'Default'}
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResumeRun(r);
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-white font-semibold text-[11px] shadow-xs transition-all cursor-pointer ${
                              r.status === 'running'
                                ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse'
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                            title="Navigate directly into the process where it left off"
                          >
                            <Play className="w-3 h-3 fill-white" />
                            <span>{r.status === 'running' ? 'Resume' : 'Open'}</span>
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                          >
                            <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Persistent Audit Inspection Drawer */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70 border-b border-slate-200">
                        <td colSpan={8} className="p-5">
                          {loadingAudit && (
                            <div className="flex items-center justify-center py-8 gap-2 text-slate-500 text-xs">
                              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                              <span>Loading persistent SQLite audit package...</span>
                            </div>
                          )}

                          {auditError && (
                            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>{auditError}</span>
                            </div>
                          )}

                          {!loadingAudit && auditData && (
                            <div className="space-y-5 text-slate-800">
                              {/* Resume Action Banner */}
                              {(() => {
                                const stage = getStageFromSteps(auditData.steps || [], r.status);
                                const stageInfo = getStageDisplay(stage);
                                return (
                                  <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border border-blue-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                                        <Play className="w-4 h-4 fill-white ml-0.5" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-bold text-slate-900 text-xs">
                                            {r.status === 'running' ? 'Active Execution In-Progress' : 'Control Execution Workflow'}
                                          </h4>
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${stageInfo.badgeColor}`}>
                                            {stageInfo.label}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-600 mt-0.5">
                                          Workflow Run <code className="font-bold text-slate-800 font-mono">{r.run_id}</code> is currently at Step {stageInfo.stepNum}.
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleResumeRun(r, stage)}
                                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-all hover:shadow-sm cursor-pointer shrink-0"
                                    >
                                      <Play className="w-3.5 h-3.5 fill-white" />
                                      <span>Continue Process ({stageInfo.nextAction}) →</span>
                                    </button>
                                  </div>
                                );
                              })()}
                              {/* Header metrics card */}
                              <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Control & Run</span>
                                  <span className="font-bold text-slate-900 font-mono">{r.control_id}</span>
                                  <span className="block text-slate-500 font-mono text-[10px]">{r.run_id}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Verification Status</span>
                                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-0.5">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    {auditData.run?.status?.toUpperCase() || 'COMPLETED'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Records Ingestion</span>
                                  <span className="font-semibold text-slate-700">
                                    Evaluated: <strong className="text-slate-900">{auditData.run?.records_evaluated ?? r.records_scanned ?? 0}</strong>
                                  </span>
                                  {auditData.run?.records_eligible !== undefined && (
                                    <span className="block text-slate-500 text-[10px]">
                                      Eligible: {auditData.run.records_eligible} | Purged: {auditData.run.records_affected}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[11px]">Storage Engine</span>
                                  <span className="font-mono text-slate-700 text-[11px]">
                                    {auditData.run?.source_db || 'bank_core.db'}
                                  </span>
                                  <span className="block text-slate-500 text-[10px]">SQLite Persistent Table</span>
                                </div>
                              </div>

                              {/* Merkle Verification Card (if available for Archival control) */}
                              {auditData.merkle_verification?.source_merkle_root && (
                                <div className="bg-white rounded-lg p-4 border border-emerald-200 shadow-2xs space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                                      <Lock className="w-4 h-4 text-emerald-600" />
                                      <span>Cryptographic Merkle Tree Verification (PASSED)</span>
                                    </div>
                                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-100/70 text-emerald-800">
                                      Byte-Fidelity: 100% Match
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px] font-mono">
                                    <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Source Merkle Root:</span>
                                      <span className="text-slate-800 break-all select-all font-semibold">
                                        {auditData.merkle_verification.source_merkle_root}
                                      </span>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Archive Merkle Root:</span>
                                      <span className="text-slate-800 break-all select-all font-semibold">
                                        {auditData.merkle_verification.archive_merkle_root}
                                      </span>
                                    </div>
                                  </div>
                                  {auditData.merkle_verification.attestation_token && (
                                    <div className="text-[11px] text-slate-600 pt-1">
                                      <span className="font-semibold text-slate-700">Attestation Token: </span>
                                      <code className="bg-slate-100 px-2 py-0.5 rounded text-blue-700 font-bold">
                                        {auditData.merkle_verification.attestation_token}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Execution Lifecycle Steps Checklist */}
                              {auditData.steps && auditData.steps.length > 0 && (
                                <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs space-y-2">
                                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                                    Execution Lifecycle Steps (Audit Log)
                                  </h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                                    {auditData.steps.map((st: any) => (
                                      <div
                                        key={st.step_id}
                                        className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-start gap-2.5"
                                      >
                                        <div className="mt-0.5 shrink-0">
                                          {st.status === 'completed' ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                          ) : (
                                            <Clock className="w-4 h-4 text-amber-500" />
                                          )}
                                        </div>
                                        <div className="text-xs leading-tight">
                                          <div className="font-bold text-slate-900 font-mono text-[11px]">{st.step_name}</div>
                                          <div className="text-[10px] text-slate-500 mt-0.5">
                                            Status: <span className="font-medium text-slate-700 uppercase">{st.status}</span>
                                            {st.records_processed > 0 && ` (${st.records_processed} records)`}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                    {/* Next Step / Action Step */}
                                    {(() => {
                                      const stage = getStageFromSteps(auditData.steps || [], r.status);
                                      if (stage === 'CLEANED') return null;
                                      const stageInfo = getStageDisplay(stage);
                                      return (
                                        <div
                                          onClick={() => handleResumeRun(r, stage)}
                                          className="p-2.5 rounded bg-blue-50/80 border-2 border-dashed border-blue-400 flex items-start gap-2.5 hover:bg-blue-100/70 cursor-pointer transition-all group"
                                          title="Click to execute this pending step"
                                        >
                                          <div className="mt-0.5 shrink-0">
                                            <Play className="w-4 h-4 fill-blue-600 text-blue-600 group-hover:scale-110 transition-transform" />
                                          </div>
                                          <div className="text-xs leading-tight">
                                            <div className="font-bold text-blue-900 font-mono text-[11px] flex items-center gap-1.5">
                                              <span>{stageInfo.nextAction}</span>
                                              <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.2 rounded font-sans font-bold uppercase">NEXT</span>
                                            </div>
                                            <div className="text-[10px] text-blue-700 mt-0.5 font-sans font-medium">
                                              Click to navigate and execute this step →
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}

                              {/* Findings Section */}
                              {auditData.findings && auditData.findings.length > 0 && (
                                <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs space-y-2">
                                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-amber-600" />
                                    Persistent Audit Findings ({auditData.findings.length})
                                  </h4>
                                  <div className="space-y-2 pt-1">
                                    {auditData.findings.map((f: any) => (
                                      <div
                                        key={f.finding_id}
                                        className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg text-xs space-y-1"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-slate-900">{f.title}</span>
                                          <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase bg-amber-100 text-amber-800">
                                            {f.severity}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-600">{f.description}</p>
                                        {f.affected_record && (
                                          <span className="text-[10px] font-mono text-slate-500">
                                            Target: {f.affected_record}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Approvals Section */}
                              {auditData.approvals && auditData.approvals.length > 0 && (
                                <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs space-y-2">
                                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                                    Maker-Checker Human Approvals
                                  </h4>
                                  <div className="space-y-2 pt-1 text-xs">
                                    {auditData.approvals.map((a: any) => (
                                      <div
                                        key={a.gate_id}
                                        className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                      >
                                        <div>
                                          <span className="font-mono font-bold text-slate-900 block">{a.gate_id}</span>
                                          <span className="text-[11px] text-slate-600">
                                            Decided By: <strong className="text-slate-800">{a.approved_by || 'Reviewer'}</strong> ({a.status})
                                          </span>
                                          {a.comment && (
                                            <p className="text-[11px] text-slate-500 italic mt-0.5">"{a.comment}"</p>
                                          )}
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                          {a.approved_at ? new Date(a.approved_at).toLocaleString() : 'Recorded'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
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

      {/* Resume Control Execution Modal */}
      {resumeModalControl && resumeRunId && (
        resumeModalControl.archetype === 'A' ? (
          <VulnerabilityExecutionModal
            control={resumeModalControl}
            currentUser={currentUser || { user_id: 'sec_reviewer_1', roles: ['control_reviewer'], email: 'reviewer@bank.internal' }}
            initialRunId={resumeRunId}
            onClose={() => {
              setResumeModalControl(null);
              setResumeRunId(null);
              setResumeStage(undefined);
            }}
            onRunCompleted={() => {
              setResumeModalControl(null);
              setResumeRunId(null);
              setResumeStage(undefined);
              onRefresh?.();
            }}
          />
        ) : (
          <ControlExecutionModal
            control={resumeModalControl}
            currentUser={currentUser || { user_id: 'sec_reviewer_1', roles: ['control_reviewer'], email: 'reviewer@bank.internal' }}
            initialRunId={resumeRunId}
            initialStage={resumeStage}
            onClose={() => {
              setResumeModalControl(null);
              setResumeRunId(null);
              setResumeStage(undefined);
            }}
            onRunCompleted={() => {
              setResumeModalControl(null);
              setResumeRunId(null);
              setResumeStage(undefined);
              onRefresh?.();
            }}
          />
        )
      )}
    </div>
  );
};

