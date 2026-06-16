import React, { useState, useEffect, useCallback } from 'react';
import { Server, Cpu, Clock, ChevronDown, ChevronRight, RefreshCw, Zap, Database, GitBranch, Brain, Shield, BarChart3, Activity, Layers } from 'lucide-react';
import { fetchAISystemInfo, fetchSystemTraces } from '../api';

const MODULE_ICONS = {
  prediction: BarChart3,
  drift_detection: Shield,
  explainability: Layers,
  shap: Zap,
  anomaly_detection: Activity,
  graph_rag: GitBranch,
  llm: Brain,
  multi_agent: Cpu,
};

function ModuleCard({ module }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = MODULE_ICONS[module.name] || Server;
  const isActive = module.status === 'active';

  return (
    <div className="card" style={{ padding: 16, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: isActive ? 'var(--accent-primary-bg)' : 'var(--bg-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
          }}>
            <Icon size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', textTransform: 'capitalize' }}>
              {module.name.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{module.description}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${isActive ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.63rem' }}>
            {module.status}
          </span>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Available Tools
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(module.tools || []).map((tool, i) => (
              <span key={i} style={{
                padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)', background: 'var(--bg-muted)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-light)',
              }}>
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TraceCard({ trace }) {
  const [expanded, setExpanded] = useState(false);

  const formatTime = (iso) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  };

  const typeColors = {
    synthesis: 'var(--accent-primary)',
    chat: 'var(--status-info)',
    anomaly_explain: 'var(--status-warning)',
  };

  const maxDuration = trace.total_duration_ms || 1;

  return (
    <div className="card" style={{ padding: 14, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: typeColors[trace.type] || 'var(--text-muted)',
            boxShadow: `0 0 6px ${typeColors[trace.type] || 'var(--text-muted)'}`,
            flexShrink: 0,
          }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.82rem', textTransform: 'capitalize' }}>
              {trace.type?.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {formatTime(trace.timestamp)} · {trace.agents_invoked?.length || 0} agents · {trace.modules_used?.length || 0} modules
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: trace.total_duration_ms > 5000 ? 'var(--status-error)' : 'var(--text-secondary)' }}>
            {trace.total_duration_ms ? `${(trace.total_duration_ms / 1000).toFixed(1)}s` : '—'}
          </span>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
          {/* Pipeline Steps */}
          {trace.steps && trace.steps.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pipeline Steps
              </div>
              {trace.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 500, minWidth: 130, color: 'var(--text-secondary)' }}>
                    {step.name?.replace(/_/g, ' ')}
                  </div>
                  {/* Timeline bar */}
                  <div style={{ flex: 1, height: 6, background: 'var(--bg-muted)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(5, Math.min(100, (step.duration_ms / maxDuration) * 100))}%`,
                      height: '100%',
                      background: 'var(--accent-gradient)',
                      borderRadius: 3,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>
                    {step.duration_ms ? `${Math.round(step.duration_ms)}ms` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Modules & Agents */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {trace.modules_used && (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Modules Used</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {trace.modules_used.map((m, i) => (
                    <span key={i} className="badge badge-info" style={{ fontSize: '0.63rem' }}>{m}</span>
                  ))}
                </div>
              </div>
            )}
            {trace.agents_invoked && (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Agents Invoked</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {trace.agents_invoked.map((a, i) => (
                    <span key={i} className="badge badge-warning" style={{ fontSize: '0.63rem' }}>{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {trace.question && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Query: "{trace.question}"
            </div>
          )}
          {trace.error && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--status-error)' }}>
              Error: {trace.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AISystemView() {
  const [systemInfo, setSystemInfo] = useState(null);
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('modules');

  const loadData = useCallback(async () => {
    try {
      const [info, traceData] = await Promise.allSettled([
        fetchAISystemInfo(),
        fetchSystemTraces(20),
      ]);
      if (info.status === 'fulfilled') setSystemInfo(info.value);
      if (traceData.status === 'fulfilled') setTraces(traceData.value.traces || []);
    } catch (err) {
      console.warn('Failed to load AI system info:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 6000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return <div className="loading-page"><div className="loading-spinner" /><span>Loading AI system...</span></div>;
  }

  const llm = systemInfo?.llm || {};
  const modules = systemInfo?.modules || [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>AI System Overview</h1>
          <p className="page-subtitle">Module registry, LLM configuration, and request execution traces</p>
        </div>
        <button className="btn btn-ghost" onClick={loadData}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* LLM Config Banner */}
      <div className="card" style={{ marginBottom: 24, background: 'var(--accent-gradient)', color: 'white', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Brain size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>LLM Provider</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{llm.provider || 'Groq'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: '0.68rem', opacity: 0.7, marginBottom: 2 }}>Primary Model</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600 }}>{llm.primary_model || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', opacity: 0.7, marginBottom: 2 }}>Fallback Model</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600 }}>{llm.fallback_model || '—'}</div>
            </div>
            {llm.cache_stats && (
              <div>
                <div style={{ fontSize: '0.68rem', opacity: 0.7, marginBottom: 2 }}>Cache Hit Rate</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600 }}>
                  {llm.cache_stats.hit_rate}% ({llm.cache_stats.entries} entries)
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Selection */}
      <div className="tab-group" style={{ marginBottom: 20 }}>
        <button className={`tab-item ${activeTab === 'modules' ? 'active' : ''}`} onClick={() => setActiveTab('modules')}>
          <Server size={14} style={{ marginRight: 6 }} /> Modules ({modules.length})
        </button>
        <button className={`tab-item ${activeTab === 'traces' ? 'active' : ''}`} onClick={() => setActiveTab('traces')}>
          <Database size={14} style={{ marginRight: 6 }} /> Request Traces ({traces.length})
        </button>
      </div>

      {/* Modules Tab */}
      {activeTab === 'modules' && (
        <div>
          {modules.map((mod, i) => (
            <ModuleCard key={mod.name || i} module={mod} />
          ))}
          {modules.length === 0 && (
            <div className="card"><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No modules registered.</p></div>
          )}
        </div>
      )}

      {/* Traces Tab */}
      {activeTab === 'traces' && (
        <div>
          {traces.length > 0 ? (
            traces.slice().reverse().map((trace, i) => (
              <TraceCard key={i} trace={trace} />
            ))
          ) : (
            <div className="card">
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                No execution traces yet. Use the AI Assistant or visit the Insights page to generate traces.
              </p>
            </div>
          )}
        </div>
      )}

      {systemInfo?.timestamp && (
        <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-placeholder)', marginTop: 16 }}>
          Platform v{systemInfo.version} · Last updated: {new Date(systemInfo.timestamp).toLocaleTimeString()} · Polling every 6s
        </div>
      )}
    </div>
  );
}
