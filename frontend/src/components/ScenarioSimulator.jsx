import React, { useState, useEffect, useCallback } from 'react';
import { Sliders, RefreshCw, TrendingUp, TrendingDown, Minus, ArrowRight, Zap } from 'lucide-react';
import { fetchSimulationDefaults, simulatePrediction } from '../api';
import LoadingState from './LoadingState';

export default function ScenarioSimulator() {
  const [features, setFeatures] = useState([]);
  const [values, setValues] = useState({});
  const [baseline, setBaseline] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchSimulationDefaults().then(res => {
      const feats = res.features || [];
      setFeatures(feats);
      const defaults = {};
      feats.forEach(f => { defaults[f.name] = f.default; });
      setValues(defaults);
      setBaseline(defaults);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleChange = useCallback((name, val) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) return;
    setValues(prev => {
      const next = { ...prev, [name]: numVal };
      setHasChanges(Object.keys(next).some(k => next[k] !== baseline[k]));
      return next;
    });
  }, [baseline]);

  const runSimulation = async () => {
    setSimulating(true);
    try {
      const modified = {};
      Object.keys(values).forEach(k => {
        if (values[k] !== baseline[k]) modified[k] = values[k];
      });
      const res = await simulatePrediction(baseline, modified);
      setResult(res);
    } catch (e) {
      console.warn('Simulation error:', e);
    }
    setSimulating(false);
  };

  const resetValues = () => {
    const defaults = {};
    features.forEach(f => { defaults[f.name] = f.default; });
    setValues(defaults);
    setHasChanges(false);
    setResult(null);
  };

  if (loading) return <LoadingState type="page" />;

  const primaryFeatures = features.filter(f => f.primary);
  const secondaryFeatures = features.filter(f => !f.primary);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Scenario Simulator</h1>
          <p className="page-subtitle">Interactive what-if analysis — modify features and see prediction impact in real-time.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={resetValues}>
            <RefreshCw size={14} /> Reset
          </button>
          <button
            className="btn btn-primary"
            onClick={runSimulation}
            disabled={!hasChanges || simulating}
          >
            {simulating ? (
              <><div className="loading-spinner" style={{ width: 14, height: 14 }} /> Simulating...</>
            ) : (
              <><Zap size={15} /> Run Simulation</>
            )}
          </button>
        </div>
      </div>

      {/* Result Panel */}
      {result && (
        <div className="simulation-result-panel animate-scale-in" style={{ marginBottom: 24 }}>
          <div className="grid-cols-3" style={{ gap: 16 }}>
            {/* Baseline */}
            <div className="card card-inset" style={{ textAlign: 'center' }}>
              <div className="metric-title" style={{ justifyContent: 'center' }}>
                <Minus size={14} /> Baseline Prediction
              </div>
              <div className="metric-value" style={{ fontSize: '1.8rem', color: 'var(--text-muted)' }}>
                {result.baseline['1_step'].toFixed(4)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-placeholder)', marginTop: 4 }}>kW</div>
            </div>

            {/* Delta */}
            <div className="card" style={{
              textAlign: 'center',
              background: result.delta.direction === 'increase'
                ? 'var(--status-error-bg)' : result.delta.direction === 'decrease'
                ? 'var(--status-success-bg)' : 'var(--bg-muted)',
              border: `1px solid ${result.delta.direction === 'increase'
                ? 'var(--status-error-border)' : result.delta.direction === 'decrease'
                ? 'var(--status-success-border)' : 'var(--border-light)'}`
            }}>
              <div className="metric-title" style={{ justifyContent: 'center' }}>
                {result.delta.direction === 'increase' ? <TrendingUp size={14} /> : result.delta.direction === 'decrease' ? <TrendingDown size={14} /> : <Minus size={14} />}
                Impact
              </div>
              <div className="metric-value" style={{
                fontSize: '1.8rem',
                color: result.delta.direction === 'increase' ? 'var(--status-error)' : result.delta.direction === 'decrease' ? 'var(--status-success)' : 'var(--text-main)'
              }}>
                {result.delta.direction === 'increase' ? '+' : ''}{result.delta.percentage.toFixed(2)}%
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Δ {result.delta['1_step'] > 0 ? '+' : ''}{result.delta['1_step'].toFixed(5)} kW
              </div>
            </div>

            {/* Simulated */}
            <div className="card" style={{ textAlign: 'center', background: 'var(--accent-primary-bg)', border: '1px solid var(--status-info-border)' }}>
              <div className="metric-title" style={{ justifyContent: 'center' }}>
                <Zap size={14} /> Simulated Prediction
              </div>
              <div className="metric-value" style={{ fontSize: '1.8rem', color: 'var(--accent-primary)' }}>
                {result.simulated['1_step'].toFixed(4)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-placeholder)', marginTop: 4 }}>kW</div>
            </div>
          </div>

          {/* Horizon comparison */}
          <div className="card" style={{ marginTop: 16, padding: '16px 24px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' }}>Multi-Horizon Impact</div>
            <div style={{ display: 'flex', gap: 32 }}>
              {[
                { label: 'T+1 min', base: result.baseline['1_step'], sim: result.simulated['1_step'] },
                { label: 'T+1 hour', base: result.baseline['1h_horizon'], sim: result.simulated['1h_horizon'] },
                { label: 'T+24 hours', base: result.baseline['24h_horizon'], sim: result.simulated['24h_horizon'] },
              ].map((h, i) => {
                const d = h.sim - h.base;
                const pct = h.base !== 0 ? (d / Math.abs(h.base) * 100) : 0;
                return (
                  <div key={i} style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>{h.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: 'var(--text-muted)' }}>{h.base.toFixed(4)}</span>
                      <ArrowRight size={14} color="var(--text-placeholder)" />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{h.sim.toFixed(4)}</span>
                      <span className={`badge ${d > 0 ? 'badge-error' : d < 0 ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.6rem' }}>
                        {d > 0 ? '+' : ''}{pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modified fields */}
          {result.modified_fields && result.modified_fields.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Modified:</span>
              {result.modified_fields.map(f => (
                <span key={f} className="badge badge-info" style={{ fontSize: '0.65rem' }}>{f.replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feature Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Primary Features */}
        <div className="card">
          <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={16} color="var(--accent-primary)" /> Primary Features
          </h3>
          {primaryFeatures.map(f => {
            const changed = values[f.name] !== f.default;
            return (
              <div key={f.name} className="simulator-control" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: changed ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                    {f.label}
                    {changed && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--accent-primary)' }}>●</span>}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      className="simulator-input"
                      value={values[f.name] ?? f.default}
                      onChange={e => handleChange(f.name, e.target.value)}
                      step={f.step}
                      min={f.min}
                      max={f.max}
                    />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 24 }}>{f.unit}</span>
                  </div>
                </div>
                <input
                  type="range"
                  className="simulator-slider"
                  value={values[f.name] ?? f.default}
                  onChange={e => handleChange(f.name, e.target.value)}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-placeholder)' }}>{f.min}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-placeholder)' }}>{f.max}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Secondary Features */}
        <div className="card">
          <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={16} color="var(--text-muted)" /> Lag Features
          </h3>
          {secondaryFeatures.map(f => {
            const changed = values[f.name] !== f.default;
            return (
              <div key={f.name} className="simulator-control" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: changed ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                    {f.label}
                    {changed && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--accent-primary)' }}>●</span>}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      className="simulator-input"
                      value={values[f.name] ?? f.default}
                      onChange={e => handleChange(f.name, e.target.value)}
                      step={f.step}
                      min={f.min}
                      max={f.max}
                    />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 24 }}>{f.unit}</span>
                  </div>
                </div>
                <input
                  type="range"
                  className="simulator-slider"
                  value={values[f.name] ?? f.default}
                  onChange={e => handleChange(f.name, e.target.value)}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-placeholder)' }}>{f.min}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-placeholder)' }}>{f.max}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
