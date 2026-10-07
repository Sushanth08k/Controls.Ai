import React, { useState } from 'react';
import { Database, Server, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, ArrowRight, ArrowLeft } from 'lucide-react';
import { VulnScopeSummary } from '../../../types';

interface VulnTargetDiscoveryStepProps {
  scopeSummary: VulnScopeSummary | null;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
}

export const VulnTargetDiscoveryStep: React.FC<VulnTargetDiscoveryStepProps> = ({
  scopeSummary,
  onBack,
  onProceed,
  loading,
}) => {
  const [showExcludedDetails, setShowExcludedDetails] = useState<boolean>(false);

  if (!scopeSummary) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>Scope summary data is not loaded or missing from run state.</span>
        </div>
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to AI Analysis
          </button>
        </div>
      </div>
    );
  }

  const { assets = [], counts, findings_reconciliation: reconciliation, assets_out_of_scope = [] } = scopeSummary;

  // Consistency validation: findings tested > 0 but assets list empty
  const hasInconsistency = reconciliation?.tested > 0 && assets.length === 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-slate-50 to-emerald-50/40 border border-blue-200/80 rounded-xl p-5 flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Step 3: Target Scope Discovery & Asset Inventory</h3>
          </div>
          <p className="text-xs text-slate-600">
            This is what the review will examine: which assets are in scope, how many findings sit on them, and what was left out and why.
          </p>
        </div>
      </div>

      {/* Red Data-Error Banner if Inconsistent */}
      {hasInconsistency && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          <div>
            <p className="font-bold">Data Inconsistency Detected</p>
            <p>
              Backend reported {reconciliation.tested} findings tested, but zero assets were returned in scope.assets. Please reload or reseed the demo data.
            </p>
          </div>
        </div>
      )}

      {/* 4 Metric Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Assets in Scope</div>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {counts.assets_in_scope} <span className="text-xs text-slate-400 font-normal">of {counts.assets_total}</span>
          </div>
          <div className="text-[10px] text-slate-500">
            {counts.assets_total - counts.assets_in_scope} out-of-scope excluded
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Findings Tested</div>
          <div className="text-xl font-bold text-blue-700 font-mono">
            {reconciliation.tested} <span className="text-xs text-slate-400 font-normal">of {reconciliation.retrieved}</span>
          </div>
          <div className="text-[10px] text-slate-500">
            {reconciliation.excluded} findings on excluded assets
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Scan Runs</div>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {counts.scan_runs_in_window} <span className="text-xs text-slate-400 font-normal">Total</span>
          </div>
          <div className="text-[10px] text-amber-700 font-medium">
            {counts.scan_runs_failed_or_partial} failed / partial
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Existing Governance</div>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {counts.tickets_existing} <span className="text-xs text-slate-400 font-normal">TKT</span> / {counts.exceptions_total} <span className="text-xs text-slate-400 font-normal">EXC</span>
          </div>
          <div className="text-[10px] text-slate-500">
            {counts.exceptions_by_status?.APPROVED || 0} active approved exceptions
          </div>
        </div>
      </div>

      {/* Row Reconciliation Highlight & Excluded Details Toggle */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-emerald-950">Row Reconciliation: </span>
              <span className="text-emerald-900">
                {reconciliation.retrieved} total findings retrieved across all databases • {reconciliation.tested} in-scope findings tested • {reconciliation.excluded} out-of-scope findings excluded
              </span>
            </div>
          </div>
          {(reconciliation.excluded > 0 || assets_out_of_scope.length > 0) && (
            <button
              onClick={() => setShowExcludedDetails(!showExcludedDetails)}
              className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 shrink-0 bg-emerald-100/60 px-2.5 py-1 rounded-md"
            >
              {showExcludedDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {showExcludedDetails ? 'Hide Excluded Details' : 'View Excluded Reasons'}
            </button>
          )}
        </div>

        {/* Expandable Excluded Items List */}
        {showExcludedDetails && (
          <div className="pt-3 border-t border-emerald-200/60 space-y-3">
            {assets_out_of_scope.length > 0 && (
              <div>
                <div className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider mb-1.5">
                  Out-of-Scope Assets ({assets_out_of_scope.length})
                </div>
                <div className="space-y-1">
                  {assets_out_of_scope.map((a, idx) => (
                    <div key={idx} className="text-xs bg-white/70 p-2 rounded border border-emerald-200 flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800">{a.asset_id} ({a.database_name})</span>
                      <span className="text-slate-600 italic text-[11px]">{a.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reconciliation.excluded_by_reason.length > 0 && (
              <div>
                <div className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider mb-1.5">
                  Excluded Findings ({reconciliation.excluded_by_reason.length})
                </div>
                <div className="space-y-1">
                  {reconciliation.excluded_by_reason.map((f, idx) => (
                    <div key={idx} className="text-xs bg-white/70 p-2 rounded border border-emerald-200 flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-800">{f.vulnerability_id} ({f.database_name}) - {f.severity}</span>
                      <span className="text-slate-600 italic text-[11px]">{f.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Target Asset Inventory Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-blue-600" />
            Target Database Assets ({counts.assets_in_scope} in-scope / {counts.assets_total} total)
          </h4>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Asset ID</th>
                <th className="py-2.5 px-3">Database</th>
                <th className="py-2.5 px-3">Tier</th>
                <th className="py-2.5 px-3">Owner</th>
                <th className="py-2.5 px-3">Scope Status</th>
                <th className="py-2.5 px-3">Frequency</th>
                <th className="py-2.5 px-3">Last Scan Date</th>
                <th className="py-2.5 px-3">Scan Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {assets.map((a) => {
                const isInScope = a.in_scope === 1;
                const scanStatus = a.last_scan_status || (a.last_scan_date ? 'COMPLETED' : 'NEVER_SCANNED');
                return (
                  <tr key={a.asset_id} className={isInScope ? 'hover:bg-slate-50/60' : 'bg-slate-50/50 opacity-60'}>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{a.asset_id}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{a.database_name}</td>
                    <td className="py-2.5 px-3 text-slate-600">{a.tier}</td>
                    <td className="py-2.5 px-3 text-slate-600">{a.owner}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isInScope
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isInScope ? 'IN SCOPE' : 'OUT OF SCOPE'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{a.scan_frequency}</td>
                    <td className="py-2.5 px-3 text-slate-600">{a.last_scan_date || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          scanStatus === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : scanStatus === 'FAILED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {scanStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to AI Analysis
        </button>
        <button
          onClick={onProceed}
          disabled={loading || hasInconsistency}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
        >
          Begin Review Execution (Q1-Q6)
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
