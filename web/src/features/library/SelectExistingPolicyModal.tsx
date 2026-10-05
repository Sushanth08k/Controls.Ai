import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  FileText,
  Check,
  X,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCheck2,
} from 'lucide-react';
import { fetchUploadedPolicies, UploadedPolicyDTO, getPolicyDocumentFileUrl } from '../../api/client';
import { ArchetypeBadge } from '../../components/ArchetypeBadge';

interface SelectExistingPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPolicy: (policy: UploadedPolicyDTO) => void;
  currentControlId?: string;
  currentPolicyId?: string | null;
  themeColor?: 'emerald' | 'blue';
}

export const SelectExistingPolicyModal: React.FC<SelectExistingPolicyModalProps> = ({
  isOpen,
  onClose,
  onSelectPolicy,
  currentControlId,
  currentPolicyId,
  themeColor = 'emerald',
}) => {
  const [policies, setPolicies] = useState<UploadedPolicyDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [filterType, setFilterType] = useState<'ALL' | 'MATCHING' | 'PDF' | 'DOCX' | 'TXT'>('ALL');
  const [previewPolicyId, setPreviewPolicyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchUploadedPolicies()
      .then((data) => {
        setPolicies(data);
        // If there are policies matching the current control, default to 'MATCHING' or 'ALL'
        const hasMatching = currentControlId && data.some((p) => p.control_id === currentControlId);
        if (hasMatching) {
          setFilterType('MATCHING');
        } else {
          setFilterType('ALL');
        }
      })
      .catch((err) => {
        console.error('Failed to load existing policies:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, currentControlId]);

  const matchingCount = useMemo(() => {
    if (!currentControlId) return 0;
    return policies.filter((p) => p.control_id === currentControlId).length;
  }, [policies, currentControlId]);

  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      // Filter Type
      if (filterType === 'MATCHING' && currentControlId) {
        if (p.control_id !== currentControlId) return false;
      } else if (filterType === 'PDF' && p.format.toUpperCase() !== 'PDF') {
        return false;
      } else if (filterType === 'DOCX' && p.format.toUpperCase() !== 'DOCX') {
        return false;
      } else if (filterType === 'TXT' && !['TXT', 'MD'].includes(p.format.toUpperCase())) {
        return false;
      }

      // Search Query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = p.title?.toLowerCase().includes(q);
        const matchesFilename = p.filename?.toLowerCase().includes(q);
        const matchesControl = p.control_id?.toLowerCase().includes(q);
        const matchesId = p.policy_id?.toLowerCase().includes(q);
        const matchesSummary = p.rules_summary?.toLowerCase().includes(q);
        const matchesText = p.policy_text?.toLowerCase().includes(q);
        return matchesTitle || matchesFilename || matchesControl || matchesId || matchesSummary || matchesText;
      }
      return true;
    });
  }, [policies, filterType, search, currentControlId]);

  if (!isOpen) return null;

  const isEmerald = themeColor === 'emerald';
  const headerBgClass = isEmerald ? 'bg-[#064e3b]' : 'bg-blue-600';
  const primaryButtonClass = isEmerald
    ? 'bg-[#064e3b] hover:bg-[#085f49] text-white shadow-xs'
    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs';
  const activeTabClass = isEmerald
    ? 'bg-[#064e3b] text-white shadow-xs'
    : 'bg-blue-600 text-white shadow-xs';
  const selectButtonActiveClass = isEmerald
    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
    : 'bg-blue-50 text-blue-800 border-blue-300';
  const accentBorderHover = isEmerald ? 'hover:border-emerald-500' : 'hover:border-blue-500';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] my-auto">
        
        {/* Header */}
        <div className={`${headerBgClass} text-white px-6 py-4 flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-xs border border-white/20">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Select Existing Policy Document</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20 text-white font-medium border border-white/30">
                  {policies.length} {policies.length === 1 ? 'doc' : 'docs'} available
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                Choose a previously uploaded compliance specification to test against {currentControlId || 'this control'}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, filename, control, rules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 shadow-2xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {currentControlId && (
              <button
                type="button"
                onClick={() => setFilterType('MATCHING')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  filterType === 'MATCHING'
                    ? activeTabClass
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100/70 shadow-2xs'
                }`}
              >
                Matching Control ({matchingCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'ALL'
                  ? activeTabClass
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100/70 shadow-2xs'
              }`}
            >
              All ({policies.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('PDF')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'PDF'
                  ? activeTabClass
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100/70 shadow-2xs'
              }`}
            >
              PDF
            </button>
            <button
              type="button"
              onClick={() => setFilterType('DOCX')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'DOCX'
                  ? activeTabClass
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100/70 shadow-2xs'
              }`}
            >
              DOCX
            </button>
            <button
              type="button"
              onClick={() => setFilterType('TXT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filterType === 'TXT'
                  ? activeTabClass
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100/70 shadow-2xs'
              }`}
            >
              TXT / MD
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#f8fafc]">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className={`w-8 h-8 animate-spin mx-auto ${isEmerald ? 'text-emerald-700' : 'text-blue-600'}`} />
              <p className="text-xs text-slate-500 font-medium">Loading uploaded compliance policies...</p>
            </div>
          ) : filteredPolicies.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3 p-6">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900">No Policy Documents Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {search
                  ? `No policy documents matched "${search}". Try searching by another keyword or reset the filter.`
                  : filterType === 'MATCHING' && currentControlId
                  ? `No documents specifically tagged for control ${currentControlId}. Click "All" above to select from any uploaded policy.`
                  : 'No uploaded policies are currently available in the compliance library.'}
              </p>
              {(search || filterType !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterType('ALL');
                  }}
                  className="text-xs text-slate-700 hover:text-slate-900 font-semibold underline"
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            filteredPolicies.map((p) => {
              const isSelected = currentPolicyId === p.policy_id;
              const isPreviewing = previewPolicyId === p.policy_id;
              const isPdf = p.format.toUpperCase() === 'PDF';
              const isDocx = p.format.toUpperCase() === 'DOCX';
              const isMatching = currentControlId && p.control_id === currentControlId;

              return (
                <div
                  key={p.policy_id}
                  className={`bg-white rounded-xl border transition-all shadow-2xs p-4 sm:p-5 space-y-3 ${
                    isSelected
                      ? isEmerald
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20'
                        : 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                      : `border-slate-200/90 ${accentBorderHover}`
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left side details */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Format badge icon */}
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs ${
                          isPdf
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : isDocx
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {p.format}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900 truncate" title={p.title}>
                            {p.title || p.filename}
                          </h4>
                          {p.control_id && (
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                                isMatching
                                  ? isEmerald
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                    : 'bg-blue-100 text-blue-900 border-blue-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {p.control_id}
                              {isMatching && ' (Target)'}
                            </span>
                          )}
                          <ArchetypeBadge archetype={p.archetype as any} />
                          {isSelected && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                                isEmerald
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-blue-100 text-blue-800 border-blue-300'
                              }`}
                            >
                              <Check className="w-3 h-3 stroke-[3]" /> Active in modal
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500 font-mono flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-slate-700 font-medium truncate max-w-[200px]" title={p.filename}>
                            {p.filename}
                          </span>
                          <span>•</span>
                          <span>ID: <span className="text-slate-700 font-semibold">{p.policy_id}</span></span>
                          <span>•</span>
                          <span>{p.file_size}</span>
                          <span>•</span>
                          <span>{p.uploaded_at}</span>
                          {p.uploaded_by && (
                            <>
                              <span>•</span>
                              <span>By: {p.uploaded_by}</span>
                            </>
                          )}
                        </div>

                        {p.rules_summary && (
                          <p className="text-xs text-slate-600 line-clamp-2 pt-0.5">
                            <span className="font-semibold text-slate-700">Rules extracted: </span>
                            {p.rules_summary}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right side action buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                      <button
                        type="button"
                        onClick={() => setPreviewPolicyId(isPreviewing ? null : p.policy_id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 transition-colors cursor-pointer"
                      >
                        {isPreviewing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>{isPreviewing ? 'Hide Text' : 'View Text'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectPolicy(p);
                          onClose();
                        }}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? selectButtonActiveClass
                            : primaryButtonClass
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSelected ? 'Selected' : 'Use Policy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Expandable Text Preview */}
                  {isPreviewing && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span>Extracted Document Specification ({p.policy_text?.length || 0} characters)</span>
                        {(p.cloudinary_url || p.policy_id) && (
                          <a
                            href={
                              p.cloudinary_url && !p.cloudinary_url.includes('/simulated/')
                                ? p.cloudinary_url
                                : getPolicyDocumentFileUrl(p.policy_id)
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>View Original File</span>
                          </a>
                        )}
                      </div>
                      <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono whitespace-pre-wrap max-h-56 overflow-y-auto border border-slate-800">
                        {p.policy_text || '(Empty text content)'}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-mono">
            Showing {filteredPolicies.length} of {policies.length} uploaded policies
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
};
