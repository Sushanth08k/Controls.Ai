import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ControlLibraryPage } from './features/library/ControlLibraryPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { RunsPage } from './features/runs/RunsPage';
import { FindingsPage } from './features/findings/FindingsPage';
import { ControlDefinitionDTO, FindingDTO, GateItemDTO, RunItemDTO, UserSessionDTO } from './types';
import { fetchControls, fetchGates, fetchRuns, fetchFindings, decideGate, triggerRun } from './api/client';
import { AlertCircle, RefreshCw, Radio } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserSessionDTO>({
    user_id: 'sec_reviewer_1',
    roles: ['control_reviewer'],
    email: 'reviewer@bank.internal',
  });

  const [controls, setControls] = useState<ControlDefinitionDTO[]>([]);
  const [runs, setRuns] = useState<RunItemDTO[]>([]);
  const [gates, setGates] = useState<GateItemDTO[]>([]);
  const [findings, setFindings] = useState<FindingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [c, r, g, f] = await Promise.all([
        fetchControls().catch(() => []),
        fetchRuns().catch(() => []),
        fetchGates(currentUser.user_id, currentUser.roles).catch(() => []),
        fetchFindings().catch(() => []),
      ]);
      setControls(c);
      setRuns(r);
      setGates(g);
      setFindings(f);
    } catch (err: any) {
      setError(err.message || 'Failed to load initial data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  // Realtime Server-Sent Events listener
  useEffect(() => {
    const sse = new EventSource('/api/events');

    sse.onopen = () => {
      setSseConnected(true);
    };

    sse.addEventListener('gate.decided', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setGates((prev) =>
          prev.map((g) =>
            g.gate_id === payload.gate_id
              ? { ...g, status: payload.decision, decided_by: payload.decided_by }
              : g
          )
        );
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    });

    sse.addEventListener('run.started', (event) => {
      try {
        const newRun = JSON.parse(event.data);
        setRuns((prev) => [newRun, ...prev.filter((r) => r.run_id !== newRun.run_id)]);
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    });

    sse.onerror = () => {
      setSseConnected(false);
    };

    return () => {
      sse.close();
    };
  }, []);

  const handleTriggerRun = async (controlId: string) => {
    try {
      const newRun = await triggerRun(controlId);
      setRuns((prev) => [newRun, ...prev.filter((r) => r.run_id !== newRun.run_id)]);
      return newRun;
    } catch (err: any) {
      setError(err.message || 'Failed to trigger run');
      throw err;
    }
  };

  const handleDecideGate = async (
    gateId: string,
    decision: 'approved' | 'rejected',
    comment: string
  ) => {
    const result = await decideGate(
      gateId,
      decision,
      comment,
      currentUser.user_id,
      currentUser.roles
    );
    // Optimistically update local gate state
    setGates((prev) =>
      prev.map((g) => (g.gate_id === gateId ? result.gate : g))
    );
  };

  const pendingCount = gates.filter((g) => g.status === 'pending').length;

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-slate-100 text-slate-900 font-sans">
        <Navigation
          currentUser={currentUser}
          onSwitchUser={setCurrentUser}
          pendingGatesCount={pendingCount}
        />

        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {/* Top Bar with Status Indicator */}
          <div className="flex items-center justify-between pb-5 mb-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500">Environment:</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-medium bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">
                Local Spark Simulator
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs">
                <Radio className={`w-3.5 h-3.5 ${sseConnected ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
                <span className={sseConnected ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                  {sseConnected ? 'Realtime Connected' : 'Connecting SSE...'}
                </span>
              </div>

              <button
                onClick={loadData}
                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-xs transition-colors"
                title="Refresh Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-900 text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Routes>
            <Route
              path="/"
              element={
                <DashboardPage
                  controls={controls}
                  runs={runs}
                  gates={gates}
                  findings={findings}
                />
              }
            />
            <Route
              path="/controls"
              element={
                <ControlLibraryPage
                  controls={controls}
                  currentUser={currentUser}
                  onTriggerRun={handleTriggerRun}
                />
              }
            />
            <Route
              path="/approvals"
              element={
                <ApprovalsPage
                  gates={gates}
                  currentUser={currentUser}
                  onDecideGate={handleDecideGate}
                />
              }
            />
            <Route path="/runs" element={<RunsPage runs={runs} />} />
            <Route path="/findings" element={<FindingsPage findings={findings} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};
