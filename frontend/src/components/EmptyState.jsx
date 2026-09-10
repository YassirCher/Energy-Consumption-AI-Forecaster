import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({ icon = Inbox, title = 'No data available', description = 'Data will appear here once the system begins processing.' }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {React.createElement(icon, { size: 24 })}
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-text">{description}</div>
    </div>
  );
}
