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
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '32px', maxWidth: '640px', width: '100%', margin: '0 16px', maxHeight: '80vh', overflowY: 'auto' }}
        className="scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', color: 'var(--gold)', fontWeight: 400 }}>keybindings</h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>? or escape to close</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
          {HELP_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                {section.title}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {section.items.map((item) => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <kbd style={{ color: 'var(--gold)', background: 'var(--bg-hover)', padding: '2px 6px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {item.key}
                    </kbd>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{item.desc}</span>
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
