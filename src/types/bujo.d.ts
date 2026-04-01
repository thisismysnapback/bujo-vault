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
  appendEntry(date: string, type: string, content: string): Promise<{ success: boolean }>
  appendMonthlyEntry(monthKey: string, type: string, content: string): Promise<{ success: boolean }>
  appendFutureEntry(monthLabel: string, content: string): Promise<{ success: boolean }>
  updateEntry(date: string, id: string, type: string, content: string): Promise<{ success: boolean; error?: string }>
  deleteEntry(date: string, id: string): Promise<{ success: boolean; error?: string }>

  // Monthly
  getMonthly(year: number, month: number): Promise<{ date: string; entries: Array<{
    id: string; type: string; content: string; timestamp: number; source_date: string; display: string
  }>; header: string; file_path: string }>

  // Future
  getFuture(): Promise<Record<string, string[]>>

  // Search
  search(query: string): Promise<Array<{
    id: string; type: string; content: string; timestamp: number; source_date: string; display: string
  }>>

  // Clear
  clearDay(date: string): Promise<{ success: boolean; error?: string }>

  // Undo
  undo(): Promise<{ description: string; filePath: string; error?: string }>

  // Migration
  migrateEntry(fromDate: string, toDate: string, entryId: string): Promise<{ success: boolean; error?: string }>

  // Parsing
  smartParse(text: string): Promise<Array<[string, string]>>

  // Analytics
  analyticsStreak(): Promise<number>
  analyticsWeekly(): Promise<{
    totalEntries: number; done: number; killed: number; migrated: number;
    tasks: number; streak: number; completionRate: number
  }>
  analyticsStats(days: number): Promise<{
    heatmap: Record<string, number>;
    period: {
      rate: number; prevRate: number; greenDays: number;
      daysTracked: number; weekdayAvg: number; weekendAvg: number;
    };
    dowRates: number[];
    allTime: { rate: number; daysTracked: number; perfectDays: number };
    bestStreak: number;
    currentStreak: number;
  }>
  analyticsCoach(): Promise<{
    period: string; streak: number; momentum: string; completionRate: number;
    priorityAlignment: number; totalEntries: number;
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
  configGet(): Promise<{ api_key: string; model: string; vault_path: string; theme: string }>
  configSave(config: any): Promise<{ success: boolean }>
  vaultPickFolder(): Promise<{ path: string | null }>

  // Templates
  templatesList(): Promise<string[]>
  templatesApply(name: string, targetDate: string): Promise<{ success: boolean; error?: string }>

  // File watching
  startListening(): Promise<void>

  // Global hotkey
  globalHotkey(callback: () => void): () => void

  // Review
  reviewPerspective(monthKey: string, perspective: string): Promise<{ content: string; cached?: boolean; error?: string }>
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
