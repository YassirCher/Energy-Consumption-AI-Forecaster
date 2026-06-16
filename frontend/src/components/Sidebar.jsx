import React from 'react';
import { Activity, BarChart2, ShieldAlert, Database, Search, Cpu, List, Settings as SettingsIcon, GitCompareArrows, Sliders, TrendingUp, Layers, FileText, Sparkles, FlaskConical, LogOut, Bot, Network, Eye } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function Sidebar({ activeTab, setActiveTab, health, criticalCount, theme, setTheme, user, onLogout, onOpenAI }) {
  const tabsCore = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'data-explorer', label: 'Data Explorer', icon: Search },
    { id: 'explainability', label: 'Explainability', icon: Cpu },
  ];

  const tabsMonitoring = [
    { id: 'predictions', label: 'Predictions', icon: BarChart2 },
    { id: 'drift', label: 'Drift Intelligence', icon: ShieldAlert },
    { id: 'alerts', label: 'Alerts Center', icon: List, badge: criticalCount > 0 ? criticalCount : null },
    { id: 'model-comparison', label: 'Model Comparison', icon: GitCompareArrows },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'timeline', label: 'Event Timeline', icon: Database },
  ];

  const tabsAI = [
    { id: 'shap', label: 'SHAP Explainer', icon: Sparkles },
    { id: 'ab-testing', label: 'A/B Testing', icon: FlaskConical },
    { id: 'ai-agents', label: 'AI Agents', icon: Network },
    { id: 'ai-system', label: 'AI System', icon: Eye },
  ];

  const tabsAdvanced = [
    { id: 'scenario', label: 'Scenario Simulator', icon: Sliders },
    { id: 'feature-evolution', label: 'Feature Evolution', icon: Layers },
    { id: 'report', label: 'Reports', icon: FileText },
  ];

  const renderNavs = (arr) => arr.map(tab => (
    <div
      key={tab.id}
      className={`nav-link ${activeTab === tab.id ? 'active' : ''}`}
      onClick={() => setActiveTab(tab.id)}
    >
      <tab.icon size={17} strokeWidth={activeTab === tab.id ? 2.5 : 1.8} />
      {tab.label}
      {tab.badge && <span className="nav-badge">{tab.badge}</span>}
    </div>
  ));

  const healthStatus = !health ? 'offline' : (health.health_score > 80 ? 'healthy' : (health.health_score > 50 ? 'degraded' : 'offline'));
  const statusLabel = !health ? 'Connecting...' : (healthStatus === 'healthy' ? 'System Healthy' : (healthStatus === 'degraded' ? 'Degraded' : 'Offline'));

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div style={{
          width: 30, height: 30,
          background: 'var(--accent-gradient)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
        }}>
          <Activity size={16} color="white" />
        </div>
        <h2>EcoForecaster</h2>
      </div>

      <div className="sidebar-nav">
        <div className="nav-section-label">Core Analytics</div>
        {renderNavs(tabsCore)}

        <div className="nav-section-label">Monitoring & ML</div>
        {renderNavs(tabsMonitoring)}

        <div className="nav-section-label">AI Intelligence</div>
        <div className="nav-link" onClick={onOpenAI} style={{ cursor: 'pointer' }}>
          <Bot size={17} strokeWidth={1.8} />
          AI Assistant
          <span className="nav-ai-badge">LLM</span>
        </div>
        {renderNavs(tabsAI)}

        <div className="nav-section-label">Advanced</div>
        {renderNavs(tabsAdvanced)}

        <div className="nav-section-label">Administration</div>
        <div
          className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon size={17} strokeWidth={activeTab === 'settings' ? 2.5 : 1.8} />
          Settings
        </div>
      </div>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <div className={`status-indicator ${healthStatus}`} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username || 'User'}
              <span className={`badge ${user?.role === 'admin' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.6rem', marginLeft: 6, padding: '1px 5px' }}>
                {user?.role}
              </span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{statusLabel}</div>
          </div>
        </div>
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <button className="sidebar-logout-btn" onClick={onLogout} title="Sign out">
          <LogOut size={15} />
        </button>
      </div>
    </div>
  );
}
