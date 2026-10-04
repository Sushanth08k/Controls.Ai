import React, { useEffect, useState, useMemo } from 'react';
import { RunItemDTO, GateItemDTO, UserSessionDTO, ControlDefinitionDTO } from '../../types';
import { fetchUploadedPolicies, UploadedPolicyDTO } from '../../api/client';
import { Search, User, CheckCircle2, XCircle, FileUp, Play, Clock } from 'lucide-react';

interface AuditEvent {
  id: string;
  time: string;
  user: string;
  action: string;
  actionType: 'approval' | 'run' | 'policy' | 'rejection';
  target: string;
  details: string;
}

interface AuditTrailPageProps {
  runs: RunItemDTO[];
  gates: GateItemDTO[];
  currentUser: UserSessionDTO;
  controls?: ControlDefinitionDTO[];
}

export const AuditTrailPage: React.FC<AuditTrailPageProps> = ({
  runs,
  gates,
  currentUser,
  controls,
}) => {
  const [policies, setPolicies] = useState<UploadedPolicyDTO[]>([]);
  const [search, setSearch] = useState('');
  const [selectedActionType, setSelectedActionType] = useState<string>('ALL');

  useEffect(() => {
    fetchUploadedPolicies()
      .then((data) => setPolicies(data))
      .catch((err) => console.error('Failed to load policies for audit trail:', err));
  }, []);

  // Map control_id to title
  const controlMap = useMemo(() => {
    const map = new Map<string, string>();
    (controls || []).forEach((c) => {
      map.set(c.control_id, c.title);
    });
    return map;
  }, [controls]);

  // Aggregate user actions from existing platform state
  const auditEvents = useMemo(() => {
    const events: AuditEvent[] = [];

    // 1. Approval and Gate Decisions
    gates.forEach((g) => {
      // Maker request
      if (g.created_at) {
        events.push({
          id: `gate-created-${g.gate_id}`,
          time: g.created_at,
          user: g.maker_id || currentUser.user_id,
          action: 'Requested approval',
          actionType: 'approval',
          target: `${g.control_id} · ${g.run_id}`,
          details: `Approval required from: ${g.approver_role}`,
        });
      }

      // Reviewer decision
      if (g.decided_at && g.decided_by) {
        const isApproved = g.status === 'approved';
        events.push({
          id: `gate-decided-${g.gate_id}`,
          time: g.decided_at,
          user: g.decided_by,
          action: isApproved ? 'Approved run' : 'Rejected approval',
          actionType: isApproved ? 'approval' : 'rejection',
          target: `${g.control_id} · ${g.run_id}`,
          details: g.comment ? `Comment: "${g.comment}"` : `Gate: ${g.gate_name} (${g.status})`,
        });
      }
    });

    // 2. Policy Uploads
    policies.forEach((p) => {
      if (p.uploaded_at) {
        events.push({
          id: `policy-uploaded-${p.policy_id}`,
          time: p.uploaded_at,
          user: p.uploaded_by || 'Sushanth',
          action: 'Uploaded policy',
          actionType: 'policy',
          target: p.control_id ? `${p.control_id}` : p.title,
          details: `${p.filename} (${p.format})`,
        });
      }
    });

    // 3. Control Test Runs
    runs.forEach((r) => {
      if (r.started_at) {
        const ctrlName = controlMap.get(r.control_id) || r.control_id;
        events.push({
          id: `run-started-${r.run_id}`,
          time: r.started_at,
          user: 'Operator',
          action: 'Started control test',
          actionType: 'run',
          target: `${r.control_id} · ${r.run_id}`,
          details: `${ctrlName} (Scope: ${r.targets.join(', ') || 'Default'}${r.policy_filename ? ` · ${r.policy_filename}` : ''})`,
        });
      }
    });

    // Sort chronologically descending (newest first)
    events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return events;
  }, [gates, policies, runs, currentUser, controlMap]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return auditEvents.filter((ev) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        ev.user.toLowerCase().includes(q) ||
        ev.action.toLowerCase().includes(q) ||
        ev.target.toLowerCase().includes(q) ||
        ev.details.toLowerCase().includes(q);

      const matchesType =
        selectedActionType === 'ALL' || ev.actionType === selectedActionType;

      return matchesSearch && matchesType;
    });
  }, [auditEvents, search, selectedActionType]);

  const getActionBadge = (type: AuditEvent['actionType'], action: string) => {
    switch (type) {
      case 'approval':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{action}</span>
          </span>
        );
      case 'rejection':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            <span>{action}</span>
          </span>
        );
      case 'policy':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <FileUp className="w-3.5 h-3.5" />
            <span>{action}</span>
          </span>
        );
      case 'run':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Play className="w-3.5 h-3.5 text-slate-500" />
            <span>{action}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Audit Trail</h2>
        <p className="text-xs text-slate-500 mt-1">
          Chronological record of user actions, policy uploads, and governance decisions.
        </p>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by user, action, control, run..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#143d2c] shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedActionType}
            onChange={(e) => setSelectedActionType(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 focus:outline-none focus:border-[#143d2c] shadow-xs cursor-pointer"
          >
            <option value="ALL">All Actions</option>
            <option value="approval">Approvals & Requests</option>
            <option value="rejection">Rejections</option>
            <option value="policy">Policy Uploads</option>
            <option value="run">Control Tests Started</option>
          </select>

          {(search || selectedActionType !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedActionType('ALL');
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline px-1 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Action Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-3">User</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Control / Run</th>
                <th className="py-3 px-4">Result / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    <Clock className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    <span>No audit actions recorded matching your criteria.</span>
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                      {new Date(ev.time).toLocaleString()}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-slate-800 font-semibold flex items-center gap-1.5">
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{ev.user}</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getActionBadge(ev.actionType, ev.action)}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700 font-medium">
                      {ev.target}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {ev.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
