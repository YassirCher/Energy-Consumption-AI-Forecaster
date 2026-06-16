import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { fetchModelsCompare } from '../api';
import { Award, AlertCircle, TrendingUp } from 'lucide-react';
import LoadingState from './LoadingState';

export default function ModelComparison() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModelsCompare().then(res => {
      setData(res);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState type="page" />;
  if (!data || !data.models) return <LoadingState type="page" />;

  const models = data.models;
  const bestModel = data.best_model;

  // Prepare bar chart data
  const barData = [
    { metric: 'R²', ...Object.fromEntries(models.filter(m => m.r2 !== null).map(m => [m.name, m.r2])) },
    { metric: 'RMSE', ...Object.fromEntries(models.filter(m => m.rmse !== null).map(m => [m.name, m.rmse])) },
    { metric: 'MAE', ...Object.fromEntries(models.filter(m => m.mae !== null).map(m => [m.name, m.mae])) },
  ];

  // Radar chart data (normalized 0–100 for visual)
  const availableModels = models.filter(m => m.status === 'available');
  const maxR2 = Math.max(...availableModels.map(m => m.r2 || 0));
  const maxRMSE = Math.max(...availableModels.map(m => m.rmse || 0.01));

  const radarData = availableModels.length > 0 ? [
    { metric: 'Accuracy (R²)', ...Object.fromEntries(availableModels.map(m => [m.name, ((m.r2 || 0) / Math.max(maxR2, 0.001)) * 100])) },
    { metric: 'Precision (1/RMSE)', ...Object.fromEntries(availableModels.map(m => [m.name, ((1 - (m.rmse || 0) / Math.max(maxRMSE, 0.001))) * 100])) },
    { metric: 'Efficiency (1/MAE)', ...Object.fromEntries(availableModels.map(m => [m.name, m.mae ? ((1 - m.mae / Math.max(maxRMSE, 0.001))) * 100 : 50])) },
  ] : [];

  const modelColors = { Ridge: '#F59E0B', LightGBM: '#6366F1', XGBoost: '#10B981' };
  const rankColors = ['gold', 'silver', 'bronze'];

  // Sort models by R2 for ranking
  const ranked = [...models].sort((a, b) => (b.r2 || -1) - (a.r2 || -1));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Model Comparison</h1>
          <p className="page-subtitle">Side-by-side performance analysis of all trained architectures.</p>
        </div>
        {bestModel && (
          <div className="badge badge-success" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
            <Award size={14} /> Best: {bestModel}
          </div>
        )}
      </div>

      {/* ─── Model Cards ────────────────────────────────────────── */}
      <div className="grid-cols-3">
        {ranked.map((m, i) => (
          <div key={m.name} className={`card model-card ${m.name === bestModel ? 'best' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {m.status === 'available' && (
                  <div className={`model-rank ${rankColors[i] || 'bronze'}`}>
                    {i === 0 ? <Award size={14} /> : `#${i + 1}`}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{m.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {m.status === 'available' ? 'Trained & Evaluated' : 'Not Trained'}
                  </div>
                </div>
              </div>
              {m.name === bestModel && (
                <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>PRODUCTION</span>
              )}
            </div>

            {m.status === 'available' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'R² Score', value: m.r2?.toFixed(6), best: m.name === bestModel },
                  { label: 'RMSE', value: m.rmse?.toFixed(6) },
                  { label: 'MAE', value: m.mae?.toFixed(6) },
                ].map((metric, j) => (
                  <div key={j}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>{metric.label}</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: metric.best ? 'var(--status-success)' : 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                        {metric.value || '—'}
                      </span>
                    </div>
                    {j === 0 && m.r2 && (
                      <div className="progress-bar">
                        <div className="progress-fill" style={{
                          width: `${(m.r2 / maxR2) * 100}%`,
                          background: modelColors[m.name] || 'var(--accent-primary)'
                        }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <AlertCircle size={28} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {m.message || 'Model not yet trained'}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-placeholder)', marginTop: 4 }}>
                  Trigger retraining from Settings to generate data.
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ─── Charts Row ────────────────────────────────────────── */}
      {availableModels.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
          {/* Grouped Bar Chart */}
          <div className="card" style={{ minHeight: 340 }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} color="var(--accent-primary)" />
              Metric Comparison
            </h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 5, right: 30, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="metric" tick={{ fill: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-md)', fontSize: '0.82rem' }}
                    formatter={(val) => [typeof val === 'number' ? val.toFixed(4) : val]}
                  />
                  {availableModels.map(m => (
                    <Bar key={m.name} dataKey={m.name} fill={modelColors[m.name] || '#6B7280'} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Radar Chart */}
          <div className="card" style={{ minHeight: 340 }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 16 }}>
              Multi-Dimensional Comparison
            </h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="var(--border-light)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <PolarRadiusAxis tick={false} domain={[0, 100]} />
                  {availableModels.map(m => (
                    <Radar
                      key={m.name}
                      name={m.name}
                      dataKey={m.name}
                      stroke={modelColors[m.name]}
                      fill={modelColors[m.name]}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
