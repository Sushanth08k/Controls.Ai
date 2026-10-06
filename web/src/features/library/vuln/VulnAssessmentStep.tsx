import React from 'react';
import { ShieldCheck, XCircle, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';

interface AttributeResult {
  attribute_name: string;
  status: 'Pass' | 'Fail' | 'Not Testable';
  defect_type?: 'Design' | 'Operating' | 'None';
  counts: {
    before?: number;
    after?: number;
  };
  details: string;
}

interface ControlAssessment {
  overall_grade: 'Effective' | 'Needs Improvement' | 'Ineffective';
  rationale: string;
  attributes: Record<string, AttributeResult>;
}

interface VulnAssessmentStepProps {
  assessment: ControlAssessment | null;
  onBack: () => void;
  onProceed: () => void;
  loading: boolean;
  stage: string;
}

export const VulnAssessmentStep: React.FC<VulnAssessmentStepProps> = ({
  assessment,
  onBack,
  onProceed,
  loading,
  stage,
}) => {
  const grade = assessment?.overall_grade || 'Needs Improvement';
  const rationale = assessment?.rationale || 'Residual defects identified in vulnerability lifecycle governance.';
  const attributes = assessment?.attributes || {};

  const gradeColors = {
    Effective: {
      bg: 'bg-emerald-50 border-emerald-300 text-emerald-950',
      badge: 'bg-emerald-600 text-white',
      border: 'border-emerald-500',
    },
    'Needs Improvement': {
      bg: 'bg-amber-50 border-amber-300 text-amber-950',
      badge: 'bg-amber-600 text-white',
      border: 'border-amber-500',
    },
    Ineffective: {
      bg: 'bg-rose-50 border-rose-300 text-rose-950',
      badge: 'bg-rose-600 text-white',
      border: 'border-rose-500',
    },
  }[grade];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${gradeColors.bg}`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/80 border border-slate-300">
              STAGE: {stage}
            </span>
            <h3 className="text-sm font-bold">Step 9: Control Effectiveness Assessment</h3>
          </div>
          <p className="text-xs font-medium max-w-2xl">
            <strong>Determination Rationale:</strong> {rationale}
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-1 shrink-0">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">OVERALL CONTROL GRADE</span>
          <span className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider font-mono shadow-xs ${gradeColors.badge}`}>
            {grade}
          </span>
        </div>
      </div>

      {/* 5-Attribute Assessment Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            Vulnerability Lifecycle Assessment Attributes (5)
          </h4>
          <span className="text-[11px] font-mono text-slate-500">
            Source: Deterministic Q1–Q6 Re-Execution
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-semibold font-mono text-[11px]">
              <tr>
                <th className="py-2.5 px-4">CONTROL ATTRIBUTE</th>
                <th className="py-2.5 px-3 text-center">BEFORE</th>
                <th className="py-2.5 px-3 text-center">AFTER</th>
                <th className="py-2.5 px-3 text-center">DEFECT TYPE</th>
                <th className="py-2.5 px-3 text-center">STATUS</th>
                <th className="py-2.5 px-4">EVALUATION SUMMARY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {Object.entries(attributes).map(([key, attr]) => {
                const st = (attr.status || '').toUpperCase();
                const isPass = st === 'PASS';
                const isFail = st === 'FAIL';

                return (
                  <tr key={key} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {attr.attribute_name || (attr as any).name || key}
                      <span className="block text-[10px] text-slate-400 font-normal uppercase">{key}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-600">
                      {attr.counts?.before ?? (attr as any).before_count ?? '—'}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-900">
                      {attr.counts?.after ?? (attr as any).after_count ?? '—'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          attr.defect_type === 'Design' || (attr as any).failure_type === 'design'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : attr.defect_type === 'Operating' || (attr as any).failure_type === 'operating'
                            ? 'bg-orange-50 text-orange-700 border border-orange-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {attr.defect_type || (attr as any).failure_type || 'None'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isPass
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isFail
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {isPass ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : isFail ? (
                          <XCircle className="w-3 h-3 text-rose-600" />
                        ) : null}
                        {(attr as any).status_display || (isPass ? 'Pass' : isFail ? 'Fail' : 'Not Testable')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-sans text-xs">
                      {attr.details || (attr as any).detail || 'Evaluated'}
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
          Back to Apply Outcomes
        </button>
        <button
          onClick={onProceed}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all"
        >
          View Final Audit Evidence & Sign-Off
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
