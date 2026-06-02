import { describe, it, expect, vi } from 'vitest'
import { cn, getGreeting, getTodayDateString } from '../utils'

describe('getTodayDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const dateStr = getTodayDateString()
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('pads single-digit months and days', () => {
    const dateStr = getTodayDateString()
    const parts = dateStr.split('-')
    expect(parts[1].length).toBe(2)
    expect(parts[2].length).toBe(2)
  })
})

describe('getGreeting', () => {
  it('returns a non-empty string', () => {
    const greeting = getGreeting()
    expect(greeting.length).toBeGreaterThan(0)
  })

  it('returns late night message for hour 0-4', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T02:00:00'))
    expect(getGreeting()).toBe("It's late. No pressure.")
    vi.useRealTimers()
  })

  it('returns Monday-specific morning message', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T08:00:00'))
    expect(getGreeting()).toBe("Monday. Set your priorities for the week.")
    vi.useRealTimers()
  })

  it('returns Friday evening message', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-03T19:00:00'))
    expect(getGreeting()).toBe("Friday evening. Migrate before the weekend.")
    vi.useRealTimers()
  })
})

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar')
  })

  it('resolves Tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
