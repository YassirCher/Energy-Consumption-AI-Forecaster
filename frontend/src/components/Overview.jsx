import React from 'react';
import { Activity, ShieldCheck, Gauge, Cpu, TrendingUp, Zap, Info } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

function HealthGauge({ score }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circumference * (1 - pct);
  const color = score > 85 ? 'var(--status-success)' : score > 60 ? 'var(--status-warning)' : 'var(--status-error)';

  return (
    <div className="gauge-container">
      <svg className="gauge-svg" viewBox="0 0 100 100">
        <circle className="gauge-bg" cx="50" cy="50" r={radius} />
        <circle
          className="gauge-fill"
          cx="50" cy="50" r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ animation: 'gaugeReveal 1.2s ease-out forwards' }}
        />
      </svg>
      <div className="gauge-label">
        <span className="gauge-value" style={{ color }}>{score}</span>
        <span className="gauge-unit">Health</span>
      </div>
    </div>
  );
}

function TooltipIcon({ text }) {
  return (
    <span className="tooltip-wrapper" style={{ marginLeft: 'auto' }}>
      <Info size={14} color="var(--text-muted)" />
      <span className="tooltip-content">{text}</span>
    </span>
  );
}

export default function Overview({ health, metrics, history, insights, onOpenAI }) {
  const r2Value = metrics?.R2 ? metrics.R2.toFixed(4) : '---';
  const rmseValue = metrics?.RMSE ? metrics.RMSE.toFixed(4) : '---';

  const histData = history && history.length > 0
    ? history.map((h) => ({ r2: h.r2, rmse: h.rmse || 0 }))
    : [];

  const rmseData = histData.filter(d => d.rmse > 0);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>System Overview</h1>
          <p className="page-subtitle">Real-time vitals, model performance, and AI-driven insights.</p>
        </div>
        {health && (
          <div className="live-badge">
            <div className="live-dot" /> Live Monitoring
          </div>
        )}
      </div>

      {/* ─── Metric Cards ────────────────────────────────────────── */}
      <div className="grid-cols-4">
        {/* Health Score Gauge */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <HealthGauge score={health?.health_score || 0} />
          <div>
            <div className="metric-title">
              <Gauge size={14} /> Health Score
              <TooltipIcon text="Composite score from R², latency, and drift status" />
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: 4 }}>
              <strong>{health?.latency_p99_ms || 0}</strong>ms P99 latency
            </div>
          </div>
        </div>

        {/* R² */}
        <div className="card">
          <div className="metric-title">
            <ShieldCheck size={14} /> Validation R²
            <TooltipIcon text="Coefficient of determination on validation set" />
          </div>
          <div className="metric-value">{r2Value}</div>
          {histData.length > 0 && (
            <div style={{ height: 36, marginTop: 8, opacity: 0.5 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={histData}>
                  <Line type="monotone" dataKey="r2" stroke="var(--accent-primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* RMSE */}
        <div className="card">
          <div className="metric-title">
            <TrendingUp size={14} /> Validation RMSE
            <TooltipIcon text="Root mean squared error — lower is better" />
          </div>
          <div className="metric-value">{rmseValue}</div>
          {rmseData.length > 0 && (
            <div style={{ height: 36, marginTop: 8, opacity: 0.5 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rmseData}>
                  <Line type="monotone" dataKey="rmse" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Active Architecture */}
        <div className="card card-gradient">
          <div className="metric-title">
            <Cpu size={14} /> Active Model
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8, letterSpacing: '-0.01em' }}>
            {metrics?.Active_Model?.replace('EnergyForecaster_', '') || 'Initializing...'}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.8, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10, marginTop: 4 }}>
            {metrics?.Data_Version || 'Awaiting pipeline'}
          </div>
        </div>
      </div>

      {/* ─── Performance History Chart ─────────────────────────── */}
      {histData.length > 1 && (
        <div className="card section-gap" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} color="var(--accent-primary)" />
            Training Performance History
          </h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                <XAxis dataKey="run_name" hide />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-md)', fontSize: '0.85rem' }}
                />
                <Bar dataKey="r2" name="R² Score" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ─── AI Insights Row ─────────────────────────────────────── */}
      {insights && insights.length > 0 && (
        <div className="section-gap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main)', margin: 0 }}>
              <Zap size={16} color="var(--accent-primary)" />
              AI Insights
              <span className="badge badge-info" style={{ fontSize: '0.6rem', padding: '2px 6px' }}>LLM-Powered</span>
            </h3>
            {onOpenAI && (
              <button className="ai-ask-btn" onClick={onOpenAI}>
                <Zap size={14} /> Ask AI Assistant
              </button>
            )}
          </div>
          <div className="grid-cols-2">
            {insights.slice(0, 4).map((ins, i) => (
              <div key={i} className="insight-card animate-fade-in" style={{ animationDelay: `${i * 80}ms`, opacity: 0 }}>
                <div className={`insight-icon ${ins.severity}`}>
                  {ins.severity === 'warning' && <ShieldCheck size={18} />}
                  {ins.severity === 'critical' && <Zap size={18} />}
                  {ins.severity === 'info' && <Activity size={18} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="insight-title">{ins.title}</div>
                  <div className="insight-text">{ins.message}</div>
                  {ins.source && ins.source !== 'rule_based' && (
                    <span className="insight-source">via {ins.source}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
