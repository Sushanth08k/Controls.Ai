import React, { useState } from 'react';
import { ControlDefinitionDTO, FindingDTO, GateItemDTO, RunItemDTO, UserSessionDTO } from '../../types';
import { ArchetypeBadge } from '../../components/ArchetypeBadge';
import { StatusPill } from '../../components/StatusPill';
import { SeverityTag } from '../../components/SeverityTag';
import { EvidenceChip } from '../../components/EvidenceChip';
import { ControlExecutionModal } from '../library/ControlExecutionModal';
import { VulnerabilityExecutionModal } from '../library/VulnerabilityExecutionModal';
import { Plus, ArrowUpRight, ShieldCheck, Database, Server, Cpu, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DashboardPageProps {
  controls: ControlDefinitionDTO[];
  runs: RunItemDTO[];
  gates: GateItemDTO[];
  findings: FindingDTO[];
  currentUser: UserSessionDTO;
  onTriggerRun?: (controlId: string) => Promise<any>;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  controls,
  runs,
  gates,
  findings,
  currentUser,
  onTriggerRun,
}) => {
  const navigate = useNavigate();
  const [modalControl, setModalControl] = useState<ControlDefinitionDTO | null>(null);

  const pendingGates = gates.filter((g) => g.status === 'pending');
  const activeRuns = runs.filter((r) => r.status === 'running');

  // Find default archival control (Archetype D) or first available control
  const defaultControl =
    controls.find((c) => c.archetype === 'D') || controls[0] || null;

  const handleStartRun = () => {
    if (defaultControl) {
      setModalControl(defaultControl);
    } else {
      navigate('/controls');
    }
  };

  const workflowSteps = [
    'Upload',
    'AI analysis',
    'Structured rules',
    'Execution',
    'Archival',
    'Verification',
    'Human approval',
    'Source cleanup',
    'Final verification',
    'Audit evidence',
  ];

  return (
    <div className="space-y-6">
      {/* Top Compliance Guardrail Banner */}
      <div className="bg-[#0e3526] text-white -mx-6 md:-mx-8 -mt-6 md:-mt-8 px-6 md:px-8 py-4 border-b border-[#184633] shadow-xs">
        <div className="max-w-7xl">
          <h2 className="text-sm md:text-base font-bold text-white tracking-tight">
            Archive first. Verify. Then obtain human approval before source cleanup.
          </h2>
          <p className="text-xs text-[#a2c4b5] mt-1 font-normal">
            Source records are never removed without an approval on record.
          </p>
        </div>
      </div>

      {/* Workflow Step Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
        {workflowSteps.map((step) => (
          <span
            key={step}
            className="px-3.5 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-700 whitespace-nowrap shadow-2xs hover:border-slate-300 hover:text-slate-900 transition-colors cursor-default"
          >
            {step}
          </span>
        ))}
      </div>

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Compliance controls at a glance.</p>
      </div>

      {/* Primary Action Button */}
      <div>
        <button
          type="button"
          onClick={handleStartRun}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#143d2c] hover:bg-[#1a4d38] text-white text-sm font-semibold shadow-xs hover:shadow transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Upload Policy</span>
        </button>
      </div>

      {/* 4 Action / KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Upload Policy (Active / Highlighted Dark Green) */}
        <div
          onClick={handleStartRun}
          className="bg-[#143d2c] hover:bg-[#184633] text-white p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
            Upload Policy
          </span>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xl font-bold text-white group-hover:text-emerald-100 transition-colors">
              Start a new run
            </span>
            <ArrowUpRight className="w-5 h-5 text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>

        {/* Card 2: Control Runs */}
        <div
          onClick={() => navigate('/runs')}
          className="bg-white hover:bg-slate-50/80 border border-slate-200/90 hover:border-slate-300 p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Control Runs
            </span>
            {activeRuns.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                {activeRuns.length} active
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xl font-bold text-slate-900">View executions</span>
            <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </div>
        </div>

        {/* Card 3: Approval Queue */}
        <div
          onClick={() => navigate('/approvals')}
          className="bg-white hover:bg-slate-50/80 border border-slate-200/90 hover:border-slate-300 p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Approval Queue
            </span>
            {pendingGates.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                {pendingGates.length} pending
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xl font-bold text-slate-900">Review pending</span>
            <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </div>
        </div>

        {/* Card 4: Audit Evidence */}
        <div
          onClick={() => navigate('/findings')}
          className="bg-white hover:bg-slate-50/80 border border-slate-200/90 hover:border-slate-300 p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Audit Evidence
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 font-mono">
              Merkle Ledger
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xl font-bold text-slate-900">View evidence</span>
            <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </div>
        </div>
      </div>

      {/* 4 Active Compliance Controls & Workflows */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Active Controls & Workflows</h3>
            <p className="text-xs text-slate-500">
              Select any control and click Run to launch its interactive verification workflow.
            </p>
          </div>
          <button
            onClick={() => navigate('/controls')}
            className="text-xs text-[#143d2c] hover:text-[#1a4d38] font-semibold flex items-center gap-1 cursor-pointer"
          >
            View all policies <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {controls.slice(0, 4).map((c) => (
            <div
              key={c.control_id}
              className="bg-white p-5 rounded-xl border border-slate-200/90 hover:border-emerald-300 transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-xs font-mono font-bold text-emerald-800 block mb-0.5">
                      {c.control_id}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
                  </div>
                  <ArchetypeBadge archetype={c.archetype} />
                </div>

                {c.objective && (
                  <p className="text-xs text-slate-600 mb-4 line-clamp-2">{c.objective}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 mb-4">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-medium">Frequency</span>
                    <span className="font-mono text-slate-800 font-semibold">{c.frequency}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-medium">Risk Rating</span>
                    <SeverityTag severity={c.risk_rating} />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-slate-500 text-[11px] truncate">
                    Owner: <span className="font-mono text-slate-800 font-medium">{c.owner_role}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setModalControl(c)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#143d2c] hover:bg-[#1a4d38] text-white shadow-xs hover:shadow transition-all cursor-pointer"
                    title={`Run ${c.control_id} workflow`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                    <span>Run</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Control Lifecycle Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 tracking-tight">Control lifecycle</h3>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          Upload policy <span className="text-slate-400">→</span> AI policy analysis{' '}
          <span className="text-slate-400">→</span> structured rules{' '}
          <span className="text-slate-400">→</span> control execution{' '}
          <span className="text-slate-400">→</span> archival{' '}
          <span className="text-slate-400">→</span> independent verification{' '}
          <span className="text-slate-400">→</span> human approval{' '}
          <span className="text-slate-400">→</span> controlled source cleanup{' '}
          <span className="text-slate-400">→</span> final verification{' '}
          <span className="text-slate-400">→</span> audit evidence.
        </p>
      </div>

      {/* System Status Section */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 tracking-tight">System Status</h3>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 tracking-wider">
            OPERATIONAL
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Spark Database</span>
            </div>
            <div className="text-xs font-semibold text-slate-900">Local Spark Simulator</div>
            <span className="text-[11px] text-emerald-600 font-medium">Ready for SQL execution</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              <span>OPA Policy Engine</span>
            </div>
            <div className="text-xs font-semibold text-slate-900">Rego v0.68.0</div>
            <span className="text-[11px] text-blue-600 font-medium">Zero-trust gates active</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
              <Server className="w-3.5 h-3.5 text-indigo-600" />
              <span>Realtime SSE</span>
            </div>
            <div className="text-xs font-semibold text-slate-900">Live Event Stream</div>
            <span className="text-[11px] text-indigo-600 font-medium">Realtime connected</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Audit Ledger</span>
            </div>
            <div className="text-xs font-semibold text-slate-900">SHA-256 Merkle Tree</div>
            <span className="text-[11px] text-amber-700 font-medium">Tamper-evident log</span>
          </div>
        </div>
      </div>

      {/* Active & Recent Executions Table */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Active & Recent Control Executions</h3>
            <p className="text-xs text-slate-500">Temporal orchestrator execution pipeline</p>
          </div>
          <button
            onClick={() => navigate('/runs')}
            className="text-xs text-[#143d2c] hover:text-[#1e543e] flex items-center gap-1 font-semibold cursor-pointer"
          >
            View all runs <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-medium">
                <th className="pb-3 font-semibold">Run ID</th>
                <th className="pb-3 font-semibold">Control ID</th>
                <th className="pb-3 font-semibold">Archetype</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Scope Targets</th>
                <th className="pb-3 font-semibold">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No runs recorded yet. Click "+ Upload Policy" to start a new run.
                  </td>
                </tr>
              ) : (
                runs.slice(0, 5).map((r) => (
                  <tr key={r.run_id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 font-mono text-slate-700">{r.run_id}</td>
                    <td className="py-3 font-mono text-emerald-800 font-semibold">{r.control_id}</td>
                    <td className="py-3">
                      <ArchetypeBadge archetype={r.archetype} />
                    </td>
                    <td className="py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="py-3 text-slate-600">{r.targets.join(', ') || 'Default'}</td>
                    <td className="py-3 text-slate-500 font-mono text-[11px]">
                      {new Date(r.started_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security & Integrity Findings Preview */}
      {findings.length > 0 && (
        <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Security & Integrity Findings</h3>
              <p className="text-xs text-slate-500">Findings derived from deterministic rule evaluation</p>
            </div>
            <button
              onClick={() => navigate('/findings')}
              className="text-xs text-[#143d2c] hover:text-[#1e543e] flex items-center gap-1 font-semibold cursor-pointer"
            >
              View all findings <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {findings.slice(0, 3).map((f) => (
              <div
                key={f.finding_id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200"
              >
                <div className="flex items-center gap-3">
                  <SeverityTag severity={f.severity} />
                  <div>
                    <span className="text-xs font-semibold text-slate-900 block">{f.title}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Control: {f.control_id} · Run: {f.run_id}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {f.evidence_ids.map((id) => (
                    <EvidenceChip key={id} evidenceId={id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Compliance Execution Modal */}
      {modalControl && (
        modalControl.control_id.toLowerCase().includes('vuln') ? (
          <VulnerabilityExecutionModal
            control={modalControl}
            currentUser={currentUser}
            onClose={() => setModalControl(null)}
            onRunCompleted={() => {
              if (onTriggerRun) onTriggerRun(modalControl.control_id);
            }}
          />
        ) : (
          <ControlExecutionModal
            control={modalControl}
            currentUser={currentUser}
            onClose={() => setModalControl(null)}
            onRunCompleted={() => {
              if (onTriggerRun) onTriggerRun(modalControl.control_id);
            }}
          />
        )
      )}
    </div>
  );
};
