import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { fetchHealth, fetchMetrics, fetchMetricsHistory, fetchEvents, fetchAlerts, fetchInsights, triggerRetrain, triggerRollback, exportPredictions, exportAlerts, exportMetrics, login as apiLogin, logout as apiLogout } from './api';
import './index.css';

import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Overview from './components/Overview';
import AdvancedPredictions from './components/AdvancedPredictions';
import DriftIntelligence from './components/DriftIntelligence';
import Timeline from './components/Timeline';
import Settings from './components/Settings';
import Explainability from './components/Explainability';
import AlertsCenter from './components/AlertsCenter';
import ModelComparison from './components/ModelComparison';
import LoadingState from './components/LoadingState';
import ScenarioSimulator from './components/ScenarioSimulator';
import FeatureEvolution from './components/FeatureEvolution';
import PerformanceDegradation from './components/PerformanceDegradation';
import ReportViewer from './components/ReportViewer';
import CommandPalette from './components/CommandPalette';
import LoginPage from './components/LoginPage';
// Lazy-loaded components
const AIAssistant = lazy(() => import('./components/AIAssistant'));
const ShapExplainer = lazy(() => import('./components/ShapExplainer'));
import ABTesting from './components/ABTesting';

// Lazy-loaded heavy components
const DataExplorer = lazy(() => import('./components/DataExplorer'));
const AgentsObservability = lazy(() => import('./components/AgentsObservability'));
const AISystemView = lazy(() => import('./components/AISystemView'));

export default function App() {
  // Auth state
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('ecoforecaster-user');
      const token = localStorage.getItem('ecoforecaster-token');
      return saved && token ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [insights, setInsights] = useState([]);
  const [dbError, setDbError] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('ecoforecaster-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      return saved;
    }
    return 'light';
  });

  const [sseState, setSseState] = useState('disconnected');

  // Auth handlers
  const handleLogin = async (username, password) => {
    const result = await apiLogin(username, password);
    setUser(result.user);
  };

  const handleLogout = () => {
    apiLogout();
    setUser(null);
    setActiveTab('overview');
  };

  const isAdmin = user?.role === 'admin';

  // SSE Connection
  useEffect(() => {
    if (!user) return;
    let eventSource = null;
    let retryCount = 0;
    const maxRetries = 10;

    const connect = () => {
      setSseState('connecting');
      try {
        eventSource = new EventSource('http://localhost:8000/stream/events');
        eventSource.onopen = () => { setSseState('connected'); retryCount = 0; };
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.health) setHealth(data.health);
          } catch {}
        };
        eventSource.onerror = () => {
          eventSource.close();
          setSseState('disconnected');
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(connect, Math.min(1000 * Math.pow(2, retryCount), 30000));
          }
        };
      } catch {
        setSseState('error');
      }
    };

    connect();
    return () => { if (eventSource) eventSource.close(); };
  }, [user]);

  const loadData = useCallback(async () => {
    try {
      const [h, hist, e, a, ins] = await Promise.allSettled([
        fetchHealth(),
        fetchMetricsHistory(),
        fetchEvents(),
        fetchAlerts(),
        fetchInsights()
      ]);

      if (h.status === 'fulfilled') setHealth(h.value);
      if (hist.status === 'fulfilled') setHistory(hist.value.history || []);
      if (e.status === 'fulfilled') setEvents(e.value.events || []);
      if (a.status === 'fulfilled') setAlerts(a.value);
      if (ins.status === 'fulfilled') setInsights(ins.value.insights || []);

      if (h.status === 'fulfilled' && h.value.status !== 'cold_start') {
        try {
          const m = await fetchMetrics();
          setMetrics(m);
        } catch { /* metrics not critical */ }
      }

      setDbError(false);
      setInitialLoading(false);
    } catch (err) {
      console.warn('API polling notice:', err?.message);
      setDbError(true);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
    const interval = setInterval(loadData, 8000); // Optimized from 4s — backend caches are 30-120s
    return () => clearInterval(interval);
  }, [loadData, user]);

  // Command palette keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleCmdAction = async (action) => {
    switch (action) {
      case 'retrain':
        if (isAdmin && window.confirm('Trigger retraining pipeline?')) await triggerRetrain();
        break;
      case 'rollback':
        if (isAdmin && window.confirm('Rollback to previous model?')) await triggerRollback();
        break;
      case 'export-predictions': await exportPredictions(); break;
      case 'export-alerts': await exportAlerts(); break;
      case 'export-metrics': await exportMetrics(); break;
      case 'generate-report': setActiveTab('report'); break;
      case 'ai-assistant': setAiOpen(true); break;
      default: break;
    }
  };

  // Login gate
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const criticalCount = alerts?.critical_count || 0;

  const renderPage = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview health={health} metrics={metrics} history={history} insights={insights} onOpenAI={() => setAiOpen(true)} />;
      case 'predictions':
        return <AdvancedPredictions />;
      case 'drift':
        return <DriftIntelligence alerts={alerts?.drift_alerts || []} insights={insights} />;
      case 'timeline':
        return <Timeline events={events} />;
      case 'settings':
        return <Settings onRetrain={triggerRetrain} onRollback={triggerRollback} health={health} metrics={metrics} theme={theme} setTheme={setTheme} isAdmin={isAdmin} user={user} />;
      case 'explainability':
        return <Explainability insights={insights} />;
      case 'data-explorer':
        return <Suspense fallback={<LoadingState type="page" />}><DataExplorer /></Suspense>;
      case 'alerts':
        return <AlertsCenter alerts={alerts} events={events} />;
      case 'model-comparison':
        return <ModelComparison />;
      case 'scenario':
        return <ScenarioSimulator />;
      case 'feature-evolution':
        return <FeatureEvolution />;
      case 'performance':
        return <PerformanceDegradation />;
      case 'report':
        return <ReportViewer />;
      case 'shap':
        return <Suspense fallback={<LoadingState type="page" />}><ShapExplainer /></Suspense>;
      case 'ab-testing':
        return <ABTesting />;
      case 'ai-agents':
        return <Suspense fallback={<LoadingState type="page" />}><AgentsObservability /></Suspense>;
      case 'ai-system':
        return <Suspense fallback={<LoadingState type="page" />}><AISystemView /></Suspense>;
      default:
        return <Overview health={health} metrics={metrics} history={history} insights={insights} onOpenAI={() => setAiOpen(true)} />;
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        criticalCount={criticalCount}
        theme={theme}
        setTheme={setTheme}
        user={user}
        onLogout={handleLogout}
        onOpenAI={() => setAiOpen(true)}
      />

      <div className="main-wrapper">
        <div className="topbar">
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-info">Production</span>
            <span style={{ color: 'var(--text-placeholder)' }}>v5.1</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="ai-topbar-btn" onClick={() => setAiOpen(true)} title="AI Assistant">
              <span className="ai-topbar-icon">✦</span> AI
            </button>
            <button
              className="cmd-trigger"
              onClick={() => setCmdOpen(true)}
              title="Command Palette (Ctrl+K)"
            >
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Search...</span>
              <kbd className="cmd-kbd-sm">⌘K</kbd>
            </button>
            <div className="topbar-user">
              <span className={`badge ${user.role === 'admin' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.68rem' }}>
                {user.role}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{user.username}</span>
            </div>
            {dbError && (
              <span className="badge badge-error">API Disconnected</span>
            )}
            {health && !dbError && (
              <div className="live-badge">
                <div className={`live-dot ${sseState === 'connected' ? '' : 'sse-reconnecting'}`} />
                {sseState === 'connected' ? 'Live' : sseState === 'connecting' ? 'Connecting...' : 'Polling'}
              </div>
            )}
          </div>
        </div>

        <div className="content-scroll">
          <ErrorBoundary>
            {initialLoading ? (
              <div>
                <LoadingState type="card" count={3} />
                <div style={{ marginTop: 20 }}>
                  <LoadingState type="chart" />
                </div>
              </div>
            ) : (
              renderPage()
            )}
          </ErrorBoundary>
        </div>
      </div>

      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={(id) => setActiveTab(id)}
        onAction={handleCmdAction}
      />

      <Suspense fallback={null}>
        <AIAssistant isOpen={aiOpen} onClose={() => setAiOpen(false)} />
      </Suspense>
    </div>
  );
}
