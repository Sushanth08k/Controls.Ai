import React, { useState } from 'react';
import {
  Tag,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Play,
  AlertCircle,
  Code,
  AlertTriangle,
} from 'lucide-react';
import { VulnSqlViewer } from './VulnSqlViewer';
import { VulnTicketCandidate, VulnDefectiveTicket, VulnVerificationResult } from '../../../types';

interface VulnTicketingStepProps {
  candidates: VulnTicketCandidate[];
  defectiveTickets?: VulnDefectiveTicket[];
  ticketingData: any;
  verificationData: VulnVerificationResult | null;
  ticketingSql?: string;
  onRaiseTickets: () => Promise<void>;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
  stage: string;
  operatorEmail?: string;
}

export const VulnTicketingStep: React.FC<VulnTicketingStepProps> = ({
  candidates = [],
  defectiveTickets = [],
  ticketingData,
  verificationData,
  ticketingSql,
  onRaiseTickets,
  onBack,
  onProceed,
  loading,
  stage,
  operatorEmail,
}) => {
  const [showSql, setShowSql] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const candidateCount = candidates.length;
  const isTicketed = Boolean(ticketingData) || stage === 'TICKETED' || stage === 'VERIFIED' || stage === 'APPROVAL_PENDING' || stage === 'APPLIED' || stage === 'FINALIZED';
  const createdCount = ticketingData?.tickets_created_count ?? ticketingData?.created_count ?? ticketingData?.tickets?.length ?? 0;

  const creatorEmail = operatorEmail || 'reviewer@bank.internal';

  // Real SQL from backend or default named query
  const sql = ticketingSql || ticketingData?.sql || (
    candidateCount > 0
      ? `INSERT INTO vuln_tickets (ticket_id, finding_id, assignee, due_date, created_by, status, created_at)\nVALUES\n` +
      candidates.map((c, i) => `  ('TKT-AUTO-${String(i + 1).padStart(4, '0')}', '${c.finding_id}', '${c.computed_assignee}', '${c.computed_due_date}', '${creatorEmail}', 'OPEN', datetime('now'))`).join(',\n') + ';'
      : '-- No candidates requiring ticketing INSERT'
  );

  const handleRaise = async () => {
    setErrorMsg(null);
    try {
      await onRaiseTickets();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to provision tickets.');
    }
  };

  const isVerifiedSuccess = Boolean(verificationData?.passed || verificationData?.verified || (isTicketed && verificationData && verificationData.mismatch_count === 0));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold text-slate-900">Remediation Ticketing & Reconciliation</h3>
          </div>
          <p className="text-xs text-slate-500">
            Automated provisioning of tracking tickets in <code className="font-mono text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">vuln_tickets</code> for open Critical/High/KEV findings lacking coverage, followed by deterministic reconciliation verification.
          </p>
        </div>

        {/* Primary Action Button */}
        {!isTicketed ? (
          candidateCount > 0 ? (
            <button
              onClick={handleRaise}
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
                  Raise {candidateCount} {candidateCount === 1 ? 'Ticket' : 'Tickets'}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleRaise}
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
                  Continue, no tickets required
                </>
              )}
            </button>
          )
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-950/80 border border-emerald-600 rounded-lg text-emerald-300 text-xs font-mono font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{createdCount} Tickets Provisioned</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-xs text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Reconciliation Result Banner (Pass / Fail on Same Screen) */}
      {isTicketed && verificationData && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 shadow-2xs ${isVerifiedSuccess
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
        >
          <div className="flex items-center gap-3">
            {isVerifiedSuccess ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                {isVerifiedSuccess ? 'Reconciliation Verification Passed' : 'Reconciliation Verification Failed'}
              </div>
              <div className="text-xs mt-0.5">
                {verificationData.reconciliation?.mismatch_count === 0 || verificationData.mismatch_count === 0
                  ? candidateCount === 0 && createdCount === 0
                    ? 'Nothing to reconcile: zero ticket candidates identified.'
                    : `Successfully verified: ${verificationData.required_count ?? createdCount} required findings reconciled with ${verificationData.created_count ?? createdCount} provisioned tickets (0 mismatches).`
                  : `Mismatch detected: ${verificationData.mismatch_count ?? 0} tickets failed reconciliation.`}
              </div>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 text-xs font-bold rounded uppercase tracking-wider ${isVerifiedSuccess ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
              }`}
          >
            {isVerifiedSuccess ? 'PASS' : 'FAIL'}
          </span>
        </div>
      )}

      {/* Ticket Candidates Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Ticket Candidates ({candidates.length})
              </h4>
              <span className="text-[11px] text-slate-500">
                — Open Critical/High/KEV findings requiring INSERT
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowSql(!showSql)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Code className="w-3.5 h-3.5 text-slate-600" />
            <span>{showSql ? 'Hide SQL' : 'View Ticketing INSERT SQL'}</span>
          </button>
        </div>

        {/* Collapsible Real INSERT SQL */}
        {showSql && (
          <div className="mb-3">
            <VulnSqlViewer sql={sql} title="Ticketing INSERT Statement (Real SQL Write)" />
          </div>
        )}

        {/* Candidates Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-56">
          {candidates.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-700 font-semibold text-[10px] uppercase">
                <tr>
                  <th className="p-2.5">Finding ID</th>
                  <th className="p-2.5">Database</th>
                  <th className="p-2.5">CVE</th>
                  <th className="p-2.5">Severity</th>
                  <th className="p-2.5">KEV</th>
                  <th className="p-2.5">Discovered</th>
                  <th className="p-2.5">Computed Assignee</th>
                  <th className="p-2.5">Computed Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                {candidates.map((c, idx) => (
                  <tr key={c.finding_id || idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-2.5 font-bold text-slate-900">{c.finding_id}</td>
                    <td className="p-2.5">{c.database_name}</td>
                    <td className="p-2.5 text-blue-600">{c.cve_id || '-'}</td>
                    <td className="p-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800'
                          : c.severity === 'HIGH'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                          }`}
                      >
                        {c.severity}
                      </span>
                    </td>
                    <td className="p-2.5">{c.is_kev ? <span className="text-rose-600 font-bold">YES</span> : 'NO'}</td>
                    <td className="p-2.5 text-slate-500">{c.discovered_at}</td>
                    <td className="p-2.5 font-bold text-slate-800">{c.computed_assignee}</td>
                    <td className="p-2.5 text-emerald-700 font-semibold">{c.computed_due_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400 italic">
              No open Critical/High findings currently require new tickets.
            </div>
          )}
        </div>
      </div>

      {/* Defective Existing Tickets Table (Read-Only) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Defective Existing Tickets ({defectiveTickets.length})
            </h4>
            <span className="text-[11px] text-slate-500">— Read-only; reported in control assessment</span>
          </div>
          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
            Not Modified
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-48">
          {defectiveTickets.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-700 font-semibold text-[10px] uppercase">
                <tr>
                  <th className="p-2.5">Ticket ID</th>
                  <th className="p-2.5">Finding ID</th>
                  <th className="p-2.5">Database</th>
                  <th className="p-2.5">Severity</th>
                  <th className="p-2.5">Assignee</th>
                  <th className="p-2.5">Due Date</th>
                  <th className="p-2.5">Defect Issue</th>
                  <th className="p-2.5">Audit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                {defectiveTickets.map((t, idx) => (
                  <tr key={t.ticket_id || idx} className="hover:bg-amber-50/40 transition-colors">
                    <td className="p-2.5 font-bold text-slate-900">{t.ticket_id}</td>
                    <td className="p-2.5">{t.finding_id}</td>
                    <td className="p-2.5">{t.database_name}</td>
                    <td className="p-2.5">{t.severity}</td>
                    <td className="p-2.5 text-amber-700">{t.assignee || <span className="italic text-rose-500">MISSING</span>}</td>
                    <td className="p-2.5 text-amber-700">{t.due_date || <span className="italic text-rose-500">MISSING</span>}</td>
                    <td className="p-2.5 font-semibold text-rose-700">{t.ticket_issue}</td>
                    <td className="p-2.5 text-slate-500 italic text-[10px]">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-5 text-center text-xs text-slate-400 italic">
              No defective existing tickets identified.
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Review
        </button>

        <div className="flex items-center gap-3">
          {!isVerifiedSuccess && (
            <span className="text-[11px] text-amber-700 font-medium">
              Tickets must be provisioned and reconciliation verified before proceeding
            </span>
          )}
          <button
            onClick={onProceed}
            disabled={!isVerifiedSuccess || loading}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <span>Proceed to Approval</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
