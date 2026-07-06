import { useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { format, subDays } from 'date-fns';
import { getTerminalPrompt, getTodayDateString } from '../lib/utils';
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
      }
      return { ...prev, [date]: existing.filter(id => id !== habitId) };
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

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') addHabit();
  };

  const isCompleted = (habitId: string, date: string) =>
    (completions[date] ?? []).includes(habitId);

  const statFor = (habitId: string): HabitStat | undefined =>
    stats.find(stat => stat.habit.id === habitId);

  if (!hasDesktopApi()) {
    return (
      <div className="habit-unavailable">
        // habits only available in desktop app
      </div>
    );
  }

  return (
    <div className="habit-page">
      <div className="habit-header">
        <div className="habit-command">
          {getTerminalPrompt()} $ habits
        </div>
        <div className="habit-subtitle">
          // daily tracking
        </div>
      </div>

      <div className="habit-section">
        <div className="habit-section-title">
          today - {today}
        </div>
        {habits.length === 0 && (
          <div className="habit-empty">no habits yet. add one below.</div>
        )}
        {habits.map(habit => {
          const done = isCompleted(habit.id, today);
          const stat = statFor(habit.id);
          const streak = stat?.currentStreak ?? 0;
          return (
            <div key={habit.id} className="habit-row">
              <button
                onClick={() => toggle(habit.id, today)}
                className={done ? 'habit-check habit-check-done' : 'habit-check'}
              >
                {done ? '✓' : ''}
              </button>
              <span className={done ? 'habit-name habit-name-done' : 'habit-name'}>
                {habit.emoji ? `${habit.emoji} ` : ''}{habit.name}
              </span>
              {streak > 0 && (
                <span className="habit-streak">
                  {streak >= 7 ? 'hot ' : ''}{streak}d
                </span>
              )}
            </div>
          );
        })}
      </div>

      {habits.length > 0 && (
        <div className="habit-matrix-wrap">
          <div className="habit-section-title">
            last 14 days
          </div>
          <table className="habit-table">
            <thead>
              <tr>
                <th className="habit-table-spacer" />
                {last14.map(date => (
                  <th
                    key={date}
                    className={date === today ? 'habit-table-day habit-table-day-today' : 'habit-table-day'}
                  >
                    {format(new Date(date), 'd')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {habits.map(habit => (
                <tr key={habit.id}>
                  <td className="habit-table-label">
                    {habit.emoji ? `${habit.emoji} ` : ''}{habit.name}
                  </td>
                  {last14.map(date => {
                    const done = isCompleted(habit.id, date);
                    return (
                      <td key={date} className="habit-table-cell">
                        <button
                          onClick={() => toggle(habit.id, date)}
                          className={done ? 'habit-matrix-button habit-matrix-button-done' : 'habit-matrix-button'}
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

      <div className="habit-add">
        <div className="habit-add-row">
          <span className="habit-prompt">{'>'}</span>
          <input
            type="text"
            value={newName}
            onChange={event => setNewName(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="add habit..."
            className="habit-input"
          />
          {newName.trim() && (
            <button onClick={addHabit} className="habit-add-button">
              [enter]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
