import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDesktopApi,
  hasDesktopApi,
  loadTodayHabits,
  loadHabitDashboard,
  refreshHabitStats,
  createDailyHabit,
  retryDump,
  summarizeDay,
  analyzeMigrationTask,
  clearAllData,
  generateReview,
  getCoachNudge,
  searchEntries,
} from '../desktop';

beforeEach(() => {
  delete (window as any).bujo;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as any).bujo;
});

function installBujoApi(overrides: Record<string, any> = {}) {
  const api = {
    habitsList: vi.fn().mockResolvedValue([{ id: 'h1', name: 'water', emoji: '💧' }]),
    habitsStats: vi.fn().mockResolvedValue([{ habit: { id: 'h1', name: 'water', frequency: 'daily', created: '2026-06-02', archived: false }, currentStreak: 1, bestStreak: 2, rate30d: 50, totalCompletions: 3 }]),
    habitsCreate: vi.fn().mockResolvedValue({ id: 'h2', name: 'walk', frequency: 'daily', created: '2026-06-02', archived: false }),
    habitsMatrix: vi.fn().mockResolvedValue([{ date: '2026-06-02', completions: { h1: true, h2: false } }]),
    habitsToggle: vi.fn().mockResolvedValue({ completed: false }),
    dumpRetry: vi.fn().mockResolvedValue({ count: 2 }),
    dailySummary: vi.fn().mockResolvedValue({ summary: 'summary text' }),
    migrateAnalyze: vi.fn().mockResolvedValue({ analysis: 'split it smaller', source: 'llm' }),
    coachNudgeLlm: vi.fn().mockResolvedValue({ nudge: 'do one small thing', source: 'llm' }),
    analyticsCoach: vi.fn().mockResolvedValue({ nudge: 'rule fallback' }),
    search: vi.fn().mockResolvedValue([{ id: 'e1', type: 'task', content: 'buy milk', timestamp: 1, source_date: '2026-06-02', display: '· buy milk' }]),
    reviewPerspective: vi.fn().mockResolvedValue({ content: 'perspective review' }),
    reviewSynthesize: vi.fn().mockResolvedValue({ content: 'synthesis review' }),
    clearAllData: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
  (window as any).bujo = api;
  return api;
}

describe('desktop service boundary', () => {
  it('detects whether the Electron preload API is available', () => {
    expect(hasDesktopApi()).toBe(false);
    expect(getDesktopApi()).toBeNull();

    installBujoApi();

    expect(hasDesktopApi()).toBe(true);
    expect(getDesktopApi()).not.toBeNull();
  });

  it('loads today habits and maps persisted completions to habit ids', async () => {
    const api = installBujoApi();

    const result = await loadTodayHabits('2026-06-02');

    expect(api.habitsList).toHaveBeenCalledOnce();
    expect(api.habitsMatrix).toHaveBeenCalledWith('2026-06-02', 1);
    expect(result).toEqual({ habits: [{ id: 'h1', name: 'water', emoji: '💧' }], completedIds: ['h1'] });
  });

  it('returns empty today habit data outside Electron', async () => {
    await expect(loadTodayHabits('2026-06-02')).resolves.toEqual({ habits: [], completedIds: [] });
  });

  it('loads habit dashboard data and refreshes stat/matrix data through one service', async () => {
    const api = installBujoApi();

    await expect(loadHabitDashboard('2026-05-20', 14)).resolves.toEqual({
      habits: [{ id: 'h1', name: 'water', emoji: '💧' }],
      stats: [{ habit: { id: 'h1', name: 'water', frequency: 'daily', created: '2026-06-02', archived: false }, currentStreak: 1, bestStreak: 2, rate30d: 50, totalCompletions: 3 }],
      completions: { '2026-06-02': ['h1'] },
    });
    await expect(refreshHabitStats('2026-05-20', 14)).resolves.toEqual({
      stats: [{ habit: { id: 'h1', name: 'water', frequency: 'daily', created: '2026-06-02', archived: false }, currentStreak: 1, bestStreak: 2, rate30d: 50, totalCompletions: 3 }],
      completions: { '2026-06-02': ['h1'] },
    });
    await expect(createDailyHabit('walk')).resolves.toBe(true);
    expect(api.habitsCreate).toHaveBeenCalledWith('walk', 'daily');
  });

  it('wraps LLM and retry IPC calls behind renderer-friendly helpers', async () => {
    installBujoApi();

    await expect(retryDump()).resolves.toEqual({ count: 2 });
    await expect(summarizeDay('2026-06-01')).resolves.toEqual({ summary: 'summary text' });
    await expect(analyzeMigrationTask({ text: 'big stale task', count: 3 })).resolves.toEqual({ analysis: 'split it smaller', source: 'llm' });
    await expect(getCoachNudge('2026-06-02')).resolves.toEqual({ nudge: 'do one small thing', source: 'llm' });
    await expect(searchEntries('milk', 'semantic')).resolves.toHaveLength(1);
  });

  it('falls back from LLM coach nudge to rule coach data', async () => {
    const api = installBujoApi({ coachNudgeLlm: vi.fn().mockRejectedValue(new Error('offline')) });

    await expect(getCoachNudge('2026-06-02')).resolves.toEqual({ nudge: 'rule fallback', source: 'rule' });
    expect(api.analyticsCoach).toHaveBeenCalledOnce();
  });

  it('routes review generation to synthesis or perspective IPC calls', async () => {
    const api = installBujoApi();

    await expect(generateReview('2026-06', 'synthesis')).resolves.toEqual({ content: 'synthesis review' });
    await expect(generateReview('2026-06', 'creative', true)).resolves.toEqual({ content: 'perspective review' });

    expect(api.reviewSynthesize).toHaveBeenCalledWith('2026-06');
    expect(api.reviewPerspective).toHaveBeenCalledWith('2026-06', 'creative', true);
  });

  it('guards clear-all-data behind the desktop API result', async () => {
    await expect(clearAllData()).resolves.toBe(false);

    const api = installBujoApi();
    await expect(clearAllData()).resolves.toBe(true);
    expect(api.clearAllData).toHaveBeenCalledOnce();

    installBujoApi({ clearAllData: vi.fn().mockResolvedValue({ success: false }) });
    await expect(clearAllData()).resolves.toBe(false);
  });
});
