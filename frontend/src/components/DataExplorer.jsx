import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fetchDataStats } from '../api';
import { Database, BarChart2, Grid3X3, Table, CheckCircle, Search } from 'lucide-react';
import LoadingState from './LoadingState';
import EmptyState from './EmptyState';

function CorrelationHeatmap({ correlation }) {
  const features = Object.keys(correlation);
  if (features.length === 0) return null;

  const getColor = (val) => {
    const abs = Math.abs(val);
    if (abs > 0.8) return val > 0 ? '#6366F1' : '#EF4444';
    if (abs > 0.5) return val > 0 ? '#818CF8' : '#F87171';
    if (abs > 0.3) return val > 0 ? '#C4B5FD' : '#FCA5A5';
    return '#F3F4F6';
  };

  const getTextColor = (val) => Math.abs(val) > 0.5 ? 'white' : 'var(--text-muted)';

  const size = features.length;

  return (
    <div>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${size}, 1fr)`, gap: 2, marginBottom: 2 }}>
        <div />
        {features.map(f => (
          <div key={f} className="heatmap-label" style={{ textAlign: 'center', fontSize: '0.6rem', transform: 'rotate(-35deg)', transformOrigin: 'center', height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            {f.replace(/_/g, ' ').slice(0, 12)}
          </div>
        ))}
      </div>
      {/* Rows */}
      {features.map(rowF => (
        <div key={rowF} style={{ display: 'grid', gridTemplateColumns: `100px repeat(${size}, 1fr)`, gap: 2, marginBottom: 2 }}>
          <div className="heatmap-label" style={{ display: 'flex', alignItems: 'center', fontSize: '0.65rem' }}>
            {rowF.replace(/_/g, ' ').slice(0, 14)}
          </div>
          {features.map(colF => {
            const val = correlation[rowF]?.[colF] ?? 0;
            return (
              <div
                key={colF}
                className="heatmap-cell"
                style={{ background: getColor(val), color: getTextColor(val) }}
                title={`${rowF} × ${colF}: ${val.toFixed(3)}`}
              >
                {Math.abs(val) > 0.3 ? val.toFixed(1) : ''}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function DataExplorer() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('distributions');
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchDataStats().then(res => {
      if (res && !res.error) {
        setStats(res);
        // Default: select first 6 features
        const dists = Object.keys(res.distributions || {});
        setSelectedFeatures(dists.slice(0, 6));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const allFeatures = useMemo(() => Object.keys(stats?.distributions || {}), [stats]);

  const filteredFeatures = useMemo(() => {
    if (!searchQuery) return selectedFeatures;
    return allFeatures.filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, allFeatures, selectedFeatures]);

  const displayFeatures = searchQuery ? filteredFeatures : selectedFeatures;

  if (loading) return <LoadingState type="page" />;
  if (!stats || stats.error) return <EmptyState title="Data unavailable" description="Parquet data could not be loaded from the backend pipeline." />;

  const toggleFeature = (f) => {
    setSelectedFeatures(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Data Explorer</h1>
          <p className="page-subtitle">Interactive analytics on the processed Parquet dataset powering the ML pipeline.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-neutral">
            <Database size={12} /> {stats.total_rows?.toLocaleString()} rows
          </span>
          <span className="badge badge-neutral">
            {stats.numeric_features?.length || 0} features
          </span>
        </div>
      </div>

      {/* ─── Tabs ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <div className="tab-group">
          {[
            { id: 'distributions', label: 'Distributions', icon: BarChart2 },
            { id: 'correlations', label: 'Correlations', icon: Grid3X3 },
            { id: 'statistics', label: 'Statistics', icon: Table },
            { id: 'quality', label: 'Data Quality', icon: CheckCircle },
          ].map(tab => (
            <button
              key={tab.id}
              className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'distributions' && (
          <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Filter features..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)',
                fontFamily: 'var(--font-base)', fontSize: '0.85rem', outline: 'none',
                color: 'var(--text-main)', background: 'var(--bg-card)'
              }}
            />
          </div>
        )}
      </div>

      {/* ─── Feature Selector (Distributions tab) ─────────────── */}
      {activeTab === 'distributions' && !searchQuery && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {allFeatures.map(f => (
            <button
              key={f}
              className={`btn btn-sm ${selectedFeatures.includes(f) ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => toggleFeature(f)}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* ─── Distributions Tab ─────────────────────────────────── */}
      {activeTab === 'distributions' && (
        <div className="grid-cols-3">
          {displayFeatures.map(feature => {
            const dist = stats.distributions[feature];
            if (!dist) return null;
            const maxCount = Math.max(...dist.counts);
            return (
              <div key={feature} className="card" style={{ padding: 20 }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 14, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                  {feature.replace(/_/g, ' ')}
                </h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: 70, gap: 2 }}>
                  {dist.counts.map((c, i) => (
                    <div key={i} style={{
                      flex: 1,
                      background: `hsl(239, 84%, ${70 - (c / maxCount) * 30}%)`,
                      height: `${Math.max(3, (c / maxCount) * 100)}%`,
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.3s ease'
                    }} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  <span>{dist.bins[0].toFixed(2)}</span>
                  <span>{dist.bins[dist.bins.length - 1].toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Correlations Tab ──────────────────────────────────── */}
      {activeTab === 'correlations' && (
        <div className="card">
          <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 20 }}>
            Feature Correlation Matrix
          </h3>
          {stats.correlation ? (
            <CorrelationHeatmap correlation={stats.correlation} />
          ) : (
            <EmptyState title="No correlation data" description="Correlation matrix not available." />
          )}
        </div>
      )}

      {/* ─── Statistics Tab ────────────────────────────────────── */}
      {activeTab === 'statistics' && stats.descriptive && (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Count</th>
                <th>Mean</th>
                <th>Std</th>
                <th>Min</th>
                <th>25%</th>
                <th>50%</th>
                <th>75%</th>
                <th>Max</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.descriptive).map(([feature, s]) => (
                <tr key={feature}>
                  <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{feature.replace(/_/g, ' ')}</td>
                  <td className="mono">{s.count}</td>
                  <td className="mono">{s.mean?.toFixed(3)}</td>
                  <td className="mono">{s.std?.toFixed(3)}</td>
                  <td className="mono">{s.min?.toFixed(3)}</td>
                  <td className="mono">{s['25%']?.toFixed(3)}</td>
                  <td className="mono">{s['50%']?.toFixed(3)}</td>
                  <td className="mono">{s['75%']?.toFixed(3)}</td>
                  <td className="mono">{s.max?.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Data Quality Tab ──────────────────────────────────── */}
      {activeTab === 'quality' && stats.missing_values && (
        <div className="card">
          <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 20 }}>Missing Values Report</h3>
          <div className="grid-cols-2" style={{ gap: 12 }}>
            {Object.entries(stats.missing_values).map(([feature, info]) => {
              const pct = info.percentage;
              const completeness = 100 - pct;
              return (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)' }}>
                    {feature.replace(/_/g, ' ')}
                  </span>
                  <div style={{ width: 120 }}>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{
                        width: `${completeness}%`,
                        background: completeness === 100 ? 'var(--status-success)' : completeness > 90 ? 'var(--status-warning)' : 'var(--status-error)'
                      }} />
                    </div>
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: completeness === 100 ? 'var(--status-success)' : 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>
                    {completeness.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
