import React from 'react';
import { Archetype } from '../types';

interface ArchetypeBadgeProps {
  archetype: Archetype;
  showTitle?: boolean;
}

const ARCHETYPE_CONFIG: Record<Archetype, { title: string; color: string }> = {
  A: { title: 'Query & Rules', color: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/50' },
  B: { title: 'Test Exec', color: 'bg-cyan-900/50 text-cyan-300 border-cyan-700/50' },
  C: { title: 'Reconcile', color: 'bg-violet-900/50 text-violet-300 border-violet-700/50' },
  D: { title: 'Execute & Verify', color: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' },
  E: { title: 'Doc Review', color: 'bg-amber-900/50 text-amber-300 border-amber-700/50' },
};

export const ArchetypeBadge: React.FC<ArchetypeBadgeProps> = ({ archetype, showTitle = true }) => {
  const conf = ARCHETYPE_CONFIG[archetype] || { title: archetype, color: 'bg-slate-800 text-slate-300 border-slate-700' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border ${conf.color}`}>
      <span className="font-mono">{archetype}</span>
      {showTitle && <span className="opacity-80">· {conf.title}</span>}
    </span>
  );
};
