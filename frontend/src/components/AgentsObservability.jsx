import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Play, Clock, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, RefreshCw, Loader, Activity } from 'lucide-react';
import { fetchAgentsStatus, triggerAgentRun } from '../api';

const STATUS_CONFIG = {
  idle: { color: 'var(--status-success)', bg: 'var(--status-success-bg)', label: 'Idle', icon: CheckCircle2 },
  running: { color: 'var(--status-warning)', bg: 'var(--status-warning-bg)', label: 'Running', icon: Loader },
  error: { color: 'var(--status-error)', bg: 'var(--status-error-bg)', label: 'Error', icon: XCircle },
};

function AgentCard({ agent, onTrigger }) {
  const [expanded, setExpanded] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const config = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const StatusIcon = config.icon;

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await onTrigger(agent.name);
    } finally {
      setTriggering(false);
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (iso) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div className="card animate-fade-in" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          <div className="agent-status-dot" style={{ background: config.color, boxShadow: `0 0 8px ${config.color}` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              {agent.name}
              <span className="badge" style={{ background: config.bg, color: config.color, borderColor: config.color, fontSize: '0.65rem' }}>
                {config.label}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Role: {agent.role} · Runs: {agent.execution_count} · Errors: {agent.error_count}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} /> {formatDuration(agent.last_duration_ms)}
            </div>
            <div style={{ marginTop: 2 }}>{formatTime(agent.last_execution)}</div>
          </div>

          <button
            className="btn btn-ghost btn-sm"
            onClick={handleTrigger}
            disabled={triggering || agent.status === 'running'}
            title={`Run ${agent.name}`}
          >
            {triggering ? <Loader size={14} className="spin" /> : <Play size={14} />}
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(!expanded)}
            style={{ padding: '6px 8px' }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {expanded && agent.last_result && (
        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Last Response
          </div>

          {agent.last_result.structured_metrics && Object.keys(agent.last_result.structured_metrics).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.72rem', color: 'var(--accent-primary)' }}>
                Structured Metrics
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, background: 'var(--bg-card)', padding: 10, borderRadius: 6, border: '1px solid var(--border-light)', maxHeight: 200, overflow: 'auto' }}>
                {JSON.stringify(agent.last_result.structured_metrics, null, 2)}
              </pre>
            </div>
          )}

          {agent.last_result.analysis && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                LLM Analysis
              </div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {typeof agent.last_result.analysis === 'string' ? agent.last_result.analysis : JSON.stringify(agent.last_result.analysis, null, 2)}
              </div>
            </div>
          )}

          {agent.last_result.error && (
            <div style={{ color: 'var(--status-error)', marginTop: 8 }}>
              Error: {agent.last_result.error}
            </div>
          )}

          {agent.last_input_summary && (
            <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Input: {agent.last_input_summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentsObservability() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadAgents = useCallback(async () => {
    try {
      const data = await fetchAgentsStatus();
      setAgents(data.agents || []);
      setLastUpdate(data.timestamp);
    } catch (err) {
      console.warn('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 5000);
    return () => clearInterval(interval);
  }, [loadAgents]);

  const handleTrigger = async (agentName) => {
    try {
      await triggerAgentRun(agentName);
      // Refresh after a short delay for result to propagate
      setTimeout(loadAgents, 1000);
    } catch (err) {
      console.warn('Agent trigger failed:', err);
    }
  };

  const idleCount = agents.filter(a => a.status === 'idle').length;
  const runningCount = agents.filter(a => a.status === 'running').length;
  const errorCount = agents.filter(a => a.status === 'error').length;
  const totalRuns = agents.reduce((sum, a) => sum + (a.execution_count || 0), 0);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>AI Agents Observability</h1>
          <p className="page-subtitle">Real-time status and control of all multi-agent system components</p>
        </div>
        <button className="btn btn-ghost" onClick={loadAgents}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Stats Banner */}
      <div className="grid-cols-4" style={{ marginBottom: 24 }}>
        <div className="card card-inset" style={{ textAlign: 'center', padding: 16 }}>
          <div className="metric-title" style={{ justifyContent: 'center' }}><Bot size={14} /> Total Agents</div>
          <div className="metric-value" style={{ fontSize: '1.5rem' }}>{agents.length}</div>
        </div>
        <div className="card card-inset" style={{ textAlign: 'center', padding: 16 }}>
          <div className="metric-title" style={{ justifyContent: 'center' }}><CheckCircle2 size={14} /> Idle</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--status-success)' }}>{idleCount}</div>
        </div>
        <div className="card card-inset" style={{ textAlign: 'center', padding: 16 }}>
          <div className="metric-title" style={{ justifyContent: 'center' }}><AlertTriangle size={14} /> Running</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--status-warning)' }}>{runningCount}</div>
        </div>
        <div className="card card-inset" style={{ textAlign: 'center', padding: 16 }}>
          <div className="metric-title" style={{ justifyContent: 'center' }}><Activity size={14} /> Total Runs</div>
          <div className="metric-value" style={{ fontSize: '1.5rem' }}>{totalRuns}</div>
        </div>
      </div>

      {/* Agent Cards */}
      {loading ? (
        <div className="loading-page"><div className="loading-spinner" /><span>Loading agents...</span></div>
      ) : agents.length === 0 ? (
        <div className="card"><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No agents registered yet. Trigger an AI request first.</p></div>
      ) : (
        agents.map((agent, i) => (
          <AgentCard key={agent.name || i} agent={agent} onTrigger={handleTrigger} />
        ))
      )}

      {lastUpdate && (
        <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-placeholder)', marginTop: 16 }}>
          Last updated: {new Date(lastUpdate).toLocaleTimeString()} · Polling every 5s
        </div>
      )}
    </div>
  );
}
