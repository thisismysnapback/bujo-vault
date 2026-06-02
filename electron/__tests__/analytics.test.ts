import { describe, it, expect } from 'vitest'
import { countByType, calculateStreak, donePendingRatio, priorityAlignment, momentumScore, migrationPatterns, killThemesAnalysis, noteHeavyDays, eventHeavyDayNudge, coachingNudge, computeHeatmap } from '../../electron/analytics'

function makeEntry(type: string, content: string = 'test') {
  return { type, content, id: crypto.randomUUID() }
}

function makeLog(date: string, entries: Array<{ type: string; content: string }>) {
  return { date, entries: entries.map(e => ({ ...e, id: crypto.randomUUID() })) }
}

describe('countByType', () => {
  it('counts entries by type', () => {
    const entries = [makeEntry('task'), makeEntry('task'), makeEntry('done'), makeEntry('note')]
    expect(countByType(entries, 'task')).toBe(2)
    expect(countByType(entries, 'done')).toBe(1)
    expect(countByType(entries, 'note')).toBe(1)
    expect(countByType(entries, 'priority')).toBe(0)
  })
})

describe('calculateStreak', () => {
  it('counts consecutive days with entries', () => {
    const logs = [
      makeLog('2026-04-01', [{ type: 'task', content: 'x' }]),
      makeLog('2026-03-31', [{ type: 'task', content: 'x' }]),
      makeLog('2026-03-30', [{ type: 'task', content: 'x' }]),
    ]
    expect(calculateStreak(logs)).toBe(3)
  })

  it('stops at a gap', () => {
    const logs = [
      makeLog('2026-04-01', []),
      makeLog('2026-03-31', [{ type: 'task', content: 'x' }]),
    ]
    expect(calculateStreak(logs)).toBe(0)
  })

  it('returns 0 for empty logs', () => {
    expect(calculateStreak([])).toBe(0)
  })

  it('counts single day', () => {
    const logs = [makeLog('2026-04-01', [{ type: 'task', content: 'x' }])]
    expect(calculateStreak(logs)).toBe(1)
  })
})

describe('donePendingRatio', () => {
  it('calculates done/(done+task+priority)', () => {
    const logs = [
      makeLog('2026-04-01', [
        { type: 'done', content: 'a' },
        { type: 'done', content: 'b' },
        { type: 'task', content: 'c' },
        { type: 'priority', content: 'd' },
      ]),
    ]
    expect(donePendingRatio(logs)).toBe(0.5)
  })

  it('returns 0 when no entries', () => {
    expect(donePendingRatio([])).toBe(0)
  })

  it('returns 1 when all done', () => {
    const logs = [makeLog('2026-04-01', [
      { type: 'done', content: 'a' },
      { type: 'done', content: 'b' },
    ])]
    expect(donePendingRatio(logs)).toBe(1)
  })
})

describe('priorityAlignment', () => {
  it('calculates priority completion rate', () => {
    const logs = [
      makeLog('2026-04-01', [
        { type: 'priority', content: 'Important Task' },
        { type: 'done', content: 'Important Task' },
        { type: 'priority', content: 'Another Priority' },
      ]),
    ]
    expect(priorityAlignment(logs)).toBe(0.5)
  })

  it('returns 0 when no priorities', () => {
    const logs = [makeLog('2026-04-01', [
      { type: 'task', content: 'x' },
    ])]
    expect(priorityAlignment(logs)).toBe(0)
  })
})

describe('momentumScore', () => {
  it('returns new for few entries', () => {
    const logs = [makeLog('2026-04-01', [{ type: 'task', content: 'x' }])]
    expect(momentumScore(logs)).toBe('new')
  })

  it('returns steady for consistent performance', () => {
    const logs = Array.from({ length: 14 }, (_, i) =>
      makeLog(`2026-04-${String(14 - i).padStart(2, '0')}`, [
        { type: 'done', content: 'a' },
        { type: 'task', content: 'b' },
      ])
    )
    const result = momentumScore(logs)
    expect(['steady', 'building', 'stalling']).toContain(result)
  })
})

describe('migrationPatterns', () => {
  it('finds tasks migrated 3+ times', () => {
    const logs = [
      makeLog('2026-04-01', [{ type: 'task', content: 'Exercise' }]),
      makeLog('2026-04-02', [{ type: 'migrated', content: 'Exercise' }]),
      makeLog('2026-04-03', [{ type: 'migrated', content: 'Exercise' }]),
      makeLog('2026-04-04', [{ type: 'migrated', content: 'Exercise' }]),
    ]
    const patterns = migrationPatterns(logs)
    expect(patterns).toHaveLength(1)
    expect(patterns[0].text).toBe('Exercise')
    expect(patterns[0].count).toBe(4)
  })

  it('ignores tasks seen fewer than 3 times', () => {
    const logs = [
      makeLog('2026-04-01', [{ type: 'task', content: 'One-off' }]),
      makeLog('2026-04-02', [{ type: 'task', content: 'One-off' }]),
    ]
    expect(migrationPatterns(logs)).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const logs = [
      makeLog('2026-04-01', [{ type: 'task', content: 'exercise' }]),
      makeLog('2026-04-02', [{ type: 'migrated', content: 'Exercise' }]),
      makeLog('2026-04-03', [{ type: 'migrated', content: 'EXERCISE' }]),
      makeLog('2026-04-04', [{ type: 'migrated', content: 'exercise' }]),
    ]
    const patterns = migrationPatterns(logs)
    expect(patterns).toHaveLength(1)
  })
})

describe('killThemesAnalysis', () => {
  it('finds most common first words in killed tasks', () => {
    const logs = [
      makeLog('2026-04-01', [
        { type: 'killed', content: 'Write blog post' },
        { type: 'killed', content: 'Write article' },
        { type: 'killed', content: 'Write something' },
      ]),
    ]
    const themes = killThemesAnalysis(logs)
    expect(themes['write']).toBe(3)
  })

  it('ignores short words', () => {
    const logs = [
      makeLog('2026-04-01', [
        { type: 'killed', content: 'a test' },
        { type: 'killed', content: 'to do' },
      ]),
    ]
    const themes = killThemesAnalysis(logs)
    expect(Object.keys(themes)).toHaveLength(0)
  })
})

describe('noteHeavyDays', () => {
  it('identifies days with 5+ notes', () => {
    const logs = [
      makeLog('2026-04-01', Array.from({ length: 6 }, (_, i) => ({ type: 'note', content: `note ${i}` }))),
      makeLog('2026-03-31', [{ type: 'note', content: 'single note' }]),
    ]
    const heavy = noteHeavyDays(logs)
    expect(heavy).toHaveLength(1)
    expect(heavy[0].date).toBe('2026-04-01')
    expect(heavy[0].count).toBe(6)
  })
})

describe('eventHeavyDayNudge', () => {
  it('detects event-heavy days with zero tasks done', () => {
    const logs = [
      makeLog('2026-04-01', [
        { type: 'event', content: 'meeting 1' },
        { type: 'event', content: 'meeting 2' },
        { type: 'event', content: 'meeting 3' },
        { type: 'task', content: 'pending task' },
      ]),
    ]
    const nudge = eventHeavyDayNudge(logs)
    expect(nudge).toContain('overcommit alert')
  })

  it('returns null when no event-heavy days', () => {
    const logs = [makeLog('2026-04-01', [{ type: 'task', content: 'x' }])]
    expect(eventHeavyDayNudge(logs)).toBeNull()
  })
})

describe('coachingNudge', () => {
  it('suggests killing stuck tasks', () => {
    const allLogs = Array.from({ length: 5 }, (_, i) =>
      makeLog(`2026-04-${String(i + 1).padStart(2, '0')}`, [
        { type: i === 0 ? 'task' : 'migrated', content: 'Exercise' },
      ])
    )
    const logs7 = allLogs.slice(0, 7)
    const nudge = coachingNudge(logs7, allLogs, 3)
    expect(nudge).toContain('Exercise')
    expect(nudge).toContain('Kill it')
  })

  it('returns a coaching message when no patterns detected', () => {
    const logs7 = Array.from({ length: 7 }, (_, i) =>
      makeLog(`2026-04-${String(7 - i).padStart(2, '0')}`, [
        { type: 'priority', content: 'Important thing' },
        { type: 'done', content: 'Important thing' },
        { type: 'task', content: 'Regular task' },
        { type: 'done', content: 'Regular task' },
      ])
    )
    const nudge = coachingNudge(logs7, [], 3)
    expect(nudge.length).toBeGreaterThan(0)
    expect(nudge).toMatch(/keep|completion|streak|logging/i)
  })
})

describe('computeHeatmap', () => {
  it('computes count and rate per day', () => {
    const logs = [
      makeLog('2026-04-01', [
        { type: 'done', content: 'a' },
        { type: 'done', content: 'b' },
        { type: 'task', content: 'c' },
      ]),
      makeLog('2026-04-02', [
        { type: 'task', content: 'x' },
      ]),
    ]
    const heatmap = computeHeatmap(logs)
    expect(heatmap['2026-04-01']).toEqual({ count: 3, rate: 2 / 3 })
    expect(heatmap['2026-04-02']).toEqual({ count: 1, rate: 0 })
  })

  it('skips empty days', () => {
    const logs = [makeLog('2026-04-01', [])]
    expect(computeHeatmap(logs)).toEqual({})
  })

  it('returns 0 rate when no done/task/priority', () => {
    const logs = [makeLog('2026-04-01', [
      { type: 'note', content: 'just a note' },
      { type: 'event', content: 'an event' },
    ])]
    const heatmap = computeHeatmap(logs)
    expect(heatmap['2026-04-01']).toEqual({ count: 2, rate: 0 })
  })
})
