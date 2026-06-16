import React, { useState } from 'react';
import { FileText, Printer, Activity, ShieldCheck, TrendingUp, AlertTriangle, Zap, Clock } from 'lucide-react';
import { generateReport } from '../api';
import LoadingState from './LoadingState';

export default function ReportViewer() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try { setReport(await generateReport()); } catch {}
    setLoading(false);
  };

  const fmt = (ts) => {
    if (!ts) return '—';
    try { return new Date(typeof ts === 'number' ? ts : ts).toLocaleString(); } catch { return ts; }
  };

  const Section = ({ icon: Icon, color, title, children }) => (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={18} color={color} /> {title}
      </h3>
      {children}
    </div>
  );

  const StatBox = ({ items }) => (
    <div className="grid-cols-4" style={{ gap: 16 }}>
      {items.map((item, i) => (
        <div key={i} className="card card-inset" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: item.color || 'var(--text-main)' }}>{item.value}</div>
        </div>
      ))}
    </div>
  );

  if (!report && !loading) return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h1>System Report</h1><p className="page-subtitle">Generate a comprehensive performance report.</p></div>
        <button className="btn btn-primary" onClick={handleGenerate}><FileText size={15} /> Generate Report</button>
      </div>
      <div className="card empty-state" style={{ padding: 60 }}>
        <div className="empty-state-icon"><FileText size={24} /></div>
        <div className="empty-state-title">No Report Generated</div>
        <div className="empty-state-text">Click "Generate Report" to create a comprehensive system report.</div>
      </div>
    </div>
  );

  if (loading) return <div className="animate-fade-in"><div className="page-header"><div><h1>System Report</h1></div></div><LoadingState type="page" /></div>;

  const es = report.sections.executive_summary || {};
  const mp = report.sections.model_performance || {};
  const ds = report.sections.drift_status || {};
  const ai = report.sections.ai_insights || [];
  const ev = report.sections.recent_events?.events || [];
  const ps = report.sections.prediction_summary || {};

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h1>System Report</h1><p className="page-subtitle">Generated: {fmt(report.generated_at)}</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer size={14} /> Print</button>
          <button className="btn btn-primary btn-sm" onClick={handleGenerate}><FileText size={14} /> Regenerate</button>
        </div>
      </div>

      <div className="card card-gradient" style={{ marginBottom: 20, padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 4 }}>{report.title}</h2>
          <div style={{ opacity: 0.8, fontSize: '0.85rem' }}>Active: {es.active_model?.replace('EnergyForecaster_', '')}</div>
        </div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: '2rem', fontWeight: 800 }}>{es.health_score || '—'}</div><div style={{ fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase' }}>Health</div></div>
      </div>

      <Section icon={Activity} color="var(--accent-primary)" title="Executive Summary">
        <StatBox items={[
          { label: 'Status', value: es.system_status || '—', color: 'var(--status-success)' },
          { label: 'Model', value: es.active_model?.replace('EnergyForecaster_', '') || '—', color: 'var(--accent-primary)' },
          { label: 'Health', value: es.health_score || '—', color: 'var(--status-success)' },
          { label: 'P99 Latency', value: `${es.latency_p99_ms || 0}ms` },
        ]} />
      </Section>

      <Section icon={ShieldCheck} color="var(--accent-primary)" title="Model Performance">
        <div className="grid-cols-3" style={{ gap: 16 }}>
          {[{ l: 'R²', v: mp.current_metrics?.R2?.toFixed(4) }, { l: 'RMSE', v: mp.current_metrics?.RMSE?.toFixed(4) }, { l: 'Data Version', v: mp.current_metrics?.Data_Version?.split('_')[0] }].map((x, i) => (
            <div key={i}><div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{x.l}</div><div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{x.v || '—'}</div></div>
          ))}
        </div>
        {mp.feature_importances?.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {mp.feature_importances.slice(0, 5).map((f, i) => <span key={i} className="badge badge-info" style={{ fontSize: '0.72rem' }}>{f.feature.replace(/_/g, ' ')} — {(f.importance * 100).toFixed(1)}%</span>)}
          </div>
        )}
      </Section>

      <Section icon={AlertTriangle} color="var(--status-warning)" title="Drift Status">
        <StatBox items={[
          { label: 'Observations', value: ds.total_observations || 0 },
          { label: 'Breaches', value: ds.recent_breaches || 0, color: ds.recent_breaches > 0 ? 'var(--status-error)' : 'var(--status-success)' },
          { label: 'Avg JS Div', value: ds.average_js_divergence?.toFixed(4) || '—' },
          { label: 'Threshold', value: ds.threshold || 0.15 },
        ]} />
      </Section>

      {ai.length > 0 && (
        <Section icon={Zap} color="var(--accent-primary)" title="AI Insights">
          {ai.map((ins, i) => (
            <div key={i} className="insight-card" style={{ marginBottom: 8 }}>
              <div className={`insight-icon ${ins.severity}`}>{ins.severity === 'critical' ? <AlertTriangle size={16} /> : <Activity size={16} />}</div>
              <div><div className="insight-title">{ins.title}</div><div className="insight-text">{ins.message}</div></div>
            </div>
          ))}
        </Section>
      )}

      {ev.length > 0 && (
        <Section icon={Clock} color="var(--text-muted)" title="Recent Events">
          <table className="data-table"><thead><tr><th>Time</th><th>Event</th><th>Description</th><th>User</th></tr></thead>
            <tbody>{ev.slice(0, 8).map((e, i) => <tr key={i}><td className="mono">{fmt(e.timestamp)}</td><td><span className="badge badge-neutral">{e.type}</span></td><td>{e.description}</td><td>{e.user || 'system'}</td></tr>)}</tbody>
          </table>
        </Section>
      )}

      {ps.total_predictions > 0 && (
        <Section icon={TrendingUp} color="var(--accent-primary)" title="Prediction Summary">
          <StatBox items={[
            { label: 'Total', value: ps.total_predictions },
            { label: 'Average', value: ps.avg_prediction?.toFixed(4) || '—' },
            { label: 'Std Dev', value: ps.std_prediction?.toFixed(4) || '—' },
            { label: 'Anomalies', value: ps.anomaly_count || 0, color: ps.anomaly_count > 0 ? 'var(--status-error)' : 'var(--status-success)' },
          ]} />
        </Section>
      )}
    </div>
  );
}
