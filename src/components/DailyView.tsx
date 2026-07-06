import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useVault } from '../store/VaultContext';
import { getGreeting, getTerminalPrompt, getTodayDateString } from '../lib/utils';
import { EntryItem } from './EntryItem';
import { InputBar } from './InputBar';
import { format, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

import { entrySortKey } from '../lib/entryModel';
import { getCoachNudge, getOriginalInput, loadTodayHabits, summarizeDay, toggleHabitCompletion } from '../services/desktop';
import { buildPromptInput, drawDailyPrompts, type JournalPrompt, type PromptCycleState, remainingPromptsInCycle } from '../lib/journalPrompts';

const PROMPT_CYCLE_STORAGE_KEY = 'bujo:promptCycle';

function loadPromptCycle(): PromptCycleState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(PROMPT_CYCLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'cycleId' in parsed && 'date' in parsed && 'usedIds' in parsed) {
      return parsed as PromptCycleState;
    }
  } catch { /* ignore */ }
  return null;
}

function savePromptCycle(state: PromptCycleState) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PROMPT_CYCLE_STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function DailyView() {
  const { logs, updateEntry, clearDay, undo, autoCompletions, dismissAutoCompletion, pendingNavigateDate, clearPendingNavigateDate } = useVault();
  const [date, setDate] = useState(getTodayDateString());
  const [greeting, setGreeting] = useState(getGreeting());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [nudge, setNudge] = useState<string>('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [todayHabits, setTodayHabits] = useState<Array<{ id: string; name: string; emoji?: string }>>([]);
  const [habitCompletions, setHabitCompletions] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [original, setOriginal] = useState<{ exists: boolean; content: string }>({ exists: false, content: '' });
  const [showOriginal, setShowOriginal] = useState(false);
  const [activePrompt, setActivePrompt] = useState<JournalPrompt | null>(null);
  const [dailyPrompts, setDailyPrompts] = useState<JournalPrompt[]>([]);
  const [cycleRemaining, setCycleRemaining] = useState<number>(0);
  const [promptsExpanded, setPromptsExpanded] = useState(false);

  const dateRef = useRef(date);
  const focusedRef = useRef(focusedIndex);
  const logsRef = useRef(logs);
  dateRef.current = date;
  focusedRef.current = focusedIndex;
  logsRef.current = logs;

  useEffect(() => {
    const interval = setInterval(() => setGreeting(getGreeting()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (pendingNavigateDate) {
      setDate(pendingNavigateDate);
      clearPendingNavigateDate();
    }
  }, [pendingNavigateDate, clearPendingNavigateDate]);

  // Pick prompts from the 31-prompt bank for whichever day is selected.
  useEffect(() => {
    const prev = loadPromptCycle();
    const result = drawDailyPrompts(prev, date);
    const todaysIds = result.prompts.map(p => p.id);
    const usedIds = Array.from(new Set([...(prev?.usedIds ?? []), ...todaysIds]));
    const next: PromptCycleState = {
      cycleId: result.cycleId,
      date,
      usedIds,
      todaysIds,
    };
    savePromptCycle(next);
    setDailyPrompts(result.prompts);
    setCycleRemaining(remainingPromptsInCycle(next));
  }, [date]);

  useEffect(() => {
    setFocusedIndex(-1);
    setPromptsExpanded(false);
  }, [date]);

  // Load coach nudge for the selected day after the browser has had time to paint and accept input.
  useEffect(() => {
    const dismissed = localStorage.getItem(`bujo:nudge:dismissed:${date}`);
    setNudge('');
    setNudgeDismissed(Boolean(dismissed));
    if (dismissed) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;
    const load = () => {
      getCoachNudge(date).then(data => {
        if (!cancelled) setNudge(data.nudge || '');
      }).catch(() => {});
    };
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(load, { timeout: 3000 });
    } else {
      timeoutId = setTimeout(load, 1500);
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [date, logs]);

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
  const sortedEntries = useMemo(() => [...dayLog.entries].sort(
    (a, b) => entrySortKey(a) - entrySortKey(b)
  ), [dayLog.entries]);
  const sortedEntriesRef = useRef(sortedEntries);
  sortedEntriesRef.current = sortedEntries;

  const handleClearDay = useCallback(async () => {
    const hasData = sortedEntriesRef.current.length > 0 || original.exists;
    if (!hasData) return;
    if (!window.confirm(`Clear all entries and original input for ${date}?`)) return;
    await clearDay(date);
    setFocusedIndex(-1);
    setOriginal({ exists: false, content: '' });
    setShowOriginal(false);
    setSummary('');
    setNudge('');
  }, [clearDay, date, original.exists]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const max = Math.max(0, sortedEntriesRef.current.length - 1);
      setFocusedIndex((prev) => Math.min(max, prev + 1));
    } else if (e.key === 'Escape') {
      setFocusedIndex(-1);
    } else if (e.key === 'x' && focusedRef.current >= 0) {
      const log = logsRef.current[dateRef.current];
      if (log) {
        const entry = sortedEntriesRef.current[focusedRef.current];
        if (entry && entry.kind === 'task' && entry.status === 'active') {
          updateEntry(dateRef.current, entry.id, { type: 'done' });
        } else if (entry && entry.kind === 'task' && entry.status === 'done') {
          updateEntry(dateRef.current, entry.id, { type: 'task' });
        }
      }
    } else if (e.key === 'k' && focusedRef.current >= 0) {
      const log = logsRef.current[dateRef.current];
      if (log) {
        const entry = sortedEntriesRef.current[focusedRef.current];
        if (entry && entry.status !== 'killed') {
          updateEntry(dateRef.current, entry.id, { type: 'killed' });
        }
      }
    } else if (e.key === '>' && focusedRef.current >= 0) {
      const log = logsRef.current[dateRef.current];
      if (log) {
        const entry = sortedEntriesRef.current[focusedRef.current];
        if (entry && entry.status !== 'migrated') {
          updateEntry(dateRef.current, entry.id, { type: 'migrated' });
        }
      }
    } else if (e.key === 'Delete' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleClearDay();
    }
  }, [updateEntry, handleClearDay]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isToday = date === getTodayDateString();

  useEffect(() => {
    let cancelled = false;
    setShowOriginal(false);
    getOriginalInput(date).then(result => {
      if (!cancelled) setOriginal({ exists: Boolean(result?.exists), content: result?.content || '' });
    }).catch(() => {
      if (!cancelled) setOriginal({ exists: false, content: '' });
    });
    return () => { cancelled = true; };
  }, [date, logs]);

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

  const handleToggleOriginal = useCallback(() => {
    setShowOriginal(prev => !prev);
  }, []);

  const handleEntrySaved = useCallback(() => {
    setPromptsExpanded(false);
  }, []);

  const hasDayData = sortedEntries.length > 0 || original.exists;
  const promptsOpen = sortedEntries.length === 0 || promptsExpanded;

  return (
    <div className="view-shell">
      {/* Date nav bar */}
      <div className="daily-nav">
        <button onClick={handlePrevDay} className="daily-nav-button">
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={handleToday}
          className={`daily-nav-today ${isToday ? 'daily-nav-today-active' : ''}`}
        >
          today
        </button>
        <button onClick={handleNextDay} className="daily-nav-button">
          <ChevronRight size={14} />
        </button>
        <span className="daily-nav-date">
          {format(new Date(date + 'T12:00:00'), 'EEE, MMM d yyyy').toLowerCase()}
        </span>
      </div>

      <div className="view-scroll">
        {/* Terminal prompt */}
        <div className="terminal-command">
          <span className="terminal-prompt">{getTerminalPrompt()}</span>
          <span className="terminal-muted"> $ </span>
          <span className="terminal-command-text">log {format(new Date(date + 'T12:00:00'), 'yyyy-MM-dd')}</span>
        </div>

        {/* Date heading */}
        <div className="daily-heading">
          <h1 className="daily-heading-title">
            {format(new Date(date + 'T12:00:00'), 'EEEE, MMMM do').toLowerCase()}
          </h1>
          {isToday && <p className="daily-greeting">// {greeting}</p>}
          {(!isToday || original.exists || hasDayData) && (
            <div className="daily-actions">
              {!isToday && (
                <button onClick={handleSummarize} disabled={isSummarizing} className="daily-action">
                  [{isSummarizing ? 'summarizing...' : 'summarize'}]
                </button>
              )}
              {original.exists && (
                <button onClick={handleToggleOriginal} className="daily-action">
                  [{showOriginal ? 'hide original' : 'original'}]
                </button>
              )}
              {hasDayData && (
                <button onClick={handleClearDay} className="daily-action daily-action-danger">
                  [clear all]
                </button>
              )}
            </div>
          )}
          {summary && <pre className="daily-pre">{summary}</pre>}
          {showOriginal && original.exists && (
            <pre className="daily-pre daily-original">
              {original.content}
            </pre>
          )}
        </div>

        <div className="daily-entry-stack">
          {sortedEntries.length === 0 ? (
            <div className="daily-empty">
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

      <div className="daily-bottom">
        {/* Habit strip — today only */}
        {isToday && todayHabits.length > 0 && (
          <div className="habit-strip">
            {todayHabits.map(h => {
              const done = habitCompletions.includes(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h.id)}
                  className={`habit-button ${done ? 'daily-habit-done' : 'daily-habit-open'}`}
                >
                  <span className={done ? 'daily-habit-marker-done' : 'daily-habit-marker-open'}>[{done ? 'x' : ' '}]</span>
                  {h.emoji ? `${h.emoji} ` : ''}{h.name}
                </button>
              );
            })}
          </div>
        )}

        {nudge && !nudgeDismissed && (
          <div className="coach-nudge">
            <span>// coach: {nudge}</span>
            <button
              onClick={() => { setNudgeDismissed(true); localStorage.setItem(`bujo:nudge:dismissed:${date}`, '1'); }}
              className="dismiss-button"
            >
              ×
            </button>
          </div>
        )}
        {autoCompletions.length > 0 && (
          <div className="auto-complete-notices">
            {autoCompletions.map(item => (
              <div key={item.key} className="auto-complete-notice">
                <span>// auto-resolved: "{item.task}" ({item.date})</span>
                <button
                  onClick={async () => {
                    await undo();
                    dismissAutoCompletion(item.key);
                  }}
                  className="auto-complete-action"
                >
                  undo
                </button>
                <button
                  onClick={() => dismissAutoCompletion(item.key)}
                  className="dismiss-button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {dailyPrompts.length > 0 && (
          <div className="prompt-section">
            <div className="prompt-header">
              <button
                onClick={() => setPromptsExpanded(prev => !prev)}
                className="prompt-toggle"
              >
                // {sortedEntries.length === 0 ? 'pick a prompt to start' : 'prompts for this day'}
              </button>
              <span className="prompt-count">// {cycleRemaining} left in cycle</span>
            </div>
            {promptsOpen && (
              <div className="prompt-list">
                {dailyPrompts.map(prompt => (
                  <button
                    key={prompt.id}
                    onClick={() => setActivePrompt(prompt)}
                    className="prompt-chip"
                  >
                    // {prompt.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <InputBar
          date={date}
          prefill={activePrompt ? buildPromptInput(activePrompt) : undefined}
          onPrefillConsumed={() => setActivePrompt(null)}
          onEntrySaved={handleEntrySaved}
        />
      </div>
    </div>
  );
}
