import React from 'react';
import { ArrowRight, ArrowLeft, AlertTriangle, Check, X, Loader2 } from 'lucide-react';

interface RuleItem {
  rule_id: string;
  rule_type?: string;
  severity?: string;
  max_age_days?: number;
  timeframe_days?: number;
  allowed_status?: string[];
  requires_rescan?: boolean;
  max_validity_days?: number;
  tier1_cadence?: string;
  other_cadence?: string;
  escalation_target?: string;
  business_days?: number;
  raw_statement?: string;
  description?: string;
  is_kev?: boolean;
  [key: string]: any;
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
  onClose?: () => void;
  loading: boolean;
}

export const VulnAnalysisStep: React.FC<VulnAnalysisStepProps> = ({
  analysisData,
  confirmedAmbiguities,
  dismissedAmbiguities,
  onToggleAmbiguity,
  onBack,
  onProceed,
  onClose,
  loading,
}) => {
  const isBlocked = analysisData?.has_sla_rules === false || analysisData?.is_unrelated || (analysisData && analysisData.rules_detected === 0);

  const rules: RuleItem[] = isBlocked
    ? []
    : analysisData?.structured_rules && analysisData.structured_rules.length > 0
    ? analysisData.structured_rules
    : analysisData?.rules && analysisData.rules.length > 0
    ? analysisData.rules
    : [];

  const rawAmbiguities: (string | AmbiguityItem)[] = isBlocked
    ? []
    : Array.isArray(analysisData?.ambiguities)
    ? analysisData.ambiguities
    : Array.isArray(analysisData?.ambiguous_items)
    ? analysisData.ambiguous_items
    : [];

  const exceptionsCount = isBlocked
    ? 0
    : analysisData?.exceptions_detected ??
      analysisData?.exceptions?.length ??
      rules.filter((r) => r.rule_type === 'EXCEPTION_GOVERNANCE').length;

  // Format human-friendly card details for any rule type
  const formatRuleCard = (rule: RuleItem) => {
    const ruleType = rule.rule_type?.toUpperCase();
    const sev = String(rule.severity || '').toUpperCase();
    const days = rule.max_age_days ?? rule.timeframe_days;

    if (ruleType === 'KEV_SLA' || rule.is_kev) {
      return {
        badge: 'KEV',
        badgeClass: 'bg-rose-200 text-rose-900',
        slaLabel: `${days ?? 3} Days SLA`,
        slaClass: 'text-rose-700',
        cardClass: 'border-rose-200 bg-rose-50/50',
        textClass: 'text-rose-950/80',
        borderClass: 'border-rose-200/60 text-rose-800',
        description: `Known Exploited Vulnerabilities (KEV) must be remediated within ${days ?? 3} days.`,
        footer: 'Allowed: PATCHED, CLOSED',
      };
    }

    if (ruleType === 'EXCEPTION_GOVERNANCE') {
      return {
        badge: 'EXCEPTIONS',
        badgeClass: 'bg-amber-200 text-amber-900',
        slaLabel: `≤ ${rule.max_validity_days ?? 90} Days`,
        slaClass: 'text-amber-700',
        cardClass: 'border-amber-200 bg-amber-50/50',
        textClass: 'text-amber-950/80',
        borderClass: 'border-amber-200/60 text-amber-800',
        description: 'Exceptions require formal approval and a compensating control and expire within 90 days.',
        footer: 'Governance: COMPENSATING CONTROL',
      };
    }

    if (ruleType === 'SCAN_CADENCE') {
      return {
        badge: 'CADENCE',
        badgeClass: 'bg-blue-100 text-blue-900',
        slaLabel: 'Tier 1 Daily',
        slaClass: 'text-blue-700',
        cardClass: 'border-blue-200 bg-blue-50/50',
        textClass: 'text-blue-950/80',
        borderClass: 'border-blue-200/60 text-blue-800',
        description: 'Tier 1 assets scanned daily, all other in-scope assets scanned weekly.',
        footer: 'Schedule: DAILY / WEEKLY',
      };
    }

    if (ruleType === 'ESCALATION') {
      return {
        badge: 'ESCALATION',
        badgeClass: 'bg-purple-100 text-purple-900',
        slaLabel: `${rule.business_days ?? 1} Business Day`,
        slaClass: 'text-purple-700',
        cardClass: 'border-purple-200 bg-purple-50/50',
        textClass: 'text-purple-950/80',
        borderClass: 'border-purple-200/60 text-purple-800',
        description: "SLA breaches escalated to the asset owner's manager within 1 business day.",
        footer: 'Target: ASSET OWNER MANAGER',
      };
    }

    // Standard Severity SLA
    const isCritical = sev === 'CRITICAL';
    const isHigh = sev === 'HIGH';
    const isMedium = sev === 'MEDIUM';

    const cardClass = isCritical
      ? 'border-rose-200 bg-rose-50/50'
      : isHigh
      ? 'border-amber-200 bg-amber-50/50'
      : isMedium
      ? 'border-blue-200 bg-blue-50/50'
      : 'border-slate-200 bg-slate-50/50';

    const badgeClass = isCritical
      ? 'bg-rose-200 text-rose-900'
      : isHigh
      ? 'bg-amber-200 text-amber-900'
      : isMedium
      ? 'bg-blue-200 text-blue-900'
      : 'bg-slate-200 text-slate-800';

    const slaClass = isCritical
      ? 'text-rose-700'
      : isHigh
      ? 'text-amber-700'
      : isMedium
      ? 'text-blue-700'
      : 'text-slate-700';

    const textClass = isCritical
      ? 'text-rose-950/80'
      : isHigh
      ? 'text-amber-950/80'
      : isMedium
      ? 'text-blue-950/80'
      : 'text-slate-950/80';

    const borderClass = isCritical
      ? 'border-rose-200/60 text-rose-800'
      : isHigh
      ? 'border-amber-200/60 text-amber-800'
      : isMedium
      ? 'border-blue-200/60 text-blue-800'
      : 'border-slate-200/60 text-slate-800';

    const effectiveDays = days ?? (isCritical ? 7 : isHigh ? 30 : isMedium ? 60 : 90);
    const allowed = Array.isArray(rule.allowed_status) ? rule.allowed_status.join(', ') : 'PATCHED, CLOSED';

    return {
      badge: sev || 'SLA',
      badgeClass,
      slaLabel: `${effectiveDays} Days SLA`,
      slaClass,
      cardClass,
      textClass,
      borderClass,
      description: `${sev ? sev.charAt(0) + sev.slice(1).toLowerCase() : 'Identified'} vulnerabilities must be remediated within ${effectiveDays} days${
        isCritical ? ' of identification.' : '.'
      }`,
      footer: `Allowed: ${allowed}`,
    };
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-sm font-bold text-slate-900">Extracted Remediation SLA Rules</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Rules extracted from the approved policy text.
        </p>
      </div>

      {/* Counts Grid (Matching Earlier UI) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
            Rules Detected
          </span>
          <span className="text-2xl font-bold font-mono text-blue-600">{rules.length}</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
            Exceptions Detected
          </span>
          <span className="text-2xl font-bold font-mono text-slate-700">{exceptionsCount}</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
            Ambiguous Items
          </span>
          <span className="text-2xl font-bold font-mono text-slate-700">
            {Array.isArray(rawAmbiguities) ? rawAmbiguities.length : 0}
          </span>
        </div>
      </div>

      {/* Structured Rules Cards Section */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Remediation SLA Boundaries:
        </h4>

        {rules.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rules.map((rule, idx) => {
              const card = formatRuleCard(rule);
              return (
                <div
                  key={rule.rule_id || idx}
                  className={`p-4 rounded-xl border ${card.cardClass} flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${card.badgeClass} uppercase tracking-wide`}>
                        {card.badge}
                      </span>
                      <span className={`font-mono text-xs font-bold ${card.slaClass}`}>
                        {card.slaLabel}
                      </span>
                    </div>
                    <p className={`text-xs ${card.textClass} leading-relaxed font-normal`}>
                      {card.description}
                    </p>
                  </div>
                  <div className={`mt-3 pt-2 border-t ${card.borderClass} text-[11px] flex items-center justify-between font-medium`}>
                    <span>{card.footer}</span>
                    <span className="font-mono text-[10px] text-slate-400 font-normal">{rule.rule_id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 text-center">
            <p className="text-xs text-slate-500 font-medium">
              No recognizable remediation SLA rules detected in this document.
            </p>
          </div>
        )}
      </div>

      {/* Ambiguous Items Requiring Human Review (matching Archival styling) */}
      {rawAmbiguities.length > 0 && (
        <div className="space-y-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Ambiguous Items Requiring Human Review ({rawAmbiguities.length})
            </h4>
          </div>

          <div className="space-y-3">
            {rawAmbiguities.map((item, idx) => {
              const ambObj: any = typeof item === 'object' && item !== null ? item : {};
              const text = typeof item === 'string' ? item : (ambObj.description || ambObj.text || JSON.stringify(item));
              const type = ambObj.type || ambObj.ambiguity_id || `AMB-${String(idx + 1).padStart(3, '0')}`;
              const severity = ambObj.severity || 'NEEDS REVIEW';
              const hedgeWords = ambObj.hedge_words || [];
              const isConfirmed = confirmedAmbiguities.includes(text);
              const isDismissed = dismissedAmbiguities.includes(text);

              return (
                <div
                  key={idx}
                  className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs space-y-2.5 bg-gradient-to-r from-rose-50/20 to-transparent"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-rose-800">
                      {type}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      {severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{text}</p>
                  {hedgeWords.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-rose-800/80">
                      <span className="font-semibold">Hedge words:</span>
                      <span className="italic bg-rose-100/60 px-1.5 py-0.5 rounded border border-rose-200/50">{hedgeWords.join(', ')}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-100">
                    <button
                      type="button"
                      onClick={() => onToggleAmbiguity(text, true)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        isConfirmed
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isConfirmed ? 'Confirmed' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleAmbiguity(text, false)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
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

      {/* Block message if no recognizable SLA rules */}
      {isBlocked && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          <div>
            <span className="font-bold">Policy Blocked: </span>
            <span>No recognizable vulnerability remediation SLA rules found in this policy. Please upload or specify a valid policy with defined SLA thresholds.</span>
          </div>
        </div>
      )}

      {/* Bottom Actions (Matching Earlier UI) */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Policy</span>
        </button>
        {isBlocked ? (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow-rose-500/25 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Close Execution</span>
          </button>
        ) : (
          <button
            onClick={onProceed}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Discovering Targets...</span>
              </>
            ) : (
              <>
                <span>Continue to Target Discovery</span>
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
