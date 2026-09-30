import React from 'react';
import { RunItemDTO } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { ArchetypeBadge } from '../../components/ArchetypeBadge';

interface RunsPageProps {
  runs: RunItemDTO[];
}

export const RunsPage: React.FC<RunsPageProps> = ({ runs }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Runs & Durable Workflows</h2>
        <p className="text-xs text-slate-500 mt-1">
          Temporal workflow orchestrations, scope fan-out targets, and activity replay histories.
        </p>
      </div>

      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                <th className="pb-3">Workflow Run ID</th>
                <th className="pb-3">Control ID</th>
                <th className="pb-3">Version</th>
                <th className="pb-3">Archetype</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Scope Targets</th>
                <th className="pb-3">Started At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((r) => (
                <tr key={r.run_id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 font-mono text-slate-700 font-medium">{r.run_id}</td>
                  <td className="py-3 font-mono text-blue-600 font-semibold">{r.control_id}</td>
                  <td className="py-3 font-mono text-slate-500">{r.version}</td>
                  <td className="py-3">
                    <ArchetypeBadge archetype={r.archetype} />
                  </td>
                  <td className="py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="py-3 text-slate-600 font-medium">{r.targets.join(', ') || 'Default'}</td>
                  <td className="py-3 text-slate-500 font-mono text-[11px]">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
