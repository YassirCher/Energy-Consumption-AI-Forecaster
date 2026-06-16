import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from 'recharts';
import { GitCompareArrows, Trophy, TrendingUp, Activity, Zap } from 'lucide-react';
import { fetchABTest } from '../api';
import LoadingState from './LoadingState';

export default function ABTesting() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState([0, 1]);

  useEffect(() => {
    fetchABTest().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState type="chart" />;
  if (!data || !data.models || data.models.length < 2) return (
    <div className="animate-fade-in">
      <div className="page-header"><div><h1>A/B Model Testing</h1></div></div>
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        At least 2 trained models are needed for A/B comparison.
      </div>
    </div>
  );

  const models = data.models;
  const a = models[selectedPair[0]];
  const b = models[selectedPair[1]];
  const comp = data.comparison;

  const barData = [
    { metric: 'R²', [a.name]: a.r2, [b.name]: b.r2 },
    { metric: 'RMSE', [a.name]: a.rmse, [b.name]: b.rmse },
    { metric: 'MAE', [a.name]: a.mae, [b.name]: b.mae },
  ].filter(d => d[a.name] != null && d[b.name] != null);

  const maxR2 = Math.max(...models.map(m => m.r2 || 0));
  const maxRMSE = Math.max(...models.map(m => m.rmse || 0));
  const maxMAE = Math.max(...models.map(m => m.mae || 0));
  const radarData = [
    { metric: 'Accuracy', [a.name]: ((a.r2 || 0) / Math.max(maxR2, 0.001)) * 100, [b.name]: ((b.r2 || 0) / Math.max(maxR2, 0.001)) * 100 },
    { metric: 'Precision', [a.name]: (1 - (a.rmse || 0) / Math.max(maxRMSE, 0.001)) * 100, [b.name]: (1 - (b.rmse || 0) / Math.max(maxRMSE, 0.001)) * 100 },
    { metric: 'Efficiency', [a.name]: (1 - (a.mae || 0) / Math.max(maxMAE, 0.001)) * 100, [b.name]: (1 - (b.mae || 0) / Math.max(maxMAE, 0.001)) * 100 },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>A/B Model Testing</h1>
          <p className="page-subtitle">Head-to-head model comparison and performance analysis.</p>
        </div>
        {comp && <div className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Trophy size={14} /> Winner: {comp.winner}
        </div>}
      </div>

      {/* Model selector */}
      <div className="grid-cols-2" style={{ marginBottom: 20 }}>
        {[0, 1].map(idx => (
          <div key={idx} className={`card ${idx === 0 ? 'ab-card-a' : 'ab-card-b'}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="badge" style={{ background: idx === 0 ? 'var(--accent-primary)' : 'var(--chart-3)', color: 'white' }}>
                Model {idx === 0 ? 'A' : 'B'}
              </span>
              <select className="select-control" value={selectedPair[idx]}
                onChange={e => { const np = [...selectedPair]; np[idx] = +e.target.value; setSelectedPair(np); }}>
                {models.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
              </select>
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>
              {models[selectedPair[idx]]?.name}
              {comp && models[selectedPair[idx]]?.name === comp.winner && (
                <Trophy size={18} color="var(--status-warning)" style={{ marginLeft: 8, verticalAlign: 'middle' }} />
              )}
            </div>
            <div className="grid-cols-3" style={{ gap: 10, marginTop: 12 }}>
              <div><div className="metric-title" style={{ fontSize: '0.72rem' }}>R²</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{models[selectedPair[idx]]?.r2?.toFixed(4) || '—'}</div></div>
              <div><div className="metric-title" style={{ fontSize: '0.72rem' }}>RMSE</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{models[selectedPair[idx]]?.rmse?.toFixed(4) || '—'}</div></div>
              <div><div className="metric-title" style={{ fontSize: '0.72rem' }}>MAE</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{models[selectedPair[idx]]?.mae?.toFixed(4) || '—'}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison diff */}
      {comp && (
        <div className="card" style={{ padding: '16px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <div className="metric-title">R² Difference</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {comp.r2_diff != null ? (comp.r2_diff > 0 ? '+' : '') + comp.r2_diff.toFixed(6) : '—'}
              </div>
            </div>
            <div>
              <div className="metric-title">RMSE Difference</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--chart-3)', fontFamily: 'var(--font-mono)' }}>
                {comp.rmse_diff != null ? (comp.rmse_diff > 0 ? '+' : '') + comp.rmse_diff.toFixed(6) : '—'}
              </div>
            </div>
            <div>
              <div className="metric-title">Advantage</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-success)', fontFamily: 'var(--font-mono)' }}>
                {comp.advantage_pct != null ? `${comp.advantage_pct.toFixed(3)}%` : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid-cols-2">
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} color="var(--accent-primary)" /> Metric Comparison
          </h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="metric" tick={{ fill: 'var(--text-main)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', fontSize: '0.85rem' }} />
                <Bar dataKey={a.name} fill="var(--accent-primary)" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Bar dataKey={b.name} fill="var(--chart-3)" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="var(--accent-primary)" /> Radar Analysis
          </h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border-light)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-main)', fontSize: 12 }} />
                <PolarRadiusAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Radar name={a.name} dataKey={a.name} stroke="var(--accent-primary)" fill="var(--accent-primary)" fillOpacity={0.2} />
                <Radar name={b.name} dataKey={b.name} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.2} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
