import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Cpu, Zap, Info, Loader } from 'lucide-react';
import { fetchShapSummary } from '../api';
import LoadingState from './LoadingState';

export default function ShapExplainer() {
  const [shapData, setShapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchShapSummary();
        if (data.error) { setError(data.error); }
        else { setShapData(data); }
      } catch (e) {
        setError('Failed to compute SHAP values');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingState type="chart" />;

  if (error) return (
    <div className="animate-fade-in">
      <div className="page-header"><div><h1>SHAP Explainability</h1>
        <p className="page-subtitle">Model explanation using SHAP values</p></div></div>
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <Loader size={24} color="var(--text-muted)" style={{ marginBottom: 12 }} />
        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        <p style={{ color: 'var(--text-placeholder)', fontSize: '0.8rem' }}>SHAP computation requires a loaded model with sufficient data.</p>
      </div>
    </div>
  );

  const chartData = (shapData?.shap_importance || []).slice(0, 12).map(item => ({
    feature: item.feature.replace(/_/g, ' ').replace(/lag/g, 'Lag '),
    value: item.mean_abs_shap,
    percentage: item.percentage,
    fullName: item.feature
  }));

  const colors = ['#6366F1', '#8B5CF6', '#A78BFA', '#C4B5FD', '#818CF8', '#7C3AED',
                  '#6D28D9', '#5B21B6', '#4C1D95', '#4338CA', '#3730A3', '#312E81'];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>SHAP Explainability</h1>
          <p className="page-subtitle">Global feature importance measured by SHAP values — how each feature impacts predictions.</p>
        </div>
        <div className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={14} /> {shapData?.method || 'TreeExplainer'}
        </div>
      </div>

      {/* Stats */}
      <div className="grid-cols-4" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="metric-title"><Zap size={14} /> Model Type</div>
          <div className="metric-value" style={{ fontSize: '1rem' }}>{shapData?.model_type || '—'}</div>
        </div>
        <div className="card">
          <div className="metric-title"><Info size={14} /> Sample Size</div>
          <div className="metric-value" style={{ fontSize: '1rem' }}>{shapData?.sample_size || '—'}</div>
        </div>
        <div className="card">
          <div className="metric-title"><Cpu size={14} /> Total Features</div>
          <div className="metric-value" style={{ fontSize: '1rem' }}>{shapData?.total_features || '—'}</div>
        </div>
        <div className="card">
          <div className="metric-title"><Zap size={14} /> Top Driver</div>
          <div className="metric-value" style={{ fontSize: '0.9rem' }}>
            {chartData[0]?.feature || '—'}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} color="var(--accent-primary)" />
          Global SHAP Feature Importance
        </h3>
        <div style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-light)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
              <YAxis type="category" dataKey="feature" tick={{ fill: 'var(--text-main)', fontSize: 12 }} width={95} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-md)', fontSize: '0.85rem' }}
                formatter={(val, name, props) => [`${val.toFixed(4)} (${props.payload.percentage}%)`, 'Mean |SHAP|']}
              />
              <Bar dataKey="value" name="Mean |SHAP|" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top contributors table */}
      <div className="card section-gap" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 14 }}>Feature Contribution Breakdown</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th><th>Feature</th><th>Mean |SHAP|</th><th>Contribution %</th><th>Impact</th>
            </tr>
          </thead>
          <tbody>
            {chartData.slice(0, 10).map((item, i) => (
              <tr key={i}>
                <td><span className={`rank-badge rank-${i < 3 ? i + 1 : 'n'}`}>{i + 1}</span></td>
                <td style={{ fontWeight: 500 }}>{item.feature}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{item.value.toFixed(4)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar-sm"><div style={{ width: `${item.percentage}%`, background: colors[i % colors.length] }} /></div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{item.percentage}%</span>
                  </div>
                </td>
                <td><span className={`badge ${item.percentage > 15 ? 'badge-warning' : 'badge-info'}`}>{item.percentage > 15 ? 'High' : 'Normal'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
