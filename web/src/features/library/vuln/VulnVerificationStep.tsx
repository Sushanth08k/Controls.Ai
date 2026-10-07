import React from 'react';
import { CheckCircle2, XCircle, ArrowRight, ArrowLeft, RefreshCw } from 'lucide-react';
import { formatCoverageMath } from './vulnUtils';
import { VulnVerificationResult } from '../../../types';

interface VulnVerificationStepProps {
  verificationData: VulnVerificationResult | null;
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
  const rec = verificationData?.reconciliation;
  const passed = verificationData?.passed === true || verificationData?.verified === true;

  const requiredCount = Number(rec?.required_count ?? verificationData?.required_count ?? 0);
  const createdCount = Number(
    rec?.created_count ??
    verificationData?.created_count ??
    verificationData?.tickets_verified_count ??
    0
  );
  const rawMismatches = rec?.mismatches ?? verificationData?.mismatches ?? [];
  const mismatchesList: string[] = Array.isArray(rawMismatches) ? rawMismatches : [];
  const mismatchCount = Number(
    rec?.mismatch_count ??
    verificationData?.mismatch_count ??
    mismatchesList.length
  );

  const coverage = rec?.coverage ?? verificationData?.coverage;
  const inScopeAssets = coverage?.in_scope_assets;
  const scannedAssets = coverage?.scanned_assets;
  const coverageInfo = (inScopeAssets !== undefined && scannedAssets !== undefined)
    ? formatCoverageMath(scannedAssets, inScopeAssets)
    : { label: coverage?.coverage_pct !== undefined ? `${coverage.coverage_pct}%` : '100%' };

  const isZeroRun = requiredCount === 0 && createdCount === 0;
  const isPassed = passed || isZeroRun;

  const isVerifiedStageOrLater = [
    'VERIFIED',
    'APPROVAL_PENDING',
    'APPROVED',
    'APPLIED',
    'FINALIZED',
  ].includes(stage);

  const canProceed = isVerifiedStageOrLater && (passed || isZeroRun);

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
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Reconciling...' : 'Run Reconciliation'}
        </button>
      </div>

      {/* Prominent Pass / Fail Banner */}
      {verificationData && (
        <div
          className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs ${
            isPassed
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
              : 'bg-rose-50/80 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {isPassed ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="text-sm font-bold">
                {isPassed
                  ? 'Verification PASSED — Reconciliation Fully Reconciled'
                  : 'Verification FAILED — Discrepancies Detected'}
              </h4>
              <p className="text-xs mt-1 opacity-90">
                {isZeroRun
                  ? 'Zero untracked findings requiring tickets. Nothing to reconcile.'
                  : isPassed
                  ? `All ${requiredCount} findings requiring tracking successfully matched 1:1 with provisioned tickets with zero field mismatches.`
                  : `${mismatchCount} mismatch${mismatchCount === 1 ? '' : 'es'} found between findings and provisioned tickets.`}
              </p>
            </div>
          </div>
          <span
            className={`px-3 py-1 text-xs font-mono font-bold rounded-lg uppercase tracking-wider shrink-0 ${
              isPassed ? 'bg-emerald-200/80 text-emerald-900' : 'bg-rose-200/80 text-rose-900'
            }`}
          >
            {isPassed ? 'PASS' : 'FAIL'}
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
            {requiredCount} Required &rarr; {createdCount} Provisioned
          </div>
          <p className="text-[11px] text-slate-500">
            {isZeroRun
              ? 'Nothing to reconcile'
              : mismatchCount === 0
              ? 'Exact count match (100% matched)'
              : `${mismatchCount} missing`}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
            FIELD-LEVEL ATTRIBUTES
          </span>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {mismatchCount} Mismatches
          </div>
          <p className="text-[11px] text-slate-500">
            {mismatchCount === 0
              ? 'Verified across finding_id, asset_id, severity, and due_date'
              : `${mismatchCount} discrepancies detected`}
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

      {/* Mismatches Discrepancies List */}
      {mismatchesList.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <h5 className="text-xs font-bold uppercase tracking-wider font-mono">
              Reconciliation Discrepancies ({mismatchesList.length})
            </h5>
          </div>
          <p className="text-xs text-rose-800">
            The following findings could not be reconciled. These issues must be addressed before advancing to the approval gate:
          </p>
          <ul className="text-xs list-disc pl-5 space-y-1 font-mono text-rose-800">
            {mismatchesList.map((m, idx) => (
              <li key={idx}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Ticketing
        </button>

        <div className="flex items-center gap-3">
          {!canProceed && (
            <span className="text-xs text-rose-600 font-medium">
              {!isVerifiedStageOrLater
                ? 'Reconciliation verification must complete before advancing.'
                : mismatchCount > 0
                ? `Cannot proceed: ${mismatchCount} reconciliation discrepancy${mismatchCount === 1 ? '' : 'ies'} detected.`
                : 'Verification did not pass.'}
            </span>
          )}
          <button
            onClick={onProceed}
            disabled={loading || !canProceed}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all cursor-pointer"
          >
            Proceed to Human Approval Gate
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
