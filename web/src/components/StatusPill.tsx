import React from 'react';

interface StatusPillProps {
  status: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const norm = status.toLowerCase().replace(/_/g, ' ').trim();

  let label = status;
  let styles = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  if (norm === 'running' || norm === 'act' || norm === 'copy' || norm === 'in progress') {
    label = 'Running';
    styles = 'bg-blue-50 text-blue-700 border-blue-200';
    dotColor = 'bg-blue-500 animate-pulse';
  } else if (norm === 'pass' || norm === 'passed') {
    label = 'Passed';
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    dotColor = 'bg-emerald-500';
  } else if (norm === 'completed' || norm === 'approved' || norm === 'verified' || norm === 'cleaned') {
    label = norm === 'approved' ? 'Approved' : 'Completed';
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    dotColor = 'bg-emerald-500';
  } else if (norm === 'pending' || norm === 'pending approval' || norm === 'pending_approval') {
    label = 'Pending Approval';
    styles = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
  } else if (norm === 'rejected') {
    label = 'Rejected';
    styles = 'bg-rose-50 text-rose-700 border-rose-200';
    dotColor = 'bg-rose-500';
  } else if (norm === 'failed' || norm === 'blocked' || norm === 'regression' || norm === 'fail') {
    label = 'Failed';
    styles = 'bg-rose-50 text-rose-700 border-rose-200';
    dotColor = 'bg-rose-500';
  } else if (norm === 'ready' || norm === 'not tested' || norm === 'not_tested') {
    label = norm === 'ready' ? 'Ready' : 'Not Tested';
    styles = 'bg-slate-100 text-slate-700 border-slate-200';
    dotColor = 'bg-slate-400';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{label}</span>
    </span>
  );
};
