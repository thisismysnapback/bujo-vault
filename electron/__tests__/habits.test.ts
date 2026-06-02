import { describe, expect, it } from 'vitest'
import {
  buildHabitCompletionMatrix,
  buildHabitStats,
  computeHabitStreaks,
  toggleHabitCompletion,
  type HabitsFile,
} from '../habits'

const data = (overrides: Partial<HabitsFile> = {}): HabitsFile => ({
  habits: [
    { id: 'exercise', name: 'Exercise', frequency: 'daily', created: '2026-06-01', archived: false },
    { id: 'read', name: 'Read', frequency: 'daily', created: '2026-06-01', archived: false, emoji: '📚' },
    { id: 'old', name: 'Old Habit', frequency: 'daily', created: '2026-05-01', archived: true },
  ],
  completions: {},
  ...overrides,
})

describe('toggleHabitCompletion', () => {
  it('adds the habit id when it is absent for the date', () => {
    const result = toggleHabitCompletion(data(), 'exercise', '2026-06-02')

    expect(result.completed).toBe(true)
    expect(result.data.completions['2026-06-02']).toEqual(['exercise'])
  })

  it('removes the habit id when it is already completed for the date', () => {
    const result = toggleHabitCompletion(
      data({ completions: { '2026-06-02': ['exercise', 'read'] } }),
      'exercise',
      '2026-06-02'
    )

    expect(result.completed).toBe(false)
    expect(result.data.completions['2026-06-02']).toEqual(['read'])
  })

  it('does not duplicate completion ids when existing data is malformed', () => {
    const result = toggleHabitCompletion(
      data({ completions: { '2026-06-02': ['exercise', 'exercise'] } }),
      'read',
      '2026-06-02'
    )

    expect(result.data.completions['2026-06-02']).toEqual(['exercise', 'read'])
  })
})

describe('computeHabitStreaks', () => {
  it('returns zero streaks for no completions', () => {
    expect(computeHabitStreaks('exercise', {}, '2026-06-05')).toEqual({ current: 0, best: 0 })
  })

  it('counts current streak backwards from today', () => {
    const completions = {
      '2026-06-03': ['exercise'],
      '2026-06-04': ['exercise'],
      '2026-06-05': ['exercise'],
      '2026-06-01': ['exercise'],
    }

    expect(computeHabitStreaks('exercise', completions, '2026-06-05')).toEqual({ current: 3, best: 3 })
  })

  it('tracks best historical streak even when current streak is broken', () => {
    const completions = {
      '2026-06-01': ['exercise'],
      '2026-06-02': ['exercise'],
      '2026-06-03': ['exercise'],
      '2026-06-05': ['exercise'],
    }

    expect(computeHabitStreaks('exercise', completions, '2026-06-06')).toEqual({ current: 0, best: 3 })
  })
})

describe('buildHabitStats', () => {
  it('ignores archived habits and sorts by current streak descending', () => {
    const stats = buildHabitStats(
      data({
        completions: {
          '2026-06-03': ['exercise', 'old'],
          '2026-06-04': ['exercise', 'read', 'old'],
          '2026-06-05': ['exercise', 'read', 'old'],
        },
      }),
      '2026-06-05'
    )

    expect(stats.map(s => s.habit.id)).toEqual(['exercise', 'read'])
    expect(stats[0].currentStreak).toBe(3)
    expect(stats[1].currentStreak).toBe(2)
  })

  it('calculates 30-day rate and total completions per active habit', () => {
    const stats = buildHabitStats(
      data({
        completions: {
          '2026-05-01': ['exercise'],
          '2026-06-04': ['exercise'],
          '2026-06-05': ['exercise'],
        },
      }),
      '2026-06-05'
    )

    const exercise = stats.find(s => s.habit.id === 'exercise')!
    expect(exercise.totalCompletions).toBe(3)
    expect(exercise.rate30d).toBe(0.07)
  })
})

describe('buildHabitCompletionMatrix', () => {
  it('returns chronological dates with active habit completion booleans', () => {
    const matrix = buildHabitCompletionMatrix(
      data({
        completions: {
          '2026-06-01': ['exercise', 'old'],
          '2026-06-03': ['read'],
        },
      }),
      '2026-06-01',
      4
    )

    expect(matrix).toEqual([
      { date: '2026-06-01', completions: { exercise: true, read: false } },
      { date: '2026-06-02', completions: { exercise: false, read: false } },
      { date: '2026-06-03', completions: { exercise: false, read: true } },
      { date: '2026-06-04', completions: { exercise: false, read: false } },
    ])
  })

  it('clamps invalid day counts to an empty matrix', () => {
    expect(buildHabitCompletionMatrix(data(), '2026-06-01', 0)).toEqual([])
  })
})
