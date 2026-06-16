import React from 'react';

export default function LoadingState({ type = 'card', count = 3 }) {
  if (type === 'page') {
    return (
      <div className="loading-page">
        <div className="loading-spinner" />
        <span>Loading data...</span>
      </div>
    );
  }

  if (type === 'chart') {
    return (
      <div className="card" style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="loading-spinner" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Rendering visualization...</span>
        </div>
      </div>
    );
  }

  // card skeleton
  return (
    <div className={`grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 24 }}>
          <div className="skeleton-box" style={{ width: '40%', height: 12, marginBottom: 16 }} />
          <div className="skeleton-box" style={{ width: '60%', height: 28, marginBottom: 12 }} />
          <div className="skeleton-box" style={{ width: '80%', height: 10 }} />
        </div>
      ))}
    </div>
  );
}
