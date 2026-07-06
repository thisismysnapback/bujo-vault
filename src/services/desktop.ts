import { Entry } from '../types';
import type { BuJoApi } from '../types/bujo';

export type SearchMode = 'text' | 'semantic';
export type TodayHabit = { id: string; name: string; emoji?: string };
export type Habit = { id: string; name: string; frequency: 'daily' | 'weekly' | 'custom'; created: string; archived: boolean; emoji?: string };
export type HabitStat = {
  habit: Habit;
  currentStreak: number;
  bestStreak: number;
  rate30d: number;
  totalCompletions: number;
};
export type MigrationAnalysisInput = { text: string; count?: number; firstSeen?: string; lastSeen?: string };

export function getDesktopApi(): BuJoApi | null {
  if (typeof window === 'undefined' || !window.bujo) return null;
  return window.bujo;
}

export function hasDesktopApi(): boolean {
  return getDesktopApi() !== null;
}

export async function loadTodayHabits(date: string): Promise<{ habits: TodayHabit[]; completedIds: string[] }> {
  const api = getDesktopApi();
  if (!api) return { habits: [], completedIds: [] };

  const [list, matrix] = await Promise.all([
    api.habitsList(),
    api.habitsMatrix(date, 1),
  ]);

  const todayRow = matrix[0]?.completions ?? {};
  return {
    habits: list.map(h => ({ id: h.id, name: h.name, emoji: h.emoji })),
    completedIds: Object.entries(todayRow)
      .filter(([, completed]) => completed)
      .map(([habitId]) => habitId),
  };
}

export async function toggleHabitCompletion(habitId: string, date: string): Promise<{ completed: boolean } | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.habitsToggle(habitId, date);
}

function matrixToCompletedIdsByDate(matrix: Array<{ date: string; completions: Record<string, boolean> }>): Record<string, string[]> {
  return Object.fromEntries(
    matrix.map(day => [
      day.date,
      Object.entries(day.completions)
        .filter(([, completed]) => completed)
        .map(([habitId]) => habitId),
    ])
  );
}

export async function loadHabitDashboard(startDate: string, days: number): Promise<{ habits: Habit[]; stats: HabitStat[]; completions: Record<string, string[]> } | null> {
  const api = getDesktopApi();
  if (!api) return null;

  const [habits, stats, matrix] = await Promise.all([
    api.habitsList(),
    api.habitsStats(),
    api.habitsMatrix(startDate, days),
  ]);

  return { habits: habits as Habit[], stats: stats as HabitStat[], completions: matrixToCompletedIdsByDate(matrix) };
}

export async function refreshHabitStats(startDate: string, days: number): Promise<{ stats: HabitStat[]; completions: Record<string, string[]> } | null> {
  const api = getDesktopApi();
  if (!api) return null;

  const [stats, matrix] = await Promise.all([
    api.habitsStats(),
    api.habitsMatrix(startDate, days),
  ]);

  return { stats: stats as HabitStat[], completions: matrixToCompletedIdsByDate(matrix) };
}

export async function createDailyHabit(name: string): Promise<boolean> {
  const api = getDesktopApi();
  if (!api) return false;
  await api.habitsCreate(name, 'daily');
  return true;
}

export async function retryDump(): Promise<{ entries?: Array<[string, string]>; count?: number; message?: string; error?: string } | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.dumpRetry();
}

export async function summarizeDay(date: string): Promise<{ summary?: string; error?: string }> {
  const api = getDesktopApi();
  if (!api) return { error: 'desktop app required' };
  return api.dailySummary(date);
}

export async function saveOriginalInput(date: string, text: string): Promise<{ success?: boolean; error?: string } | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.originalSave(date, text);
}

export async function getOriginalInput(date: string): Promise<{ exists: boolean; content: string; filePath: string; error?: string } | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.originalGet(date);
}

export async function analyzeMigrationTask(task: MigrationAnalysisInput | string): Promise<{ analysis: string; source: 'llm' | 'fallback' }> {
  const api = getDesktopApi();
  if (!api) return { analysis: '// ai unavailable', source: 'fallback' };
  return api.migrateAnalyze(task);
}

export async function getCoachNudge(date: string): Promise<{ nudge: string; source: 'llm' | 'rule' }> {
  const api = getDesktopApi();
  if (!api) return { nudge: '', source: 'rule' };

  try {
    const data = await api.coachNudgeLlm(date);
    return data;
  } catch {
    // Fall through to deterministic analytics coach below.
  }

  const fallback = await api.analyticsCoach();
  return { nudge: fallback.nudge, source: 'rule' };
}

export async function searchEntries(query: string, mode: SearchMode = 'text'): Promise<Entry[]> {
  const api = getDesktopApi();
  if (!api) return [];
  return api.search(query, mode) as Promise<Entry[]>;
}

export async function getCoachData(): Promise<Awaited<ReturnType<BuJoApi['analyticsCoach']>> | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.analyticsCoach();
}

export async function getStats(days: number): Promise<Awaited<ReturnType<BuJoApi['analyticsStats']>> | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.analyticsStats(days);
}

export async function getHeatmap(): Promise<Awaited<ReturnType<BuJoApi['analyticsHeatmap']>> | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.analyticsHeatmap();
}

export async function listReviews(monthKey: string): Promise<Record<string, boolean>> {
  const api = getDesktopApi();
  if (!api) return {};
  return api.reviewList(monthKey);
}

export async function getReview(monthKey: string, perspective: string): Promise<{ content: string; exists: boolean } | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.reviewGet(monthKey, perspective);
}

export async function generateReview(monthKey: string, perspective: string, force = false): Promise<{ content: string; cached?: boolean; error?: string } | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return perspective === 'synthesis'
    ? api.reviewSynthesize(monthKey)
    : api.reviewPerspective(monthKey, perspective, force);
}

export async function loadSettings(): Promise<{ vaultPath: string; config: Awaited<ReturnType<BuJoApi['configGet']>> } | null> {
  const api = getDesktopApi();
  if (!api) return null;
  const [info, config] = await Promise.all([api.vaultInfo(), api.configGet()]);
  return { vaultPath: info.path, config };
}

export async function saveSettings(config: Parameters<BuJoApi['configSave']>[0]): Promise<{ success: boolean } | null> {
  const api = getDesktopApi();
  if (!api) return null;
  return api.configSave(config);
}

export async function pickVaultFolder(): Promise<string | null> {
  const api = getDesktopApi();
  if (!api) return null;
  const result = await api.vaultPickFolder();
  return result.path;
}

export async function clearDays(dates: string[]): Promise<boolean> {
  const api = getDesktopApi();
  if (!api) return false;
  await Promise.all(dates.map(date => api.clearDay(date)));
  return true;
}

export async function clearAllData(): Promise<boolean> {
  const api = getDesktopApi();
  if (!api?.clearAllData) return false;
  const result = await api.clearAllData();
  return Boolean(result.success);
}
