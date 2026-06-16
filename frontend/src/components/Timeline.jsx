import React from 'react';
import { Database, ArrowRight, User } from 'lucide-react';
import EmptyState from './EmptyState';

export default function Timeline({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1>Event Timeline</h1>
            <p className="page-subtitle">Chronological ledger of all MLOps pipeline events.</p>
          </div>
        </div>
        <EmptyState
          icon={Database}
          title="No Events Recorded"
          description="System events will appear here as the platform processes retraining, drift detection, and model promotions."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Event Timeline</h1>
          <p className="page-subtitle">Chronological ledger of {events.length} MLOps pipeline events.</p>
        </div>
      </div>

      {events.map((ev, i) => {
        const transition = ev.transition || '';
        const badgeClass = transition === 'Production' ? 'badge-success' : transition === 'Archived' ? 'badge-error' : transition === 'Restored' ? 'badge-info' : 'badge-warning';
        const delay = Math.min(i * 80, 400);

        return (
          <div key={i} className="timeline-capsule animate-fade-in" style={{ animationDelay: `${delay}ms`, opacity: 0 }}>
            <div className="timeline-dot" />
            <div className="timeline-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)' }}>{ev.type}</span>
                  {transition && (
                    <span className={`badge ${badgeClass}`} style={{ marginLeft: 10, fontSize: '0.6rem' }}>
                      <ArrowRight size={10} /> {transition}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {ev.description}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
                {ev.active_model && ev.active_model !== 'None' && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                    {ev.active_model.replace('EnergyForecaster_', '')}
                  </span>
                )}
                {ev.user && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--text-placeholder)' }}>
                    <User size={11} /> {ev.user}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
