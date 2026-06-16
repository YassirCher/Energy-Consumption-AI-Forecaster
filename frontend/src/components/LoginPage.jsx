import React, { useState } from 'react';
import { Activity, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    setError('');
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-pattern" />
      <div className="login-card animate-fade-in">
        <div className="login-header">
          <div className="login-logo">
            <Activity size={24} color="white" />
          </div>
          <h1>EcoForecaster</h1>
          <p className="login-subtitle">AI-Powered Energy Intelligence Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error animate-fade-in">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="login-field">
            <label><User size={14} /> Username</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label><Lock size={14} /> Password</label>
            <div className="login-pw-wrapper">
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button type="button" className="login-pw-toggle" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button id="login-submit" type="submit" className="login-btn" disabled={loading}>
            {loading ? <span className="login-spinner" /> : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <div className="login-hint">
            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Demo</span>
            <span>admin / admin123 &nbsp;•&nbsp; viewer / viewer123</span>
          </div>
          <p>v5.0 — Multi-Agent AI • Graph RAG • MLOps</p>
        </div>
      </div>
    </div>
  );
}
