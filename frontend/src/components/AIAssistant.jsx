import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Sparkles, ChevronDown, Loader, RefreshCw, Clock, Cpu } from 'lucide-react';
import { askAI } from '../api';

function parseInline(text) {
  if (!text) return null;
  const parts = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('`') && raw.endsWith('`')) {
      parts.push({ type: 'code', content: raw.slice(1, -1) });
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      const inner = raw.slice(2, -2).trim();
      const isMetricVal = /^[\d.,%+\-/\s]+(?:ms|kW|s|h|%)?$/i.test(inner);
      parts.push({ type: isMetricVal ? 'metric' : 'bold', content: inner });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts.map((p, idx) => {
    if (p.type === 'bold') {
      return <strong key={idx} className="ai-strong">{p.content}</strong>;
    }
    if (p.type === 'metric') {
      return <span key={idx} className="ai-metric-val">{p.content}</span>;
    }
    if (p.type === 'code') {
      return <code key={idx} className="ai-code">{p.content}</code>;
    }
    const cleaned = p.content.replace(/\*{1,2}/g, '');
    return <span key={idx}>{cleaned}</span>;
  });
}

function FormattedAIMessage({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let currentList = [];

  const flushList = (keyPrefix) => {
    if (currentList.length > 0) {
      elements.push(
        <div key={`${keyPrefix}-list`} className="ai-bullet-list">
          {currentList.map((item, idx) => (
            <div key={idx} className="ai-bullet-row">
              <span className="ai-bullet-marker" />
              <div className="ai-bullet-content">{parseInline(item)}</div>
            </div>
          ))}
        </div>
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      flushList(`flush-${i}`);
      continue;
    }

    // Bullet item (* item, - item, • item)
    const bulletMatch = rawLine.match(/^[*•-]\s+(.*)$/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1]);
      continue;
    }

    // Section header (**Title:** or ### Title or **Title**)
    const headerMatch = rawLine.match(/^(?:###\s*|\*\*)([^*:]+)(?:\*\*:?|:\*\*|:)?$/);
    if (headerMatch && !rawLine.startsWith('* ') && !rawLine.startsWith('- ')) {
      flushList(`header-flush-${i}`);
      const title = headerMatch[1].replace(/\*{1,2}/g, '').trim();
      elements.push(
        <div key={`header-${i}`} className="ai-section-title">
          <span className="ai-section-icon">✦</span>
          <span>{title}</span>
        </div>
      );
      continue;
    }

    // Paragraph
    flushList(`p-flush-${i}`);
    elements.push(
      <p key={`p-${i}`} className="ai-p">
        {parseInline(rawLine)}
      </p>
    );
  }

  flushList('final-flush');

  return <div className="ai-formatted-msg">{elements}</div>;
}

export default React.memo(function AIAssistant({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m EcoForecaster AI. I can answer questions about your models, drift status, feature importance, and system health. What would you like to know?', ts: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const quickQuestions = [
    'What is the current model performance?',
    'Is there any drift detected?',
    'Which features matter most?',
    'Should I retrain the model?',
  ];

  const handleSend = async (text) => {
    const question = text || input.trim();
    if (!question || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question, ts: Date.now() }]);
    setLoading(true);

    // Timeout controller
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'The AI is taking longer than expected. The request is still processing — you can wait or try again.',
        ts: Date.now(),
        warning: true,
      }]);
    }, 30000);

    try {
      const result = await askAI(question);
      clearTimeout(timeoutId);

      const meta = {};
      if (result.agents_used && result.agents_used.length > 0) {
        meta.agents = result.agents_used;
      }
      if (result.modules_used && result.modules_used.length > 0) {
        meta.modules = result.modules_used;
      }
      if (result.duration_ms) {
        meta.duration_ms = result.duration_ms;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.answer || 'I could not generate a response.',
        reasoning: result.reasoning,
        ts: Date.now(),
        meta,
        source: result.source,
      }]);
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.includes('timeout');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: isTimeout
          ? 'Request timed out. The AI service might be busy. Please try again.'
          : 'Sorry, I encountered an error connecting to the AI service. Please try again.',
        ts: Date.now(),
        error: true,
        retryQuestion: question,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = (question) => {
    handleSend(question);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-panel-overlay" onClick={onClose}>
      <div className="ai-panel animate-slide-in" onClick={e => e.stopPropagation()}>
        <div className="ai-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="ai-panel-icon"><Sparkles size={18} /></div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>AI Assistant</h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Powered by Groq LLM • Multi-Agent RAG</span>
            </div>
          </div>
          <button className="ai-panel-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ai-panel-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`ai-msg ai-msg-${msg.role} ${msg.error ? 'ai-msg-error' : ''} ${msg.warning ? 'ai-msg-warning' : ''}`}>
              <div className="ai-msg-avatar">
                {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div className="ai-msg-content">
                {msg.reasoning && (
                  <details style={{ marginBottom: 8, background: 'var(--bg-inset)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-light)' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', userSelect: 'none' }}>
                      Agent Reasoning
                    </summary>
                    <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                      {msg.reasoning}
                    </div>
                  </details>
                )}
                {msg.role === 'assistant' ? (
                  <FormattedAIMessage content={msg.content} />
                ) : (
                  <div className="ai-msg-text">{msg.content}</div>
                )}

                {/* Agent attribution & meta */}
                {msg.meta && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {msg.meta.agents && msg.meta.agents.map((a, j) => (
                      <span key={j} style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        fontSize: '0.63rem', fontWeight: 600,
                        background: 'var(--accent-primary-bg)', color: 'var(--accent-primary)',
                        border: '1px solid var(--accent-primary)',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <Cpu size={9} /> {a}
                      </span>
                    ))}
                    {msg.meta.duration_ms && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        fontSize: '0.63rem', fontWeight: 500,
                        background: 'var(--bg-muted)', color: 'var(--text-muted)',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <Clock size={9} /> {msg.meta.duration_ms > 1000 ? `${(msg.meta.duration_ms / 1000).toFixed(1)}s` : `${Math.round(msg.meta.duration_ms)}ms`}
                      </span>
                    )}
                  </div>
                )}

                {/* Retry button on error */}
                {msg.error && msg.retryQuestion && (
                  <button
                    onClick={() => handleRetry(msg.retryQuestion)}
                    style={{
                      marginTop: 8, padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                      background: 'var(--status-error-bg)', color: 'var(--status-error)',
                      border: '1px solid var(--status-error-border)',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <RefreshCw size={11} /> Retry
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="ai-msg ai-msg-assistant">
              <div className="ai-msg-avatar"><Bot size={16} /></div>
              <div className="ai-msg-content">
                <div className="ai-typing"><span /><span /><span /></div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {messages.length <= 1 && (
          <div className="ai-quick-questions">
            {quickQuestions.map((q, i) => (
              <button key={i} className="ai-quick-btn" onClick={() => handleSend(q)}>
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="ai-panel-input">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about models, drift, features..."
            disabled={loading}
          />
          <button
            className="ai-send-btn"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
          >
            {loading ? <Loader size={16} className="spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
});
