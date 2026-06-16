import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Predictions() {
  const [data, setData] = useState([]);

  // Simulate a live websocket buffer visually updating the chart naturally
  useEffect(() => {
    let t = 0;
    const interval = setInterval(() => {
      t += 1;
      const actual = 4.5 + Math.sin(t * 0.1) + Math.random() * 0.5;
      const predicted = 4.5 + Math.sin(t * 0.1) + Math.random() * 0.2;
      
      setData((prev) => {
        const next = [...prev, { time: t, actual, predicted }];
        if (next.length > 50) next.shift(); // Keep bounded window
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="animate-fade-in delay-200">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <h1>Predictions Stream</h1>
          <p className="page-subtitle">Real-time inference vs Actual Targets (Simulated Web-Socket Buffer).</p>
        </div>
        <div style={{ padding: '8px 16px', background: 'var(--status-success-bg)', borderRadius: '99px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="live-dot"></div> Live Session
        </div>
      </div>
      
      <div className="card" style={{ height: 'calc(100vh - 250px)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
            <XAxis dataKey="time" hide />
            <YAxis domain={['auto', 'auto']} tick={{fill: 'var(--text-muted)'}} />
            <Tooltip 
              contentStyle={{ borderRadius: 8, border: 'none', boxShadow: 'var(--shadow-lg)' }} 
              itemStyle={{ fontWeight: 600 }}
            />
            <Legend verticalAlign="top" height={36} />
            <Line type="monotone" dataKey="actual" name="Actual kW" stroke="var(--text-muted)" strokeWidth={2} dot={false} strokeOpacity={0.6} />
            <Line type="monotone" dataKey="predicted" name="AI Predicted kW" stroke="var(--accent-primary)" strokeWidth={3} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
