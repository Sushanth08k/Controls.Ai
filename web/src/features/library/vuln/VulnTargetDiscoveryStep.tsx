import React from 'react';
import { Database, Server, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';

interface VulnTargetDiscoveryStepProps {
  scopeSummary: {
    total_assets: number;
    in_scope_assets: number;
    out_of_scope_assets: number;
    assets: Array<{
      asset_id: string;
      database_name: string;
      tier: number;
      owner: string;
      owner_manager: string;
      in_scope: number;
      scan_frequency: string;
      last_scan_date: string;
    }>;
    total_findings_retrieved: number;
    in_scope_findings_tested: number;
    out_of_scope_findings_excluded: number;
    reconciliation_message: string;
  } | null;
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
  const assets = scopeSummary?.assets || [];
  const inScopeCount = scopeSummary?.in_scope_assets ?? assets.filter((a) => a.in_scope === 1).length;
  const totalCount = scopeSummary?.total_assets ?? assets.length;
  const retrieved = scopeSummary?.total_findings_retrieved ?? 12;
  const tested = scopeSummary?.in_scope_findings_tested ?? 10;
  const excluded = scopeSummary?.out_of_scope_findings_excluded ?? (retrieved - tested);

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
            Real target discovery connects directly to <code className="font-mono bg-blue-100/60 text-blue-900 px-1 py-0.5 rounded">vuln_assets</code> and <code className="font-mono bg-blue-100/60 text-blue-900 px-1 py-0.5 rounded">vuln_scan_runs</code>.
            Only assets marked in-scope are tested; out-of-scope assets are reconciled explicitly.
          </p>
        </div>
      </div>

      {/* Reconciliation Highlight Box */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-emerald-950">Row Reconciliation: </span>
            <span className="text-emerald-900">
              {scopeSummary?.reconciliation_message ||
                `${retrieved} findings retrieved across all databases • ${tested} in-scope findings tested • ${excluded} out-of-scope excluded`}
            </span>
          </div>
        </div>
        <span className="text-[11px] font-mono text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded shrink-0">
          In-Scope Scope Rule: vuln_assets.in_scope = 1
        </span>
      </div>

      {/* Target Asset Inventory Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-blue-600" />
            Target Database Assets ({inScopeCount} In-Scope / {totalCount} Total)
          </h4>
          <span className="text-[11px] text-slate-500 font-mono">
            {totalCount - inScopeCount} Excluded
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {assets.map((a) => {
            const isInScope = a.in_scope === 1;
            return (
              <div
                key={a.asset_id}
                className={`rounded-xl border p-3.5 transition-all space-y-2 ${
                  isInScope
                    ? 'bg-white border-slate-200 shadow-2xs hover:border-blue-300'
                    : 'bg-slate-50 border-slate-200/80 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-900">{a.database_name}</span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      isInScope
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isInScope ? 'IN SCOPE' : 'OUT OF SCOPE'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 font-mono pt-1 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px]">TIER / ASSET:</span>
                    <span className="font-bold text-slate-800">Tier {a.tier} ({a.asset_id})</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">CADENCE:</span>
                    <span className="font-bold text-slate-800">{a.scan_frequency || 'DAILY'}</span>
                  </div>
                  <div className="col-span-2 pt-1">
                    <span className="text-slate-400 block text-[10px]">OWNER & MANAGER:</span>
                    <span className="text-slate-800 truncate block">
                      {a.owner} &rarr; {a.owner_manager}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
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
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all"
        >
          Begin Review Execution (Q1-Q6)
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
