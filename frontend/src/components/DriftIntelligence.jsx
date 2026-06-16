import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Minus, ShieldAlert, Zap } from 'lucide-react';
import EmptyState from './EmptyState';

export default function DriftIntelligence({ alerts, insights }) {
  const chartData = alerts?.slice(-60).map((a, i) => ({
    index: i + 1,
    JS_Divergence: Number(a.js_divergence?.toFixed(4)),
    Threshold: a.threshold
  })) || [];

  // Compute drift trend
  let trendIcon = <Minus size={16} />;
  let trendText = 'Stable';
  let trendColor = 'var(--text-muted)';

  if (chartData.length >= 6) {
    const mid = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, mid).reduce((s, d) => s + d.JS_Divergence, 0) / mid;
    const secondHalf = chartData.slice(mid).reduce((s, d) => s + d.JS_Divergence, 0) / (chartData.length - mid);
    if (secondHalf > firstHalf * 1.1) {
      trendIcon = <TrendingUp size={16} />;
      trendText = 'Increasing';
      trendColor = 'var(--status-warning)';
    } else if (secondHalf < firstHalf * 0.9) {
      trendIcon = <TrendingDown size={16} />;
      trendText = 'Decreasing';
      trendColor = 'var(--status-success)';
    }
  }

  const latestJS = chartData.length > 0 ? chartData[chartData.length - 1].JS_Divergence : 0;
  const breachCount = alerts?.filter(a => a.is_breach).length || 0;
  const driftInsights = insights?.filter(i => i.type === 'drift') || [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Drift Intelligence</h1>
          <p className="page-subtitle">Jensen-Shannon divergence tracking with automated threshold monitoring.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 'var(--radius-full)',
            background: trendColor === 'var(--status-warning)' ? 'var(--status-warning-bg)' : trendColor === 'var(--status-success)' ? 'var(--status-success-bg)' : 'var(--bg-muted)',
            border: `1px solid ${trendColor === 'var(--status-warning)' ? 'var(--status-warning-border)' : trendColor === 'var(--status-success)' ? 'var(--status-success-border)' : 'var(--border-light)'}`,
            fontSize: '0.82rem', fontWeight: 600, color: trendColor
          }}>
            {trendIcon} Drift {trendText}
          </div>
        </div>
      </div>

      {/* ─── Stats Row ─────────────────────────────────────────── */}
      <div className="stats-banner">
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: latestJS > 0.15 ? 'var(--status-error)' : 'var(--accent-primary)' }}>
            {latestJS.toFixed(4)}
          </div>
          <div className="stats-banner-label">Current JS Divergence</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--text-main)' }}>
            {alerts?.[0]?.threshold?.toFixed(2) || '0.15'}
          </div>
          <div className="stats-banner-label">Alert Threshold</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: breachCount > 0 ? 'var(--status-error)' : 'var(--status-success)' }}>
            {breachCount}
          </div>
          <div className="stats-banner-label">Total Breaches</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--text-muted)' }}>
            {chartData.length}
          </div>
          <div className="stats-banner-label">Observations</div>
        </div>
      </div>

      {/* ─── Chart + Incidents ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div className="card" style={{ minHeight: 440, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: 16, fontSize: '0.92rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={16} color="var(--accent-primary)" />
            Live Divergence Tracking
          </h3>
          {chartData.length > 0 ? (
            <div style={{ flex: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="driftGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--status-warning)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--status-warning)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="index" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis domain={[0, 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-md)', fontSize: '0.82rem' }}
                  />
                  <ReferenceLine
                    y={0.15}
                    label={{ position: 'right', value: 'Critical', fill: 'var(--status-error)', fontSize: 11 }}
                    stroke="var(--status-error)" strokeDasharray="5 5" strokeWidth={1.5}
                  />
                  <Line
                    type="monotone" dataKey="JS_Divergence" name="JS Divergence"
                    stroke="var(--status-warning)" strokeWidth={2.5} dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No drift data" description="Awaiting drift telemetry from the monitoring pipeline." />
          )}
        </div>

        {/* ─── Right Panel ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* AI Commentary */}
          {driftInsights.length > 0 && (
            <div className="card card-inset">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <div style={{ padding: 6, background: 'var(--accent-gradient)', color: 'white', borderRadius: 6 }}>
                  <Zap size={16} />
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>AI Drift Analysis</span>
              </div>
              {driftInsights.map((ins, i) => (
                <p key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                  {ins.message}
                </p>
              ))}
            </div>
          )}

          {/* Recent Incidents */}
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h3 style={{ marginBottom: 12, fontSize: '0.88rem', fontWeight: 600 }}>Recent Incidents</h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {alerts && alerts.length > 0 ? [...alerts].reverse().slice(0, 12).map((a, i) => (
                <div key={i} className="alert-item" style={{ padding: '10px 0', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        JS: {a.js_divergence?.toFixed(4)}
                      </span>
                      {a.is_breach
                        ? <span className="badge badge-error" style={{ fontSize: '0.65rem' }}>BREACH</span>
                        : <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>OK</span>
                      }
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(a.timestamp).toLocaleTimeString()}
                      {a.consecutive > 0 && <span style={{ color: 'var(--status-error)', marginLeft: 8 }}>×{a.consecutive} consecutive</span>}
                    </div>
                  </div>
                </div>
              )) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No drift incidents recorded.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
