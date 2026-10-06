import React, { useRef } from 'react';
import { Upload, FolderOpen, FileText, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { SelectExistingPolicyModal } from '../SelectExistingPolicyModal';
import { UploadedPolicyDTO } from '../../../api/client';

interface VulnPolicyStepProps {
  policyText: string;
  setPolicyText: (text: string) => void;
  fileName: string;
  policyId: string | null;
  duplicateNotice: string | null;
  selectedNotice: string | null;
  loading: boolean;
  error: string | null;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectExisting: (selected: UploadedPolicyDTO) => void;
  onProceed: () => void;
  controlId: string;
}

export const VulnPolicyStep: React.FC<VulnPolicyStepProps> = ({
  policyText,
  setPolicyText,
  fileName,
  policyId,
  duplicateNotice,
  selectedNotice,
  loading,
  error,
  onFileUpload,
  onSelectExisting,
  onProceed,
  controlId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSelectModal, setShowSelectModal] = React.useState(false);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50 border border-blue-200/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Step 1: Vulnerability Management Policy Specification</h3>
          <p className="text-xs text-slate-600 mt-1">
            Upload or inspect the active vulnerability remediation SLA policy. The parser extracts SLAs, KEV rules, closure rescanning, and exception governance rules.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileUpload}
            className="hidden"
            accept=".txt,.md,.pdf,.docx"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg shadow-2xs transition-all"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            Upload File
          </button>
          <button
            onClick={() => setShowSelectModal(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xs transition-all"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Select Existing
          </button>
        </div>
      </div>

      {duplicateNotice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{duplicateNotice}</span>
        </div>
      )}

      {selectedNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
          <FileText className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{selectedNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Editor & Metadata */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Active Specification:</span>
            <span className="text-xs font-mono font-medium text-slate-600 px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
              {fileName}
            </span>
            {policyId && (
              <span className="text-[10px] font-mono text-slate-400">ID: {policyId}</span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {policyText.length} characters • {policyText.split('\n').filter((l) => l.trim()).length} clauses
          </span>
        </div>

        <textarea
          value={policyText}
          onChange={(e) => setPolicyText(e.target.value)}
          rows={12}
          className="w-full font-mono text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
          placeholder="Enter vulnerability management SLA policy..."
        />
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end pt-2">
        <button
          onClick={onProceed}
          disabled={loading || !policyText.trim()}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Parsing Policy Rules...
            </>
          ) : (
            <>
              Analyze Policy Specification
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {showSelectModal && (
        <SelectExistingPolicyModal
          isOpen={showSelectModal}
          currentControlId={controlId}
          currentPolicyId={policyId}
          themeColor="blue"
          onSelectPolicy={(selected: UploadedPolicyDTO) => {
            onSelectExisting(selected);
            setShowSelectModal(false);
          }}
          onClose={() => setShowSelectModal(false)}
        />
      )}
    </div>
  );
};
