import React from 'react';
import { Archetype } from '../types';

interface ArchetypeBadgeProps {
  archetype: Archetype;
  showTitle?: boolean;
}

const ARCHETYPE_CONFIG: Record<Archetype, { title: string; color: string }> = {
  A: { title: 'Query & Rules', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  B: { title: 'Test Exec', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  C: { title: 'Reconcile', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  D: { title: 'Execute & Verify', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  E: { title: 'Doc Review', color: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export const ArchetypeBadge: React.FC<ArchetypeBadgeProps> = ({ archetype, showTitle = true }) => {
  const conf = ARCHETYPE_CONFIG[archetype] || { title: archetype, color: 'bg-slate-100 text-slate-700 border-slate-200' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border ${conf.color}`}>
      <span className="font-mono">{archetype}</span>
      {showTitle && <span className="opacity-90">· {conf.title}</span>}
    </span>
  );
};
