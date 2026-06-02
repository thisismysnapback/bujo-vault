export interface HabitEntry {
  id: string
  name: string
  frequency: 'daily' | 'weekly' | 'custom'
  created: string
  archived: boolean
  emoji?: string
}

export interface HabitsFile {
  habits: HabitEntry[]
  completions: Record<string, string[]>
}

export interface HabitStat {
  habit: HabitEntry
  currentStreak: number
  bestStreak: number
  rate30d: number
  totalCompletions: number
}

export interface HabitMatrixDay {
  date: string
  completions: Record<string, boolean>
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`)
}

function addDays(key: string, days: number): string {
  const date = dateFromKey(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids))
}

export function toggleHabitCompletion(data: HabitsFile, id: string, date: string): { data: HabitsFile; completed: boolean } {
  const completions = { ...data.completions }
  const existing = uniqueIds(completions[date] ?? [])
  const alreadyCompleted = existing.includes(id)
  const nextForDate = alreadyCompleted
    ? existing.filter(existingId => existingId !== id)
    : [...existing, id]

  completions[date] = nextForDate

  return {
    data: {
      ...data,
      completions,
    },
    completed: !alreadyCompleted,
  }
}

export function computeHabitStreaks(
  habitId: string,
  completions: Record<string, string[]>,
  today: string
): { current: number; best: number } {
  const completedDates = new Set(
    Object.entries(completions)
      .filter(([, ids]) => ids.includes(habitId))
      .map(([date]) => date)
  )

  if (completedDates.size === 0) return { current: 0, best: 0 }

  let current = 0
  let cursor = today
  while (completedDates.has(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  const dates = Array.from(completedDates).sort()
  let best = 1
  let run = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = dateFromKey(dates[i - 1])
    const curr = dateFromKey(dates[i])
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000)
    if (diff === 1) {
      run++
    } else {
      run = 1
    }
    best = Math.max(best, run)
  }

  return { current, best }
}

export function buildHabitStats(data: HabitsFile, today: string): HabitStat[] {
  const thirtyDaysAgo = addDays(today, -29)

  return data.habits
    .filter(habit => !habit.archived)
    .map(habit => {
      const { current, best } = computeHabitStreaks(habit.id, data.completions, today)
      const completions30 = Object.entries(data.completions)
        .filter(([date, ids]) => date >= thirtyDaysAgo && date <= today && ids.includes(habit.id))
        .length
      const totalCompletions = Object.values(data.completions)
        .filter(ids => ids.includes(habit.id))
        .length

      return {
        habit,
        currentStreak: current,
        bestStreak: best,
        rate30d: Math.round((completions30 / 30) * 100) / 100,
        totalCompletions,
      }
    })
    .sort((a, b) => b.currentStreak - a.currentStreak)
}

export function buildHabitCompletionMatrix(data: HabitsFile, startDate: string, days: number): HabitMatrixDay[] {
  if (days <= 0) return []

  const activeHabits = data.habits.filter(habit => !habit.archived)

  return Array.from({ length: days }, (_, offset) => {
    const date = addDays(startDate, offset)
    const completedIds = new Set(data.completions[date] ?? [])
    const completions: Record<string, boolean> = {}

    for (const habit of activeHabits) {
      completions[habit.id] = completedIds.has(habit.id)
    }

    return { date, completions }
  })
}
