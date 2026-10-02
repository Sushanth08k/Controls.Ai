import React from 'react';

interface StatusPillProps {
  status: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const norm = status.toLowerCase();

  let styles = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  if (norm === 'running' || norm === 'act' || norm === 'copy') {
    styles = 'bg-blue-50 text-blue-700 border-blue-200';
    dotColor = 'bg-blue-500 animate-pulse';
  } else if (norm === 'completed' || norm === 'approved' || norm === 'verified' || norm === 'pass') {
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    dotColor = 'bg-emerald-500';
  } else if (norm === 'pending') {
    styles = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
  } else if (norm === 'failed' || norm === 'rejected' || norm === 'blocked' || norm === 'regression') {
    styles = 'bg-red-50 text-red-700 border-red-200';
    dotColor = 'bg-red-500';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="capitalize">{status}</span>
    </span>
  );
};
