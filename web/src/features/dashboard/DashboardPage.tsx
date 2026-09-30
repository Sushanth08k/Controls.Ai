import React from 'react';
import { ControlDefinitionDTO, FindingDTO, GateItemDTO, RunItemDTO } from '../../types';
import { ArchetypeBadge } from '../../components/ArchetypeBadge';
import { StatusPill } from '../../components/StatusPill';
import { SeverityTag } from '../../components/SeverityTag';
import { EvidenceChip } from '../../components/EvidenceChip';
import { BookOpen, ShieldCheck, PlayCircle, AlertCircle, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardPageProps {
  controls: ControlDefinitionDTO[];
  runs: RunItemDTO[];
  gates: GateItemDTO[];
  findings: FindingDTO[];
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ controls, runs, gates, findings }) => {
  const pendingGates = gates.filter((g) => g.status === 'pending');
  const activeRuns = runs.filter((r) => r.status === 'running');

  const statCards = [
    { label: 'Active Controls', value: controls.length, icon: BookOpen, color: 'text-blue-600' },
    { label: 'Active Runs', value: activeRuns.length, icon: PlayCircle, color: 'text-cyan-600' },
    { label: 'Pending Gates', value: pendingGates.length, icon: ShieldCheck, color: 'text-amber-600' },
    { label: 'Open Findings', value: findings.length, icon: AlertCircle, color: 'text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Platform Operational Overview</h2>
        <p className="text-xs text-slate-500 mt-1">
          Autonomous control automation across deterministic workflows and LangGraph generic agents.
        </p>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">{c.label}</span>
                <Icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900">{c.value}</div>
            </div>
          );
        })}
      </div>

      {/* Active Runs Table */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Active & Recent Control Executions</h3>
            <p className="text-xs text-slate-500">Temporal orchestrator execution pipeline</p>
          </div>
          <Link to="/runs" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold">
            View all runs <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
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
              {runs.map((r) => (
                <tr key={r.run_id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 font-mono text-slate-700">{r.run_id}</td>
                  <td className="py-3 font-mono text-blue-600 font-semibold">{r.control_id}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Findings Preview */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Security & Integrity Findings</h3>
            <p className="text-xs text-slate-500">Findings derived from deterministic rule evaluation</p>
          </div>
          <Link to="/findings" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-semibold">
            View all findings <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2">
          {findings.map((f) => (
            <div key={f.finding_id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-3">
                <SeverityTag severity={f.severity} />
                <div>
                  <span className="text-xs font-semibold text-slate-900 block">{f.title}</span>
                  <span className="text-[11px] text-slate-500 font-mono">Control: {f.control_id} · Run: {f.run_id}</span>
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
    </div>
  );
};
