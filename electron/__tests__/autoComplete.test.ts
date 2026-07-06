import { describe, expect, it } from 'vitest'
import { entriesResolveSameLoop, findAutoCompletions, resolvedOpenLoopIds } from '../autoComplete'

function entry(id: string, type: string, content: string) {
  return { id, type, content }
}

describe('auto completion matching', () => {
  it('resolves an older passport task from a later completed call', () => {
    const logs = [
      { date: '2026-06-03', entries: [entry('passport', 'task', 'Talk to mom about the passport extension tomorrow; quite important.')] },
    ]
    const matches = findAutoCompletions('2026-06-05', entry('today', 'event', 'Called mom about the passport.'), logs)

    expect(matches).toEqual([
      expect.objectContaining({
        date: '2026-06-03',
        id: 'passport',
        daysStalled: 2,
      }),
    ])
  })

  it('marks resolved open loop ids from later evidence', () => {
    const logs = [
      { date: '2026-06-03', entries: [entry('passport', 'task', 'Talk to mom about the passport extension tomorrow; quite important.')] },
      { date: '2026-06-05', entries: [entry('called-mom', 'event', 'Called mom about the passport.')] },
    ]

    expect(resolvedOpenLoopIds(logs)).toContain('2026-06-03:passport')
  })

  it('does not mark work done just because someone handed over a related file', () => {
    const oldTask = entry('feedback', 'task', 'Do the feedback file from Michael, but not now.')
    const newEvent = entry('handoff', 'event', 'Michael handed over the latest feedback file.')

    expect(entriesResolveSameLoop(oldTask, newEvent)).toBe(false)
  })

  it('does not resolve unrelated older tasks', () => {
    const logs = [
      { date: '2026-06-04', entries: [entry('blender', 'task', 'Watch Blender videos tonight')] },
    ]
    const matches = findAutoCompletions('2026-06-05', entry('mom', 'event', 'Called mom about the passport.'), logs)

    expect(matches).toEqual([])
  })

  it('resolves explicit finished work', () => {
    const oldTask = entry('round', 'task', 'Finish final feedback round')
    const newEvent = entry('done', 'event', 'Finished final feedback round.')

    expect(entriesResolveSameLoop(oldTask, newEvent)).toBe(true)
  })
})
