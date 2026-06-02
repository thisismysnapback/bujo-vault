import React, { useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { ViewType } from '../types';
import { cn } from '../lib/utils';
import { format, addDays, addMonths } from 'date-fns';

const PRIMARY_TABS: { id: ViewType; label: string }[] = [
  { id: 'daily', label: 'log' },
  { id: 'review', label: 'stats' },
  { id: 'coach', label: 'coach' },
  { id: 'search', label: 'search' },
  { id: 'settings', label: 'settings' },
];

const SUB_TABS: Record<string, { id: ViewType; label: string; dropTarget?: string }[]> = {
  daily: [
    { id: 'daily', label: 'today' },
    { id: 'calendar', label: 'calendar' },
    { id: 'monthly', label: 'monthly', dropTarget: 'monthly' },
    { id: 'future', label: 'future', dropTarget: 'future' },
    { id: 'habits', label: 'habits' },
    { id: 'migration', label: 'migrate' },
  ],
};

function getPrimaryTab(view: ViewType): string {
  if (['daily', 'calendar', 'monthly', 'future', 'habits', 'migration'].includes(view)) return 'daily';
  return view;
}

export function TopNav() {
  const { currentView, setCurrentView, logs, migrateEntry, undo, streak } = useVault();
  const primaryTab = getPrimaryTab(currentView);
  const subTabs = SUB_TABS[primaryTab] || [];

  // Ctrl+Z undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  // Drag-drop target resolution
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (!data.id || !data.date) return;
      let targetDate = '';
      if (targetId === 'tomorrow') targetDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      else if (targetId === 'monthly') targetDate = format(new Date(), 'yyyy-MM');
      else if (targetId === 'future') targetDate = format(addMonths(new Date(), 1), 'MMMM yyyy') + '-future';
      if (targetDate && data.date !== targetDate) {
        migrateEntry(data.id, data.date, targetDate);
      }
    } catch { /* ignore */ }
  };

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
      {/* Primary tabs */}
      <div className="flex items-center justify-between px-6 pt-3">
        <div className="flex items-center gap-6">
          {PRIMARY_TABS.map((tab) => {
            const isActive = primaryTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                style={{
                  color: isActive ? 'var(--gold)' : 'var(--text-muted)',
                  paddingBottom: '8px',
                  fontSize: '13px',
                  fontWeight: isActive ? '500' : '400',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'color 0.15s',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {streak > 0 && (
          <span style={{ color: 'var(--gold)', fontSize: '12px' }}>
            {streak}d streak
          </span>
        )}
      </div>

      {/* Sub-tabs */}
      {subTabs.length > 0 && (
        <div className="flex items-center gap-5 px-6 pb-2 pt-1">
          {subTabs.map((tab) => {
            const isActive = currentView === tab.id;
            const dropId = tab.dropTarget;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                onDragOver={dropId ? handleDragOver : undefined}
                onDrop={dropId ? (e) => handleDrop(e, dropId) : undefined}
                style={{
                  color: isActive ? 'var(--text)' : 'var(--text-faint)',
                  fontSize: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'color 0.15s',
                  textDecoration: isActive ? 'underline' : 'none',
                  textUnderlineOffset: '3px',
                  textDecorationColor: 'var(--gold)',
                }}
              >
                {tab.label}
              </button>
            );
          })}
          {/* Tomorrow: drop-only target, not a nav item */}
          <div
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'tomorrow')}
            style={{
              fontSize: '12px',
              color: 'var(--text-faint)',
              cursor: 'default',
              letterSpacing: '0.02em',
            }}
          >
            → tmrw
          </div>
        </div>
      )}
    </div>
  );
}
