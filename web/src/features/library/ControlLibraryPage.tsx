import React, { useState } from 'react';
import { ControlDefinitionDTO, UserSessionDTO } from '../../types';
import { ArchetypeBadge } from '../../components/ArchetypeBadge';
import { SeverityTag } from '../../components/SeverityTag';
import { HashDisplay } from '../../components/HashDisplay';
import { ControlExecutionModal } from './ControlExecutionModal';
import { Search, Play, Loader2, CheckCircle2, Sparkles } from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState<string>('ALL');
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [modalControl, setModalControl] = useState<ControlDefinitionDTO | null>(null);

  const filtered = controls.filter((c) => {
    const matchesSearch =
      c.control_id.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase());
    const matchesArchetype = selectedArchetype === 'ALL' || c.archetype === selectedArchetype;
    return matchesSearch && matchesArchetype;
  });

  const handleTrigger = async (controlId: string) => {
    if (!onTriggerRun) return;
    setTriggeringId(controlId);
    try {
      await onTriggerRun(controlId);
      setSuccessId(controlId);
      setTimeout(() => setSuccessId(null), 3000);
    } finally {
      setTriggeringId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Control Library</h2>
        <p className="text-xs text-slate-500 mt-1">
          Declarative control definitions (YAML, schema-validated, approved via maker-checker).
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ID or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['ALL', 'A', 'B', 'C', 'D', 'E'].map((arch) => (
            <button
              key={arch}
              onClick={() => setSelectedArchetype(arch)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedArchetype === arch
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-xs'
              }`}
            >
              {arch === 'ALL' ? 'All Archetypes' : `Archetype ${arch}`}
            </button>
          ))}
        </div>
      </div>

      {/* Controls Grid */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No Controls Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {controls.length === 0
              ? 'Loading control definitions from registry...'
              : 'No controls matched your current search or archetype filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const isTriggering = triggeringId === c.control_id;
            const isSuccess = successId === c.control_id;

          return (
            <div key={c.control_id} className="bg-white p-5 rounded-xl border border-slate-200/90 hover:border-blue-300 transition-all shadow-xs hover:shadow-md flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-xs font-mono font-bold text-blue-600 block mb-0.5">
                      {c.control_id}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
                  </div>
                  <ArchetypeBadge archetype={c.archetype} />
                </div>

                {c.objective && (
                  <p className="text-xs text-slate-600 mb-4 line-clamp-2">{c.objective}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 rounded-lg bg-slate-50 border border-slate-200 mb-4">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-medium">Frequency</span>
                    <span className="font-mono text-slate-800 font-semibold">{c.frequency}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-medium">Risk Rating</span>
                    <SeverityTag severity={c.risk_rating} />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-slate-500 text-[11px] truncate">Owner: <span className="font-mono text-slate-800 font-medium">{c.owner_role}</span></span>
                  {c.definition_sha256 && (
                    <HashDisplay hash={c.definition_sha256} label="SHA" />
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setModalControl(c)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm hover:shadow-indigo-500/20 transition-all"
                    title="Open Step-by-Step Interactive Studio"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Interactive Studio</span>
                  </button>

                  {onTriggerRun && (
                    <button
                      onClick={() => handleTrigger(c.control_id)}
                      disabled={isTriggering}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isSuccess
                          ? 'bg-emerald-600 text-white'
                          : isTriggering
                          ? 'bg-blue-900/60 text-blue-300 cursor-not-allowed border border-blue-700/60'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      }`}
                    >
                      {isSuccess ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Triggered!</span>
                        </>
                      ) : isTriggering ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Starting...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current text-blue-400" />
                          <span>Run</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Interactive Execution & Compliance Studio Modal */}
      {modalControl && (
        <ControlExecutionModal
          control={modalControl}
          currentUser={currentUser}
          onClose={() => setModalControl(null)}
          onRunCompleted={() => {
            // Trigger refresh
            if (onTriggerRun) onTriggerRun(modalControl.control_id);
          }}
        />
      )}
    </div>
  );
};
