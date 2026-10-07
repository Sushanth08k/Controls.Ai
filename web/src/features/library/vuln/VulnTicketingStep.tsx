import React from 'react';
import { Tag, CheckCircle2, ArrowRight, ArrowLeft, Loader2, Play, AlertCircle, Info } from 'lucide-react';
import { VulnSqlViewer } from './VulnSqlViewer';
import { VulnTicketCandidate, VulnDefectiveTicket } from '../../../types';

interface VulnTicketingStepProps {
  candidates: VulnTicketCandidate[];
  defectiveTickets?: VulnDefectiveTicket[];
  ticketingData: any;
  ticketingSql?: string;
  onRaiseTickets: () => void;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
  stage: string;
}

export const VulnTicketingStep: React.FC<VulnTicketingStepProps> = ({
  candidates = [],
  defectiveTickets = [],
  ticketingData,
  ticketingSql,
  onRaiseTickets,
  onBack,
  onProceed,
  loading,
  stage,
}) => {
  const isTicketed = stage === 'TICKETED' || ticketingData !== null;
  const createdTickets = ticketingData?.tickets || [];
  const createdCount = ticketingData?.tickets_created ?? ticketingData?.tickets_created_count ?? createdTickets.length;

  const candidateCount = candidates.length;
  const sql = ticketingSql || ticketingData?.sql || '';

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
            Provision remediation tracking tickets in <code className="font-mono text-emerald-300">vuln_tickets</code> for open Critical/High/KEV findings lacking tracking. Assignee is mapped from the asset owner; due date is calculated from policy SLA.
          </p>
        </div>

        {/* Primary Action Button */}
        {!isTicketed ? (
          candidateCount > 0 ? (
            <button
              onClick={onRaiseTickets}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all shrink-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Provisioning Tickets...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Raise {candidateCount} Tickets
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onRaiseTickets}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all shrink-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Advancing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Continue (no tickets required)
                </>
              )}
            </button>
          )
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-950/80 border border-emerald-600 rounded-lg text-emerald-300 text-xs font-mono font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{createdCount} Tickets Provisioned (Stage: TICKETED)</span>
          </div>
        )}
      </div>

      {/* Zero Candidates Notice */}
      {candidateCount === 0 && !isTicketed && (
        <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900 space-y-1">
            <p className="font-bold">No untracked Critical/High/KEV findings. No tickets are required.</p>
            <p className="text-blue-700">
              All identified findings already have tracking tickets in place or are covered by active exceptions. You can click &quot;Continue (no tickets required)&quot; to advance to Verification.
            </p>
          </div>
        </div>
      )}

      {/* SQL Viewer rendering REAL SQL */}
      <VulnSqlViewer
        tabs={[
          {
            id: 'TICKET_INSERT',
            label: 'INSERT INTO vuln_tickets',
            sql: sql || 'INSERT INTO vuln_tickets (ticket_id, finding_id, assignee, created_at, created_by, due_date, status, run_id)\nSELECT :ticket_id, :finding_id, :assignee, :created_at, :created_by, :due_date, \'OPEN\', :run_id\nWHERE NOT EXISTS (SELECT 1 FROM vuln_tickets WHERE finding_id = :finding_id);',
            description: 'Idempotent insert statement guarded by NOT EXISTS to prevent duplicate tickets.',
          },
        ]}
        title="Ticketing SQL Statement"
      />

      {/* Candidate Findings Table / Created Tickets Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            {isTicketed
              ? `Created Tickets for this Run (${createdTickets.length})`
              : `Candidate Findings Requiring Tickets (${candidateCount})`}
          </h4>
          <span className="text-[11px] font-mono text-slate-500">
            {isTicketed ? 'Status: Tracked in vuln_tickets' : 'Status: Untracked in database'}
          </span>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-semibold font-mono text-[11px]">
              <tr>
                <th className="py-2 px-3">{isTicketed ? 'TICKET ID' : 'FINDING ID'}</th>
                <th className="py-2 px-3">DATABASE</th>
                <th className="py-2 px-3">SEVERITY</th>
                <th className="py-2 px-3">KEV</th>
                <th className="py-2 px-3">ASSIGNEE</th>
                <th className="py-2 px-3">DUE DATE</th>
                <th className="py-2 px-3 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {isTicketed && createdTickets.length > 0 ? (
                createdTickets.map((t: any) => (
                  <tr key={t.ticket_id} className="hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-bold text-blue-700">
                      {t.ticket_id}
                      <span className="block text-[10px] text-slate-400 font-normal">{t.finding_id}</span>
                    </td>
                    <td className="py-2 px-3 text-slate-700">{t.database_name || 'DB-CORE'}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.severity === 'CRITICAL' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {t.severity}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{t.is_kev ? 'YES' : 'NO'}</td>
                    <td className="py-2 px-3 text-slate-800 font-sans">{t.assignee}</td>
                    <td className="py-2 px-3 text-slate-600">{t.due_date}</td>
                    <td className="py-2 px-3 text-right">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {t.status || 'OPEN'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : candidateCount > 0 ? (
                candidates.map((c) => (
                  <tr key={c.finding_id} className="hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-bold text-slate-800">
                      {c.finding_id}
                      {c.cve_id && <span className="block text-[10px] text-slate-400 font-normal">{c.cve_id}</span>}
                    </td>
                    <td className="py-2 px-3 text-slate-700">{c.database_name}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          c.severity === 'CRITICAL' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {c.severity}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{c.is_kev ? 'YES' : 'NO'}</td>
                    <td className="py-2 px-3 text-slate-800 font-sans">{c.computed_assignee}</td>
                    <td className="py-2 px-3 text-slate-600">{c.computed_due_date}</td>
                    <td className="py-2 px-3 text-right">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 border border-rose-200">
                        UNTRACKED
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                    No untracked findings found. All findings are already tracked.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Defective Existing Tickets Table (Read-Only) */}
      {defectiveTickets.length > 0 && (
        <div className="bg-amber-50/50 rounded-xl border border-amber-200 overflow-hidden shadow-2xs space-y-2 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                Defective Existing Tickets ({defectiveTickets.length})
              </h5>
              <p className="text-[11px] text-amber-800">
                These tickets already exist in <code className="font-mono">vuln_tickets</code> but have missing metadata (assignee or due date). They are reported in the Control Assessment and are not re-created here.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-48 bg-white rounded-lg border border-amber-200/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-100/50 border-b border-amber-200 text-amber-900 font-semibold font-mono text-[11px]">
                <tr>
                  <th className="py-2 px-3">TICKET ID</th>
                  <th className="py-2 px-3">FINDING ID</th>
                  <th className="py-2 px-3">DATABASE</th>
                  <th className="py-2 px-3">DEFECT ISSUE</th>
                  <th className="py-2 px-3">ASSIGNEE</th>
                  <th className="py-2 px-3">DUE DATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 font-mono text-[11px]">
                {defectiveTickets.map((dt) => (
                  <tr key={dt.ticket_id} className="hover:bg-amber-50/40">
                    <td className="py-2 px-3 font-bold text-amber-950">{dt.ticket_id}</td>
                    <td className="py-2 px-3 text-slate-700">{dt.finding_id}</td>
                    <td className="py-2 px-3 text-slate-700">{dt.database_name}</td>
                    <td className="py-2 px-3 text-rose-700 font-bold">{dt.ticket_issue}</td>
                    <td className="py-2 px-3 text-slate-500 italic">{dt.assignee || 'NULL'}</td>
                    <td className="py-2 px-3 text-slate-500 italic">{dt.due_date || 'NULL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Review Execution
        </button>

        <div className="flex items-center gap-2">
          {!isTicketed && (
            <span className="text-[11px] text-slate-400 italic">
              {candidateCount > 0
                ? 'Raise tickets before proceeding to verification'
                : 'Click "Continue (no tickets required)" above'}
            </span>
          )}
          <button
            onClick={onProceed}
            disabled={loading || !isTicketed}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
          >
            Proceed to Verification
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
