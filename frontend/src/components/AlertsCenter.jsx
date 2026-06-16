import React, { useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, Info, Shield, RefreshCw, Filter } from 'lucide-react';
import EmptyState from './EmptyState';

export default function AlertsCenter({ alerts, events }) {
  const [filter, setFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('all');

  // Merge drift alerts and system alerts into a unified feed
  const unifiedAlerts = useMemo(() => {
    const items = [];

    // Drift alerts
    if (alerts?.drift_alerts) {
      alerts.drift_alerts.forEach(a => {
        items.push({
          id: `drift-${a.timestamp}`,
          type: 'drift',
          severity: a.severity || 'INFO',
          title: a.is_breach ? 'Drift Threshold Breached' : 'Drift Check Passed',
          description: `JS Divergence: ${a.js_divergence?.toFixed(4)} (threshold: ${a.threshold})`,
          detail: a.consecutive > 0 ? `${a.consecutive} consecutive breach${a.consecutive > 1 ? 'es' : ''}` : null,
          timestamp: a.timestamp,
          raw: a
        });
      });
    }

    // System events as alerts
    if (alerts?.system_alerts) {
      alerts.system_alerts.forEach(a => {
        items.push({
          id: `sys-${a.timestamp}`,
          type: 'system',
          severity: a.severity || 'INFO',
          title: a.event_type || 'System Event',
          description: a.description || '',
          detail: a.model ? `Model: ${a.model}` : null,
          timestamp: a.timestamp,
          raw: a
        });
      });
    }

    // Retraining events from full events list
    if (events) {
      events.forEach(ev => {
        if (ev.type?.includes('Retrain') || ev.type?.includes('Promoted') || ev.type?.includes('Rollback')) {
          const exists = items.some(i => i.timestamp === ev.timestamp && i.title === ev.type);
          if (!exists) {
            items.push({
              id: `ev-${ev.timestamp}`,
              type: 'retraining',
              severity: ev.transition === 'Production' ? 'INFO' : (ev.transition === 'Archived' ? 'WARNING' : 'INFO'),
              title: ev.type,
              description: ev.description,
              detail: ev.active_model && ev.active_model !== 'None' ? `Model: ${ev.active_model}` : null,
              timestamp: ev.timestamp,
              raw: ev
            });
          }
        }
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return items;
  }, [alerts, events]);

  const filtered = useMemo(() => {
    return unifiedAlerts.filter(a => {
      if (filter !== 'ALL' && a.severity !== filter) return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      return true;
    });
  }, [unifiedAlerts, filter, typeFilter]);

  const criticalCount = unifiedAlerts.filter(a => a.severity === 'CRITICAL').length;
  const warningCount = unifiedAlerts.filter(a => a.severity === 'WARNING').length;
  const infoCount = unifiedAlerts.filter(a => a.severity === 'INFO').length;

  const SeverityIcon = ({ severity }) => {
    switch (severity) {
      case 'CRITICAL': return <AlertTriangle size={20} color="var(--status-error)" />;
      case 'WARNING': return <AlertCircle size={20} color="var(--status-warning)" />;
      default: return <Info size={20} color="var(--status-info)" />;
    }
  };

  const TypeIcon = ({ type }) => {
    switch (type) {
      case 'drift': return <Shield size={14} />;
      case 'retraining': return <RefreshCw size={14} />;
      default: return <Info size={14} />;
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Alerts Center</h1>
          <p className="page-subtitle">Unified incident management — drift alerts, retraining events, and system notifications.</p>
        </div>
      </div>

      {/* ─── Stats Banner ──────────────────────────────────────── */}
      <div className="stats-banner">
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--text-main)' }}>{unifiedAlerts.length}</div>
          <div className="stats-banner-label">Total Events</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--status-error)' }}>{criticalCount}</div>
          <div className="stats-banner-label">Critical</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--status-warning)' }}>{warningCount}</div>
          <div className="stats-banner-label">Warning</div>
        </div>
        <div className="stats-banner-item">
          <div className="stats-banner-value" style={{ color: 'var(--status-info)' }}>{infoCount}</div>
          <div className="stats-banner-label">Info</div>
        </div>
      </div>

      {/* ─── Filters ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={14} color="var(--text-muted)" />

        <div className="tab-group">
          {['ALL', 'CRITICAL', 'WARNING', 'INFO'].map(f => (
            <button
              key={f}
              className={`tab-item ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'ALL' ? 'All Severities' : f}
            </button>
          ))}
        </div>

        <select
          className="select-control"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="drift">Drift Alerts</option>
          <option value="system">System Events</option>
          <option value="retraining">Retraining</option>
        </select>
      </div>

      {/* ─── Alert List ───────────────────────────────────────── */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No matching alerts"
            description="No alerts match the selected filters. Try adjusting your filter criteria."
          />
        ) : (
          filtered.slice(0, 50).map((a, i) => (
            <div key={a.id || i} className="alert-item">
              <SeverityIcon severity={a.severity} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{a.title}</span>
                  <span className="badge badge-neutral" style={{ fontSize: '0.6rem' }}>
                    <TypeIcon type={a.type} /> {a.type}
                  </span>
                </div>
                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {a.description}
                </div>
                {a.detail && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--status-error)', marginTop: 3, fontWeight: 500 }}>
                    {a.detail}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {new Date(a.timestamp).toLocaleString()}
                </div>
                <span className={`badge badge-${a.severity === 'CRITICAL' ? 'error' : a.severity === 'WARNING' ? 'warning' : 'info'}`}
                  style={{ marginTop: 4, fontSize: '0.6rem' }}>
                  {a.severity}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
