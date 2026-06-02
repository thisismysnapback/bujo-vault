import React, { useState, useEffect, useCallback } from 'react';
import { getTodayDateString } from '../lib/utils';
import { format, subDays } from 'date-fns';
import {
  createDailyHabit,
  hasDesktopApi,
  loadHabitDashboard,
  refreshHabitStats,
  toggleHabitCompletion,
  type Habit,
  type HabitStat,
} from '../services/desktop';

function buildLast14(): string[] {
  return Array.from({ length: 14 }, (_, i) =>
    format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
  );
}

export function HabitView() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [stats, setStats] = useState<HabitStat[]>([]);
  const [completions, setCompletions] = useState<Record<string, string[]>>({});
  const [newName, setNewName] = useState('');
  const [today, setToday] = useState(getTodayDateString());
  const last14 = buildLast14();
  const matrixStartDate = last14[0];

  const load = useCallback(async () => {
    const dashboard = await loadHabitDashboard(matrixStartDate, 14);
    if (!dashboard) return;
    setHabits(dashboard.habits);
    setStats(dashboard.stats);
    setCompletions(dashboard.completions);
  }, [matrixStartDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refreshToday = () => setToday(getTodayDateString());
    const interval = window.setInterval(refreshToday, 60000);
    window.addEventListener('focus', refreshToday);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshToday);
    };
  }, []);

  const toggle = useCallback(async (habitId: string, date: string) => {
    const result = await toggleHabitCompletion(habitId, date);
    if (!result) return;
    setCompletions(prev => {
      const existing = prev[date] ?? [];
      if (result.completed) {
        return { ...prev, [date]: [...existing, habitId] };
      } else {
        return { ...prev, [date]: existing.filter(id => id !== habitId) };
      }
    });
    const refreshed = await refreshHabitStats(matrixStartDate, 14);
    if (!refreshed) return;
    setStats(refreshed.stats);
    setCompletions(refreshed.completions);
  }, [matrixStartDate]);

  const addHabit = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await createDailyHabit(name);
    if (!created) return;
    setNewName('');
    await load();
  }, [newName, load]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addHabit();
  };

  const isCompleted = (habitId: string, date: string) =>
    (completions[date] ?? []).includes(habitId);

  const statFor = (habitId: string): HabitStat | undefined =>
    stats.find(s => s.habit.id === habitId);

  if (!hasDesktopApi()) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
        // habits only available in desktop app
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '720px', fontSize: '13px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
          ryan@bujo.vault $ habits
        </div>
        <div style={{ color: 'var(--text-faint)', fontSize: '11px' }}>
          // daily tracking
        </div>
      </div>

      {/* Section A: Today's habits */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>
          today — {today}
        </div>
        {habits.length === 0 && (
          <div style={{ color: 'var(--text-faint)' }}>no habits yet. add one below.</div>
        )}
        {habits.map(habit => {
          const done = isCompleted(habit.id, today);
          const stat = statFor(habit.id);
          const streak = stat?.currentStreak ?? 0;
          return (
            <div
              key={habit.id}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}
            >
              <button
                onClick={() => toggle(habit.id, today)}
                style={{
                  width: '16px',
                  height: '16px',
                  border: `1px solid ${done ? 'var(--green)' : 'var(--text-muted)'}`,
                  background: done ? 'var(--green)' : 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: '#111',
                }}
              >
                {done ? '✓' : ''}
              </button>
              <span style={{ color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                {habit.emoji ? `${habit.emoji} ` : ''}{habit.name}
              </span>
              {streak > 0 && (
                <span style={{ color: 'var(--text-faint)', fontSize: '11px', marginLeft: 'auto' }}>
                  {streak >= 7 ? '🔥' : ''} {streak}d
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Section B: 14-day rolling matrix */}
      {habits.length > 0 && (
        <div style={{ marginBottom: '28px', overflowX: 'auto' }}>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>
            last 14 days
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: 'var(--text-faint)', paddingRight: '16px', fontWeight: 400, minWidth: '100px' }} />
                {last14.map(d => (
                  <th key={d} style={{ color: d === today ? 'var(--gold)' : 'var(--text-faint)', fontWeight: 400, width: '24px', textAlign: 'center', paddingBottom: '6px' }}>
                    {format(new Date(d), 'd')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {habits.map(habit => (
                <tr key={habit.id}>
                  <td style={{ color: 'var(--text-muted)', paddingRight: '16px', paddingBottom: '4px', whiteSpace: 'nowrap' }}>
                    {habit.emoji ? `${habit.emoji} ` : ''}{habit.name}
                  </td>
                  {last14.map(d => {
                    const done = isCompleted(habit.id, d);
                    return (
                      <td key={d} style={{ textAlign: 'center', paddingBottom: '4px' }}>
                        <button
                          onClick={() => toggle(habit.id, d)}
                          style={{
                            width: '14px',
                            height: '14px',
                            border: `1px solid ${done ? 'var(--green)' : 'var(--border)'}`,
                            background: done ? 'var(--green)' : 'transparent',
                            cursor: 'pointer',
                            fontSize: '0',
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section C: Add habit */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--text-faint)' }}>{'>'}</span>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="add habit..."
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'inherit',
              flex: 1,
            }}
          />
          {newName.trim() && (
            <button
              onClick={addHabit}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
            >
              [enter]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
