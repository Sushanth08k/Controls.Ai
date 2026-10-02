import React from 'react';
import { RiskRating } from '../types';

interface SeverityTagProps {
  severity: RiskRating | string;
}

export const SeverityTag: React.FC<SeverityTagProps> = ({ severity }) => {
  const norm = severity.toLowerCase();

  let styles = 'bg-slate-100 text-slate-700 border-slate-200';

  if (norm === 'critical') {
    styles = 'bg-red-50 text-red-800 border-red-200';
  } else if (norm === 'high') {
    styles = 'bg-orange-50 text-orange-800 border-orange-200';
  } else if (norm === 'medium') {
    styles = 'bg-amber-50 text-amber-800 border-amber-200';
  } else if (norm === 'low') {
    styles = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${styles}`}>
      {severity}
    </span>
  );
};
