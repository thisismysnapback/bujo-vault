import React, { useState } from 'react';
import { useVault } from '../store/VaultContext';
import { DailyLog, Entry } from '../types';
import { format, addDays } from 'date-fns';
import { ArrowRight, Check, X, Sparkles } from 'lucide-react';
import { analyzeMigrationTask } from '../services/desktop';

const DAILY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function MigrationView() {
  const { logs, updateEntry, migrateEntry } = useVault();

  const pendingTasks: Array<{ date: string; entry: Entry }> = [];
  for (const [date, log] of Object.entries(logs) as [string, DailyLog][]) {
    if (!DAILY_KEY_RE.test(date)) continue;
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

  const actionBtnStyle = (color: string): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const entryColor = (entry: Entry): string => {
    if (entry.meta?.priority) return 'var(--gold-bright)';
    if (entry.meta?.scheduledFor) return 'var(--gold)';
    return 'var(--text)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '48px 32px 16px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          ryan@bujo.vault $ migrate
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 2px' }}>
          migration
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          // {remaining.length} pending {remaining.length === 1 ? 'task' : 'tasks'} to review
        </p>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 32px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        {remaining.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>
            // all caught up. no pending tasks to migrate
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
            {remaining.map(({ date, entry }) => (
              <div
                key={entry.id}
                className="group"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-faint)', width: '56px', flexShrink: 0 }}>
                  {format(new Date(date + 'T12:00:00'), 'MMM d')}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '13px', color: entryColor(entry) }}>
                    {entry.content}
                  </span>
                  {actionErrors[entry.id] && (
                    <div style={{ fontSize: '12px', color: 'var(--red)', margin: '6px 0 0' }}>// {actionErrors[entry.id]}</div>
                  )}
                  {(analyzing === entry.id || pendingActionIds.has(entry.id) || analysis[entry.id]) && (
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12px', color: 'var(--gold-dim)', margin: '6px 0 0' }}>
                      {pendingActionIds.has(entry.id) ? '// saving...' : analyzing === entry.id ? '// analyzing...' : analysis[entry.id]}
                    </pre>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '2px', opacity: 0, transition: 'opacity 0.15s' }} className="group-hover:opacity-100">
                  <button
                    disabled={pendingActionIds.has(entry.id)}
                    onClick={() => handleAnalyze(entry)}
                    style={actionBtnStyle('var(--gold)')}
                    title="Analyze with AI"
                  >
                    <Sparkles size={14} />
                  </button>
                  <button
                    disabled={pendingActionIds.has(entry.id)}
                    onClick={() => handleDone(date, entry)}
                    style={actionBtnStyle('#4caf50')}
                    title="Mark done"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    disabled={pendingActionIds.has(entry.id)}
                    onClick={() => handleMigrate(date, entry)}
                    style={actionBtnStyle('var(--gold)')}
                    title="Migrate to tomorrow"
                  >
                    <ArrowRight size={14} />
                  </button>
                  <button
                    disabled={pendingActionIds.has(entry.id)}
                    onClick={() => handleKill(date, entry)}
                    style={actionBtnStyle('var(--red)')}
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
