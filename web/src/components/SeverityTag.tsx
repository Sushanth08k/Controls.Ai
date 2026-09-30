import React from 'react';
import { RiskRating } from '../types';

interface SeverityTagProps {
  severity: RiskRating | string;
}

export const SeverityTag: React.FC<SeverityTagProps> = ({ severity }) => {
  const norm = severity.toLowerCase();

  let styles = 'bg-slate-800 text-slate-300 border-slate-700';

  if (norm === 'critical') {
    styles = 'bg-purple-950/70 text-purple-300 border-purple-800/80';
  } else if (norm === 'high') {
    styles = 'bg-rose-950/70 text-rose-300 border-rose-800/80';
  } else if (norm === 'medium') {
    styles = 'bg-amber-950/70 text-amber-300 border-amber-800/80';
  } else if (norm === 'low') {
    styles = 'bg-blue-950/70 text-blue-300 border-blue-800/80';
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${styles}`}>
      {severity}
    </span>
  );
};
