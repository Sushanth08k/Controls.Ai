import React from 'react';

interface StatusPillProps {
  status: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const norm = status.toLowerCase();

  let styles = 'bg-slate-800/80 text-slate-300 border-slate-700/60';
  let dotColor = 'bg-slate-400';

  if (norm === 'running' || norm === 'act' || norm === 'copy') {
    styles = 'bg-blue-950/60 text-blue-300 border-blue-800/60';
    dotColor = 'bg-blue-400 animate-pulse';
  } else if (norm === 'completed' || norm === 'approved' || norm === 'verified' || norm === 'pass') {
    styles = 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
    dotColor = 'bg-emerald-400';
  } else if (norm === 'pending') {
    styles = 'bg-amber-950/60 text-amber-300 border-amber-800/60';
    dotColor = 'bg-amber-400 animate-ping';
  } else if (norm === 'failed' || norm === 'rejected' || norm === 'blocked' || norm === 'regression') {
    styles = 'bg-rose-950/60 text-rose-300 border-rose-800/60';
    dotColor = 'bg-rose-400';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="capitalize">{status}</span>
    </span>
  );
};
