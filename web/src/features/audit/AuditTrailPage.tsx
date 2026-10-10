import React, { useEffect, useState, useMemo } from 'react';
import { RunItemDTO, GateItemDTO, UserSessionDTO, ControlDefinitionDTO } from '../../types';
import { fetchUploadedPolicies, UploadedPolicyDTO } from '../../api/client';
import { Search, Mail, CheckCircle2, XCircle, FileUp, Play, Clock, ChevronDown, ChevronRight, Layers, LayoutList, AlertCircle } from 'lucide-react';
import { formatGateTitle } from '../../utils/vulnDisplayNames';

interface AuditEvent {
  id: string;
  time: string;
  user: string;
  action: string;
  actionType: 'approval' | 'run' | 'policy' | 'rejection';
  target: string;
  control_id?: string;
  run_id?: string;
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
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [collapsedRuns, setCollapsedRuns] = useState<Record<string, boolean>>({});

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

    // 2. Explicit authentic email address
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
        const storedMaker =
          localStorage.getItem(`controls_gate_maker_${g.gate_id}`) ||
          localStorage.getItem(`controls_gate_maker_${g.run_id}`) ||
          (g.run_id ? localStorage.getItem(`controls_gate_maker_gate-${g.run_id}-vuln`) : null) ||
          runEditorMap.get(g.run_id) ||
          localStorage.getItem(`controls_run_starter_${g.run_id}`) ||
          localStorage.getItem(`controls_run_editor_${g.run_id}`);

        const rawMakerCandidate =
          (g.maker_email && g.maker_email.includes('@') && !g.maker_email.includes('operator@bank.internal') ? g.maker_email : null) ||
          (storedMaker && storedMaker.includes('@') && !storedMaker.includes('operator@bank.internal') ? storedMaker : null) ||
          g.maker_email ||
          storedMaker ||
          g.maker_id;
        const makerEditor = resolveEditorEmail(rawMakerCandidate);
        const roleLabel =
          g.approver_role === 'ciso'
            ? 'CISO'
            : g.approver_role === 'compliance_officer'
            ? 'Compliance Officer'
            : 'Approver';

        events.push({
          id: `gate-created-${g.gate_id}`,
          time: g.created_at,
          user: makerEditor,
          action: 'Requested approval',
          actionType: 'approval',
          target: `${g.control_id} · ${g.run_id}`,
          control_id: g.control_id,
          run_id: g.run_id,
          details: `Submitted for compliance sign-off. Awaiting review by ${roleLabel} before policy changes can be executed.`,
        });
      }

      // Reviewer decision: who approved/rejected the gate?
      if (g.decided_at || g.status === 'approved' || g.status === 'rejected') {
        const isApproved = g.status === 'approved';
        const storedDecider =
          localStorage.getItem(`controls_gate_decided_${g.gate_id}`) ||
          localStorage.getItem(`controls_gate_decided_${g.run_id}`) ||
          (g.run_id ? localStorage.getItem(`controls_gate_decided_gate-${g.run_id}-vuln`) : null) ||
          (g.run_id && g.run_id.startsWith('run-') ? localStorage.getItem(`controls_gate_decided_APPR-GATE-${g.run_id.slice(4)}`) : null);

        const rawDeciderCandidate =
          (g.decided_by && g.decided_by.includes('@') && !g.decided_by.includes('reviewer@bank.internal') ? g.decided_by : null) ||
          (storedDecider && storedDecider.includes('@') && !storedDecider.includes('reviewer@bank.internal') ? storedDecider : null) ||
          g.decided_by ||
          storedDecider;
        const deciderEditor = resolveEditorEmail(rawDeciderCandidate);

        events.push({
          id: `gate-decided-${g.gate_id}`,
          time: g.decided_at || g.created_at,
          user: deciderEditor,
          action: isApproved ? 'Approved run' : 'Rejected approval',
          actionType: isApproved ? 'approval' : 'rejection',
          target: `${g.control_id} · ${g.run_id}`,
          control_id: g.control_id,
          run_id: g.run_id,
          details: isApproved
            ? (g.comment ? `Approved with note: "${g.comment}" · Gate cleared to proceed with automated execution.` : `Approved checkpoint "${formatGateTitle(g.gate_name, g.control_id)}". Authorized to proceed with automated execution.`)
            : (g.comment ? `Rejected with note: "${g.comment}" · Execution halted at gate.` : `Rejected at checkpoint "${formatGateTitle(g.gate_name, g.control_id)}". Control execution suspended for non-compliance.`),
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
          control_id: p.control_id,
          details: `Uploaded compliance policy document "${p.filename}" (${(p.format || 'pdf').toUpperCase()})${p.rules_summary ? ` · Extracted rules: ${p.rules_summary}` : ''}.`,
        });
      }
    });

    // 3. Control Test Runs: who executed the run?
    runs.forEach((r) => {
      const ctrlName = controlMap.get(r.control_id) || r.control_id;

      // Correlate with gate decisions to accurately identify maker and approver across different browsers
      const matchingGate = gates.find(
        (g) => g.run_id === r.run_id && (g.status === 'approved' || g.decided_at || g.created_at)
      );
      const gateMaker = matchingGate?.maker_email || matchingGate?.maker_id;
      const storedGateDecider =
        matchingGate
          ? (localStorage.getItem(`controls_gate_decided_${matchingGate.gate_id}`) ||
             localStorage.getItem(`controls_gate_decided_${matchingGate.run_id}`) ||
             (matchingGate.run_id ? localStorage.getItem(`controls_gate_decided_gate-${matchingGate.run_id}-vuln`) : null) ||
             (matchingGate.run_id && matchingGate.run_id.startsWith('run-') ? localStorage.getItem(`controls_gate_decided_APPR-GATE-${matchingGate.run_id.slice(4)}`) : null))
          : null;
      const gateApprover =
        (matchingGate?.decided_by && matchingGate.decided_by.includes('@') && !matchingGate.decided_by.includes('reviewer@bank.internal') ? gateApproverCandidate(matchingGate.decided_by, storedGateDecider) : null) ||
        (storedGateDecider && storedGateDecider.includes('@') && !storedGateDecider.includes('reviewer@bank.internal') ? storedGateDecider : null) ||
        matchingGate?.decided_by ||
        storedGateDecider;

      function gateApproverCandidate(dBy?: string, sDec?: string | null) {
        return dBy || sDec || null;
      }

      const rawStarterCandidate =
        localStorage.getItem(`controls_run_starter_${r.run_id}`) ||
        (r.operator_email && r.operator_email.includes('@') && !r.operator_email.includes('operator@bank.internal') ? r.operator_email : null) ||
        gateMaker ||
        localStorage.getItem(`controls_run_editor_${r.run_id}`) ||
        (r.policy_id ? localStorage.getItem(`controls_policy_editor_${r.policy_id}`) : null) ||
        r.operator_email;
      const starterUser = resolveEditorEmail(rawStarterCandidate);

      if (r.started_at) {
        events.push({
          id: `run-started-${r.run_id}`,
          time: r.started_at,
          user: starterUser,
          action: 'Started control run',
          actionType: 'run',
          target: `${r.control_id} · ${r.run_id}`,
          control_id: r.control_id,
          run_id: r.run_id,
          details: `Initiated control evaluation for ${ctrlName}. Scope: ${r.targets.length > 0 ? r.targets.join(', ') : 'Standard scope'}${r.policy_filename ? ` · Policy: ${r.policy_filename}` : ''}.`,
        });
      }

      if (r.completed_at) {
        const isPassed = (r.status === 'completed' || r.status === 'verified' || r.status === 'VERIFIED') && (!r.failed || r.failed === 0);
        const rawExecutorCandidate =
          (r.executor_email && r.executor_email.includes('@') && !r.executor_email.includes('operator@bank.internal') ? r.executor_email : null) ||
          localStorage.getItem(`controls_run_executor_${r.run_id}`) ||
          gateApprover ||
          r.executor_email ||
          (r.operator_email && r.operator_email.includes('@') && !r.operator_email.includes('operator@bank.internal') ? r.operator_email : null) ||
          localStorage.getItem(`controls_run_editor_${r.run_id}`) ||
          rawStarterCandidate;
        const executorUser = resolveEditorEmail(rawExecutorCandidate);

        events.push({
          id: `run-completed-${r.run_id}`,
          time: r.completed_at,
          user: executorUser,
          action: 'Control executed',
          actionType: 'run',
          target: `${r.control_id} · ${r.run_id}`,
          control_id: r.control_id,
          run_id: r.run_id,
          details: isPassed
            ? `Control executed successfully. All verification checks passed with zero policy breaches across evaluated records.`
            : `Control executed. Evaluated ${r.records_scanned ?? 0} records${r.failed ? ` · ${r.failed} non-compliant findings tracked for remediation` : ''}. Evidence recorded in audit register.`,
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
        ev.details.toLowerCase().includes(q) ||
        (ev.run_id && ev.run_id.toLowerCase().includes(q)) ||
        (ev.control_id && ev.control_id.toLowerCase().includes(q));

      const matchesType =
        selectedActionType === 'ALL' || ev.actionType === selectedActionType;

      return matchesSearch && matchesType;
    });
  }, [auditEvents, search, selectedActionType]);

  // Group filtered events by run_id
  const { runGroups, nonRunEvents } = useMemo(() => {
    const groupsMap = new Map<string, AuditEvent[]>();
    const nonRun: AuditEvent[] = [];

    filteredEvents.forEach((ev) => {
      if (ev.run_id) {
        if (!groupsMap.has(ev.run_id)) {
          groupsMap.set(ev.run_id, []);
        }
        groupsMap.get(ev.run_id)!.push(ev);
      } else {
        nonRun.push(ev);
      }
    });

    const actionPriority: Record<string, number> = {
      'Started control run': 1,
      'Requested approval': 2,
      'Approved run': 3,
      'Rejected approval': 3,
      'Control executed': 4,
    };

    const runList = Array.from(groupsMap.entries()).map(([runId, events]) => {
      const matchingRun = runs.find((r) => r.run_id === runId);
      const controlId =
        events.find((e) => e.control_id)?.control_id || matchingRun?.control_id;
      const controlTitle = controlId ? controlMap.get(controlId) : undefined;

      // Sort events within the run in descending time (newest first)
      const sortedEvents = [...events].sort((a, b) => {
        const timeDiff = new Date(b.time).getTime() - new Date(a.time).getTime();
        if (timeDiff !== 0) return timeDiff;
        const pA = actionPriority[a.action] || 99;
        const pB = actionPriority[b.action] || 99;
        return pB - pA;
      });

      const latestTime = sortedEvents.reduce((latest, ev) => {
        return new Date(ev.time).getTime() > new Date(latest).getTime() ? ev.time : latest;
      }, sortedEvents[0]?.time || new Date().toISOString());

      return {
        runId,
        controlId,
        controlTitle,
        run: matchingRun,
        latestTime,
        events: sortedEvents,
      };
    });

    // Sort run groups chronologically descending (most recent run first)
    runList.sort((a, b) => new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime());

    // Sort non-run events in descending time (newest first)
    nonRun.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return { runGroups: runList, nonRunEvents: nonRun };
  }, [filteredEvents, runs, controlMap]);

  const toggleCollapse = (runId: string) => {
    setCollapsedRuns((prev) => ({
      ...prev,
      [runId]: !prev[runId],
    }));
  };

  const handleExpandAll = () => {
    setCollapsedRuns({});
  };

  const handleCollapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    runGroups.forEach((g) => {
      allCollapsed[g.runId] = true;
    });
    setCollapsedRuns(allCollapsed);
  };

  const getActionBadge = (type: AuditEvent['actionType'], action: string) => {
    if (action === 'Control executed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{action}</span>
        </span>
      );
    }
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

  const getRunStatusBadge = (group: { run?: RunItemDTO; events: AuditEvent[] }) => {
    if (group.run?.status) {
      const s = group.run.status.toLowerCase();
      if (s === 'completed' || s === 'verified' || s === 'archived') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>Completed</span>
          </span>
        );
      }
      if (s === 'running') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Play className="w-3 h-3 text-blue-500" />
            <span>Running</span>
          </span>
        );
      }
      if (s === 'failed') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            <span>Failed</span>
          </span>
        );
      }
      if (s === 'blocked') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-500" />
            <span>Blocked</span>
          </span>
        );
      }
    }

    const hasExecuted = group.events.some((e) => e.action === 'Control executed');
    if (hasExecuted) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          <span>Completed</span>
        </span>
      );
    }

    const hasRejected = group.events.some((e) => e.action === 'Rejected approval');
    if (hasRejected) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="w-3 h-3" />
          <span>Rejected</span>
        </span>
      );
    }

    const hasApproved = group.events.some((e) => e.action === 'Approved run');
    if (hasApproved) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          <span>Approved</span>
        </span>
      );
    }

    const hasRequested = group.events.some((e) => e.action === 'Requested approval');
    if (hasRequested) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-500" />
          <span>Pending Review</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        <Play className="w-3 h-3 text-slate-500" />
        <span>Started</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Audit Trail</h2>
          <p className="text-xs text-slate-500 mt-1">
            Chronological record of user actions, policy uploads, and governance decisions grouped by execution run.
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('grouped')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'grouped'
                ? 'bg-white text-slate-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Grouped by Run</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('flat')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'flat'
                ? 'bg-white text-slate-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>Flat Timeline</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by user, action, control, run ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#143d2c] shadow-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <select
            value={selectedActionType}
            onChange={(e) => setSelectedActionType(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 focus:outline-none focus:border-[#143d2c] shadow-xs cursor-pointer"
          >
            <option value="ALL">All Actions</option>
            <option value="approval">Approvals & Requests</option>
            <option value="rejection">Rejections</option>
            <option value="policy">Policy Uploads</option>
            <option value="run">Control Runs</option>
          </select>

          {viewMode === 'grouped' && runGroups.length > 1 && (
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
              <button
                type="button"
                onClick={handleExpandAll}
                className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors font-medium cursor-pointer"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors font-medium cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          )}

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

      {/* Main Content Area */}
      {viewMode === 'grouped' ? (
        <div className="space-y-4">
          {runGroups.length === 0 && nonRunEvents.length === 0 ? (
            <div className="bg-white p-10 rounded-xl border border-slate-200/90 text-center shadow-xs">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No audit actions found</p>
              <p className="text-xs text-slate-400 mt-1">No audit actions recorded matching your criteria.</p>
            </div>
          ) : (
            <>
              {/* Grouped Run Cards */}
              {runGroups.map((group) => {
                const isCollapsed = collapsedRuns[group.runId];
                return (
                  <div
                    key={group.runId}
                    className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
                  >
                    {/* Run Header */}
                    <div
                      onClick={() => toggleCollapse(group.runId)}
                      className="bg-slate-50/80 hover:bg-slate-100/70 cursor-pointer px-4 py-3 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 transition-colors select-none"
                    >
                      <div className="flex items-center flex-wrap gap-2.5">
                        <button
                          type="button"
                          className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-transform"
                          aria-label={isCollapsed ? 'Expand run' : 'Collapse run'}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>

                        {/* 1. Name of control first */}
                        <span className="text-xs font-bold text-slate-900 tracking-tight">
                          {group.controlTitle || group.controlId || 'Control Evaluation'}
                        </span>

                        {/* 2. runId second */}
                        <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs inline-flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>{group.runId}</span>
                        </span>

                        {/* 3. control ID third */}
                        {group.controlId && (
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {group.controlId}
                          </span>
                        )}

                        {getRunStatusBadge(group)}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono text-[11px]">
                            {new Date(group.latestTime).toLocaleString()}
                          </span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-semibold text-[11px]">
                          {group.events.length} {group.events.length === 1 ? 'action' : 'actions'}
                        </span>
                      </div>
                    </div>

                    {/* Events Table within this Run */}
                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 bg-white text-slate-400 text-[11px] uppercase font-semibold">
                              <th className="py-2.5 px-4 w-44">Time</th>
                              <th className="py-2.5 px-3 w-56">User</th>
                              <th className="py-2.5 px-3 w-44">Action</th>
                              <th className="py-2.5 px-4">Result / Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.events.map((ev) => (
                              <tr key={ev.id} className="hover:bg-slate-50/60 transition-colors">
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
                                <td className="py-3 px-4 text-slate-700 text-xs leading-relaxed">
                                  {ev.details}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Standalone Policy Uploads / Non-Run Events */}
              {nonRunEvents.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                  <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileUp className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Policy Specifications & Governance Documents
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-semibold text-[11px]">
                      {nonRunEvents.length} {nonRunEvents.length === 1 ? 'action' : 'actions'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-white text-slate-400 text-[11px] uppercase font-semibold">
                          <th className="py-2.5 px-4 w-44">Time</th>
                          <th className="py-2.5 px-3 w-56">User</th>
                          <th className="py-2.5 px-3 w-44">Action</th>
                          <th className="py-2.5 px-3 w-36">Control</th>
                          <th className="py-2.5 px-4">Result / Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {nonRunEvents.map((ev) => (
                          <tr key={ev.id} className="hover:bg-slate-50/60 transition-colors">
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
                            <td className="py-3 px-3">
                              {ev.control_id ? (
                                <span className="font-mono text-xs font-bold text-blue-700">
                                  {ev.control_id}
                                </span>
                              ) : (
                                <span className="text-slate-500 text-xs">{ev.target}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-700 text-xs leading-relaxed">
                              {ev.details}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Flat Timeline Table View */
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
                      <td className="py-3 px-3">
                        {ev.control_id || ev.run_id ? (
                          <div className="flex flex-col gap-0.5 leading-snug">
                            {ev.control_id && (
                              <span className="font-mono text-xs font-bold text-blue-700 whitespace-nowrap">
                                {ev.control_id}
                              </span>
                            )}
                            {ev.run_id && (
                              <span className="font-mono text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                                {ev.run_id}
                              </span>
                            )}
                          </div>
                        ) : ev.target.includes(' · ') ? (
                          <div className="flex flex-col gap-0.5 leading-snug">
                            <span className="font-mono text-xs font-bold text-blue-700 whitespace-nowrap">
                              {ev.target.split(' · ')[0]}
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                              {ev.target.split(' · ')[1]}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-slate-700 font-medium whitespace-nowrap">
                            {ev.target}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 text-xs leading-relaxed">
                        {ev.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

