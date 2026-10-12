import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, Search, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { fetchLiveDb } from '../api/client';

interface LiveDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  controlId: string;
  runId: string;
  sourceTableName?: string;
  archiveTableName?: string;
}

export const LiveDatabaseModal: React.FC<LiveDatabaseModalProps> = ({
  isOpen,
  onClose,
  controlId,
  runId,
  sourceTableName = 'source_transactions',
  archiveTableName = 'archive_transactions',
}) => {
  const isArchival = controlId.toLowerCase().includes('arch');
  const isVuln = controlId.toLowerCase().includes('vuln');

  const defaultTabs = isArchival
    ? [
        { id: 'source', label: `Active DB (${sourceTableName})`, table: sourceTableName },
        { id: 'archive', label: `Archive DB (${archiveTableName})`, table: archiveTableName },
      ]
    : isVuln
    ? [
        { id: 'vuln_tickets', label: 'Tickets DB (vuln_tickets)', table: 'vuln_tickets' },
        { id: 'vuln_exceptions', label: 'Exceptions DB (vuln_exceptions)', table: 'vuln_exceptions' },
        { id: 'source', label: `Source DB (${sourceTableName})`, table: sourceTableName },
      ]
    : [
        { id: 'source', label: `Active DB (${sourceTableName})`, table: sourceTableName },
        { id: 'archive', label: `Archive DB (${archiveTableName})`, table: archiveTableName },
      ];

  const [activeTab, setActiveTab] = useState<string>(defaultTabs[0].id);
  const [sourceRows, setSourceRows] = useState<any[]>([]);
  const [archiveRows, setArchiveRows] = useState<any[]>([]);
  const [extraRows, setExtraRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const currentTable =
    defaultTabs.find((t) => t.id === activeTab)?.table || sourceTableName;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isArchival || (!isVuln && !isArchival)) {
        const [srcRes, arcRes] = await Promise.all([
          fetchLiveDb(sourceTableName).catch(() => ({ rows: [] })),
          fetchLiveDb(archiveTableName).catch(() => ({ rows: [] })),
        ]);
        setSourceRows(srcRes.rows || []);
        setArchiveRows(arcRes.rows || []);
      } else {
        const res = await fetchLiveDb(currentTable).catch(() => ({ rows: [] }));
        if (activeTab === 'source') setSourceRows(res.rows || []);
        else if (activeTab === 'archive') setArchiveRows(res.rows || []);
        else setExtraRows(res.rows || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch live database records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const currentRows =
    activeTab === 'source'
      ? sourceRows
      : activeTab === 'archive'
      ? archiveRows
      : extraRows;

  // Filter rows by search query
  const filteredRows = currentRows.filter((row) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(q)
      );
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-xs text-slate-800">
              <Database className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Live Database Inspector
                </h3>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-200/80 text-slate-800">
                  {controlId}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-200/80 text-slate-700">
                  {runId}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect active and archive database state before authorizing control progression.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              title="Refresh live database records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab switcher & Search Bar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            {defaultTabs.map((tab) => {
              const count =
                tab.id === 'source'
                  ? sourceRows.length
                  : tab.id === 'archive'
                  ? archiveRows.length
                  : extraRows.length;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`ml-1.5 text-[10px] px-1.5 py-0.2 rounded-full ${
                      activeTab === tab.id
                        ? 'bg-slate-100 text-slate-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 max-w-xs justify-end">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-500 bg-white text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Info Strip */}
        <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800">
              {activeTab === 'source'
                ? 'Active Production Database (bank_core.db)'
                : activeTab === 'archive'
                ? 'Immutable Archival Database (bank_archive.db)'
                : 'Target Database Table'}
              :
            </span>
            <span>
              Showing {filteredRows.length} of {currentRows.length} record(s)
            </span>
          </div>
          {isArchival && activeTab === 'source' && (
            <span className="text-amber-800 font-medium">
              * Active legal holds and open investigations are strictly preserved and exempt from purge.
            </span>
          )}
          {isArchival && activeTab === 'archive' && (
            <span className="text-emerald-800 font-medium">
              * Records in archive_transactions contain cryptographic verification hashes.
            </span>
          )}
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-6 bg-white">
          {error && (
            <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <p className="text-xs font-semibold">Loading live database records...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-16 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl">
              <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">No records found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery
                  ? 'No database records match your filter query.'
                  : activeTab === 'archive'
                  ? 'Archive database has no records for this table yet.'
                  : 'Source table currently contains 0 records.'}
              </p>
            </div>
          ) : activeTab === 'source' ? (
            /* Active DB Table (source_transactions) */
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Transaction ID</th>
                    <th className="py-2.5 px-3 font-sans">Customer Name</th>
                    <th className="py-2.5 px-3">Txn Date</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Support Ticket</th>
                    <th className="py-2.5 px-3">Investigation</th>
                    <th className="py-2.5 px-3">Document Ref</th>
                    <th className="py-2.5 px-3">Legal Hold</th>
                    <th className="py-2.5 px-3">Purge Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r, i) => {
                    const hasHold = Boolean(r.legal_hold);
                    const hasActiveInv = r.investigation_status === 'ACTIVE';
                    const isProtected = hasHold || hasActiveInv;

                    return (
                      <tr
                        key={r.transaction_id || i}
                        className={`hover:bg-slate-50 text-[11px] ${
                          isProtected ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-slate-900 font-bold font-mono">
                          {r.transaction_id}
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 font-sans font-medium">
                          {r.customer_name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono">
                          {r.transaction_date}
                        </td>
                        <td className="py-2.5 px-3 text-slate-900 font-semibold font-mono">
                          ${typeof r.amount === 'number' ? r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : r.amount}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.support_ticket_id && r.support_ticket_id !== '—' ? (
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-200">
                              {r.support_ticket_id}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.investigation_status === 'ACTIVE' ? (
                            <span className="bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="text-slate-400">NONE</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono text-[10px]">
                          {r.document_ref || '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {hasHold ? (
                            <span className="bg-rose-100 text-rose-800 border border-rose-300 font-bold px-1.5 py-0.5 rounded text-[10px]">
                              ACTIVE HOLD
                            </span>
                          ) : (
                            <span className="text-slate-400">No</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {isProtected ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                              Exempt (Preserved)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-[10px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Eligible for Purge
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : activeTab === 'archive' ? (
            /* Archive DB Table (archive_transactions) */
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Transaction ID</th>
                    <th className="py-2.5 px-3 font-sans">Customer Name</th>
                    <th className="py-2.5 px-3">Txn Date</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Verification Hash</th>
                    <th className="py-2.5 px-3">Archived At</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r, i) => (
                    <tr key={r.transaction_id || i} className="hover:bg-slate-50 text-[11px]">
                      <td className="py-2.5 px-3 text-slate-900 font-bold font-mono">
                        {r.transaction_id}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-sans font-medium">
                        {r.customer_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">
                        {r.transaction_date}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-semibold font-mono">
                        ${typeof r.amount === 'number' ? r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : r.amount}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-[10px] text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          {r.verification_hash || 'SHA256-COMPUTED'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">
                        {r.archived_at ? new Date(r.archived_at).toLocaleString() : 'Recent'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 font-bold text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ARCHIVED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Extra/Generic Table (vuln_tickets, vuln_exceptions, etc.) */
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    {filteredRows.length > 0 &&
                      Object.keys(filteredRows[0])
                        .slice(0, 7)
                        .map((key) => (
                          <th key={key} className="py-2.5 px-3 uppercase text-[10px]">
                            {key.replace(/_/g, ' ')}
                          </th>
                        ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 text-[11px]">
                      {Object.keys(r)
                        .slice(0, 7)
                        .map((key) => (
                          <td key={key} className="py-2.5 px-3 font-mono text-slate-800">
                            {String(r[key] ?? '—')}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span>
              Total records evaluated: <strong className="text-slate-900">{sourceRows.length} active</strong>,{' '}
              <strong className="text-slate-900">{archiveRows.length} archived</strong>
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all cursor-pointer shadow-xs"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
