import React, { useState } from 'react';
import { Upload, FolderOpen, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SelectExistingPolicyModal } from '../SelectExistingPolicyModal';
import { UploadedPolicyDTO } from '../../../api/client';
import { ArchetypeBadge } from '../../../components/ArchetypeBadge';
import { Archetype } from '../../../types';

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
  controlTitle?: string;
  archetype?: Archetype;
}

export const VulnPolicyStep: React.FC<VulnPolicyStepProps> = ({
  policyText,
  setPolicyText,
  fileName,
  policyId,
  duplicateNotice: initialDuplicateNotice,
  selectedNotice: initialSelectedNotice,
  loading,
  error,
  onFileUpload,
  onSelectExisting,
  onProceed,
  controlId,
  controlTitle = 'Database Vulnerability Management Review',
  archetype = 'A',
}) => {
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [dismissDuplicate, setDismissDuplicate] = useState(false);
  const [dismissSelected, setDismissSelected] = useState(false);

  const duplicateNotice = dismissDuplicate ? null : initialDuplicateNotice;
  const selectedNotice = dismissSelected ? null : initialSelectedNotice;

  return (
    <div className="space-y-5">
      {/* Top Header Matching Archival Layout */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Upload Policy & Standards</h2>
          <p className="text-xs text-slate-500 mt-1">
            Upload an organizational compliance document or review the configured bank baseline for {controlTitle}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-blue-700">{controlId}</span>
          <ArchetypeBadge archetype={archetype} />
        </div>
      </div>

      {/* Duplicate Notice Banner */}
      {duplicateNotice && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-blue-950">Policy already exists: </span>
              <span>{duplicateNotice}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissDuplicate(true)}
            className="text-blue-700 hover:text-blue-900 text-xs font-semibold px-2 py-1 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Selected Notice Banner */}
      {selectedNotice && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-blue-950">Selected policy document: </span>
              <span>{selectedNotice}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissSelected(true)}
            className="text-blue-700 hover:text-blue-900 text-xs font-semibold px-2 py-1 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 3-Column Card Grid Matching Archival */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Upload Specification File */}
        <label className="border-2 border-dashed border-slate-300 hover:border-blue-600 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all bg-white hover:bg-blue-50/20 group text-center shadow-xs">
          <Upload className="w-7 h-7 text-blue-600 mb-2 group-hover:scale-105 transition-transform" />
          <span className="text-xs font-semibold text-slate-800">Upload Specification File</span>
          <span className="text-[11px] text-slate-500 mt-0.5">PDF, Word (DOCX), Markdown, or TXT</span>
          <input
            type="file"
            onChange={onFileUpload}
            className="hidden"
            accept=".pdf,.docx,.doc,.txt,.md,.rtf,.csv"
          />
        </label>

        {/* 2. Select Existing Policy Docs */}
        <button
          type="button"
          onClick={() => setShowSelectModal(true)}
          className="border-2 border-dashed border-slate-300 hover:border-blue-600 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all bg-white hover:bg-blue-50/20 group text-center shadow-xs"
        >
          <FolderOpen className="w-7 h-7 text-blue-600 mb-2 group-hover:scale-105 transition-transform" />
          <span className="text-xs font-semibold text-slate-800">Select Existing Policy Docs</span>
          <span className="text-[11px] text-slate-500 mt-0.5">Choose from uploaded library</span>
        </button>

        {/* 3. Active Specification */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-mono text-blue-700 font-semibold block">Active Specification:</span>
              {policyId && (
                <span
                  className="text-[10px] font-mono bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 truncate max-w-[130px]"
                  title={policyId}
                >
                  {policyId}
                </span>
              )}
            </div>
            <span className="text-xs font-bold text-slate-900 block truncate" title={fileName}>
              {fileName}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-2">
            Source: {policyId ? 'Policy Repository (Selected)' : 'Approved Compliance Repository'}
          </span>
        </div>
      </div>

      {/* Policy Specification Textarea */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-slate-700 block font-semibold">Policy Specification Text:</label>
          <span className="text-[11px] text-slate-400 font-mono">
            {policyText.length} characters • {policyText.split('\n').filter((l) => l.trim()).length} clauses
          </span>
        </div>
        <textarea
          value={policyText}
          onChange={(e) => setPolicyText(e.target.value)}
          rows={8}
          className="w-full text-xs font-mono p-4 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-hidden focus:border-blue-600 shadow-xs resize-y"
          placeholder="Enter vulnerability management SLA policy..."
        />
      </div>

      {/* Action Footer */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onProceed}
          disabled={loading || !policyText.trim()}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-900/20 disabled:opacity-50 transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Extracting Policies & Rules...</span>
            </>
          ) : (
            <>
              <span>Analyze Policy Specification</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* Select Existing Modal with themeColor="blue" */}
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
