import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ArrowRight, Activity, BarChart2, ShieldAlert, Database, Cpu, List, Settings, GitCompareArrows, Sliders, TrendingUp, Layers, FileText, Power, RotateCcw, Download } from 'lucide-react';

const PAGES = [
  { id: 'overview', label: 'System Overview', icon: Activity, category: 'Navigation' },
  { id: 'predictions', label: 'Real-Time Predictions', icon: BarChart2, category: 'Navigation' },
  { id: 'drift', label: 'Drift Intelligence', icon: ShieldAlert, category: 'Navigation' },
  { id: 'explainability', label: 'Model Explainability', icon: Cpu, category: 'Navigation' },
  { id: 'data-explorer', label: 'Data Explorer', icon: Database, category: 'Navigation' },
  { id: 'alerts', label: 'Alerts Center', icon: List, category: 'Navigation' },
  { id: 'model-comparison', label: 'Model Comparison', icon: GitCompareArrows, category: 'Navigation' },
  { id: 'timeline', label: 'Event Timeline', icon: Database, category: 'Navigation' },
  { id: 'scenario', label: 'Scenario Simulator', icon: Sliders, category: 'Navigation' },
  { id: 'feature-evolution', label: 'Feature Evolution', icon: Layers, category: 'Navigation' },
  { id: 'performance', label: 'Performance Monitor', icon: TrendingUp, category: 'Navigation' },
  { id: 'report', label: 'System Report', icon: FileText, category: 'Navigation' },
  { id: 'settings', label: 'Settings', icon: Settings, category: 'Navigation' },
];

const ACTIONS = [
  { id: 'action-retrain', label: 'Trigger Retraining', icon: Power, category: 'Actions', action: 'retrain' },
  { id: 'action-rollback', label: 'Model Rollback', icon: RotateCcw, category: 'Actions', action: 'rollback' },
  { id: 'action-export-pred', label: 'Export Predictions CSV', icon: Download, category: 'Export', action: 'export-predictions' },
  { id: 'action-export-alerts', label: 'Export Alerts CSV', icon: Download, category: 'Export', action: 'export-alerts' },
  { id: 'action-export-metrics', label: 'Export Metrics CSV', icon: Download, category: 'Export', action: 'export-metrics' },
  { id: 'action-report', label: 'Generate Report', icon: FileText, category: 'Actions', action: 'generate-report' },
];

export default function CommandPalette({ isOpen, onClose, onNavigate, onAction }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const allItems = useMemo(() => [...PAGES, ...ACTIONS], []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  }, [query, allItems]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = (item) => {
    if (item.action) {
      onAction(item.action);
    } else {
      onNavigate(item.id);
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Group by category
  const groups = {};
  filtered.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  let flatIndex = 0;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Search Input */}
        <div className="cmd-search">
          <Search size={18} color="var(--text-muted)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, actions, exports..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="cmd-input"
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </div>

        {/* Results */}
        <div className="cmd-results" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmd-empty">No results for "{query}"</div>
          ) : (
            Object.entries(groups).map(([category, items]) => (
              <div key={category}>
                <div className="cmd-category">{category}</div>
                {items.map(item => {
                  const idx = flatIndex++;
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className={`cmd-item ${idx === selectedIndex ? 'cmd-item-active' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <Icon size={16} />
                      <span className="cmd-item-label">{item.label}</span>
                      <ArrowRight size={14} className="cmd-item-arrow" />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
