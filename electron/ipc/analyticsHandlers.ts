import { ipcMain } from 'electron'
import { computeHeatmap, countByType as countByTypePure, meaningfulProgressCount } from '../analytics'
import { resolvedOpenLoopIds } from '../autoComplete'

type DayLog = { date: string; entries: any[]; file_path?: string }

export interface AnalyticsHandlerDeps {
  localDateStr: (offsetDays?: number) => string
  dayLogFromFile: (vaultPath: string, date: string) => DayLog
  getVaultPath: () => string
  loadRange: (days: number) => DayLog[]
  loadAll: () => DayLog[]
  calculateStreak: () => number
  donePendingRatio: (days?: number) => number
  priorityAlignment: (days?: number) => number
  momentumScore: () => string
  migrationPatterns: () => Array<{ text: string; count: number; firstSeen?: string; lastSeen?: string }>
  killThemesAnalysis: () => Record<string, number>
  eventDensityMapping: () => Record<string, { days: number; completionRate: number }>
  noteHeavyDays: () => Array<{ date: string; count: number }>
  coachNudgeForDate: (date: string) => Promise<{ nudge: string; source: 'llm' | 'rule' }>
  mostProductiveTime: () => string
  tasksPerDayAvg: () => number
}

export function registerAnalyticsHandlers(deps: AnalyticsHandlerDeps): void {
  ipcMain.handle('analytics_streak', async () => {
    return deps.calculateStreak()
  })

  ipcMain.handle('analytics_weekly', async () => {
    const logs7 = []
    for (let i = 0; i < 7; i++) {
      logs7.push(deps.dayLogFromFile(deps.getVaultPath(), deps.localDateStr(-i)))
    }

    let totalEntries = 0
    let done = 0
    let killed = 0
    let migrated = 0
    let tasks = 0

    for (const log of logs7) {
      totalEntries += log.entries.length
      done += countByTypePure(log.entries, 'done')
      killed += countByTypePure(log.entries, 'killed')
      migrated += countByTypePure(log.entries, 'migrated')
      tasks += countByTypePure(log.entries, 'task')
    }

    return {
      totalEntries,
      done,
      killed,
      migrated,
      tasks,
      streak: deps.calculateStreak(),
      completionRate: (tasks + done) > 0 ? Math.round((done / (tasks + done)) * 100) : 0,
    }
  })

  ipcMain.handle('analytics_heatmap', async () => {
    const logs: DayLog[] = []
    for (let i = 0; i < 365; i++) {
      const date = deps.localDateStr(-i)
      const log = deps.dayLogFromFile(deps.getVaultPath(), date)
      if (log.entries.length > 0) {
        logs.push(log)
      }
    }
    return computeHeatmap(logs)
  })

  ipcMain.handle('analytics_stats', async (_, days: number) => {
    const periodLogs = deps.loadRange(days)
    const allLogs = deps.loadAll()
    const resolvedLoops = resolvedOpenLoopIds(allLogs, 22)
    let pDone = 0, pTotal = 0, pGreenDays = 0, pDaysTracked = 0
    let wdDone = 0, wdTotal = 0, weDone = 0, weTotal = 0
    const byDow = [0, 0, 0, 0, 0, 0, 0]
    const byDowTotal = [0, 0, 0, 0, 0, 0, 0]
    const byDowEntries = [0, 0, 0, 0, 0, 0, 0]
    const byDowLoggedDays = [0, 0, 0, 0, 0, 0, 0]
    let periodEntries = 0, periodTasks = 0, periodNotes = 0, periodEvents = 0
    let lowEnergyMentions = 0, stressMentions = 0, satisfactionMentions = 0, prideMentions = 0
    const themeCounts: Record<string, number> = {}
    const openLoops: Array<{ text: string; date: string; kind: string }> = []
    const themeRules: Array<{ key: string; label: string; pattern: RegExp }> = [
      { key: 'work-feedback', label: 'work / feedback', pattern: /\b(work|project|feedback|client|michael|podcast|deadline)\b/i },
      { key: 'creative-work', label: 'creative work', pattern: /\b(blender|sora|body|video|youtube|render|model|art)\b/i },
      { key: 'family-admin', label: 'family / admin', pattern: /\b(mom|wife|passport|family|parents|extension)\b/i },
      { key: 'adulthood', label: 'adulthood / life', pattern: /\b(adulthood|adult|life|friends|working|fair|accept)\b/i },
      { key: 'inner-child', label: 'inner child / ADHD', pattern: /\b(inner\s*child|childhood|adhd|teacher|school|forgave|forgiven)\b/i },
      { key: 'rest-energy', label: 'rest / energy', pattern: /\b(tired|drained|stress|rest|sleep|energy|mentally)\b/i },
    ]

    for (const log of periodLogs) {
      const d = countByTypePure(log.entries, 'done')
      const t = d + countByTypePure(log.entries, 'task') + countByTypePure(log.entries, 'priority')
      pDone += d; pTotal += t
      const notes = countByTypePure(log.entries, 'note')
      const events = countByTypePure(log.entries, 'event')
      const scheduled = countByTypePure(log.entries, 'scheduled')
      const tasks = t + scheduled
      periodEntries += log.entries.length
      periodTasks += tasks
      periodNotes += notes
      periodEvents += events
      if (log.entries.length > 0) pDaysTracked++
      if (t > 0 && d >= t) pGreenDays++
      const dow = new Date(log.date + 'T12:00:00').getDay()
      byDow[dow] += d
      byDowTotal[dow] += t
      byDowEntries[dow] += log.entries.length
      if (log.entries.length > 0) byDowLoggedDays[dow] += 1
      if (dow === 0 || dow === 6) { weDone += d; weTotal += t }
      else { wdDone += d; wdTotal += t }

      for (const entry of log.entries) {
        const content = entry.content || ''
        if (/\b(tired|drained|exhausted|low energy|mentally)\b/i.test(content)) lowEnergyMentions++
        if (/\b(stress|stressed|pressure|overwhelmed)\b/i.test(content)) stressMentions++
        if (/\b(satisfied|satisfaction|okay|all good|pretty much)\b/i.test(content)) satisfactionMentions++
        if (/\b(proud|glad|happy|win|delivered)\b/i.test(content)) prideMentions++
        for (const rule of themeRules) {
          if (rule.pattern.test(content)) themeCounts[rule.label] = (themeCounts[rule.label] || 0) + 1
        }
        const loopId = `${log.date}:${entry.id}`
        if (!resolvedLoops.has(loopId) && (countByTypePure([entry], 'task') || countByTypePure([entry], 'priority') || countByTypePure([entry], 'scheduled'))) {
          openLoops.push({ text: content, date: log.date, kind: entry.type || entry.kind || 'task' })
        }
      }
    }

    const dowRates = byDow.map((d, i) => byDowTotal[i] > 0 ? Math.round((d / byDowTotal[i]) * 100) : 0)
    const dowEntries = byDowEntries
    const dowLoggedDays = byDowLoggedDays

    const prevPeriodLogs = []
    for (let i = days; i < days * 2; i++) {
      prevPeriodLogs.push(deps.dayLogFromFile(deps.getVaultPath(), deps.localDateStr(-i)))
    }
    let prevDone = 0, prevTotal = 0
    for (const log of prevPeriodLogs) {
      const d = countByTypePure(log.entries, 'done')
      prevDone += d
      prevTotal += d + countByTypePure(log.entries, 'task') + countByTypePure(log.entries, 'priority')
    }
    const prevRate = prevTotal > 0 ? Math.round((prevDone / prevTotal) * 100) : 0

    let aDone = 0, aTotal = 0, aDays = 0, aPerfect = 0
    for (const log of allLogs) {
      const d = countByTypePure(log.entries, 'done')
      const t = d + countByTypePure(log.entries, 'task') + countByTypePure(log.entries, 'priority')
      aDone += d; aTotal += t
      if (log.entries.length > 0) aDays++
      if (t > 0 && d >= t) aPerfect++
    }

    const trackedDates = allLogs.filter(l => l.entries.length > 0).map(l => l.date).sort()
    let bestStreak = 0, curS = 0
    for (let i = 0; i < trackedDates.length; i++) {
      if (i === 0) { curS = 1 }
      else {
        const prev = new Date(trackedDates[i - 1] + 'T12:00:00')
        const curr = new Date(trackedDates[i] + 'T12:00:00')
        const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000)
        curS = diff === 1 ? curS + 1 : 1
      }
      bestStreak = Math.max(bestStreak, curS)
    }

    return {
      period: {
        rate: pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0,
        prevRate,
        greenDays: pGreenDays,
        daysTracked: pDaysTracked,
        weekdayAvg: wdTotal > 0 ? Math.round((wdDone / wdTotal) * 100) : 0,
        weekendAvg: weTotal > 0 ? Math.round((weDone / weTotal) * 100) : 0,
      },
      dowRates,
      dowEntries,
      dowLoggedDays,
      journal: {
        periodEntries,
        entriesPerTrackedDay: pDaysTracked > 0 ? Math.round((periodEntries / pDaysTracked) * 10) / 10 : 0,
        activeDays: pDaysTracked,
        quietDays: Math.max(0, days - pDaysTracked),
        mix: { tasks: periodTasks, notes: periodNotes, events: periodEvents },
        signals: {
          lowEnergy: lowEnergyMentions,
          stress: stressMentions,
          satisfaction: satisfactionMentions,
          pride: prideMentions,
        },
        themes: Object.entries(themeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([label, count]) => ({ label, count })),
        openLoops: openLoops.slice(0, 8),
      },
      allTime: {
        rate: aTotal > 0 ? Math.round((aDone / aTotal) * 100) : 0,
        daysTracked: aDays,
        perfectDays: aPerfect,
      },
      bestStreak,
      currentStreak: deps.calculateStreak(),
    }
  })

  ipcMain.handle('analytics_coach', async () => {
    const logs7 = deps.loadRange(7)
    const totalEntries = logs7.reduce((sum, l) => sum + l.entries.filter(e => countByTypePure([e], 'scheduled') === 0).length, 0)
    const taskEntries = logs7.reduce((sum, l) => sum + l.entries.filter((e: any) => e.kind === 'task').length, 0)
    const progressEntries = logs7.reduce((sum, log) => sum + meaningfulProgressCount(log), 0)
    const allEntryCount = deps.loadAll().reduce((sum, l) => sum + l.entries.filter((e: any) => countByTypePure([e], 'scheduled') === 0).length, 0)
    const nudge = await deps.coachNudgeForDate(deps.localDateStr())

    return {
      period: `${deps.localDateStr(-6)} to ${deps.localDateStr()}`,
      streak: deps.calculateStreak(),
      momentum: deps.momentumScore(),
      completionRate: deps.donePendingRatio(7),
      priorityAlignment: deps.priorityAlignment(7),
      totalEntries,
      taskEntries,
      progressEntries,
      stuckTasks: deps.migrationPatterns().slice(0, 5),
      killThemes: deps.killThemesAnalysis(),
      eventDensity: deps.eventDensityMapping(),
      noteHeavyDays: deps.noteHeavyDays().map(d => d.date),
      nudge: nudge.nudge,
      nudgeSource: nudge.source,
      empty: allEntryCount === 0,
      productiveTime: deps.mostProductiveTime(),
      tasksPerDayAvg: deps.tasksPerDayAvg(),
    }
  })
}
