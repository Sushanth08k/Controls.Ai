import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface HashDisplayProps {
  hash: string;
  label?: string;
}

export const HashDisplay: React.FC<HashDisplayProps> = ({ hash, label }) => {
  const [copied, setCopied] = useState(false);

  if (!hash) return <span className="text-slate-500 font-mono text-xs">—</span>;

  const display = hash.length > 16 ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : hash;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title={`Click to copy full hash: ${hash}`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-xs text-slate-300 bg-slate-900/80 border border-slate-700/60 hover:border-slate-500 transition-colors group cursor-pointer"
    >
      {label && <span className="text-slate-400 font-sans mr-1">{label}:</span>}
      <span>{display}</span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Copy className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
      )}
    </button>
  );
};
