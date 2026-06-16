import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div style={{ 
            width: 64, height: 64, borderRadius: 16, 
            background: 'var(--status-error-bg)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20 
          }}>
            <AlertTriangle size={28} color="var(--status-error)" />
          </div>
          <h2>Something went wrong</h2>
          <p>A rendering error occurred in this section. This has been logged for investigation.</p>
          <button className="btn btn-primary" onClick={this.handleRetry}>
            <RefreshCw size={16} /> Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
