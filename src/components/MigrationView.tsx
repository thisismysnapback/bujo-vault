import React, { useState } from 'react';
import { useVault } from '../store/VaultContext';
import { DailyLog, Entry } from '../types';
import { format, addDays } from 'date-fns';
import { ArrowRight, Check, X, Sparkles } from 'lucide-react';
import { analyzeMigrationTask } from '../services/desktop';
import { getTerminalPrompt } from '../lib/utils';

const DAILY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function MigrationView() {
  const { logs, updateEntry, migrateEntry } = useVault();

  const pendingTasks: Array<{ date: string; entry: Entry }> = [];
  const today = format(new Date(), 'yyyy-MM-dd');
  for (const [date, log] of Object.entries(logs) as [string, DailyLog][]) {
    if (!DAILY_KEY_RE.test(date)) continue;
    if (date === today) continue;
    for (const entry of log.entries) {
      if (entry.kind === 'task' && entry.status === 'active') {
        pendingTasks.push({ date, entry });
      }
    }
  }
  pendingTasks.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const [processed, setProcessed] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const runAction = async (entry: Entry, action: () => Promise<void>) => {
    setPendingActionIds(prev => new Set([...prev, entry.id]));
    setActionErrors(prev => ({ ...prev, [entry.id]: '' }));
    try {
      await action();
      setProcessed(prev => new Set([...prev, entry.id]));
    } catch (err: any) {
      setActionErrors(prev => ({ ...prev, [entry.id]: err?.message || 'action failed' }));
    } finally {
      setPendingActionIds(prev => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const handleMigrate = (date: string, entry: Entry) => {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    void runAction(entry, () => migrateEntry(entry.id, date, tomorrow));
  };

  const handleKill = (date: string, entry: Entry) => {
    void runAction(entry, () => updateEntry(date, entry.id, { type: 'killed' }));
  };

  const handleDone = (date: string, entry: Entry) => {
    void runAction(entry, () => updateEntry(date, entry.id, { type: 'done' }));
  };

  const handleAnalyze = async (entry: Entry) => {
    setAnalyzing(entry.id);
    try {
      const result = await analyzeMigrationTask({ text: entry.content, count: 1 });
      setAnalysis(prev => ({ ...prev, [entry.id]: result.analysis }));
    } finally {
      setAnalyzing(null);
    }
  };

  const remaining = pendingTasks.filter(t => !processed.has(t.entry.id));

  const entryColorClass = (entry: Entry): string => {
    if (entry.meta?.priority) return 'migration-content-priority';
    if (entry.meta?.scheduledFor) return 'migration-content-scheduled';
    return 'migration-content-normal';
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-command">
          {getTerminalPrompt()} $ migrate
        </div>
        <h1 className="page-title">
          migration
        </h1>
        <p className="page-subtitle">
          // {remaining.length} pending {remaining.length === 1 ? 'task' : 'tasks'} to review
        </p>
      </div>

      <div className="page-scroll">
        {remaining.length === 0 ? (
          <div className="page-empty">
            // all caught up. no pending tasks to migrate
          </div>
        ) : (
          <div className="page-entries">
            {remaining.map(({ date, entry }) => (
              <div
                key={entry.id}
                className="migration-row"
              >
                <span className="migration-date">
                  {format(new Date(date + 'T12:00:00'), 'MMM d')}
                </span>
                <div className="flex-1">
                  <span className={`migration-content ${entryColorClass(entry)}`}>
                    {entry.content}
                  </span>
                  {actionErrors[entry.id] && (
                    <div className="migration-error">// {actionErrors[entry.id]}</div>
                  )}
                  {(analyzing === entry.id || pendingActionIds.has(entry.id) || analysis[entry.id]) && (
                    <pre className="migration-analysis">
                      {pendingActionIds.has(entry.id) ? '// saving...' : analyzing === entry.id ? '// analyzing...' : analysis[entry.id]}
                    </pre>
                  )}
                </div>
                <div className="migration-actions">
                  <button
                    disabled={pendingActionIds.has(entry.id)}
                    onClick={() => handleAnalyze(entry)}
                    className="migration-action-btn"
                    title="Analyze with AI"
                  >
                    <Sparkles size={14} />
                  </button>
                  <button
                    disabled={pendingActionIds.has(entry.id)}
                    onClick={() => handleDone(date, entry)}
                    className="migration-action-btn"
                    title="Mark done"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    disabled={pendingActionIds.has(entry.id)}
                    onClick={() => handleMigrate(date, entry)}
                    className="migration-action-btn"
                    title="Migrate to tomorrow"
                  >
                    <ArrowRight size={14} />
                  </button>
                  <button
                    disabled={pendingActionIds.has(entry.id)}
                    onClick={() => handleKill(date, entry)}
                    className="migration-action-btn"
                    title="Kill"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
