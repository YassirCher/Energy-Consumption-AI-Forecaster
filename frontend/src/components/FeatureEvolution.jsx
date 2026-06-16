import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Activity, Layers } from 'lucide-react';
import { fetchExplainHistory } from '../api';
import LoadingState from './LoadingState';
import EmptyState from './EmptyState';

const COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444', '#84CC16'];

export default function FeatureEvolution() {
  const [snapshots, setSnapshots] = useState([]);
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [allFeatures, setAllFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('trend'); // 'trend' | 'compare'

  useEffect(() => {
    fetchExplainHistory().then(res => {
      const snaps = res.snapshots || [];
      setSnapshots(snaps);

      // Collect all unique features across snapshots
      const featureSet = new Set();
      snaps.forEach(s => {
        (s.importances || []).forEach(imp => featureSet.add(imp.feature));
      });
      const features = Array.from(featureSet);
      setAllFeatures(features);
      // Default select top 5
      setSelectedFeatures(features.slice(0, 5));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState type="page" />;

  // Build chart data: each snapshot becomes a data point, with feature importances as values
  const chartData = snapshots.map((snap, i) => {
    const point = {
      index: i + 1,
      run: snap.run_name?.replace('Self-Healing-DriftTriggered-Run-1-step-', '').replace('Self-Healing-Training-1-step-', '') || `Run ${i + 1}`,
      model: snap.model_type,
      r2: snap.r2,
      timestamp: snap.timestamp
    };
    (snap.importances || []).forEach(imp => {
      point[imp.feature] = Number((imp.importance * 100).toFixed(2));
    });
    return point;
  });

  // Build comparison data between first and last snapshot
  const comparisonData = [];
  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const firstMap = {};
    const lastMap = {};
    (first.importances || []).forEach(i => { firstMap[i.feature] = i.importance * 100; });
    (last.importances || []).forEach(i => { lastMap[i.feature] = i.importance * 100; });

    allFeatures.forEach(f => {
      if (firstMap[f] !== undefined || lastMap[f] !== undefined) {
        const before = firstMap[f] || 0;
        const after = lastMap[f] || 0;
        comparisonData.push({
          feature: f.replace(/_/g, ' '),
          fullName: f,
          before: Number(before.toFixed(2)),
          after: Number(after.toFixed(2)),
          delta: Number((after - before).toFixed(2))
        });
      }
    });
    comparisonData.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  const toggleFeature = (f) => {
    setSelectedFeatures(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Feature Evolution</h1>
          <p className="page-subtitle">Track feature importance changes across training runs and detect instability patterns.</p>
        </div>
        <div className="tab-group">
          <button className={`tab-item ${viewMode === 'trend' ? 'active' : ''}`} onClick={() => setViewMode('trend')}>
            Trend View
          </button>
          <button className={`tab-item ${viewMode === 'compare' ? 'active' : ''}`} onClick={() => setViewMode('compare')}>
            Before vs After
          </button>
        </div>
      </div>

      {snapshots.length < 2 ? (
        <EmptyState
          icon={Layers}
          title="Insufficient Training History"
          description="Feature evolution requires at least 2 training runs. Trigger retraining to generate comparison data."
        />
      ) : viewMode === 'trend' ? (
        <>
          {/* Feature Selector */}
          <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Features to Track
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allFeatures.map(f => (
                <button
                  key={f}
                  className={`btn btn-sm ${selectedFeatures.includes(f) ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => toggleFeature(f)}
                  style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                >
                  {f.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Evolution Chart */}
          <div className="card" style={{ minHeight: 480 }}>
            <h3 style={{ marginBottom: 16, fontSize: '0.92rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} color="var(--accent-primary)" /> Importance Evolution (% variance)
            </h3>
            <div style={{ height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="run" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} label={{ value: 'Importance %', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 11 } }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-md)', fontSize: '0.82rem' }}
                    formatter={(val, name) => [`${val}%`, name.replace(/_/g, ' ')]}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                  {selectedFeatures.map((f, i) => (
                    <Line
                      key={f}
                      type="monotone"
                      dataKey={f}
                      name={f.replace(/_/g, ' ')}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        /* Before vs After Comparison */
        <>
          <div className="stats-banner" style={{ marginBottom: 20 }}>
            <div className="stats-banner-item">
              <div className="stats-banner-value" style={{ color: 'var(--text-muted)' }}>{snapshots[0]?.model_type}</div>
              <div className="stats-banner-label">First Training</div>
            </div>
            <div className="stats-banner-item">
              <div className="stats-banner-value" style={{ color: 'var(--accent-primary)' }}>→</div>
              <div className="stats-banner-label">{snapshots.length} Runs</div>
            </div>
            <div className="stats-banner-item">
              <div className="stats-banner-value" style={{ color: 'var(--accent-primary)' }}>{snapshots[snapshots.length - 1]?.model_type}</div>
              <div className="stats-banner-label">Latest Training</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: '0.92rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color="var(--accent-primary)" /> Feature Importance Changes
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {comparisonData.slice(0, 12).map((item, i) => {
                const maxVal = Math.max(...comparisonData.map(d => Math.max(d.before, d.after)));
                return (
                  <div key={i} className="evolution-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ width: 160, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {item.feature}
                    </div>
                    <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <div style={{ width: '45%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Before</span>
                          <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{item.before.toFixed(1)}%</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${(item.before / maxVal) * 100}%`, background: 'var(--text-muted)' }} />
                        </div>
                      </div>
                      <div style={{ width: '45%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)' }}>After</span>
                          <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{item.after.toFixed(1)}%</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${(item.after / maxVal) * 100}%`, background: 'var(--accent-primary)' }} />
                        </div>
                      </div>
                    </div>
                    <span className={`badge ${item.delta > 0 ? 'badge-success' : item.delta < 0 ? 'badge-error' : 'badge-neutral'}`} style={{ fontSize: '0.65rem', minWidth: 60, justifyContent: 'center' }}>
                      {item.delta > 0 ? '↑' : item.delta < 0 ? '↓' : '—'} {Math.abs(item.delta).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
