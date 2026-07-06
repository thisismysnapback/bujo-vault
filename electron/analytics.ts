import type { EntryKind, EntryMeta, EntryStatus } from './types'

export interface AnalyticsEntry {
  type?: string
  kind?: EntryKind
  status?: EntryStatus
  meta?: EntryMeta
  content: string
  id: string
}

export interface DailyLog {
  date: string
  entries: AnalyticsEntry[]
}

function normalize(entry: AnalyticsEntry): Required<Pick<AnalyticsEntry, 'kind' | 'status'>> & { meta?: EntryMeta } {
  if (entry.kind && entry.status) return { kind: entry.kind, status: entry.status, meta: entry.meta }

  switch (entry.type) {
    case 'done': return { kind: 'task', status: 'done' }
    case 'migrated': return { kind: 'task', status: 'migrated' }
    case 'killed': return { kind: 'task', status: 'killed' }
    case 'note': return { kind: 'note', status: 'active' }
    case 'event': return { kind: 'event', status: 'active' }
    case 'scheduled': return { kind: 'task', status: 'active', meta: { scheduledFor: true } }
    case 'priority': return { kind: 'task', status: 'active', meta: { priority: true } }
    case 'task':
    default: return { kind: 'task', status: 'active' }
  }
}

export function countEntries(entries: AnalyticsEntry[], predicate: (entry: AnalyticsEntry) => boolean): number {
  return entries.filter(predicate).length
}

export function isTaskWithStatus(entry: AnalyticsEntry, status: EntryStatus): boolean {
  const normalized = normalize(entry)
  return normalized.kind === 'task' && normalized.status === status
}

export function isPriorityActive(entry: AnalyticsEntry): boolean {
  const normalized = normalize(entry)
  return normalized.kind === 'task' && normalized.status === 'active' && normalized.meta?.priority === true
}

export function countByType(entries: AnalyticsEntry[], type: string): number {
  return entries.filter(e => {
    const normalized = normalize(e)
    if (type === 'task') return normalized.kind === 'task' && normalized.status === 'active' && !normalized.meta?.priority && !normalized.meta?.scheduledFor
    if (type === 'done') return normalized.kind === 'task' && normalized.status === 'done'
    if (type === 'migrated') return normalized.kind === 'task' && normalized.status === 'migrated'
    if (type === 'killed') return normalized.kind === 'task' && normalized.status === 'killed'
    if (type === 'priority') return normalized.kind === 'task' && normalized.status === 'active' && normalized.meta?.priority === true
    if (type === 'scheduled') return normalized.kind === 'task' && normalized.status === 'active' && normalized.meta?.scheduledFor !== undefined
    if (type === 'note') return normalized.kind === 'note'
    if (type === 'event') return normalized.kind === 'event'
    return false
  }).length
}

export function calculateStreak(logs: DailyLog[]): number {
  let streak = 0
  for (const log of logs) {
    const hasEntries = log.entries.length > 0
    if (hasEntries) {
      streak++
    } else {
      break
    }
  }
  return streak
}

export function donePendingRatio(logs: DailyLog[], days: number = 7): number {
  let done = 0
  let pending = 0
  for (const log of logs) {
    done += countByType(log.entries, 'done')
    pending += countByType(log.entries, 'task') + countByType(log.entries, 'priority')
  }
  const total = done + pending
  return total > 0 ? Math.round((done / total) * 100) / 100 : 0
}

export function priorityAlignment(logs: DailyLog[], days: number = 7): number {
  let totalPriorities = 0
  let donePriorities = 0
  for (const log of logs) {
    const priorityTexts = new Set(log.entries.filter(isPriorityActive).map(e => e.content.toLowerCase()))
    const doneTexts = new Set(log.entries.filter(e => isTaskWithStatus(e, 'done')).map(e => e.content.toLowerCase()))
    totalPriorities += priorityTexts.size
    priorityTexts.forEach(t => {
      if (doneTexts.has(t)) donePriorities++
    })
  }
  return totalPriorities > 0 ? Math.round((donePriorities / totalPriorities) * 100) / 100 : 0
}

export function momentumScore(logs: DailyLog[]): string {
  const thisWeekRatio = donePendingRatio(logs.slice(0, 7))
  const twoWeeks = logs.slice(0, 14)
  let lastWeekDone = 0
  let lastWeekPending = 0
  let thisWeekEntries = 0

  for (let i = 0; i < twoWeeks.length; i++) {
    const done = countByType(twoWeeks[i].entries, 'done')
    const pending = countByType(twoWeeks[i].entries, 'task') + countByType(twoWeeks[i].entries, 'priority')
    if (i >= 7) {
      lastWeekDone += done
      lastWeekPending += pending
    } else {
      thisWeekEntries += twoWeeks[i].entries.filter(e => countByType([e], 'scheduled') === 0).length
    }
  }

  const lastWeekTotal = lastWeekDone + lastWeekPending
  const lastWeek = lastWeekTotal > 0 ? lastWeekDone / lastWeekTotal : 0

  if (thisWeekEntries < 3) return 'new'
  if (thisWeekRatio < 0.2 && lastWeek < 0.2) return 'stalled'
  if (thisWeekRatio < lastWeek - 0.2) return 'stalling'
  if (thisWeekRatio > lastWeek + 0.2) return 'building'
  return 'steady'
}

export function migrationPatterns(allLogs: DailyLog[]): Array<{ text: string; count: number; firstSeen: string; lastSeen: string }> {
  const migrated: Record<string, { text: string; count: number; firstSeen: string; lastSeen: string }> = {}
  for (const log of allLogs) {
    for (const entry of log.entries) {
      const normalized = normalize(entry)
      if (normalized.kind === 'task' && (normalized.status === 'active' || normalized.status === 'migrated')) {
        const key = entry.content.toLowerCase().trim()
        if (!migrated[key]) {
          migrated[key] = { text: entry.content, count: 0, firstSeen: log.date, lastSeen: log.date }
        }
        migrated[key].count++
        migrated[key].lastSeen = log.date
      }
    }
  }
  return Object.values(migrated).filter(v => v.count >= 3).sort((a, b) => b.count - a.count)
}

export function killThemesAnalysis(allLogs: DailyLog[]): Record<string, number> {
  const themes: Record<string, number> = {}
  for (const log of allLogs) {
    for (const entry of log.entries) {
      if (isTaskWithStatus(entry, 'killed')) {
        const words = entry.content.toLowerCase().split(/\s+/)
        if (words.length && words[0].length > 3) {
          themes[words[0]] = (themes[words[0]] || 0) + 1
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 10))
}

export function noteHeavyDays(logs: DailyLog[]): Array<{ date: string; count: number }> {
  return logs
    .map(log => ({ date: log.date, count: countByType(log.entries, 'note') }))
    .filter(d => d.count >= 5)
    .sort((a, b) => b.count - a.count)
}

export function eventHeavyDayNudge(logs: DailyLog[]): string | null {
  for (const log of logs) {
    const events = countByType(log.entries, 'event')
    const done = countByType(log.entries, 'done')
    const pending = countByType(log.entries, 'task') + countByType(log.entries, 'priority')
    const progress = done + log.entries.filter(isCompletedProgressEvent).length
    if (events >= 3 && progress === 0 && pending > 0) {
      const d = new Date(log.date + 'T12:00:00')
      return `${events} events on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} and no clear progress items - possible overcommit.`
    }
  }
  return null
}

export function isCompletedProgressEvent(entry: AnalyticsEntry): boolean {
  const normalized = normalize(entry)
  if (normalized.kind !== 'event') return false
  return /\b(delivered|sent|submitted|finished|completed|called|talked|spoke|handled|handed|spent|worked|made|created|modeled|wrote|recorded|edited|shipped|resolved|paid|booked)\b/i.test(entry.content)
}

export function meaningfulProgressCount(log: DailyLog): number {
  return countByType(log.entries, 'done') + log.entries.filter(isCompletedProgressEvent).length
}

export function coachingNudge(logs7: DailyLog[], allLogs: DailyLog[], streak: number): string {
  const recentEntries = logs7.reduce((sum, log) => sum + log.entries.length, 0)
  const allEntries = allLogs.reduce((sum, log) => sum + log.entries.length, 0)
  if (recentEntries === 0 && allEntries === 0) return 'No logs yet. Start with a few real entries, then coaching can use evidence.'

  const stuck = migrationPatterns(allLogs)
  if (stuck.length && stuck[0].count >= 4) {
    return `You've migrated "${stuck[0].text}" ${stuck[0].count} times. Kill it or do it today.`
  }
  const overcommit = eventHeavyDayNudge(logs7)
  if (overcommit) return overcommit

  const killThemes = killThemesAnalysis(allLogs)
  const topTheme = Object.entries(killThemes)[0]
  if (topTheme && topTheme[1] >= 3) {
    return `You tend to drop ${topTheme[0]} tasks (${topTheme[1]} times). Worth examining why.`
  }
  const heavy = noteHeavyDays(logs7)
  if (heavy.length >= 2) {
    return `Heavy note days: ${heavy.slice(0, 2).map(d => d.date).join(', ')} - lots of raw material captured.`
  }
  const actionableEntries = logs7.reduce((sum, log) => sum + log.entries.filter(entry => normalize(entry).kind === 'task').length, 0)
  const progressEntries = logs7.reduce((sum, log) => sum + meaningfulProgressCount(log), 0)
  if (actionableEntries === 0 && progressEntries === 0) {
    return 'No task patterns yet. Keep logging; coaching will use the texture that emerges.'
  }
  if (progressEntries > 0 && actionableEntries <= progressEntries) {
    return `${progressEntries} concrete progress ${progressEntries === 1 ? 'item' : 'items'} logged. Count done work even when it came in as events.`
  }
  const priorityEntries = logs7.reduce((sum, log) => sum + log.entries.filter(entry => Boolean(normalize(entry).meta?.priority)).length, 0)
  const alignment = priorityAlignment(logs7)
  if (priorityEntries > 0 && alignment < 0.4) {
    return "You're setting priorities but not finishing them. Fewer priorities, more action."
  }
  const momentum = momentumScore(logs7)
  if (momentum === 'building') return 'Completion rate is up this week. Keep going.'
  if (momentum === 'stalled') return 'Completion rate is low. Pick one small thing and finish it.'
  if (streak >= 7) return `${streak}-day streak. The habit is forming.`
  return 'No patterns yet. Keep logging.'
}

export function computeHeatmap(logs: DailyLog[]): Record<string, { count: number; rate: number; tasks: number; notes: number; events: number }> {
  const result: Record<string, { count: number; rate: number; tasks: number; notes: number; events: number }> = {}
  for (const log of logs) {
    const count = log.entries.length
    if (count === 0) continue
    const done = countByType(log.entries, 'done')
    const task = countByType(log.entries, 'task')
    const priority = countByType(log.entries, 'priority')
    const scheduled = countByType(log.entries, 'scheduled')
    const notes = countByType(log.entries, 'note')
    const events = countByType(log.entries, 'event')
    const denominator = done + task + priority
    const rate = denominator > 0 ? done / denominator : 0
    result[log.date] = { count, rate, tasks: task + priority + scheduled + done, notes, events }
  }
  return result
}
