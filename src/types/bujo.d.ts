export interface BuJoApi {
  // Vault operations
  vaultEnsure(): Promise<{ success: boolean }>
  vaultInfo(): Promise<{ path: string }>

  // Day log
  getDay(date: string): Promise<{ date: string; entries: Array<{
    id: string; type: string; content: string; timestamp: number; source_date: string; display: string
  }>; file_path: string }>
  getRange(days: number): Promise<Array<{
    date: string; entries: Array<{
      id: string; type: string; content: string; timestamp: number; source_date: string; display: string
    }>; file_path: string
  }>>

  // Entries
  appendEntry(date: string, type: string, content: string): Promise<{ success: boolean; entry?: {
    id: string; type: string; content: string; timestamp: number; source_date: string; display: string
  }; autoCompleted?: Array<{ date: string; id: string; daysStalled: number; task: string; evidence: string }>; error?: string }>
  appendEntriesBatch?(date: string, entries: Array<{ type: string; content: string }>): Promise<{ success: boolean; entries?: Array<{
    id: string; type: string; content: string; timestamp: number; source_date: string; display: string
  }>; autoCompleted?: Array<{ date: string; id: string; daysStalled: number; task: string; evidence: string }>; error?: string }>
  appendMonthlyEntry(monthKey: string, type: string, content: string): Promise<{ success: boolean }>
  appendFutureEntry(monthLabel: string, content: string): Promise<{ success: boolean }>
  updateEntry(date: string, id: string, type: string, content: string): Promise<{ success?: boolean; error?: string }>
  updateMonthlyEntry(monthKey: string, id: string, type: string, content: string): Promise<{ success?: boolean; error?: string }>
  deleteEntry(date: string, id: string): Promise<{ success?: boolean; error?: string }>
  deleteMonthlyEntry(monthKey: string, id: string): Promise<{ success?: boolean; error?: string }>

  // Monthly
  getMonthly(year: number, month: number): Promise<{ date: string; entries: Array<{
    id: string; type: string; content: string; timestamp: number; source_date: string; display: string
  }>; header: string; file_path: string }>

  // Future
  getFuture(): Promise<Record<string, string[]>>
  updateFutureEntry?(monthLabel: string, oldContent: string, type: string, content: string): Promise<{ success?: boolean; error?: string }>
  deleteFutureEntry?(monthLabel: string, content: string): Promise<{ success?: boolean; error?: string }>

  // Search
  search(query: string, mode?: 'text' | 'semantic'): Promise<Array<{
    id: string; type: string; content: string; timestamp: number; source_date: string; display: string
  }>>

  // Clear
  clearDay(date: string): Promise<{ success: boolean; error?: string }>
  clearAllData(): Promise<{ success: boolean; removed?: number; error?: string }>

  // Undo
  undo(): Promise<{ description?: string; filePath?: string; filePaths?: string[]; error?: string }>

  // Migration
  migrateEntry(fromDate: string, toDate: string, entryId: string): Promise<{ success: boolean; error?: string }>

  // Parsing
  smartParse(text: string, logDate?: string): Promise<Array<[string, string]>>
  originalSave(date: string, text: string): Promise<{ success: boolean; filePath?: string; error?: string }>
  originalGet(date: string): Promise<{ exists: boolean; content: string; filePath: string; error?: string }>

  // Analytics
  analyticsStreak(): Promise<number>
  analyticsWeekly(): Promise<{
    totalEntries: number; done: number; killed: number; migrated: number;
    tasks: number; streak: number; completionRate: number
  }>
  analyticsStats(days: number): Promise<{
    period: {
      rate: number; prevRate: number; greenDays: number;
      daysTracked: number; weekdayAvg: number; weekendAvg: number;
    };
    dowRates: number[];
    dowEntries: number[];
    dowLoggedDays: number[];
    journal: {
      periodEntries: number;
      entriesPerTrackedDay: number;
      activeDays: number;
      quietDays: number;
      mix: { tasks: number; notes: number; events: number };
      signals: { lowEnergy: number; stress: number; satisfaction: number; pride: number };
      themes: Array<{ label: string; count: number }>;
      openLoops: Array<{ text: string; date: string; kind: string }>;
    };
    allTime: { rate: number; daysTracked: number; perfectDays: number };
    bestStreak: number;
    currentStreak: number;
  }>
  analyticsHeatmap(): Promise<Record<string, { count: number; rate: number; tasks: number; notes: number; events: number }>>
  migrateAnalyze(task: { text: string; count?: number; firstSeen?: string; lastSeen?: string } | string): Promise<{ analysis: string; source: 'llm' | 'fallback' }>
  coachNudgeLlm(date: string): Promise<{ nudge: string; source: 'llm' | 'rule' }>
  dailySummary(date: string): Promise<{ summary?: string; error?: string }>
  analyticsCoach(): Promise<{
    period: string; streak: number; momentum: string; completionRate: number;
    priorityAlignment: number; totalEntries: number; progressEntries: number; taskEntries?: number;
    stuckTasks: Array<{ text: string; count: number }>;
    killThemes: Record<string, number>;
    eventDensity: Record<string, { days: number; completionRate: number }>;
    noteHeavyDays: string[]; nudge: string; empty: boolean;
    productiveTime: string; tasksPerDayAvg: number
  }>

  // Dump retry
  dumpRetry(): Promise<{ entries?: Array<[string, string]>; count?: number; message?: string; error?: string }>

  // Context
  contextGet(): Promise<{ me: string; evals: string }>
  contextSave(section: string, content: string): Promise<{ success: boolean }>
  contextEvalSave(monthLabel: string, evalText: string): Promise<{ success: boolean }>

  // Future
  futureMarkDone(text: string): Promise<{ success: boolean; error?: string }>

  // Config
  configGet(): Promise<{ has_api_key: boolean; api_key_preview: string; provider?: 'minimax' | 'deepseek'; model: string; vault_path: string; theme: string; error?: string }>
  configSave(config: { api_key?: string; clear_api_key?: boolean; provider?: 'minimax' | 'deepseek'; model?: string; vault_path?: string; theme?: string }): Promise<{ success: boolean }>
  vaultPickFolder(): Promise<{ path: string | null }>

  // Templates
  templatesList(): Promise<string[]>
  templatesApply(name: string, targetDate: string): Promise<{ success: boolean; error?: string }>

  // File watching
  startListening(): Promise<void>
  bridgeDiagnostics(): { preload: string; loadedAt: string }

  // Global hotkey
  globalHotkey(callback: () => void): () => void

  // Habits
  habitsList(): Promise<Array<{ id: string; name: string; frequency: 'daily' | 'weekly' | 'custom'; created: string; archived: boolean; emoji?: string }>>
  habitsCreate(name: string, frequency: string, emoji?: string): Promise<{ id: string; name: string; frequency: string; created: string; archived: boolean; emoji?: string }>
  habitsUpdate(id: string, updates: { name?: string; frequency?: string; emoji?: string; archived?: boolean }): Promise<{ success: boolean; error?: string }>
  habitsDelete(id: string): Promise<{ success: boolean; error?: string }>
  habitsToggle(id: string, date: string): Promise<{ completed: boolean }>
  habitsStats(): Promise<Array<{
    habit: { id: string; name: string; frequency: string; created: string; archived: boolean; emoji?: string };
    currentStreak: number;
    bestStreak: number;
    rate30d: number;
    totalCompletions: number;
  }>>
  habitsMatrix(startDate: string, days: number): Promise<Array<{
    date: string;
    completions: Record<string, boolean>;
  }>>

  // Review
  reviewPerspective(monthKey: string, perspective: string, force?: boolean): Promise<{ content: string; cached?: boolean; error?: string }>
  reviewSynthesize(monthKey: string): Promise<{ content: string; cached?: boolean; error?: string }>
  reviewList(monthKey: string): Promise<Record<string, boolean>>
  reviewGet(monthKey: string, perspective: string): Promise<{ content: string; exists: boolean }>

  // Events
  onVaultChanged(callback: (label: string) => void): () => void
}

declare global {
  interface Window {
    bujo: BuJoApi
  }
}
