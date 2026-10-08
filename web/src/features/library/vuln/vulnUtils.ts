export function getPriorityLabel(
  severity: string = 'MEDIUM',
  tier: number | string = 2,
  isKev: boolean = false
): { label: string; color: string; bg: string } {
  const sev = (severity || '').toUpperCase();
  const t = Number(tier) || 2;

  if (isKev) {
    if (t === 1) {
      return { label: 'P1 - Critical (KEV)', color: 'text-rose-700', bg: 'bg-rose-100 border-rose-300' };
    }
    return { label: 'P1 - High (KEV)', color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' };
  }

  if (sev === 'CRITICAL') {
    if (t === 1) {
      return { label: 'P1 - Urgent', color: 'text-red-700', bg: 'bg-red-100 border-red-300' };
    }
    if (t === 2) {
      return { label: 'P2 - High', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300' };
    }
    return { label: 'P3 - Medium', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-300' };
  }

  if (sev === 'HIGH') {
    if (t === 1) {
      return { label: 'P2 - High', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300' };
    }
    return { label: 'P3 - Medium', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-300' };
  }

  if (sev === 'MEDIUM') {
    return { label: 'P4 - Low', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-300' };
  }

  return { label: 'P5 - Info', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-300' };
}

export function formatCoverageMath(scanned: number, totalInScope: number): { percent: number; label: string } {
  if (!totalInScope || totalInScope <= 0) {
    return { percent: 100, label: '100% (0 / 0 in-scope assets)' };
  }
  const pct = Math.round((scanned / totalInScope) * 100);
  return {
    percent: pct,
    label: `${pct}% (${scanned} of ${totalInScope} in-scope scanned)`,
  };
}
