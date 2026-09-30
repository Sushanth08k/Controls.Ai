import React from 'react';
import { Database } from 'lucide-react';

interface EvidenceChipProps {
  evidenceId: string;
  onClick?: (id: string) => void;
}

export const EvidenceChip: React.FC<EvidenceChipProps> = ({ evidenceId, onClick }) => {
  return (
    <button
      onClick={() => onClick && onClick(evidenceId)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 hover:bg-cyan-900/50 hover:border-cyan-600 transition-all cursor-pointer"
      title={`Evidence ID: ${evidenceId} (Click to inspect ledger payload)`}
    >
      <Database className="w-3 h-3 text-cyan-400" />
      <span>{evidenceId}</span>
    </button>
  );
};
