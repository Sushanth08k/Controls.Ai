import React, { useState } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';

interface SqlTab {
  id: string;
  label: string;
  sql: string;
  description?: string;
}

interface VulnSqlViewerProps {
  tabs?: SqlTab[];
  sql?: string;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  title?: string;
}

export const VulnSqlViewer: React.FC<VulnSqlViewerProps> = ({
  tabs,
  sql,
  activeTabId,
  onTabChange,
  title = 'Parameterised SQL Statements',
}) => {
  const effectiveTabs: SqlTab[] = tabs && tabs.length > 0 ? tabs : [{ id: 'sql', label: title || 'SQL', sql: sql || '' }];
  const [localActiveTab, setLocalActiveTab] = useState<string>(effectiveTabs[0]?.id || '');
  const [copied, setCopied] = useState<boolean>(false);

  const currentTabId = activeTabId || localActiveTab;
  const currentTab = effectiveTabs.find((t) => t.id === currentTabId) || effectiveTabs[0];

  const handleCopy = () => {
    if (!currentTab?.sql) return;
    navigator.clipboard.writeText(currentTab.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelect = (id: string) => {
    setLocalActiveTab(id);
    onTabChange?.(id);
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-md overflow-hidden text-slate-200">
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
          title="Copy SQL"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy SQL</span>
            </>
          )}
        </button>
      </div>

      {effectiveTabs.length > 1 && (
        <div className="flex border-b border-slate-800/80 bg-slate-950/40 px-3 pt-2 gap-1 overflow-x-auto">
          {effectiveTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleSelect(tab.id)}
              className={`px-3 py-1.5 text-xs font-mono rounded-t-md transition-colors border-t border-x ${
                tab.id === currentTabId
                  ? 'bg-slate-900 border-slate-700 text-emerald-400 font-semibold'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {currentTab?.description && (
        <div className="px-4 py-1.5 bg-slate-950/20 border-b border-slate-800/50 text-[11px] text-slate-400 italic">
          {currentTab.description}
        </div>
      )}

      <div className="p-4 overflow-x-auto max-h-72">
        <pre className="font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap select-all">
          {currentTab?.sql || '-- No SQL available'}
        </pre>
      </div>
    </div>
  );
};
