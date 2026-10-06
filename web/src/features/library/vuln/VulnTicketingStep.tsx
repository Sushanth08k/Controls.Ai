import React from 'react';
import { Tag, CheckCircle2, ArrowRight, ArrowLeft, Loader2, Play } from 'lucide-react';
import { VulnSqlViewer } from './VulnSqlViewer';
import { getPriorityLabel } from './vulnUtils';

interface VulnTicketingStepProps {
  untrackedFindings: any[];
  ticketingData: any;
  onRaiseTickets: () => void;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
  stage: string;
}

export const VulnTicketingStep: React.FC<VulnTicketingStepProps> = ({
  untrackedFindings,
  ticketingData,
  onRaiseTickets,
  onBack,
  onProceed,
  loading,
  stage,
}) => {
  const isTicketed = stage === 'TICKETED' || ticketingData?.tickets_created !== undefined;
  const ticketsCreated = ticketingData?.tickets_created ?? 0;
  const tickets = ticketingData?.tickets || [];
  const sql = ticketingData?.sql || '-- INSERT INTO vuln_tickets guarded by NOT EXISTS';

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-blue-800 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-700">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold">Step 5: Automated Ticket Provisioning & SLA Tracking</h3>
          </div>
          <p className="text-xs text-slate-300">
            Provision remediation tracking tickets in <code className="font-mono text-emerald-300">vuln_tickets</code> for open findings lacking tracking. Assignee is mapped from the asset owner; due date is calculated from policy SLA.
          </p>
        </div>

        {!isTicketed ? (
          <button
            onClick={onRaiseTickets}
            disabled={loading || untrackedFindings.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Provisioning Tickets...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                Raise {untrackedFindings.length} Tickets
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-950/80 border border-emerald-600 rounded-lg text-emerald-300 text-xs font-mono font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{ticketsCreated} Tickets Successfully Provisioned</span>
          </div>
        )}
      </div>

      {/* SQL Viewer */}
      <VulnSqlViewer
        tabs={[
          {
            id: 'TICKET_INSERT',
            label: 'INSERT INTO vuln_tickets',
            sql: sql,
            description: 'Idempotent insert statement guarded by NOT EXISTS to prevent duplicate tickets.',
          },
        ]}
        title="Ticketing SQL Statement"
      />

      {/* Ticket List Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            {isTicketed ? `Provisioned Tickets (${tickets.length})` : `Findings Requiring Tickets (${untrackedFindings.length})`}
          </h4>
          <span className="text-[11px] font-mono text-slate-500">
            {isTicketed ? 'Status: Tracked in vuln_tickets' : 'Status: Untracked in source'}
          </span>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-semibold font-mono text-[11px]">
              <tr>
                <th className="py-2 px-3">TICKET / FINDING ID</th>
                <th className="py-2 px-3">DATABASE</th>
                <th className="py-2 px-3">SEVERITY / PRIORITY</th>
                <th className="py-2 px-3">ASSIGNEE</th>
                <th className="py-2 px-3">DUE DATE</th>
                <th className="py-2 px-3 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {isTicketed && tickets.length > 0 ? (
                tickets.map((t: any) => {
                  const prio = getPriorityLabel(t.severity, 1, false);
                  return (
                    <tr key={t.ticket_id} className="hover:bg-slate-50/80">
                      <td className="py-2 px-3 font-bold text-blue-700">
                        {t.ticket_id}
                        <span className="block text-[10px] text-slate-400 font-normal">{t.finding_id}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">{t.database_name || 'DB-CORE'}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${prio.bg} ${prio.color}`}>
                          {prio.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-800 font-sans">{t.assignee}</td>
                      <td className="py-2 px-3 text-slate-600">{t.due_date}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : untrackedFindings.length > 0 ? (
                untrackedFindings.map((f: any) => {
                  const prio = getPriorityLabel(f.severity, f.tier || 1, f.cve_id?.includes('2024'));
                  return (
                    <tr key={f.vulnerability_id} className="hover:bg-slate-50/80">
                      <td className="py-2 px-3 font-bold text-slate-800">
                        {f.vulnerability_id}
                        <span className="block text-[10px] text-slate-400 font-normal">{f.cve_id}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">{f.database_name}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${prio.bg} ${prio.color}`}>
                          {prio.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500 italic font-sans">{f.owner || 'Auto-assign to Owner'}</td>
                      <td className="py-2 px-3 text-slate-500 italic">SLA Calculated on Ticket</td>
                      <td className="py-2 px-3 text-right">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 border border-rose-200">
                          UNTRACKED
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                    No untracked findings found. All findings are already tracked.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Review Execution
        </button>
        <button
          onClick={onProceed}
          disabled={loading || !isTicketed}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
        >
          Proceed to Verification
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
