import type { DailyLog, AnalyticsEntry } from './analytics'

export interface AutoCompletionMatch {
  date: string
  id: string
  daysStalled: number
  task: string
  evidence: string
}

const completionVerbs = /\b(called|talked|spoke|finished|completed|delivered|submitted|sent|handled|worked|made|created|modeled|wrote|recorded|edited|shipped|resolved|paid|booked)\b/i
const passiveReceipt = /\b(handed over|gave me|sent me|received|got|provided)\b/i
const workDemand = /\b(do|finish|complete|work on|edit|write|make|fix|revise|review|handle)\b/i
const stopwords = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'then', 'than', 'about', 'into', 'onto', 'will',
  'just', 'quite', 'very', 'today', 'tonight', 'tomorrow', 'yesterday', 'maybe', 'not', 'now', 'but',
  'have', 'has', 'had', 'was', 'were', 'been', 'being', 'are', 'you', 'your', 'they', 'their', 'our',
])

function entryKind(entry: AnalyticsEntry): string {
  if (entry.kind) return entry.kind
  if (entry.type === 'note') return 'note'
  if (entry.type === 'event') return 'event'
  return 'task'
}

function entryStatus(entry: AnalyticsEntry): string {
  if (entry.status) return entry.status
  if (entry.type === 'done') return 'done'
  if (entry.type === 'migrated') return 'migrated'
  if (entry.type === 'killed') return 'killed'
  return 'active'
}

function isOpenLoop(entry: AnalyticsEntry): boolean {
  return entryKind(entry) === 'task' && entryStatus(entry) === 'active'
}

function isCompletionEvidence(entry: AnalyticsEntry): boolean {
  if (entryKind(entry) === 'task' && entryStatus(entry) === 'done') return true
  return entryKind(entry) === 'event' && completionVerbs.test(entry.content)
}

function tokens(text: string): Set<string> {
  const raw = text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !stopwords.has(t))

  return new Set(raw.map(t => {
    if (t === 'call' || t === 'called' || t === 'calling') return 'contact'
    if (t === 'talk' || t === 'talked' || t === 'talking') return 'contact'
    if (t === 'spoke' || t === 'speak' || t === 'speaking') return 'contact'
    if (t === 'finished' || t === 'finishing') return 'finish'
    if (t === 'completed' || t === 'completing') return 'complete'
    if (t === 'modeled' || t === 'modeling') return 'model'
    return t
  }))
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime()
  const b = new Date(`${to}T12:00:00`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function sharedTokenCount(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const token of a) if (b.has(token)) count++
  return count
}

export function entriesResolveSameLoop(oldTask: AnalyticsEntry, newEntry: AnalyticsEntry): boolean {
  if (!isOpenLoop(oldTask) || !isCompletionEvidence(newEntry)) return false

  const oldText = oldTask.content.toLowerCase()
  const newText = newEntry.content.toLowerCase()
  if (workDemand.test(oldText) && passiveReceipt.test(newText) && !/\b(finished|completed|handled|worked|edited|revised|submitted|delivered)\b/i.test(newText)) {
    return false
  }

  const oldTokens = tokens(oldTask.content)
  const newTokens = tokens(newEntry.content)
  const shared = sharedTokenCount(oldTokens, newTokens)
  const denominator = Math.min(oldTokens.size, newTokens.size)
  if (shared >= 2 && denominator > 0 && shared / denominator >= 0.5) return true

  if (oldTokens.size >= 2 && newText.includes(oldText)) return true
  return false
}

export function findAutoCompletions(currentDate: string, newEntry: AnalyticsEntry, logs: DailyLog[], maxDays = 21): AutoCompletionMatch[] {
  if (!isCompletionEvidence(newEntry)) return []

  const matches: AutoCompletionMatch[] = []
  for (const log of logs) {
    const stalled = daysBetween(log.date, currentDate)
    if (log.date >= currentDate || stalled <= 0 || stalled > maxDays) continue

    for (const entry of log.entries) {
      if (entriesResolveSameLoop(entry, newEntry)) {
        matches.push({
          date: log.date,
          id: entry.id,
          daysStalled: stalled,
          task: entry.content,
          evidence: newEntry.content,
        })
      }
    }
  }

  return matches.sort((a, b) => a.daysStalled - b.daysStalled).slice(0, 3)
}

export function resolvedOpenLoopIds(logs: DailyLog[], maxDays = 21): Set<string> {
  const resolved = new Set<string>()
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))

  for (let i = 0; i < sorted.length; i++) {
    const log = sorted[i]
    const priorLogs = sorted.slice(0, i)

    for (const entry of log.entries) {
      for (const match of findAutoCompletions(log.date, entry, priorLogs, maxDays)) {
        resolved.add(`${match.date}:${match.id}`)
      }
    }
  }

  return resolved
}
