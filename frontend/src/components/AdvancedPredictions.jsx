import React, { useState, useEffect, useRef } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot } from 'recharts';
import { AlertTriangle, Eye, EyeOff, TrendingUp, Zap, BarChart2 } from 'lucide-react';
import api from '../api';

export default function AdvancedPredictions() {
  const [data, setData] = useState([]);
  const [horizonView, setHorizonView] = useState('1_step');
  const [showConfidence, setShowConfidence] = useState(true);
  const [showAnomalies, setShowAnomalies] = useState(true);
  const [stats, setStats] = useState({ anomalyCount: 0, avgError: 0, latest: 0 });
  const tickRef = useRef(0);

  useEffect(() => {
    let running = true;

    const fetchPrediction = async () => {
      if (!running) return;
      try {
        tickRef.current += 1;
        const t = tickRef.current;
        const hour = (t * 0.15) % (2 * Math.PI);

        const payload = { features: [{
          Global_intensity: 4.5 + Math.sin(hour) * 2 + Math.random() * 0.3,
          Global_reactive_power: 0.1 + Math.random() * 0.05,
          Voltage: 239 + Math.random() * 3,
          Sub_metering_1: Math.random() * 2,
          Sub_metering_2: 1 + Math.random(),
          Sub_metering_3: 16 + Math.random() * 3,
          Global_active_power_lag1h: 1.1 + Math.sin(hour - 0.5) * 0.3,
          Global_active_power_lag24h: 1.05 + Math.sin(hour - 1) * 0.2,
          Global_intensity_lag1h: 4.3 + Math.sin(hour - 0.5),
          Global_intensity_lag24h: 4.2 + Math.sin(hour - 1),
          Sub_metering_3_lag1h: 17, Sub_metering_3_lag24h: 17,
          Sub_metering_2_lag1h: 1, Sub_metering_2_lag24h: 1,
          Sub_metering_1_lag1h: 0, Sub_metering_1_lag24h: 0,
          Global_reactive_power_lag1h: 0.1, Global_reactive_power_lag24h: 0.1,
          Voltage_lag1h: 240, Voltage_lag24h: 240,
          hour_sin: Math.sin(hour), hour_cos: Math.cos(hour),
          dow_sin: 0.43, dow_cos: 0.9
        }]};

        const response = await api.post('/predict', payload);
        const preds = response.data.predictions[0];
        const actualSim = preds['1_step'] + (Math.random() - 0.5) * 0.08;
        const isAnomaly = preds.anomaly?.is_anomaly || false;

        setData(prev => {
          const arr = [...prev, {
            time: t,
            actual: Number(actualSim.toFixed(4)),
            '1_step': preds['1_step'],
            '1h_horizon': preds['1h_horizon'],
            '24h_horizon': preds['24h_horizon'],
            conf_interval: [preds.conf_lower, preds.conf_upper],
            isAnomaly,
            zScore: preds.anomaly?.z_score || 0
          }];
          if (arr.length > 50) arr.shift();

          // Update stats
          const anomalies = arr.filter(d => d.isAnomaly).length;
          const errors = arr.map(d => Math.abs(d.actual - d['1_step']));
          const avgErr = errors.reduce((a, b) => a + b, 0) / errors.length;

          setStats({
            anomalyCount: anomalies,
            avgError: avgErr.toFixed(4),
            latest: preds['1_step'].toFixed(4)
          });

          return arr;
        });
      } catch { /* retry on next tick */ }
    };

    const interval = setInterval(fetchPrediction, 2200);
    fetchPrediction();

    return () => { running = false; clearInterval(interval); };
  }, []);

  const anomalyPoints = showAnomalies ? data.filter(d => d.isAnomaly) : [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Real-Time Forecasting</h1>
          <p className="page-subtitle">Multi-horizon inference with anomaly detection and confidence intervals.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="select-control"
            value={horizonView}
            onChange={e => setHorizonView(e.target.value)}
          >
            <option value="1_step">T+1 min (Standard)</option>
            <option value="1h_horizon">T+1 hour</option>
            <option value="24h_horizon">T+24 hours</option>
          </select>

          <button
            className={`btn btn-sm ${showConfidence ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowConfidence(!showConfidence)}
            title="Toggle confidence bands"
          >
            {showConfidence ? <Eye size={14} /> : <EyeOff size={14} />}
            CI
          </button>

          <button
            className={`btn btn-sm ${showAnomalies ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setShowAnomalies(!showAnomalies)}
            title="Toggle anomaly markers"
          >
            <AlertTriangle size={14} />
            {stats.anomalyCount}
          </button>

          <div className="live-badge">
            <div className="live-dot" /> Streaming
          </div>
        </div>
      </div>

      {/* ─── Stats Row ─────────────────────────────────────────── */}
      <div className="stats-banner">
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--accent-primary)' }}>
            <TrendingUp size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {stats.latest}
          </div>
          <div className="stats-banner-label">Latest Prediction (kW)</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--text-main)' }}>{stats.avgError}</div>
          <div className="stats-banner-label">Avg Absolute Error</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: stats.anomalyCount > 0 ? 'var(--status-error)' : 'var(--status-success)' }}>
            {stats.anomalyCount}
          </div>
          <div className="stats-banner-label">Anomalies Detected</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--text-muted)' }}>
            <BarChart2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {data.length}
          </div>
          <div className="stats-banner-label">Window Size</div>
        </div>
      </div>

      {/* ─── Chart ─────────────────────────────────────────────── */}
      <div className="card" style={{ height: 'calc(100vh - 340px)', minHeight: 360, padding: '16px 20px 12px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="confGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
            <XAxis dataKey="time" hide />
            <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)', fontSize: '0.82rem' }}
              formatter={(val, name) => {
                if (Array.isArray(val)) return [`${val[0].toFixed(3)} — ${val[1].toFixed(3)}`, 'Confidence Band'];
                if (typeof val === 'number') return [val.toFixed(4), name];
                return [val, name];
              }}
            />
            <Legend verticalAlign="top" height={32} iconSize={10} wrapperStyle={{ fontSize: '0.78rem' }} />

            {showConfidence && (
              <Area
                type="monotone" dataKey="conf_interval" name="Confidence Interval"
                fill="url(#confGradient)" stroke="none" fillOpacity={1}
                isAnimationActive={false}
              />
            )}

            <Line
              type="monotone" dataKey="actual" name="Simulated Actual"
              stroke="var(--text-muted)" strokeWidth={1.5} dot={false}
              strokeOpacity={0.5} strokeDasharray="4 4" isAnimationActive={false}
            />

            <Line
              type="monotone" dataKey={horizonView}
              name={`Predicted (${horizonView === '1_step' ? 'T+1' : horizonView === '1h_horizon' ? 'T+1h' : 'T+24h'})`}
              stroke="var(--accent-primary)" strokeWidth={2.5} dot={false}
              isAnimationActive={false}
            />

            {/* Anomaly markers */}
            {anomalyPoints.map((pt, i) => (
              <ReferenceDot
                key={i}
                x={pt.time} y={pt['1_step']}
                r={5}
                fill="var(--status-error)"
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
