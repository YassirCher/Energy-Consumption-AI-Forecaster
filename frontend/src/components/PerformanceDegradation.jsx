import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Legend } from 'recharts';
import { TrendingDown, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { fetchPerformanceTimeline } from '../api';
import LoadingState from './LoadingState';
import EmptyState from './EmptyState';

export default function PerformanceDegradation() {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metricView, setMetricView] = useState('r2');

  useEffect(() => {
    fetchPerformanceTimeline().then(res => {
      setTimeline(res.timeline || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState type="page" />;

  if (timeline.length < 2) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1>Performance Monitoring</h1>
            <p className="page-subtitle">Model performance evolution and degradation detection.</p>
          </div>
        </div>
        <EmptyState
          icon={Activity}
          title="Insufficient History"
          description="Performance monitoring requires at least 2 training runs. Trigger retraining to generate data."
        />
      </div>
    );
  }

  // Prepare chart data
  const chartData = timeline.map((t, i) => ({
    index: i + 1,
    label: t.run_name?.replace('Self-Healing-DriftTriggered-Run-1-step-', '').replace('Self-Healing-Training-1-step-', '') || `Run ${i + 1}`,
    r2: t.r2,
    rmse: t.rmse,
    mae: t.mae,
    model: t.model_type,
    isDegraded: t.is_degraded
  }));

  // Detect degradation zones
  const degradationZones = [];
  let zoneStart = null;
  chartData.forEach((d, i) => {
    if (d.isDegraded && zoneStart === null) {
      zoneStart = d.index;
    } else if (!d.isDegraded && zoneStart !== null) {
      degradationZones.push({ start: zoneStart, end: chartData[i - 1].index });
      zoneStart = null;
    }
  });
  if (zoneStart !== null) {
    degradationZones.push({ start: zoneStart, end: chartData[chartData.length - 1].index });
  }

  // Compute trend
  const r2Values = chartData.map(d => d.r2).filter(Boolean);
  const mid = Math.floor(r2Values.length / 2);
  const firstHalf = r2Values.slice(0, mid);
  const secondHalf = r2Values.slice(mid);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const trend = avgSecond < avgFirst * 0.995 ? 'degrading' : avgSecond > avgFirst * 1.005 ? 'improving' : 'stable';

  const latestR2 = r2Values[r2Values.length - 1] || 0;
  const bestR2 = Math.max(...r2Values);
  const worstR2 = Math.min(...r2Values);
  const degradedCount = chartData.filter(d => d.isDegraded).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Performance Monitoring</h1>
          <p className="page-subtitle">Track R² / RMSE evolution and detect model performance degradation over time.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="tab-group">
            <button className={`tab-item ${metricView === 'r2' ? 'active' : ''}`} onClick={() => setMetricView('r2')}>R² Score</button>
            <button className={`tab-item ${metricView === 'rmse' ? 'active' : ''}`} onClick={() => setMetricView('rmse')}>RMSE</button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 'var(--radius-full)',
            background: trend === 'degrading' ? 'var(--status-error-bg)' : trend === 'improving' ? 'var(--status-success-bg)' : 'var(--bg-muted)',
            border: `1px solid ${trend === 'degrading' ? 'var(--status-error-border)' : trend === 'improving' ? 'var(--status-success-border)' : 'var(--border-light)'}`,
            fontSize: '0.82rem', fontWeight: 600,
            color: trend === 'degrading' ? 'var(--status-error)' : trend === 'improving' ? 'var(--status-success)' : 'var(--text-muted)'
          }}>
            {trend === 'degrading' ? <TrendingDown size={14} /> : trend === 'improving' ? <ShieldCheck size={14} /> : <Activity size={14} />}
            {trend === 'degrading' ? 'Degrading' : trend === 'improving' ? 'Improving' : 'Stable'}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-banner">
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: latestR2 > 0.98 ? 'var(--status-success)' : 'var(--status-warning)' }}>
            {latestR2.toFixed(4)}
          </div>
          <div className="stats-banner-label">Latest R²</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--accent-primary)' }}>{bestR2.toFixed(4)}</div>
          <div className="stats-banner-label">Peak R²</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--text-muted)' }}>{worstR2.toFixed(4)}</div>
          <div className="stats-banner-label">Lowest R²</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: degradedCount > 0 ? 'var(--status-error)' : 'var(--status-success)' }}>
            {degradedCount}
          </div>
          <div className="stats-banner-label">Degraded Runs</div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="card" style={{ minHeight: 460 }}>
        <h3 style={{ marginBottom: 16, fontSize: '0.92rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} color="var(--accent-primary)" />
          {metricView === 'r2' ? 'R² Score Evolution' : 'RMSE Evolution'}
          {degradedCount > 0 && (
            <span className="badge badge-error" style={{ marginLeft: 8, fontSize: '0.65rem' }}>
              <AlertTriangle size={10} /> {degradedCount} degraded
            </span>
          )}
        </h3>
        <div style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="degradeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--status-error)" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="var(--status-error)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} angle={-15} textAnchor="end" height={50} />
              <YAxis
                domain={metricView === 'r2' ? ['auto', 'auto'] : ['auto', 'auto']}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-md)', fontSize: '0.82rem' }}
                formatter={(val, name) => [val?.toFixed(6), name]}
                labelFormatter={(label) => {
                  const d = chartData.find(c => c.label === label);
                  return `${label} (${d?.model || ''})`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: '0.78rem' }} />

              {/* Degradation zones */}
              {metricView === 'r2' && degradationZones.map((zone, i) => (
                <ReferenceArea
                  key={i}
                  x1={zone.start}
                  x2={zone.end}
                  fill="url(#degradeGrad)"
                  stroke="var(--status-error)"
                  strokeOpacity={0.3}
                  strokeDasharray="3 3"
                />
              ))}

              {/* Target threshold */}
              {metricView === 'r2' && (
                <ReferenceLine
                  y={0.98}
                  stroke="var(--status-success)"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{ position: 'right', value: 'Target', fill: 'var(--status-success)', fontSize: 11 }}
                />
              )}

              <Line
                type="monotone"
                dataKey={metricView}
                name={metricView === 'r2' ? 'R² Score' : 'RMSE'}
                stroke={metricView === 'r2' ? 'var(--accent-primary)' : 'var(--chart-3)'}
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isDeg = payload.isDegraded && metricView === 'r2';
                  return (
                    <circle
                      cx={cx} cy={cy} r={isDeg ? 6 : 4}
                      fill={isDeg ? 'var(--status-error)' : (metricView === 'r2' ? 'var(--accent-primary)' : 'var(--chart-3)')}
                      stroke="white" strokeWidth={2}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model breakdown */}
      <div className="grid-cols-3 section-gap">
        {['Ridge', 'LightGBM', 'XGBoost'].map(model => {
          const runs = chartData.filter(d => d.model === model);
          if (runs.length === 0) return null;
          const latestRun = runs[runs.length - 1];
          const avgR2 = runs.reduce((s, r) => s + (r.r2 || 0), 0) / runs.length;
          return (
            <div key={model} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 600 }}>{model}</h3>
                <span className={`badge ${latestRun.isDegraded ? 'badge-error' : 'badge-success'}`}>
                  {latestRun.isDegraded ? 'Below Target' : 'Healthy'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Latest R²</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{(latestRun.r2 || 0).toFixed(4)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Avg R²</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{avgR2.toFixed(4)}</div>
                </div>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
                {runs.length} training run{runs.length > 1 ? 's' : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
