import React, { useState, useMemo } from 'react';
import { FindingDTO, ControlDefinitionDTO } from '../../types';
import { SeverityTag } from '../../components/SeverityTag';
import { EvidenceChip } from '../../components/EvidenceChip';
import { StatusPill } from '../../components/StatusPill';
import { Search, AlertTriangle, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';

interface FindingsPageProps {
  findings: FindingDTO[];
  controls?: ControlDefinitionDTO[];
}

export const FindingsPage: React.FC<FindingsPageProps> = ({ findings, controls }) => {
  const [search, setSearch] = useState('');
  const [selectedControl, setSelectedControl] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [collapsedRuns, setCollapsedRuns] = useState<Record<string, boolean>>({});

  // Unique control IDs and statuses for filter dropdowns
  const uniqueControls = useMemo(() => {
    const set = new Set<string>();
    findings.forEach((f) => {
      if (f.control_id) set.add(f.control_id);
    });
    return Array.from(set).sort();
  }, [findings]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>();
    findings.forEach((f) => {
      if (f.status) set.add(f.status);
    });
    return Array.from(set).sort();
  }, [findings]);

  // Filter findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        f.title.toLowerCase().includes(q) ||
        f.finding_id.toLowerCase().includes(q) ||
        f.run_id.toLowerCase().includes(q) ||
        f.control_id.toLowerCase().includes(q);

      const matchesControl = selectedControl === 'ALL' || f.control_id === selectedControl;
      const matchesSeverity = selectedSeverity === 'ALL' || f.severity.toLowerCase() === selectedSeverity.toLowerCase();
      const matchesStatus = selectedStatus === 'ALL' || f.status.toLowerCase() === selectedStatus.toLowerCase();

      return matchesSearch && matchesControl && matchesSeverity && matchesStatus;
    });
  }, [findings, search, selectedControl, selectedSeverity, selectedStatus]);

  // Group filtered findings by Control Run
  const groupedByRun = useMemo(() => {
    const groups: {
      key: string;
      control_id: string;
      run_id: string;
      findings: FindingDTO[];
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
    }[] = [];

    const map = new Map<string, typeof groups[0]>();

    filteredFindings.forEach((f) => {
      const key = `${f.control_id}::${f.run_id}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          control_id: f.control_id,
          run_id: f.run_id,
          findings: [],
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
        };
        map.set(key, group);
        groups.push(group);
      }
      group.findings.push(f);
      const sev = f.severity?.toLowerCase();
      if (sev === 'critical') group.criticalCount++;
      else if (sev === 'high') group.highCount++;
      else if (sev === 'medium') group.mediumCount++;
      else if (sev === 'low') group.lowCount++;
    });

    return groups;
  }, [filteredFindings]);

  const toggleRun = (key: string) => {
    setCollapsedRuns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Security Findings</h2>
        <p className="text-xs text-slate-500 mt-1">
          Issues identified during control testing.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, control, run, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#143d2c] shadow-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Control Filter */}
            {uniqueControls.length > 0 && (
              <select
                value={selectedControl}
                onChange={(e) => setSelectedControl(e.target.value)}
                className="text-xs px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 focus:outline-none focus:border-[#143d2c] shadow-xs cursor-pointer"
              >
                <option value="ALL">All Controls</option>
                {uniqueControls.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            {/* Severity Filter */}
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="text-xs px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 focus:outline-none focus:border-[#143d2c] shadow-xs cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {/* Status Filter */}
            {uniqueStatuses.length > 0 && (
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-xs px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 focus:outline-none focus:border-[#143d2c] shadow-xs cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                {uniqueStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            {(search || selectedControl !== 'ALL' || selectedSeverity !== 'ALL' || selectedStatus !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedControl('ALL');
                  setSelectedSeverity('ALL');
                  setSelectedStatus('ALL');
                }}
                className="text-xs text-slate-500 hover:text-slate-800 underline px-1 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grouped Findings List */}
      {groupedByRun.length === 0 ? (
        <div className="bg-white rounded-xl p-12 border border-slate-200/90 shadow-xs text-center space-y-2">
          {findings.length === 0 ? (
            <>
              <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto opacity-80" />
              <p className="text-sm font-semibold text-slate-800">Zero Open Findings</p>
              <p className="text-xs text-slate-500">All evaluated rules and controls have passed verification.</p>
            </>
          ) : (
            <>
              <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">No Findings Match Filter</p>
              <p className="text-xs text-slate-500">Try adjusting your search query or severity filter.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByRun.map((group) => {
            const isCollapsed = collapsedRuns[group.key];

            return (
              <div
                key={group.key}
                className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
              >
                {/* Group Header */}
                <div
                  onClick={() => toggleRun(group.key)}
                  className="p-4 bg-slate-50/80 hover:bg-slate-100/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {group.control_id}
                    </span>
                    <span className="text-xs font-mono text-slate-600">
                      Test Run: <strong className="text-slate-800">{group.run_id}</strong>
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
                      {group.findings.length} {group.findings.length === 1 ? 'Issue Found' : 'Issues Found'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Severity Counters */}
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      {group.criticalCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                          {group.criticalCount} Critical
                        </span>
                      )}
                      {group.highCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                          {group.highCount} High
                        </span>
                      )}
                      {group.mediumCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                          {group.mediumCount} Medium
                        </span>
                      )}
                      {group.lowCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                          {group.lowCount} Low
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors ml-1"
                      aria-label="Toggle group"
                    >
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Group Findings List */}
                {!isCollapsed && (
                  <div className="p-4 space-y-3 divide-y divide-slate-100">
                    {group.findings.map((f, idx) => {
                      const ctrl = controls?.find((c) => c.control_id === f.control_id);
                      const cleanTitle = f.title
                        .replace(/^(Critical|High|Medium|Low)\s+vulnerability\s+/i, 'Vulnerability ');

                      const cveMatch = f.title.match(/(CVE-\d{4}-\d+)/i);
                      const cveId = f.cve_id || (cveMatch ? cveMatch[1] : null);

                      return (
                        <div
                          key={f.finding_id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            idx > 0 ? 'pt-3' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0">
                              <SeverityTag severity={f.severity} />
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-slate-900">{cleanTitle}</h4>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                                {cveId && (
                                  <span className="font-mono font-medium text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                    {cveId}
                                  </span>
                                )}
                                <span>
                                  Control:{' '}
                                  <strong className="text-slate-800 font-medium">
                                    {ctrl ? ctrl.title : f.control_id}
                                  </strong>{' '}
                                  {ctrl && (
                                    <span className="font-mono text-slate-500 text-[10px]">
                                      ({f.control_id})
                                    </span>
                                  )}
                                </span>
                                <span>·</span>
                                <span className="font-mono text-slate-400">ID: {f.finding_id}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                            {f.target && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500 font-medium">Affected System:</span>
                                <span className="font-mono text-[11px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {f.target}
                                </span>
                              </div>
                            )}
                            {f.evidence_ids && f.evidence_ids.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500 font-medium">Evidence:</span>
                                {f.evidence_ids.map((id) => (
                                  <EvidenceChip key={id} evidenceId={id} />
                                ))}
                              </div>
                            )}
                            <StatusPill status={f.status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
