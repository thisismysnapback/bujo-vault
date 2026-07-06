import React, { useState, useEffect } from 'react';
import { VaultProvider, useVault } from './store/VaultContext';
import { TopNav } from './components/TopNav';
import { DailyView } from './components/DailyView';
import { SearchView } from './components/SearchView';
import { ReviewView } from './components/ReviewView';
import { SettingsView } from './components/SettingsView';
import { MonthlyView } from './components/MonthlyView';
import { FutureLog } from './components/FutureLog';
import { MigrationView } from './components/MigrationView';
import { CoachView } from './components/CoachView';
import { HelpOverlay } from './components/HelpOverlay';
import { CalendarView } from './components/CalendarView';
import { HabitView } from './components/HabitView';
import { CommandPalette } from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getTodayDateString } from './lib/utils';

function MainContent() {
  const { currentView, setCurrentView, logs, addEntry, clearDay, undo } = useVault();
  const [showHelp, setShowHelp] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const today = getTodayDateString();
  const hasEntriesToday = (logs[today]?.entries.length ?? 0) > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
        return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setShowHelp(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowHelp(false);
        setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (showHelp) return <HelpOverlay onClose={() => setShowHelp(false)} />;

  return (
    <div className="app-main">
      {currentView === 'daily' && <ErrorBoundary viewName="daily"><DailyView /></ErrorBoundary>}
      {currentView === 'calendar' && <ErrorBoundary viewName="calendar"><CalendarView /></ErrorBoundary>}
      {currentView === 'monthly' && <ErrorBoundary viewName="monthly"><MonthlyView /></ErrorBoundary>}
      {currentView === 'future' && <ErrorBoundary viewName="future"><FutureLog /></ErrorBoundary>}
      {currentView === 'migration' && <ErrorBoundary viewName="migration"><MigrationView /></ErrorBoundary>}
      {currentView === 'review' && <ErrorBoundary viewName="review"><ReviewView /></ErrorBoundary>}
      {currentView === 'search' && <ErrorBoundary viewName="search"><SearchView /></ErrorBoundary>}
      {currentView === 'settings' && <ErrorBoundary viewName="settings"><SettingsView /></ErrorBoundary>}
      {currentView === 'coach' && <ErrorBoundary viewName="coach"><CoachView onClose={() => setCurrentView('daily')} /></ErrorBoundary>}
      {currentView === 'habits' && <ErrorBoundary viewName="habits"><HabitView /></ErrorBoundary>}
      {showCommandPalette && (
        <CommandPalette
          currentView={currentView}
          hasEntriesToday={hasEntriesToday}
          onClose={() => setShowCommandPalette(false)}
          onNavigate={setCurrentView}
          onAddEntry={(type, content) => addEntry(today, type, content)}
          onClearToday={() => clearDay(today)}
          onUndo={undo}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <VaultProvider>
      <div className="app-root">
        <TopNav />
        <MainContent />
      </div>
    </VaultProvider>
  );
}
