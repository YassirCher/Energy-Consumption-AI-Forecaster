import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom React hook for Server-Sent Events (SSE) connection.
 * Auto-connects with exponential backoff on disconnect.
 * Returns connection state, latest data, and reconnect function.
 */
export default function useSSE(url = 'http://localhost:8000/stream/events') {
  const [connectionState, setConnectionState] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected' | 'error'
  const [lastEvent, setLastEvent] = useState(null);
  const [latestHealth, setLatestHealth] = useState(null);
  const [latestPrediction, setLatestPrediction] = useState(null);
  const [latestDrift, setLatestDrift] = useState(null);
  const [eventCount, setEventCount] = useState(0);
  const eventSourceRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef(null);
  const maxRetries = 10;

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionState('connecting');

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnectionState('connected');
        retryCountRef.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent(data);
          setEventCount(prev => prev + 1);

          if (data.health) setLatestHealth(data.health);
          if (data.prediction) setLatestPrediction(data.prediction);
          if (data.latest_drift) setLatestDrift(data.latest_drift);
        } catch {
          // Skip malformed events
        }
      };

      es.onerror = () => {
        es.close();
        setConnectionState('disconnected');

        // Exponential backoff retry
        if (retryCountRef.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
          retryCountRef.current += 1;
          retryTimeoutRef.current = setTimeout(connect, delay);
        } else {
          setConnectionState('error');
        }
      };
    } catch {
      setConnectionState('error');
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setConnectionState('disconnected');
  }, []);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connectionState,
    lastEvent,
    latestHealth,
    latestPrediction,
    latestDrift,
    eventCount,
    reconnect,
    disconnect,
    isConnected: connectionState === 'connected'
  };
}
