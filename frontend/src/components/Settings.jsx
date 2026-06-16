import React, { useState } from 'react';
import { Power, RotateCcw, Server, Database, Clock, Shield, Download, FileText, Sun, Moon } from 'lucide-react';
import { exportPredictions, exportAlerts, exportMetrics } from '../api';

export default function Settings({ onRetrain, onRollback, health, metrics, theme, setTheme, isAdmin, user }) {
  const [loadingRetrain, setLoadingRetrain] = useState(false);
  const [loadingRollback, setLoadingRollback] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [exporting, setExporting] = useState(null);

  const handleRetrain = async () => {
    if (window.confirm('Trigger a full retraining pipeline? This will run PySpark extraction and MLflow model training in the background.')) {
      setLoadingRetrain(true);
      setFeedback(null);
      try {
        await onRetrain();
        setFeedback({ type: 'success', message: 'Retraining pipeline initiated. Check Event Timeline for progress.' });
      } catch {
        setFeedback({ type: 'error', message: 'Retraining failed to start. Check backend logs.' });
      }
      setLoadingRetrain(false);
    }
  };

  const handleRollback = async () => {
    if (window.confirm('Roll back to the previous production model? This will swap the current model with the archived version.')) {
      setLoadingRollback(true);
      setFeedback(null);
      try {
        await onRollback();
        setFeedback({ type: 'success', message: 'Rollback successful. Previous model restored to production.' });
      } catch {
        setFeedback({ type: 'error', message: 'Rollback failed. No archive state available or backend error.' });
      }
      setLoadingRollback(false);
    }
  };

  const handleExport = async (type) => {
    setExporting(type);
    try {
      if (type === 'predictions') await exportPredictions();
      else if (type === 'alerts') await exportAlerts();
      else if (type === 'metrics') await exportMetrics();
      setFeedback({ type: 'success', message: `${type.charAt(0).toUpperCase() + type.slice(1)} exported successfully.` });
    } catch {
      setFeedback({ type: 'error', message: `Export failed. Ensure data exists for ${type}.` });
    }
    setExporting(null);
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ecoforecaster-theme', next);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>System Settings</h1>
          <p className="page-subtitle">Administrative controls, exports, and system configuration.</p>
        </div>
      </div>

      {feedback && (
        <div style={{
          padding: '12px 20px', borderRadius: 'var(--radius-md)', marginBottom: 20,
          background: feedback.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
          border: `1px solid ${feedback.type === 'success' ? 'var(--status-success-border)' : 'var(--status-error-border)'}`,
          color: feedback.type === 'success' ? 'var(--status-success)' : 'var(--status-error)',
          fontSize: '0.88rem', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          {feedback.message}
          <button onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'inherit', padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* System Info */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Server size={16} color="var(--accent-primary)" /> System Information
        </h3>
        <div className="grid-cols-4" style={{ gap: 0 }}>
          {[
            { label: 'Active Model', value: metrics?.Active_Model?.replace('EnergyForecaster_', '') || '—', icon: Database, color: 'var(--accent-primary)' },
            { label: 'Health Score', value: health?.health_score ?? '—', icon: Shield, color: health?.health_score > 80 ? 'var(--status-success)' : 'var(--status-warning)' },
            { label: 'P99 Latency', value: `${health?.latency_p99_ms || 0}ms`, icon: Clock, color: 'var(--text-muted)' },
            { label: 'Data Version', value: metrics?.Data_Version?.replace('Window[', '').replace(']', '').split('_')[0] || '—', icon: Database, color: 'var(--text-muted)' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '12px 16px', borderRight: i < 3 ? '1px solid var(--border-light)' : 'none' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <item.icon size={12} /> {item.label}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: item.color, letterSpacing: '-0.01em' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MLOps Actions */}
      {isAdmin !== false ? (
      <div className="grid-cols-2">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ padding: 10, background: 'var(--accent-gradient)', color: 'white', borderRadius: 10 }}><Power size={20} /></div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Trigger Retraining</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>MLOps Pipeline Override</span>
            </div>
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Initiates a full retraining cycle: PySpark extraction, multi-model training, and automatic promotion.
          </p>
          <button className="btn btn-primary" onClick={handleRetrain} disabled={loadingRetrain}>
            {loadingRetrain ? <><div className="loading-spinner" style={{ width: 14, height: 14 }} /> Processing...</> : <><Power size={15} /> Execute Retraining</>}
          </button>
        </div>

        <div className="danger-zone">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ padding: 10, background: 'var(--status-error)', color: 'white', borderRadius: 10 }}><RotateCcw size={20} /></div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--status-error)' }}>Model Rollback</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Emergency Recovery</span>
            </div>
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Swaps the production model with the previously archived version.
          </p>
          <button className="btn btn-danger" onClick={handleRollback} disabled={loadingRollback}>
            {loadingRollback ? <><div className="loading-spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} /> Restoring...</> : <><RotateCcw size={15} /> Rollback to Previous</>}
          </button>
        </div>
      </div>
      ) : (
      <div className="card" style={{ marginBottom: 20, padding: '20px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Shield size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
        <p style={{ fontWeight: 500, margin: '4px 0' }}>Admin Privileges Required</p>
        <p style={{ fontSize: '0.82rem' }}>Retraining and rollback actions are restricted to admin users.</p>
      </div>
      )}

      {/* Export Section */}
      <div className="card section-gap">
        <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={16} color="var(--accent-primary)" /> Data Exports
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Download system data as CSV files for offline analysis and reporting.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { type: 'predictions', label: 'Predictions', icon: FileText },
            { type: 'alerts', label: 'Alerts & Events', icon: Shield },
            { type: 'metrics', label: 'Metrics History', icon: Database },
          ].map(({ type, label, icon: Icon }) => (
            <button key={type} className="btn btn-ghost" onClick={() => handleExport(type)} disabled={exporting === type}>
              {exporting === type ? <div className="loading-spinner" style={{ width: 14, height: 14 }} /> : <Icon size={15} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Appearance Section */}
      <div className="card section-gap">
        <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {theme === 'dark' ? <Moon size={16} color="var(--accent-primary)" /> : <Sun size={16} color="var(--accent-primary)" />}
          Appearance
        </h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>Theme</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Currently using {theme === 'dark' ? 'dark' : 'light'} mode
            </div>
          </div>
          <button className="btn btn-ghost" onClick={toggleTheme}>
            {theme === 'dark' ? <><Sun size={15} /> Light Mode</> : <><Moon size={15} /> Dark Mode</>}
          </button>
        </div>
      </div>
    </div>
  );
}
