import React, { useEffect, useState, useMemo } from 'react';
import { RunItemDTO, GateItemDTO, UserSessionDTO, ControlDefinitionDTO } from '../../types';
import { fetchUploadedPolicies, UploadedPolicyDTO } from '../../api/client';
import { Search, Mail, CheckCircle2, XCircle, FileUp, Play, Clock } from 'lucide-react';

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

  // Resolve user identifier to the true editor's email
  const resolveEditorEmail = (userVal?: string | null, specificEditor?: string | null): string => {
    // 1. Direct explicit editor email passed from run / policy / gate
    if (specificEditor && specificEditor.includes('@')) {
      return specificEditor;
    }

    if (!userVal) {
      return currentUser?.email || 'operator@bank.internal';
    }

    // 2. Already an email address
    if (userVal.includes('@')) {
      return userVal;
    }

    // 3. Check localStorage cache for mapped UID or run/gate
    const stored = localStorage.getItem(`controls_user_email_${userVal}`);
    if (stored && stored.includes('@')) {
      return stored;
    }

    // 4. Matches current logged-in user session
    if (
      currentUser?.email &&
      ((currentUser.user_id && userVal.toLowerCase() === currentUser.user_id.toLowerCase()) ||
       (currentUser.username && userVal.toLowerCase() === currentUser.username.toLowerCase()) ||
       (currentUser.displayName && userVal.toLowerCase() === currentUser.displayName.toLowerCase()))
    ) {
      return currentUser.email;
    }

    // 5. Canonical persona mappings for test / demo seeds
    const personaMap: Record<string, string> = {
      sec_reviewer_1: 'reviewer@bank.internal',
      sec_owner_1: 'owner@bank.internal',
      release_owner_1: 'release@bank.internal',
      operator_1: 'operator@bank.internal',
      compliance_lead: 'compliance@bank.internal',
      ciso_direct: 'ciso@bank.internal',
      payments_lead: 'payments@bank.internal',
      sec_ops_team: 'secops@bank.internal',
      db_admin_core: 'dbadmin@bank.internal',
      identity_team: 'identity@bank.internal',
    };
    if (personaMap[userVal]) {
      return personaMap[userVal];
    }

    // 6. Generic or slug string without @: format as corporate internal email
    if (!userVal.includes(' ')) {
      return `${userVal}@bank.internal`;
    }

    return currentUser?.email || 'operator@bank.internal';
  };

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

    // Map run_id to operator_email for quick lookup
    const runEditorMap = new Map<string, string>();
    runs.forEach((r) => {
      const email = resolveEditorEmail(r.operator_email);
      if (email && email.includes('@')) {
        runEditorMap.set(r.run_id, email);
      }
    });

    // 1. Approval and Gate Decisions
    gates.forEach((g) => {
      // Maker request: who requested approval?
      if (g.created_at) {
        const rawMakerCandidate =
          (g.maker_email && g.maker_email.includes('@') ? g.maker_email : null) ||
          (g.maker_id && g.maker_id.includes('@') ? g.maker_id : null) ||
          localStorage.getItem(`controls_gate_maker_${g.gate_id}`) ||
          runEditorMap.get(g.run_id) ||
          localStorage.getItem(`controls_run_editor_${g.run_id}`) ||
          g.maker_email ||
          g.maker_id;
        const makerEditor = resolveEditorEmail(rawMakerCandidate);

        events.push({
          id: `gate-created-${g.gate_id}`,
          time: g.created_at,
          user: makerEditor,
          action: 'Requested approval',
          actionType: 'approval',
          target: `${g.control_id} · ${g.run_id}`,
          details: `Approval required from: ${g.approver_role}`,
        });
      }

      // Reviewer decision: who approved/rejected the gate?
      if (g.decided_at && g.decided_by) {
        const isApproved = g.status === 'approved';
        const rawDeciderCandidate =
          (g.decided_by && g.decided_by.includes('@') ? g.decided_by : null) ||
          localStorage.getItem(`controls_gate_decided_${g.gate_id}`) ||
          g.decided_by;
        const deciderEditor = resolveEditorEmail(rawDeciderCandidate);

        events.push({
          id: `gate-decided-${g.gate_id}`,
          time: g.decided_at,
          user: deciderEditor,
          action: isApproved ? 'Approved run' : 'Rejected approval',
          actionType: isApproved ? 'approval' : 'rejection',
          target: `${g.control_id} · ${g.run_id}`,
          details: g.comment ? `Comment: "${g.comment}"` : `Gate: ${g.gate_name} (${g.status})`,
        });
      }
    });

    // 2. Policy Uploads: who uploaded the policy?
    policies.forEach((p) => {
      if (p.uploaded_at) {
        const rawPolicyCandidate =
          (p.uploaded_by && p.uploaded_by.includes('@') ? p.uploaded_by : null) ||
          localStorage.getItem(`controls_policy_editor_${p.policy_id}`) ||
          p.uploaded_by;
        const policyEditor = resolveEditorEmail(rawPolicyCandidate);

        events.push({
          id: `policy-uploaded-${p.policy_id}`,
          time: p.uploaded_at,
          user: policyEditor,
          action: 'Uploaded policy',
          actionType: 'policy',
          target: p.control_id ? `${p.control_id}` : p.title,
          details: `${p.filename} (${p.format})`,
        });
      }
    });

    // 3. Control Test Runs: who executed the run?
    runs.forEach((r) => {
      if (r.started_at) {
        const ctrlName = controlMap.get(r.control_id) || r.control_id;
        const rawRunCandidate =
          (r.operator_email && r.operator_email.includes('@') ? r.operator_email : null) ||
          localStorage.getItem(`controls_run_editor_${r.run_id}`) ||
          (r.policy_id ? localStorage.getItem(`controls_policy_editor_${r.policy_id}`) : null) ||
          r.operator_email;
        const runEditor = resolveEditorEmail(rawRunCandidate);

        events.push({
          id: `run-started-${r.run_id}`,
          time: r.started_at,
          user: runEditor,
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
                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
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
