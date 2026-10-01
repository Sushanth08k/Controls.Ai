import React, { useEffect, useState, useRef } from 'react';
import { ControlDefinitionDTO, UserSessionDTO } from '../../types';
import { ArchetypeBadge } from '../../components/ArchetypeBadge';
import { ControlExecutionModal } from './ControlExecutionModal';
import {
  fetchUploadedPolicies,
  uploadPolicyDocument,
  deleteUploadedPolicy,
  UploadedPolicyDTO,
} from '../../api/client';
import {
  Search,
  Play,
  FileText,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  FileUp,
  CheckCircle2,
  Copy,
  Check,
  Upload,
} from 'lucide-react';

interface ControlLibraryPageProps {
  controls: ControlDefinitionDTO[];
  currentUser: UserSessionDTO;
  onTriggerRun?: (controlId: string) => Promise<any>;
}

export const ControlLibraryPage: React.FC<ControlLibraryPageProps> = ({
  controls,
  currentUser,
  onTriggerRun,
}) => {
  const [policies, setPolicies] = useState<UploadedPolicyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<string>('ALL');
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Execution modal state
  const [modalControl, setModalControl] = useState<ControlDefinitionDTO | null>(null);
  const [activePolicy, setActivePolicy] = useState<UploadedPolicyDTO | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const data = await fetchUploadedPolicies();
      setPolicies(data);
    } catch (err) {
      console.error('Failed to load uploaded policies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadSuccess(null);
    try {
      const res = await uploadPolicyDocument(file);
      setUploadSuccess(`Successfully ingested "${file.name}" (${res.pages || 1} pages, ${res.format})`);
      setTimeout(() => setUploadSuccess(null), 4000);
      await loadPolicies();
    } catch (err: any) {
      alert(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (policyId: string) => {
    if (!confirm('Are you sure you want to remove this uploaded policy?')) return;
    try {
      await deleteUploadedPolicy(policyId);
      setPolicies((prev) => prev.filter((p) => p.policy_id !== policyId));
    } catch (err: any) {
      alert(`Delete failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleRunPolicy = (policy: UploadedPolicyDTO) => {
    // Match the control definition by ID or archetype
    const matched =
      controls.find((c) => c.control_id === policy.control_id) ||
      controls.find((c) => c.archetype === policy.archetype) ||
      controls[0];

    if (matched) {
      setActivePolicy(policy);
      setModalControl(matched);
    }
  };

  const handleCopyText = (policyId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(policyId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = policies.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.filename.toLowerCase().includes(search.toLowerCase()) ||
      p.control_id.toLowerCase().includes(search.toLowerCase()) ||
      p.rules_summary.toLowerCase().includes(search.toLowerCase());
    const matchesFormat = selectedFormat === 'ALL' || p.format.toUpperCase() === selectedFormat;
    return matchesSearch && matchesFormat;
  });

  return (
    <div className="space-y-6">
      {/* Header & Upload Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Policies</h2>
          <p className="text-xs text-slate-500 mt-1">
            Uploaded compliance policy documents, specifications, and automated verification rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#143d2c] hover:bg-[#1a4d38] text-white text-xs font-semibold shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Extracting Document...</span>
              </>
            ) : (
              <>
                <FileUp className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>+ Upload Policy Document</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Upload Notification Banner */}
      {uploadSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{uploadSuccess}</span>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 font-mono">Ready to Run</span>
        </div>
      )}

      {/* Dropzone Area */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFileUpload(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="p-6 rounded-2xl border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/20 transition-all text-center cursor-pointer group shadow-2xs"
      >
        <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-emerald-100 text-slate-500 group-hover:text-emerald-700 flex items-center justify-center mx-auto mb-2 transition-colors">
          <Upload className="w-5 h-5" />
        </div>
        <div className="text-xs font-semibold text-slate-800 group-hover:text-emerald-900">
          Drop compliance policy files here, or <span className="text-emerald-700 underline">browse</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Supports PDF, Word (DOCX), and Plain Text (TXT/MD) with automatic AI rule extraction
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search policies by title, filename, control..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#143d2c] shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['ALL', 'PDF', 'DOCX', 'TXT'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => setSelectedFormat(fmt)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedFormat === fmt
                  ? 'bg-[#143d2c] text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-xs'
              }`}
            >
              {fmt === 'ALL' ? 'All Formats' : `${fmt} Files`}
            </button>
          ))}
        </div>
      </div>

      {/* Uploaded Policies List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-700 mx-auto" />
          <p className="text-xs text-slate-500">Loading uploaded policies...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No Policies Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {policies.length === 0
              ? 'No policies have been uploaded yet. Click "+ Upload Policy Document" above to ingest one.'
              : 'No policies matched your current search or format filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isExpanded = expandedPolicyId === p.policy_id;
            const isPdf = p.format.toUpperCase() === 'PDF';
            const isDocx = p.format.toUpperCase() === 'DOCX';

            return (
              <div
                key={p.policy_id}
                className="bg-white rounded-xl border border-slate-200/90 hover:border-emerald-300 transition-all shadow-xs p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left: Document details */}
                  <div className="flex items-start gap-3.5">
                    {/* Format Badge Icon */}
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

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{p.title}</h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                          {p.control_id}
                        </span>
                        <ArchetypeBadge archetype={p.archetype as any} />
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {p.status}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>File: <span className="text-slate-700 font-medium">{p.filename}</span></span>
                        <span>•</span>
                        <span>Size: <span className="text-slate-700 font-medium">{p.file_size}</span></span>
                        <span>•</span>
                        <span>Uploaded: <span className="text-slate-700 font-medium">{p.uploaded_at}</span></span>
                        <span>•</span>
                        <span>By: <span className="text-slate-700 font-medium">{p.uploaded_by}</span></span>
                      </div>

                      <p className="text-xs text-slate-600 pt-1 line-clamp-2">
                        <span className="font-semibold text-slate-700">Specification:</span> {p.rules_summary}
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPolicyId(isExpanded ? null : p.policy_id)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      title={isExpanded ? 'Hide policy text' : 'View extracted policy text'}
                    >
                      {isExpanded ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide Text</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Text</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunPolicy(p)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#143d2c] hover:bg-[#1a4d38] text-white shadow-xs hover:shadow transition-all cursor-pointer"
                      title={`Run compliance workflow for ${p.title}`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                      <span>Run</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(p.policy_id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete uploaded policy"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Policy Text Viewer */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Extracted Document Text ({p.filename})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(p.policy_id, p.policy_text)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                      >
                        {copiedId === p.policy_id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </button>
                    </div>

                    <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-72 border border-slate-800 whitespace-pre-wrap">
                      {p.policy_text || 'No text extracted for this policy document.'}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Compliance Execution Studio Modal */}
      {modalControl && (
        <ControlExecutionModal
          control={modalControl}
          currentUser={currentUser}
          initialPolicyText={activePolicy?.policy_text}
          initialFileName={activePolicy?.filename}
          onClose={() => {
            setModalControl(null);
            setActivePolicy(null);
          }}
          onRunCompleted={() => {
            if (onTriggerRun && modalControl) {
              onTriggerRun(modalControl.control_id);
            }
          }}
        />
      )}
    </div>
  );
};
