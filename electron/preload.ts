import { contextBridge, ipcRenderer } from 'electron'

const bujoApi = {
  // Vault operations
  vaultEnsure: () => ipcRenderer.invoke('vault_ensure'),
  vaultInfo: () => ipcRenderer.invoke('vault_info'),

  // Day log
  getDay: (date: string) => ipcRenderer.invoke('vault_get_day', date),
  getRange: (days: number) => ipcRenderer.invoke('vault_get_range', days),

  // Entries
  appendEntry: (date: string, type: string, content: string) =>
    ipcRenderer.invoke('vault_append_entry', date, type, content),
  appendEntriesBatch: (date: string, entries: Array<{ type: string; content: string }>) =>
    ipcRenderer.invoke('vault_append_entries_batch', date, entries),
  appendMonthlyEntry: (monthKey: string, type: string, content: string) =>
    ipcRenderer.invoke('vault_append_monthly_entry', monthKey, type, content),
  appendFutureEntry: (monthLabel: string, content: string) =>
    ipcRenderer.invoke('vault_append_future_entry', monthLabel, content),
  updateEntry: (date: string, id: string, type: string, content: string) =>
    ipcRenderer.invoke('vault_update_entry', date, id, type, content),
  updateMonthlyEntry: (monthKey: string, id: string, type: string, content: string) =>
    ipcRenderer.invoke('vault_update_monthly_entry', monthKey, id, type, content),
  deleteEntry: (date: string, id: string) =>
    ipcRenderer.invoke('vault_delete_entry', date, id),
  deleteMonthlyEntry: (monthKey: string, id: string) =>
    ipcRenderer.invoke('vault_delete_monthly_entry', monthKey, id),

  // Monthly
  getMonthly: (year: number, month: number) =>
    ipcRenderer.invoke('vault_get_monthly', year, month),

  // Future
  getFuture: () => ipcRenderer.invoke('vault_get_future'),
  updateFutureEntry: (monthLabel: string, oldContent: string, type: string, content: string) =>
    ipcRenderer.invoke('vault_update_future_entry', monthLabel, oldContent, type, content),
  deleteFutureEntry: (monthLabel: string, content: string) =>
    ipcRenderer.invoke('vault_delete_future_entry', monthLabel, content),

  // Search
  search: (query: string, mode?: 'text' | 'semantic') => ipcRenderer.invoke('vault_search', query, mode),

  // Clear
  clearDay: (date: string) => ipcRenderer.invoke('vault_clear_day', date),
  clearAllData: () => ipcRenderer.invoke('vault_clear_all_data'),

  // Undo
  undo: () => ipcRenderer.invoke('undo_last'),

  // Migration
  migrateEntry: (fromDate: string, toDate: string, entryId: string) =>
    ipcRenderer.invoke('migrate_entry', fromDate, toDate, entryId),

  // Parsing
  smartParse: (text: string, logDate?: string) => ipcRenderer.invoke('smart_parse', text, logDate),
  originalSave: (date: string, text: string) => ipcRenderer.invoke('original_save', date, text),
  originalGet: (date: string) => ipcRenderer.invoke('original_get', date),

  // Analytics
  analyticsStreak: () => ipcRenderer.invoke('analytics_streak'),
  analyticsWeekly: () => ipcRenderer.invoke('analytics_weekly'),
  analyticsCoach: () => ipcRenderer.invoke('analytics_coach'),
  analyticsStats: (days: number) => ipcRenderer.invoke('analytics_stats', days),
  analyticsHeatmap: () => ipcRenderer.invoke('analytics_heatmap'),
  migrateAnalyze: (task: { text: string; count?: number; firstSeen?: string; lastSeen?: string } | string) =>
    ipcRenderer.invoke('migrate_analyze', task),
  coachNudgeLlm: (date: string) => ipcRenderer.invoke('coach_nudge_llm', date),
  dailySummary: (date: string) => ipcRenderer.invoke('daily_summary', date),

  // Dump retry
  dumpRetry: () => ipcRenderer.invoke('dump_retry'),

  // Context
  contextGet: () => ipcRenderer.invoke('context_get'),
  contextSave: (section: string, content: string) =>
    ipcRenderer.invoke('context_save', section, content),
  contextEvalSave: (monthLabel: string, evalText: string) =>
    ipcRenderer.invoke('context_eval_save', monthLabel, evalText),

  // Future
  futureMarkDone: (text: string) => ipcRenderer.invoke('future_mark_done', text),

  // Config
  configGet: () => ipcRenderer.invoke('config_get'),
  configSave: (config: any) => ipcRenderer.invoke('config_save', config),
  vaultPickFolder: () => ipcRenderer.invoke('vault_pick_folder'),

  // Templates
  templatesList: () => ipcRenderer.invoke('templates_list'),
  templatesApply: (name: string, targetDate: string) =>
    ipcRenderer.invoke('templates_apply', name, targetDate),

  // File watching
  startListening: () => ipcRenderer.invoke('start_listening'),

  // Global hotkey
  globalHotkey: (callback: () => void) => {
    ipcRenderer.on('global-hotkey', () => callback())
    return () => ipcRenderer.removeAllListeners('global-hotkey')
  },

  // Review
  reviewPerspective: (monthKey: string, perspective: string, force = false) =>
    ipcRenderer.invoke('review_perspective', monthKey, perspective, force),
  reviewSynthesize: (monthKey: string) =>
    ipcRenderer.invoke('review_synthesize', monthKey),
  reviewList: (monthKey: string) =>
    ipcRenderer.invoke('review_list', monthKey),
  reviewGet: (monthKey: string, perspective: string) =>
    ipcRenderer.invoke('review_get', monthKey, perspective),

  // Habits
  habitsList: () => ipcRenderer.invoke('habits_list'),
  habitsCreate: (name: string, frequency: string, emoji?: string) =>
    ipcRenderer.invoke('habits_create', name, frequency, emoji),
  habitsUpdate: (id: string, updates: object) =>
    ipcRenderer.invoke('habits_update', id, updates),
  habitsDelete: (id: string) => ipcRenderer.invoke('habits_delete', id),
  habitsToggle: (id: string, date: string) =>
    ipcRenderer.invoke('habits_toggle', id, date),
  habitsStats: () => ipcRenderer.invoke('habits_stats'),
  habitsMatrix: (startDate: string, days: number) =>
    ipcRenderer.invoke('habits_matrix', startDate, days),

  // Events - vault_changed
  onVaultChanged: (callback: (label: string) => void) => {
    const listener = (_event: any, label: string) => callback(label)
    ipcRenderer.on('vault_changed', listener)
    return () => ipcRenderer.removeListener('vault_changed', listener)
  },

  // Diagnostics
  bridgeDiagnostics: () => ({
    preload: 'dist-electron/preload.cjs',
    loadedAt: new Date().toISOString(),
  }),
}

contextBridge.exposeInMainWorld('bujo', bujoApi)
