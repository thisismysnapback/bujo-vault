import { describe, it, expect } from 'vitest'
import { legacyTypeToEntryFields, parseEntries, hasExplicitPrefix, parseQuickInput, stableEntryId } from '../../electron/parser'

describe('parseEntries', () => {
  it('maps legacy types to entry kind/status/meta fields', () => {
    expect(legacyTypeToEntryFields('task')).toEqual({ kind: 'task', status: 'active' })
    expect(legacyTypeToEntryFields('done')).toEqual({ kind: 'task', status: 'done' })
    expect(legacyTypeToEntryFields('migrated')).toEqual({ kind: 'task', status: 'migrated' })
    expect(legacyTypeToEntryFields('killed')).toEqual({ kind: 'task', status: 'killed' })
    expect(legacyTypeToEntryFields('note')).toEqual({ kind: 'note', status: 'active' })
    expect(legacyTypeToEntryFields('event')).toEqual({ kind: 'event', status: 'active' })
    expect(legacyTypeToEntryFields('scheduled')).toEqual({ kind: 'task', status: 'active', meta: { scheduledFor: true } })
    expect(legacyTypeToEntryFields('priority')).toEqual({ kind: 'task', status: 'active', meta: { priority: true } })
  })

  it('parses ASCII prefixed entries', () => {
    const content = `# 2026-04-01
t buy groceries
x finished report
n feeling good today
e meeting at 3pm
* urgent deadline
k dropped the idea
> moved to tomorrow
< scheduled for next week`
    const entries = parseEntries(content, '2026-04-01')
    expect(entries).toHaveLength(8)
    expect(entries[0]).toEqual(expect.objectContaining({ type: 'task', content: 'buy groceries', symbol: '·' }))
    expect(entries[1]).toEqual(expect.objectContaining({ type: 'done', content: 'finished report', symbol: '×' }))
    expect(entries[2]).toEqual(expect.objectContaining({ type: 'note', content: 'feeling good today', symbol: '–' }))
    expect(entries[3]).toEqual(expect.objectContaining({ type: 'event', content: 'meeting at 3pm', symbol: '○' }))
    expect(entries[4]).toEqual(expect.objectContaining({ type: 'priority', content: 'urgent deadline', symbol: '★' }))
    expect(entries[5]).toEqual(expect.objectContaining({ type: 'killed', content: 'dropped the idea', symbol: '~' }))
    expect(entries[6]).toEqual(expect.objectContaining({ type: 'migrated', content: 'moved to tomorrow', symbol: '>' }))
    expect(entries[7]).toEqual(expect.objectContaining({ type: 'scheduled', content: 'scheduled for next week', symbol: '←' }))
  })

  it('parses Unicode prefixed entries', () => {
    const content = `· task with unicode
× done with unicode
○ event with unicode
★ priority with unicode`
    const entries = parseEntries(content, '2026-04-01')
    expect(entries).toHaveLength(4)
    expect(entries[0].type).toBe('task')
    expect(entries[1].type).toBe('done')
    expect(entries[2].type).toBe('event')
    expect(entries[3].type).toBe('priority')
  })

  it('skips headers and empty lines', () => {
    const content = `# 2026-04-01

## some section

t actual task

`
    const entries = parseEntries(content, '2026-04-01')
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe('actual task')
  })

  it('returns stable deterministic IDs and distinguishes duplicate lines', () => {
    const content = `# 2026-04-01
t duplicate
t duplicate`
    const first = parseEntries(content, '2026-04-01')
    const second = parseEntries(content, '2026-04-01')
    expect(first.map(e => e.id)).toEqual(second.map(e => e.id))
    expect(first[0].id).not.toBe(first[1].id)
    expect(first[0].id).toBe(stableEntryId('2026-04-01', 1, 't duplicate'))
  })
})

describe('hasExplicitPrefix', () => {
  it('detects single letter prefixes', () => {
    expect(hasExplicitPrefix('t something')).toBe(true)
    expect(hasExplicitPrefix('n something')).toBe(true)
    expect(hasExplicitPrefix('e something')).toBe(true)
    expect(hasExplicitPrefix('k something')).toBe(true)
    expect(hasExplicitPrefix('x something')).toBe(true)
    expect(hasExplicitPrefix('* something')).toBe(true)
    expect(hasExplicitPrefix('> something')).toBe(true)
    expect(hasExplicitPrefix('< something')).toBe(true)
  })

  it('detects word prefixes', () => {
    expect(hasExplicitPrefix('task something')).toBe(true)
    expect(hasExplicitPrefix('note something')).toBe(true)
    expect(hasExplicitPrefix('event something')).toBe(true)
    expect(hasExplicitPrefix('done something')).toBe(true)
    expect(hasExplicitPrefix('kill something')).toBe(true)
    expect(hasExplicitPrefix('priority something')).toBe(true)
  })

  it('detects exclamation marks', () => {
    expect(hasExplicitPrefix('!important')).toBe(true)
    expect(hasExplicitPrefix('something!')).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(hasExplicitPrefix('just a regular thought')).toBe(false)
    expect(hasExplicitPrefix('hello world')).toBe(false)
  })
})

describe('parseQuickInput', () => {
  it('defaults to task for plain text', () => {
    expect(parseQuickInput('hello world')).toEqual(['task', 'hello world'])
    expect(parseQuickInput('')).toEqual(['task', ''])
  })

  it('parses note prefixes', () => {
    expect(parseQuickInput('note something')).toEqual(['note', 'something'])
    expect(parseQuickInput('note: something')).toEqual(['note', 'something'])
    expect(parseQuickInput('n: something')).toEqual(['note', 'something'])
  })

  it('parses event prefixes', () => {
    expect(parseQuickInput('event something')).toEqual(['event', 'something'])
    expect(parseQuickInput('event: something')).toEqual(['event', 'something'])
    expect(parseQuickInput('e: something')).toEqual(['event', 'something'])
  })

  it('parses done prefix', () => {
    expect(parseQuickInput('done something')).toEqual(['done', 'something'])
    expect(parseQuickInput('done: something')).toEqual(['done', 'something'])
  })

  it('parses kill prefix', () => {
    expect(parseQuickInput('kill something')).toEqual(['killed', 'something'])
    expect(parseQuickInput('k something')).toEqual(['killed', 'something'])
  })

  it('parses priority via exclamation', () => {
    expect(parseQuickInput('something!')).toEqual(['priority', 'something'])
    expect(parseQuickInput('!something')).toEqual(['priority', 'something'])
  })

  it('parses priority via keywords', () => {
    expect(parseQuickInput('something important')).toEqual(['priority', 'something'])
    expect(parseQuickInput('something urgent')).toEqual(['priority', 'something'])
  })

  it('parses scheduled and migrated', () => {
    expect(parseQuickInput('< something')).toEqual(['scheduled', 'something'])
    expect(parseQuickInput('> something')).toEqual(['migrated', 'something'])
  })

  it('parses task prefix', () => {
    expect(parseQuickInput('task something')).toEqual(['task', 'something'])
    expect(parseQuickInput('t something')).toEqual(['task', 'something'])
  })
})
