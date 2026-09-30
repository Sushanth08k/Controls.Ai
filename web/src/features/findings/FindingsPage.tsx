import React from 'react';
import { FindingDTO } from '../../types';
import { SeverityTag } from '../../components/SeverityTag';
import { EvidenceChip } from '../../components/EvidenceChip';
import { StatusPill } from '../../components/StatusPill';

interface FindingsPageProps {
  findings: FindingDTO[];
}

export const FindingsPage: React.FC<FindingsPageProps> = ({ findings }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Security & Compliance Findings</h2>
        <p className="text-xs text-slate-500 mt-1">
          Identified rule failures and exceptions linked directly to cryptographically hashed evidence records.
        </p>
      </div>

      <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs">
        <div className="space-y-3">
          {findings.map((f) => (
            <div key={f.finding_id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all shadow-2xs">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-3">
                  <SeverityTag severity={f.severity} />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">{f.title}</h4>
                    <span className="text-[11px] font-mono text-slate-500">ID: {f.finding_id}</span>
                  </div>
                </div>
                <StatusPill status={f.status} />
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  Control: <span className="font-mono text-blue-600 font-semibold">{f.control_id}</span> · Run: <span className="font-mono text-slate-700 font-medium">{f.run_id}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 mr-1">Supporting Evidence:</span>
                  {f.evidence_ids.map((id) => (
                    <EvidenceChip key={id} evidenceId={id} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
