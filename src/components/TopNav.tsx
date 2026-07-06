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
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
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
    <div className="nav-bar">
      {/* Primary tabs */}
      <div className="flex items-center justify-between px-6 pt-3">
        <div className="flex items-center gap-6">
          {PRIMARY_TABS.map((tab) => {
            const isActive = primaryTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={`nav-primary-tab ${isActive ? 'nav-primary-tab-active' : 'nav-primary-tab-inactive'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {streak > 0 && (
          <span className="nav-streak">
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
                className={`nav-sub-tab ${isActive ? 'nav-sub-tab-active' : 'nav-sub-tab-inactive'}`}
              >
                {tab.label}
              </button>
            );
          })}
          {/* Tomorrow: drop-only target, not a nav item */}
          <div
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'tomorrow')}
            className="nav-drop-target"
          >
            → tmrw
          </div>
        </div>
      )}
    </div>
  );
}
