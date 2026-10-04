import React, { useState } from 'react';
import { ControlDefinitionDTO, FindingDTO, GateItemDTO, RunItemDTO, UserSessionDTO } from '../../types';
import { ArchetypeBadge } from '../../components/ArchetypeBadge';
import { StatusPill } from '../../components/StatusPill';
import { SeverityTag } from '../../components/SeverityTag';
import { EvidenceChip } from '../../components/EvidenceChip';
import { ControlExecutionModal } from '../library/ControlExecutionModal';
import { VulnerabilityExecutionModal } from '../library/VulnerabilityExecutionModal';
import { Plus, ArrowUpRight, Play, PlayCircle, Shield, CheckCircle2, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatFrequency } from '../../utils/formatFrequency';

interface DashboardPageProps {
  controls: ControlDefinitionDTO[];
  runs: RunItemDTO[];
  gates: GateItemDTO[];
  findings: FindingDTO[];
  currentUser: UserSessionDTO;
  onRefresh?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  controls,
  runs,
  gates,
  findings,
  currentUser,
  onRefresh,
}) => {
  const navigate = useNavigate();
  const [modalControl, setModalControl] = useState<ControlDefinitionDTO | null>(null);

  // Exactly 5 Control Testing Metrics
  const totalControls = controls.length;
  const testsRun = runs.length;
  const testsPassed = runs.filter(
    (r) =>
      r.status === 'completed' ||
      r.status === 'CLEANED' ||
      r.status === 'VERIFIED' ||
      (r.status !== 'failed' && r.status !== 'blocked' && (r.failed ?? 0) === 0)
  ).length;
  const passRate = testsRun > 0 ? Math.round((testsPassed / testsRun) * 100) : 100;
  const pendingApprovals = gates.filter((g) => g.status === 'pending').length;
  const openFindings = findings.filter(
    (f) => f.status === 'open' || !f.status || f.status === 'active'
  ).length;
  const criticalFindings = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');

  // Helper to determine control testing status
  const getControlStatus = (controlId: string): string => {
    const controlRuns = runs.filter((r) => r.control_id === controlId);
    if (controlRuns.length === 0) return 'Not Tested';
    const latest = controlRuns[0];
    if (latest.status === 'running') return 'Running';
    if (latest.status === 'failed' || (latest.failed !== undefined && latest.failed > 0)) return 'Failed';
    if (
      latest.status === 'completed' ||
      latest.status === 'CLEANED' ||
      latest.status === 'VERIFIED' ||
      latest.status === 'APPROVED'
    ) {
      return 'Passed';
    }
    return 'Passed';
  };

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

  return (
    <div className="space-y-6">
      {/* Page Header with Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time compliance telemetry, deterministic verification, and automated controls audit.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs hover:border-slate-300 transition-all cursor-pointer"
              title="Refresh telemetry data"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleStartRun}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#143d2c] hover:bg-[#1a4d38] text-white text-xs sm:text-sm font-semibold shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Upload Policy</span>
          </button>
        </div>
      </div>

      {/* 5 Real Control Testing Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Controls */}
        <div
          onClick={() => navigate('/controls')}
          className="bg-white hover:bg-slate-50/70 border border-slate-200/90 hover:border-slate-300 p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Controls
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>

            <div className="mt-3.5 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
                {totalControls}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active Catalog
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Configured controls</span>
            <span>View all →</span>
          </div>
        </div>

        {/* Card 2: Tests Run */}
        <div
          onClick={() => navigate('/runs')}
          className="bg-white hover:bg-slate-50/70 border border-slate-200/90 hover:border-slate-300 p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                  <PlayCircle className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Tests Run
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>

            <div className="mt-3.5 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
                {testsRun}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Executions
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Historical test runs</span>
            <span>Control Runs →</span>
          </div>
        </div>

        {/* Card 3: Tests Passed */}
        <div
          onClick={() => navigate('/runs')}
          className="bg-white hover:bg-slate-50/70 border border-slate-200/90 hover:border-slate-300 p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Tests Passed
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>

            <div className="mt-3.5 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
                {testsPassed}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {passRate}% Pass Rate
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden flex">
              <div
                style={{ width: `${passRate}%` }}
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>{testsPassed} passed</span>
              <span>{testsRun - testsPassed} other</span>
            </div>
          </div>
        </div>

        {/* Card 4: Pending Approvals */}
        <div
          onClick={() => navigate('/approvals')}
          className="bg-white hover:bg-slate-50/70 border border-slate-200/90 hover:border-slate-300 p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    pendingApprovals > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Pending Approvals
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>

            <div className="mt-3.5 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
                {pendingApprovals}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  pendingApprovals > 0
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {pendingApprovals > 0 ? 'Action Required' : 'All Clear'}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Two-person gates</span>
            <span>Review queue →</span>
          </div>
        </div>

        {/* Card 5: Open Findings */}
        <div
          onClick={() => navigate('/findings')}
          className="bg-white hover:bg-slate-50/70 border border-slate-200/90 hover:border-slate-300 p-5 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    criticalFindings.length > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Open Findings
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>

            <div className="mt-3.5 flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
                {openFindings}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  criticalFindings.length > 0
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {criticalFindings.length > 0 ? `${criticalFindings.length} High/Crit` : 'Zero High Risk'}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Discovered exceptions</span>
            <span>View findings →</span>
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
            View all controls <ArrowUpRight className="w-3.5 h-3.5" />
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusPill status={getControlStatus(c.control_id)} />
                    <ArchetypeBadge archetype={c.archetype} />
                  </div>
                </div>

                {c.objective && (
                  <p className="text-xs text-slate-600 mb-4 line-clamp-2">{c.objective}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 mb-4">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-medium">Frequency</span>
                    <span className="text-slate-800 font-medium">{formatFrequency(c.frequency)}</span>
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

      {/* Active & Recent Executions Table */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Active & Recent Control Executions</h3>
            <p className="text-xs text-slate-500">Control Test History</p>
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
                <th className="pb-3 font-semibold">Testing Method</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Data Checked</th>
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
              if (onRefresh) onRefresh();
            }}
          />
        ) : (
          <ControlExecutionModal
            control={modalControl}
            currentUser={currentUser}
            onClose={() => setModalControl(null)}
            onRunCompleted={() => {
              if (onRefresh) onRefresh();
            }}
          />
        )
      )}
    </div>
  );
};
