import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ControlLibraryPage } from './features/library/ControlLibraryPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { RunsPage } from './features/runs/RunsPage';
import { FindingsPage } from './features/findings/FindingsPage';
import { AuditTrailPage } from './features/audit/AuditTrailPage';
import { AuthPage } from './features/auth/AuthPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ControlDefinitionDTO, FindingDTO, GateItemDTO, RunItemDTO, UserSessionDTO } from './types';
import { fetchControls, fetchGates, fetchRuns, fetchFindings, decideGate, API_BASE, isTargetControl } from './api/client';
import { AlertCircle, Shield } from 'lucide-react';

interface AppLayoutProps {
  currentUser: UserSessionDTO;
  onSwitchUser: (u: UserSessionDTO) => void;
  onLogout: () => void;
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
  onSwitchUser,
  onLogout,
  pendingCount,
  controls,
  runs,
  gates,
  findings,
  error,
  loadData,
  handleDecideGate,
}) => {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      <Navigation
        currentUser={currentUser}
        onSwitchUser={onSwitchUser}
        onLogout={onLogout}
        pendingGatesCount={pendingCount}
      />

      <main className="flex-1 overflow-y-auto">

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
                  runs={runs}
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
            <Route path="/findings" element={<FindingsPage findings={findings} controls={controls} />} />
            <Route path="/evidence" element={<FindingsPage findings={findings} controls={controls} />} />
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

const AuthenticatedPlatform: React.FC = () => {
  const { currentUser, switchRole, logout, loading: authLoading } = useAuth();

  const [controls, setControls] = useState<ControlDefinitionDTO[]>([]);
  const [runs, setRuns] = useState<RunItemDTO[]>([]);
  const [gates, setGates] = useState<GateItemDTO[]>([]);
  const [findings, setFindings] = useState<FindingDTO[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setSseConnected] = useState(false);

  const loadData = async () => {
    if (!currentUser) return;
    try {
      setDataLoading(true);
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
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  // Realtime Server-Sent Events listener
  useEffect(() => {
    if (!currentUser) return;

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
        if (newRun.control_id && !isTargetControl(newRun.control_id)) return;
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
  }, [currentUser]);

  const handleDecideGate = async (
    gateId: string,
    decision: 'approved' | 'rejected',
    comment: string
  ) => {
    if (!currentUser) return;
    const result = await decideGate(
      gateId,
      decision,
      comment,
      currentUser.email || currentUser.user_id,
      currentUser.roles
    );
    // Optimistically update local gate state
    setGates((prev) =>
      prev.map((g) => (g.gate_id === gateId ? result.gate : g))
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 rounded-xl bg-[#0d281e] border border-[#204a37] flex items-center justify-center mb-4">
          <Shield className="w-6 h-6 text-emerald-400 animate-pulse" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-white">Authenticating Secure Session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage />;
  }

  const pendingCount = gates.filter((g) => g.status === 'pending').length;

  return (
    <BrowserRouter>
      <AppLayout
        currentUser={currentUser}
        onSwitchUser={(user) => switchRole(user.roles[0])}
        onLogout={logout}
        pendingCount={pendingCount}
        controls={controls}
        runs={runs}
        gates={gates}
        findings={findings}
        loading={dataLoading}
        error={error}
        loadData={loadData}
        handleDecideGate={handleDecideGate}
      />
    </BrowserRouter>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AuthenticatedPlatform />
    </AuthProvider>
  );
};
