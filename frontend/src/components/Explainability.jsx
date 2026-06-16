import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fetchExplainability } from '../api';
import { Lightbulb, Award, TrendingUp, Zap } from 'lucide-react';
import LoadingState from './LoadingState';

const GRADIENT_COLORS = ['#6366F1', '#7C3AED', '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE', '#E0E7FF', '#EEF2FF'];

export default function Explainability({ insights }) {
  const [importances, setImportances] = useState([]);
  const [insight, setInsight] = useState('');
  const [topDrivers, setTopDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExplainability().then(res => {
      const charted = (res.importances || []).map(i => ({
        name: i.feature.replace(/_lag/g, ' L').replace(/_/g, ' '),
        fullName: i.feature,
        Weight: Number((i.importance * 100).toFixed(2))
      }));
      setImportances(charted.slice(0, 10));
      setInsight(res.insight || '');
      setTopDrivers(res.top_drivers || []);
      setLoading(false);
    }).catch(() => {
      setInsight('Model interpretability data is being computed.');
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingState type="page" />;

  const aiInsights = insights?.filter(i => i.type === 'features' || i.type === 'performance') || [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Model Explainability</h1>
          <p className="page-subtitle">Feature importance analysis and AI-driven interpretability insights.</p>
        </div>
      </div>

      {/* ─── Top 3 Drivers ────────────────────────────────────── */}
      {topDrivers.length > 0 && (
        <div className="grid-cols-3" style={{ marginBottom: 24 }}>
          {topDrivers.map((d, i) => (
            <div key={i} className={`card ${i === 0 ? 'model-card best' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <div className={`model-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze'}`}>
                {i === 0 ? <Award size={15} /> : `#${i + 1}`}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {i === 0 ? 'Top Driver' : `Rank #${i + 1}`}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                  {d.feature.replace(/_/g, ' ')}
                </div>
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                {(d.importance * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Chart + Insights ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div className="card" style={{ minHeight: 440 }}>
          <h3 style={{ marginBottom: 16, fontSize: '0.92rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color="var(--accent-primary)" />
            Global Feature Importances (%)
          </h3>
          <div style={{ height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={importances} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="var(--border-light)" />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis
                  dataKey="name" type="category"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}
                  width={130}
                />
                <Tooltip
                  cursor={{ fill: 'var(--bg-muted)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-md)', fontSize: '0.82rem' }}
                  formatter={(val) => [`${val}%`, 'Importance']}
                />
                <Bar dataKey="Weight" radius={[0, 6, 6, 0]}>
                  {importances.map((_, i) => (
                    <Cell key={i} fill={GRADIENT_COLORS[i] || GRADIENT_COLORS[7]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* AI Synthesis Card */}
          <div className="card card-inset" style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
              <div style={{ padding: 8, background: 'var(--accent-gradient)', color: 'white', borderRadius: 8 }}>
                <Lightbulb size={20} />
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>AI Synthesis</h3>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
              {insight}
            </p>

            {aiInsights.length > 0 && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '14px 0' }} />
                {aiInsights.slice(0, 2).map((ins, i) => (
                  <div key={i} className="insight-card" style={{ marginBottom: 8, padding: 12 }}>
                    <div className={`insight-icon ${ins.severity}`} style={{ width: 30, height: 30 }}>
                      <Zap size={14} />
                    </div>
                    <div>
                      <div className="insight-title" style={{ fontSize: '0.82rem' }}>{ins.title}</div>
                      <div className="insight-text" style={{ fontSize: '0.78rem' }}>{ins.message}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
