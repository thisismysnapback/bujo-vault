import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVault } from '../store/VaultContext';
import { getGreeting, getTodayDateString } from '../lib/utils';
import { EntryItem } from './EntryItem';
import { InputBar } from './InputBar';
import { format, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

import { entrySortKey } from '../lib/entryModel';
import { getCoachNudge, loadTodayHabits, summarizeDay, toggleHabitCompletion } from '../services/desktop';

export function DailyView() {
  const { logs, updateEntry, clearDay } = useVault();
  const [date, setDate] = useState(getTodayDateString());
  const [greeting, setGreeting] = useState(getGreeting());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [nudge, setNudge] = useState<string>('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [todayHabits, setTodayHabits] = useState<Array<{ id: string; name: string; emoji?: string }>>([]);
  const [habitCompletions, setHabitCompletions] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);

  const dateRef = useRef(date);
  const focusedRef = useRef(focusedIndex);
  dateRef.current = date;
  focusedRef.current = focusedIndex;

  useEffect(() => {
    const interval = setInterval(() => setGreeting(getGreeting()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Check for calendar navigation date
  useEffect(() => {
    const navDate = (window as any).__bujoNavigateDate;
    if (navDate) {
      setDate(navDate);
      (window as any).__bujoNavigateDate = undefined;
    }
  });

  // Session detection: focus input on empty day, focus list on existing
  useEffect(() => {
    const dayLog = logs[date];
    if (dayLog && dayLog.entries.length > 0 && focusedIndex === -1) {
      setFocusedIndex(dayLog.entries.length - 1);
    }
  }, [date, logs]);

  // Load coach nudge for today
  useEffect(() => {
    if (date !== getTodayDateString()) return;
    const dismissed = sessionStorage.getItem(`bujo:nudge:dismissed:${date}`);
    if (dismissed) return;
    getCoachNudge(date).then(data => {
      if (data.nudge) setNudge(data.nudge);
    }).catch(() => {});
  }, [date]);

  // Load today's habits and persisted completions for the inline strip
  useEffect(() => {
    if (date !== getTodayDateString()) return;
    loadTodayHabits(date).then(({ habits, completedIds }) => {
      setTodayHabits(habits);
      setHabitCompletions(completedIds);
    }).catch(() => {});
  }, [date]);

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    const prev = subDays(d, 1);
    setDate(format(prev, 'yyyy-MM-dd'));
    setFocusedIndex(-1);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    const next = addDays(d, 1);
    setDate(format(next, 'yyyy-MM-dd'));
    setFocusedIndex(-1);
  };

  const handleToday = () => {
    setDate(getTodayDateString());
    setFocusedIndex(-1);
  };

  const dayLog = logs[date] || { date, entries: [] };
  const sortedEntries = [...dayLog.entries].sort(
    (a, b) => entrySortKey(a) - entrySortKey(b)
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const log = logs[dateRef.current];
      const sorted = log ? [...log.entries].sort(
        (a, b) => entrySortKey(a) - entrySortKey(b)
      ) : [];
      const max = Math.max(0, sorted.length - 1);
      setFocusedIndex((prev) => Math.min(max, prev + 1));
    } else if (e.key === 'Escape') {
      setFocusedIndex(-1);
    } else if (e.key === 'x' && focusedRef.current >= 0) {
      const log = logs[dateRef.current];
      if (log) {
        const sorted = [...log.entries].sort(
          (a, b) => entrySortKey(a) - entrySortKey(b)
        );
        const entry = sorted[focusedRef.current];
        if (entry && entry.kind === 'task' && entry.status === 'active') {
          updateEntry(dateRef.current, entry.id, { type: 'done' });
        } else if (entry && entry.kind === 'task' && entry.status === 'done') {
          updateEntry(dateRef.current, entry.id, { type: 'task' });
        }
      }
    } else if (e.key === 'k' && focusedRef.current >= 0) {
      const log = logs[dateRef.current];
      if (log) {
        const sorted = [...log.entries].sort(
          (a, b) => entrySortKey(a) - entrySortKey(b)
        );
        const entry = sorted[focusedRef.current];
        if (entry && entry.status !== 'killed') {
          updateEntry(dateRef.current, entry.id, { type: 'killed' });
        }
      }
    } else if (e.key === '>' && focusedRef.current >= 0) {
      const log = logs[dateRef.current];
      if (log) {
        const sorted = [...log.entries].sort(
          (a, b) => entrySortKey(a) - entrySortKey(b)
        );
        const entry = sorted[focusedRef.current];
        if (entry && entry.status !== 'migrated') {
          updateEntry(dateRef.current, entry.id, { type: 'migrated' });
        }
      }
    } else if (e.key === 'Delete' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      clearDay(dateRef.current);
      setFocusedIndex(-1);
    }
  }, [logs, updateEntry, clearDay]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isToday = date === getTodayDateString();

  const toggleHabit = useCallback(async (habitId: string) => {
    const result = await toggleHabitCompletion(habitId, date);
    if (!result) return;
    setHabitCompletions(prev =>
      result.completed ? [...prev, habitId] : prev.filter(id => id !== habitId)
    );
  }, [date]);

  const handleSummarize = useCallback(async () => {
    setIsSummarizing(true);
    setSummary('');
    try {
      const result = await summarizeDay(date);
      setSummary(result.summary || `// ${result.error || 'summary unavailable'}`);
    } finally {
      setIsSummarizing(false);
    }
  }, [date]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Date nav bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={handlePrevDay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={handleToday}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: isToday ? 'var(--gold)' : 'var(--text-muted)',
            fontSize: '12px',
            fontFamily: 'inherit',
            padding: '2px 6px',
          }}
        >
          today
        </button>
        <button onClick={handleNextDay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>
          <ChevronRight size={14} />
        </button>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
          {format(new Date(date + 'T12:00:00'), 'EEE, MMM d yyyy').toLowerCase()}
        </span>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
        {/* Terminal prompt */}
        <div style={{ fontSize: '13px', marginBottom: '24px' }}>
          <span style={{ color: 'var(--gold)' }}>ryan</span>
          <span style={{ color: 'var(--text-muted)' }}>@</span>
          <span style={{ color: 'var(--gold)' }}>bujo.vault</span>
          <span style={{ color: 'var(--text-muted)' }}> $ </span>
          <span style={{ color: 'var(--text)' }}>log {format(new Date(date + 'T12:00:00'), 'yyyy-MM-dd')}</span>
        </div>

        {/* Date heading */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '600', color: 'var(--text)', margin: 0, fontFamily: 'inherit' }}>
            {format(new Date(date + 'T12:00:00'), 'EEEE, MMMM do').toLowerCase()}
          </h1>
          {isToday && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>// {greeting}</p>}
          {!isToday && (
            <button onClick={handleSummarize} disabled={isSummarizing} style={{ marginTop: '8px', background: 'transparent', border: 'none', color: 'var(--gold)', fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
              [{isSummarizing ? 'summarizing...' : 'summarize'}]
            </button>
          )}
          {summary && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'var(--text-muted)', fontSize: '12px', marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>{summary}</pre>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '32px' }}>
          {sortedEntries.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-faint)', fontStyle: 'italic', padding: '8px 0' }}>
              // no entries yet. start typing to capture.
            </div>
          ) : (
            sortedEntries.map((entry, idx) => (
              <EntryItem
                key={entry.id}
                entry={entry}
                date={date}
                source={{ kind: 'daily', date }}
                isFocused={focusedIndex === idx}
              />
            ))
          )}
        </div>
      </div>

      <div style={{ padding: '16px 24px 24px', maxWidth: '640px', margin: '0 auto', width: '100%' }}>
        {/* Habit strip — today only */}
        {isToday && todayHabits.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px', fontSize: '12px' }}>
            {todayHabits.map(h => {
              const done = habitCompletions.includes(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: done ? 'var(--green)' : 'var(--text-muted)',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span style={{ color: done ? 'var(--green)' : 'var(--text-faint)' }}>[{done ? 'x' : ' '}]</span>
                  {h.emoji ? `${h.emoji} ` : ''}{h.name}
                </button>
              );
            })}
          </div>
        )}

        {nudge && isToday && !nudgeDismissed && (
          <div style={{ fontSize: '12px', color: 'var(--gold-dim)', padding: '8px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span>// coach: {nudge}</span>
            <button
              onClick={() => { setNudgeDismissed(true); sessionStorage.setItem(`bujo:nudge:dismissed:${date}`, '1'); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: '0 0 0 8px', fontSize: '12px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )}
        <InputBar date={date} />
      </div>
    </div>
  );
}
