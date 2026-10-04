import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ControlLibraryPage } from './features/library/ControlLibraryPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { RunsPage } from './features/runs/RunsPage';
import { FindingsPage } from './features/findings/FindingsPage';
import { AuditTrailPage } from './features/audit/AuditTrailPage';
import { ControlDefinitionDTO, FindingDTO, GateItemDTO, RunItemDTO, UserSessionDTO } from './types';
import { fetchControls, fetchGates, fetchRuns, fetchFindings, decideGate, API_BASE } from './api/client';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface AppLayoutProps {
  currentUser: UserSessionDTO;
  setCurrentUser: (u: UserSessionDTO) => void;
  pendingCount: number;
  controls: ControlDefinitionDTO[];
  runs: RunItemDTO[];
  gates: GateItemDTO[];
  findings: FindingDTO[];
  loading: boolean;
  error: string | null;
  loadData: () => void;
  handleDecideGate: (gateId: string, decision: 'approved' | 'rejected', comment: string) => Promise<void>;
}

const AppLayout: React.FC<AppLayoutProps> = ({
  currentUser,
  setCurrentUser,
  pendingCount,
  controls,
  runs,
  gates,
  findings,
  loading,
  error,
  loadData,
  handleDecideGate,
}) => {
  const location = useLocation();
  const isDashboard = location.pathname === '/';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      <Navigation
        currentUser={currentUser}
        onSwitchUser={setCurrentUser}
        pendingGatesCount={pendingCount}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Top Status Bar for non-dashboard pages */}
        {!isDashboard && (
          <div className="bg-white border-b border-slate-200 px-6 md:px-8 py-2.5 flex items-center justify-end shadow-2xs">
            <button
              onClick={loadData}
              className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-xs transition-colors cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        <div className="p-6 md:p-8">
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
                  currentUser={currentUser}
                  onRefresh={loadData}
                />
              }
            />
            <Route
              path="/controls"
              element={
                <ControlLibraryPage
                  controls={controls}
                  currentUser={currentUser}
                  onRefresh={loadData}
                />
              }
            />
            <Route
              path="/policies"
              element={
                <ControlLibraryPage
                  controls={controls}
                  currentUser={currentUser}
                  onRefresh={loadData}
                />
              }
            />
            <Route
              path="/approvals"
              element={
                <ApprovalsPage
                  gates={gates}
                  controls={controls}
                  currentUser={currentUser}
                  onDecideGate={handleDecideGate}
                  onRefresh={loadData}
                />
              }
            />
            <Route
              path="/runs"
              element={
                <RunsPage
                  runs={runs}
                  controls={controls}
                  currentUser={currentUser}
                  onRefresh={loadData}
                />
              }
            />
            <Route path="/findings" element={<FindingsPage findings={findings} />} />
            <Route path="/evidence" element={<FindingsPage findings={findings} />} />
            <Route
              path="/audit"
              element={
                <AuditTrailPage
                  runs={runs}
                  gates={gates}
                  currentUser={currentUser}
                  controls={controls}
                />
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserSessionDTO>({
    user_id: 'sec_reviewer_1',
    roles: ['control_reviewer'],
    email: 'sushanth@bank.internal',
  });

  const [controls, setControls] = useState<ControlDefinitionDTO[]>([]);
  const [runs, setRuns] = useState<RunItemDTO[]>([]);
  const [gates, setGates] = useState<GateItemDTO[]>([]);
  const [findings, setFindings] = useState<FindingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setSseConnected] = useState(false);

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
    const sse = new EventSource(`${API_BASE}/events`);

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
      <AppLayout
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        pendingCount={pendingCount}
        controls={controls}
        runs={runs}
        gates={gates}
        findings={findings}
        loading={loading}
        error={error}
        loadData={loadData}
        handleDecideGate={handleDecideGate}
      />
    </BrowserRouter>
  );
};
