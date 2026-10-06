import React from 'react';
import { CheckCircle2, XCircle, ArrowRight, ArrowLeft, RefreshCw } from 'lucide-react';
import { formatCoverageMath } from './vulnUtils';

interface VulnVerificationStepProps {
  verificationData: {
    verified: boolean;
    reconciliation: {
      required_count: number;
      created_count: number;
      mismatch_count: number;
      mismatches?: string[];
      findings_with_tickets?: number;
      open_critical_high_count?: number;
      coverage?: {
        in_scope_assets: number;
        scanned_assets: number;
        coverage_pct: number;
      };
    };
  } | null;
  onVerify: () => void;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
  stage: string;
}

export const VulnVerificationStep: React.FC<VulnVerificationStepProps> = ({
  verificationData,
  onVerify,
  onBack,
  onProceed,
  loading,
  stage,
}) => {
  const isVerified = verificationData?.verified === true;
  const rec = verificationData?.reconciliation;
  const coverage = rec?.coverage;
  const coverageInfo = formatCoverageMath(
    coverage?.scanned_assets ?? 3,
    coverage?.in_scope_assets ?? 4
  );

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800 shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-700">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold">Step 6: Field-Level Reconciliation Verification</h3>
          </div>
          <p className="text-xs text-slate-300">
            Non-cryptographic verification reconciles ticket creation counts and per-finding attributes (finding ID, asset, severity, SLA due date) between source findings and tracking tables.
          </p>
        </div>

        <button
          onClick={onVerify}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Reconciling...' : 'Run Reconciliation'}
        </button>
      </div>

      {/* Prominent Pass / Fail Banner */}
      {rec && (
        <div
          className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs ${
            isVerified
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
              : 'bg-rose-50/80 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {isVerified ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="text-sm font-bold">
                {isVerified
                  ? 'Verification PASSED — Reconciliation Fully Reconciled'
                  : 'Verification FAILED — Discrepancies Detected'}
              </h4>
              <p className="text-xs mt-1 opacity-90">
                {isVerified
                  ? `All ${rec.required_count} findings requiring tracking successfully matched 1:1 with provisioned tickets with zero field mismatches.`
                  : `${rec.mismatch_count} mismatches found between findings and provisioned tickets.`}
              </p>
            </div>
          </div>
          <span
            className={`px-3 py-1 text-xs font-mono font-bold rounded-lg uppercase tracking-wider shrink-0 ${
              isVerified ? 'bg-emerald-200/80 text-emerald-900' : 'bg-rose-200/80 text-rose-900'
            }`}
          >
            {isVerified ? 'PASS' : 'FAIL'}
          </span>
        </div>
      )}

      {/* Reconciliation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            COUNT RECONCILIATION
          </span>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {rec?.required_count ?? 0} Required &rarr; {rec?.created_count ?? 0} Provisioned
          </div>
          <p className="text-[11px] text-slate-500">
            {rec?.mismatch_count === 0 ? 'Exact count match (100% matched)' : `${rec?.mismatch_count} missing`}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            FIELD-LEVEL ATTRIBUTES
          </span>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {rec?.mismatch_count ?? 0} Mismatches
          </div>
          <p className="text-[11px] text-slate-500">
            Verified across finding_id, asset_id, severity, and due_date
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            IN-SCOPE SCAN COVERAGE
          </span>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {coverageInfo.label}
          </div>
          <p className="text-[11px] text-slate-500">
            Coverage math: in-scope scanned / in-scope assets
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Ticketing
        </button>
        <button
          onClick={onProceed}
          disabled={loading || !isVerified}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
        >
          Proceed to Human Approval Gate
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
