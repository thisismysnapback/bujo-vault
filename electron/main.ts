import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import * as chokidar from 'chokidar'
import { countByType as countByTypePure, calculateStreak as calculateStreakPure, donePendingRatio as donePendingRatioPure, priorityAlignment as priorityAlignmentPure, momentumScore as momentumScorePure, migrationPatterns as migrationPatternsPure, killThemesAnalysis as killThemesAnalysisPure, noteHeavyDays as noteHeavyDaysPure, eventHeavyDayNudge as eventHeavyDayNudgePure, coachingNudge as coachingNudgePure } from './analytics'
import { parseEntries } from './parser'
import type { ParsedEntry } from './parser'
import { callChatCompletion } from './aiProvider'
import { getAiConfig, resolveVaultPath } from './configManager'
import { buildCoachNudgePrompt, type PromptEntry } from './llm'
import type { HabitsFile } from './habits'
import type { UndoRecord } from './vaultFs'
import * as vaultFs from './vaultFs'
import { validateDate } from './ipcValidation'
import { PERSPECTIVES } from './perspectives'
import { findAutoCompletions } from './autoComplete'
import { registerAiHandlers } from './ipc/aiHandlers'
import { registerAnalyticsHandlers } from './ipc/analyticsHandlers'
import { registerConfigHandlers } from './ipc/configHandlers'
import { registerContextHandlers } from './ipc/contextHandlers'
import { registerFutureHandlers } from './ipc/futureHandlers'
import { registerHabitHandlers } from './ipc/habitHandlers'
import { registerReviewHandlers } from './ipc/reviewHandlers'
import { registerVaultHandlers } from './ipc/vaultHandlers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV === 'development'

// Shared constants
const SYMBOL_MAP: Record<string, string> = { 'task': 't', 'done': 'x', 'migrated': '>', 'scheduled': '<', 'killed': 'k', 'note': 'n', 'event': 'e', 'priority': '*' }

// Rate limiting
let aiCallCount = 0
let aiCallResetTime = Date.now()
const AI_RATE_LIMIT = 10

function checkRateLimit(): boolean {
  const now = Date.now()
  if (now - aiCallResetTime > 60000) {
    aiCallCount = 0
    aiCallResetTime = now
  }
  if (aiCallCount >= AI_RATE_LIMIT) return false
  aiCallCount++
  return true
}

async function callAiProvider(systemPrompt: string, userContent: string, maxTokens = 2048): Promise<string | null> {
  const config = getAiConfig()
  if (!config) return null
  if (!checkRateLimit()) return null

  const result = await callChatCompletion(config, systemPrompt, userContent, maxTokens)
  return result.ok ? result.content : null
}

function localDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDateStr(date: string, offsetDays: number): string {
  const validDate = validateDate(date)
  const d = new Date(`${validDate}T12:00:00`)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let mainWindow: BrowserWindow | null = null
let vaultPath: string = ''
let undoStack: UndoRecord[] = []
let watcher: chokidar.FSWatcher | null = null

function ensureVaultDirs(vault: string): void {
  for (const dir of ['daily', 'monthly', 'future', 'reflections', 'perspectives', 'analysis']) {
    const dirPath = path.join(vault, dir)
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }
  }
  // Copy perspective prompt files on first setup
  const perspDir = path.join(vault, 'perspectives')
  for (const [name, content] of Object.entries(PERSPECTIVES)) {
    const filePath = path.join(perspDir, `${name}.md`)
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content)
    }
  }
}

function headerForDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function readTextSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
  } catch {
    try {
      return readFileSync(filePath, 'latin1')
    } catch {
      return ''
    }
  }
}

// --- Habits ---

function habitsFilePath(): string {
  return path.join(vaultPath, 'habits.json')
}

function readHabitsFile(): HabitsFile {
  const fp = habitsFilePath()
  if (!existsSync(fp)) return { habits: [], completions: {} }
  try {
    return JSON.parse(readFileSync(fp, 'utf-8')) as HabitsFile
  } catch {
    const backupPath = `${fp}.bak.${Date.now()}`
    try { writeFileSync(backupPath, readFileSync(fp)) } catch { /* ignore backup failure */ }
    return { habits: [], completions: {} }
  }
}

function writeHabitsFile(data: HabitsFile): void {
  writeFileSync(habitsFilePath(), JSON.stringify(data, null, 2))
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// --- End Habits ---

function dayLogFromFile(vault: string, date: string) {
  const filePath = path.join(vault, 'daily', `${date}.md`)
  let entries: ParsedEntry[] = []

  if (existsSync(filePath)) {
    const content = readTextSafe(filePath)
    entries = parseEntries(content, date)
  }

  return { date, entries, file_path: filePath }
}

function toPromptEntry(entry: ParsedEntry): PromptEntry {
  return {
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    content: entry.content,
    timestamp: entry.timestamp,
    meta: entry.meta,
  }
}

const coachNudgeCache = new Map<string, { expiresAt: number; nudge: string; source: 'llm' | 'rule' }>()

function cleanAiReport(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
}

// --- Analytics wrappers (filesystem I/O delegates to pure functions in analytics.ts) ---

function loadRange(days: number) {
  const logs = []
  for (let i = days - 1; i >= 0; i--) {
    logs.push(dayLogFromFile(vaultPath, localDateStr(-i)))
  }
  return logs
}

function loadRangeUntil(date: string, days: number) {
  const logs = []
  for (let i = days - 1; i >= 0; i--) {
    logs.push(dayLogFromFile(vaultPath, shiftDateStr(date, -i)))
  }
  return logs
}

function loadAll() {
  const logs: any[] = []
  const dailyDir = path.join(vaultPath, 'daily')
  if (!existsSync(dailyDir)) return logs
  const files = readdirSync(dailyDir).filter(f => f.endsWith('.md')).sort()
  for (const file of files) {
    const dateStr = file.replace('.md', '')
    logs.push(dayLogFromFile(vaultPath, dateStr))
  }
  return logs
}

function hasRealEntries(content: string): boolean {
  return content.split('\n').some((l: string) => l.trim() && !l.trim().startsWith('#'))
}

function reconcileAutoCompletions(maxDays = 22): void {
  const logs = loadAll()
  const completedIds = new Set<string>()

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]
    const priorLogs = logs.slice(0, i)
    for (const entry of log.entries) {
      for (const match of findAutoCompletions(log.date, entry, priorLogs, maxDays)) {
        const matchId = `${match.date}:${match.id}`
        if (completedIds.has(matchId)) continue
        completedIds.add(matchId)
        vaultFs.updateEntry(vaultPath, match.date, match.id, 'done', match.task)
      }
    }
  }
}

function loadCoachContext(date: string): Array<PromptEntry & { date: string }> {
  return loadAll()
    .filter(log => log.date <= date)
    .slice(-21)
    .flatMap(log => log.entries.map((entry: any) => ({ ...toPromptEntry(entry), date: log.date })))
    .slice(-80)
}

function calculateStreak(): number {
  const logs: any[] = []
  for (let i = 0; i < 365; i++) {
    const dateStr = localDateStr(-i)
    const filePath = path.join(vaultPath, 'daily', `${dateStr}.md`)
    if (!existsSync(filePath)) {
      if (i === 0) continue
      break
    }
    const content = readTextSafe(filePath)
    const hasEntries = hasRealEntries(content)
    if (hasEntries) {
      logs.push({ date: dateStr, entries: [{ type: 'task', content: 'x', id: 'x' }] })
    } else if (i === 0) {
      continue
    } else {
      break
    }
  }
  return calculateStreakPure(logs)
}

function calculateStreakUntil(date: string): number {
  const logs: any[] = []
  for (let i = 0; i < 365; i++) {
    const dateStr = shiftDateStr(date, -i)
    const filePath = path.join(vaultPath, 'daily', `${dateStr}.md`)
    if (!existsSync(filePath)) {
      if (i === 0) continue
      break
    }
    const content = readTextSafe(filePath)
    const hasEntries = hasRealEntries(content)
    if (hasEntries) {
      logs.push({ date: dateStr, entries: [{ type: 'task', content: 'x', id: 'x' }] })
    } else if (i === 0) {
      continue
    } else {
      break
    }
  }
  return calculateStreakPure(logs)
}

function donePendingRatio(days: number = 7): number {
  return donePendingRatioPure(loadRange(days), days)
}

function priorityAlignment(days: number = 7): number {
  return priorityAlignmentPure(loadRange(days), days)
}

function momentumScore(): string {
  return momentumScorePure(loadRange(14))
}

function migrationPatterns(): Array<{ text: string; count: number; firstSeen: string; lastSeen: string }> {
  return migrationPatternsPure(loadAll())
}

function killThemesAnalysis(): Record<string, number> {
  return killThemesAnalysisPure(loadAll())
}

function noteHeavyDays(): Array<{ date: string; count: number }> {
  return noteHeavyDaysPure(loadRange(14))
}

function eventHeavyDayNudge(): string | null {
  return eventHeavyDayNudgePure(loadRange(7))
}

function coachingNudge(date?: string): string {
  const logs7 = date ? loadRangeUntil(date, 7) : loadRange(7)
  const all = date ? loadAll().filter(log => log.date <= date) : loadAll()
  const streak = date ? calculateStreakUntil(date) : calculateStreak()
  return coachingNudgePure(logs7, all, streak)
}

function cleanCoachNudge(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .pop()
    ?.replace(/^["']|["']$/g, '')
    .trim() || ''
}

async function coachNudgeForDate(date: string): Promise<{ nudge: string; source: 'llm' | 'rule' }> {
  const validDate = validateDate(date)
  const entries = loadCoachContext(validDate)
  if (entries.length === 0) return { nudge: '', source: 'rule' }

  const rule = coachingNudge(validDate)
  const prompt = buildCoachNudgePrompt(validDate, entries, rule)
  const cached = coachNudgeCache.get(prompt.cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached

  if (!getAiConfig()) return { nudge: rule, source: 'rule' }

  const raw = await callAiProvider(prompt.systemPrompt, prompt.userContent, 512)
  const cleaned = raw ? cleanCoachNudge(raw) : ''
  const result = { nudge: cleaned || rule, source: cleaned ? 'llm' as const : 'rule' as const }
  coachNudgeCache.set(prompt.cacheKey, { ...result, expiresAt: Date.now() + 30 * 60 * 1000 })
  return result
}

function mostProductiveTime(): string {
  const buckets: Record<string, number> = { morning: 0, afternoon: 0, evening: 0, late: 0 }
  let totalDays = 0
  for (const log of loadRange(30)) {
    if (!log.entries.length) continue
    try {
      const filePath = path.join(vaultPath, 'daily', `${log.date}.md`)
      if (!existsSync(filePath)) continue
      const { mtime } = statSync(filePath)
      const hour = new Date(mtime).getHours()
      if (hour >= 5 && hour < 12) buckets.morning += log.entries.length
      else if (hour >= 12 && hour < 17) buckets.afternoon += log.entries.length
      else if (hour >= 17 && hour < 21) buckets.evening += log.entries.length
      else buckets.late += log.entries.length
      totalDays++
    } catch { continue }
  }
  if (totalDays < 3) return 'not enough data'
  const top = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]
  return `${top[0]} (${top[1]} entries from ${totalDays} days)`
}

function tasksPerDayAvg(): number {
  const logs = loadRange(30)
  let daysWithEntries = 0
  let totalDone = 0
  for (const log of logs) {
    if (log.entries.length > 0) {
      daysWithEntries++
      totalDone += countByTypePure(log.entries, 'done')
    }
  }
  return daysWithEntries > 0 ? Math.round((totalDone / daysWithEntries) * 10) / 10 : 0
}

function eventDensityMapping(): Record<string, { days: number; completionRate: number }> {
  const buckets: Record<string, { days: number; done: number; pending: number }> = {
    low: { days: 0, done: 0, pending: 0 },
    medium: { days: 0, done: 0, pending: 0 },
    high: { days: 0, done: 0, pending: 0 },
  }
  for (const log of loadRange(30)) {
    const eventCount = countByTypePure(log.entries, 'event')
    const bucket = eventCount <= 1 ? 'low' : eventCount === 2 ? 'medium' : 'high'
    buckets[bucket].days++
    buckets[bucket].done += countByTypePure(log.entries, 'done')
    buckets[bucket].pending += countByTypePure(log.entries, 'task') + countByTypePure(log.entries, 'priority')
  }
  const result: Record<string, { days: number; completionRate: number }> = {}
  for (const [key, data] of Object.entries(buckets)) {
    const total = data.done + data.pending
    result[key] = { days: data.days, completionRate: total > 0 ? Math.round((data.done / total) * 100) / 100 : 0 }
  }
  return result
}

function resolveInsideAsar(...parts: string[]): string {
  // path inside an asar archive
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', ...parts)
  }
  return path.join(__dirname, '..', ...parts)
}

function resolveOutsideAsar(...parts: string[]): string {
  // path on the real filesystem (asar.unpacked or extracted)
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', ...parts)
  }
  return path.join(__dirname, '..', ...parts)
}

function resolveIndexHtml(): string {
  // Try asar virtual path first (works when Electron reads it as a file:// URL inside asar)
  const asarPath = resolveInsideAsar('dist', 'index.html')
  // Try real on-disk path (works when app.asar is in .unpacked form or asar is disabled)
  const onDiskPath = resolveOutsideAsar('dist', 'index.html')
  // Some builds unpack dist too
  const candidateUnpacked = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist', 'index.html')
  const candidates = [asarPath, onDiskPath, candidateUnpacked, path.join(__dirname, '..', 'dist', 'index.html')]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return asarPath
}

function resolvePreload(): string {
  const candidates = [
    resolveOutsideAsar('dist-electron', 'preload.cjs'),
    resolveInsideAsar('dist-electron', 'preload.cjs'),
    resolveInsideAsar('dist-electron', 'preload.js'),
    resolveOutsideAsar('dist-electron', 'preload.js'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist-electron', 'preload.cjs'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist-electron', 'preload.js'),
    path.join(__dirname, 'preload.cjs'),
    path.join(__dirname, 'preload.js'),
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      console.log(`[bujo] preload=${candidate}`)
      return candidate
    }
  }
  console.warn('[bujo] preload not found, falling back to dist-electron/preload.cjs')
  if (app.isPackaged) return resolveOutsideAsar('dist-electron', 'preload.cjs')
  return path.join(__dirname, 'preload.js')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: resolvePreload(),
    },
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(resolveIndexHtml())
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupIpcHandlers() {
  function pushUndo(record: UndoRecord | undefined): void {
    if (!record) return
    undoStack.push(record)
    if (undoStack.length > 100) undoStack.shift()
  }

  function safeResult<T>(fn: () => T): T | { error: string } {
    try {
      return fn()
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }

  registerVaultHandlers({
    getVaultPath: () => vaultPath,
    ensureVaultDirs,
    safeResult,
    pushUndo,
    popUndo: () => undoStack.pop(),
    localDateStr,
    loadRangeUntil,
    findAutoCompletions,
    readTextSafe,
    toPromptEntry,
    callAiProvider,
  })

  registerFutureHandlers({ getVaultPath: () => vaultPath, readTextSafe, pushUndo })

  registerAiHandlers({
    getVaultPath: () => vaultPath,
    readTextSafe,
    safeResult,
    localDateStr,
    callAiProvider,
    coachNudgeForDate,
    dayLogFromFile,
    toPromptEntry,
    symbolMap: SYMBOL_MAP,
  })

  registerAnalyticsHandlers({
    localDateStr,
    dayLogFromFile,
    getVaultPath: () => vaultPath,
    loadRange,
    loadAll,
    calculateStreak,
    donePendingRatio,
    priorityAlignment,
    momentumScore,
    migrationPatterns,
    killThemesAnalysis,
    eventDensityMapping,
    noteHeavyDays,
    coachNudgeForDate,
    mostProductiveTime,
    tasksPerDayAvg,
  })

  registerReviewHandlers({ getVaultPath: () => vaultPath, readTextSafe, callAiProvider, cleanAiReport })

  registerHabitHandlers({ readHabitsFile, writeHabitsFile, makeId, localDateStr })
}

app.whenReady().then(() => {
  vaultPath = resolveVaultPath()
  ensureVaultDirs(vaultPath)
  reconcileAutoCompletions()

  setupIpcHandlers()
  createWindow()

  // Global hotkey: Win+Shift+B to focus the app
  globalShortcut.register('CommandOrControl+Shift+B', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('global-hotkey')
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (watcher) {
    watcher.close()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
