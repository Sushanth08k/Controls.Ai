import React, { useState } from 'react';
import { GateItemDTO, UserSessionDTO, ControlDefinitionDTO } from '../../types';
import { GateCard } from '../../components/GateCard';
import { ControlExecutionModal } from '../library/ControlExecutionModal';
import { ShieldCheck, Info } from 'lucide-react';

interface ApprovalsPageProps {
  gates: GateItemDTO[];
  currentUser: UserSessionDTO;
  onDecideGate: (gateId: string, decision: 'approved' | 'rejected', comment: string) => Promise<void>;
  controls?: ControlDefinitionDTO[];
  onRefresh?: () => void;
}

export const ApprovalsPage: React.FC<ApprovalsPageProps> = ({
  gates,
  currentUser,
  onDecideGate,
  controls,
  onRefresh,
}) => {
  const [resumingGate, setResumingGate] = useState<GateItemDTO | null>(null);

  const pending = gates.filter((g) => g.status === 'pending');
  const history = gates.filter((g) => g.status !== 'pending');

  const selectedControl = resumingGate
    ? controls?.find((c) => c.control_id === resumingGate.control_id) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Pending Approvals</h2>
        <p className="text-xs text-slate-500 mt-1">
          Review queue for control runs requiring authorized human approval.
        </p>
      </div>

      {/* Governance Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 shadow-xs">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block mb-0.5 text-blue-950">Two-Person Approval Required</span>
          <span className="text-blue-800">
            Two-person approval required. The person who starts a high-risk operation cannot approve their own request.
          </span>
        </div>
      </div>

      {/* Pending Gates */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <span>Pending Approvals Queue</span>
          <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            {pending.length}
          </span>
        </h3>

        {pending.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center shadow-xs">
            <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold text-slate-800">No Pending Approvals</p>
            <p className="text-xs text-slate-500 mt-1">All control execution gates are currently cleared.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pending.map((gate) => (
              <GateCard
                key={gate.gate_id}
                gate={gate}
                currentUser={currentUser}
                onDecide={onDecideGate}
                onResumeRun={(g) => setResumingGate(g)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Decided History */}
      {history.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-slate-600">Decided Gate History</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {history.map((gate) => (
              <GateCard
                key={gate.gate_id}
                gate={gate}
                currentUser={currentUser}
                onDecide={onDecideGate}
                onResumeRun={(g) => setResumingGate(g)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Resume Execution Modal */}
      {resumingGate && selectedControl && (
        <ControlExecutionModal
          control={selectedControl}
          currentUser={currentUser}
          initialRunId={resumingGate.run_id}
          initialStage="APPROVED"
          onClose={() => {
            setResumingGate(null);
            onRefresh?.();
          }}
          onRunCompleted={() => {
            setResumingGate(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};

