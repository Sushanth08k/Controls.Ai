import React from 'react';
import { Sparkles, ShieldCheck, AlertTriangle, Check, X, ArrowRight, ArrowLeft } from 'lucide-react';

interface RuleItem {
  rule_id: string;
  rule_type?: string;
  severity?: string;
  timeframe_days?: number;
  condition?: string;
  raw_statement?: string;
  description?: string;
}

interface AmbiguityItem {
  text: string;
  reason?: string;
}

interface VulnAnalysisStepProps {
  analysisData: any;
  confirmedAmbiguities: string[];
  dismissedAmbiguities: string[];
  onToggleAmbiguity: (text: string, confirm: boolean) => void;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
}

export const VulnAnalysisStep: React.FC<VulnAnalysisStepProps> = ({
  analysisData,
  confirmedAmbiguities,
  dismissedAmbiguities,
  onToggleAmbiguity,
  onBack,
  onProceed,
  loading,
}) => {
  const rules: RuleItem[] = analysisData?.structured_rules || [];
  const ambiguities: (string | AmbiguityItem)[] = analysisData?.ambiguities || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50/80 via-blue-50/50 to-slate-50 border border-indigo-200/60 rounded-xl p-5 flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Step 2: AI Policy Interpretation & Rule Extraction</h3>
          </div>
          <p className="text-xs text-slate-600">
            Automated semantic parsing classified {rules.length} enforceable compliance rules. Review extracted SLA rules and confirm or dismiss ambiguous clauses.
          </p>
        </div>
      </div>

      {/* Rules Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            Enforceable Control Rules ({rules.length})
          </h4>
          <span className="text-[11px] text-slate-500 font-mono">Status: Ready for execution</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rules.map((r, i) => (
            <div
              key={r.rule_id || i}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  {r.rule_id}
                </span>
                {r.rule_type && (
                  <span className="text-[10px] font-mono text-slate-500 uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                    {r.rule_type}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-800">
                {r.raw_statement || r.description || JSON.stringify(r)}
              </p>
              {r.timeframe_days !== undefined && (
                <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 pt-1 border-t border-slate-100">
                  <span>SLA Timeframe:</span>
                  <strong className="text-slate-800">{r.timeframe_days} Calendar Days</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Ambiguities & Hedge-Word Clauses */}
      {ambiguities.length > 0 && (
        <div className="bg-amber-50/60 rounded-xl border border-amber-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-amber-900">
                Ambiguous or Discretionary Clauses ({ambiguities.length})
              </h4>
              <p className="text-[11px] text-amber-700">
                These clauses contain hedge words (e.g. "promptly", "where feasible", "appropriate") and require reviewer confirmation before persisting in audit evidence.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {ambiguities.map((item, idx) => {
              const text = typeof item === 'string' ? item : item.text;
              const isConfirmed = confirmedAmbiguities.includes(text);
              const isDismissed = dismissedAmbiguities.includes(text);

              return (
                <div
                  key={idx}
                  className="bg-white rounded-lg border border-amber-200/80 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <p className="text-slate-800 font-serif italic">"{text}"</p>
                    <span className="text-[10px] font-mono text-amber-800 bg-amber-100/60 px-1.5 py-0.5 rounded">
                      Hedge word / Subjective standard
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onToggleAmbiguity(text, true)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                        isConfirmed
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isConfirmed ? 'Confirmed' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => onToggleAmbiguity(text, false)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                        isDismissed
                          ? 'bg-slate-700 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      {isDismissed ? 'Dismissed' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Policy
        </button>
        <button
          onClick={onProceed}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all"
        >
          Proceed to Target Discovery
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
