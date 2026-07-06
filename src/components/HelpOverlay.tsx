import React, { useEffect } from 'react';

const HELP_SECTIONS = [
  {
    title: 'input bar',
    items: [
      { key: 'Enter', desc: 'submit entry' },
      { key: 'Shift+Enter', desc: 'new line (dump mode)' },
      { key: 'Ctrl+K', desc: 'focus input bar' },
      { key: 'Escape', desc: 'focus input bar' },
    ],
  },
  {
    title: 'navigation',
    items: [
      { key: '↑ ↓', desc: 'move through entries' },
      { key: 'x', desc: 'mark selected done' },
      { key: 'k', desc: 'kill selected' },
      { key: '>', desc: 'migrate selected' },
    ],
  },
  {
    title: 'actions',
    items: [
      { key: 'Ctrl+Z', desc: 'undo last change' },
      { key: 'Ctrl+Delete', desc: 'clear all entries today' },
      { key: 'Ctrl+B', desc: 'coaching insights' },
      { key: '?', desc: 'toggle this help' },
    ],
  },
  {
    title: 'prefixes',
    items: [
      { key: 't', desc: 'task' },
      { key: 'n', desc: 'note' },
      { key: 'e', desc: 'event' },
      { key: '*', desc: 'priority' },
      { key: 'x', desc: 'done' },
      { key: 'k', desc: 'kill' },
      { key: '>', desc: 'migrated' },
      { key: '!', desc: 'priority (suffix)' },
      { key: 'dump', desc: 'ai parse dump' },
    ],
  },
  {
    title: 'views',
    items: [
      { key: 'daily', desc: "today's entries" },
      { key: 'monthly', desc: 'monthly priorities' },
      { key: 'future', desc: 'parked items' },
      { key: 'migration', desc: 'review pending tasks' },
      { key: 'review', desc: 'analytics & insights' },
      { key: 'coach', desc: 'inline coaching (ctrl+b)' },
      { key: 'search', desc: 'full vault search' },
      { key: 'settings', desc: 'configuration' },
    ],
  },
];

interface HelpOverlayProps {
  onClose: () => void;
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="help-backdrop"
      onClick={onClose}
    >
      <div
        className="help-panel scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-header">
          <h2 className="help-title">keybindings</h2>
          <span className="help-hint">? or escape to close</span>
        </div>

        <div className="help-grid">
          {HELP_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="help-section-title">
                {section.title}
              </h3>
              <div className="help-items">
                {section.items.map((item) => (
                  <div key={item.key} className="help-item">
                    <kbd className="help-kbd">
                      {item.key}
                    </kbd>
                    <span className="help-desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
