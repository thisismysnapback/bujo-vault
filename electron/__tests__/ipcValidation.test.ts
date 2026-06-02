import { describe, expect, it } from 'vitest'
import * as path from 'path'
import { safeJoin, validateDate, validateDays, validateMonthKey, validatePerspective, validateSlug, validateText } from '../../electron/ipcValidation'

describe('ipcValidation', () => {
  it('validates dates and month keys strictly', () => {
    expect(validateDate('2026-06-02')).toBe('2026-06-02')
    expect(validateMonthKey('2026-06')).toBe('2026-06')
    expect(() => validateDate('../../outside')).toThrow()
    expect(() => validateDate('2026-13-99')).toThrow()
    expect(() => validateMonthKey('2026-13')).toThrow()
  })

  it('rejects path-like slugs and unknown perspectives', () => {
    expect(validateSlug('morning_template')).toBe('morning_template')
    for (const value of ['../x', 'a/b', 'a\\b', 'bad.slug', '']) {
      expect(() => validateSlug(value)).toThrow()
    }
    expect(validatePerspective('coach')).toBe('coach')
    expect(() => validatePerspective('custom/../../x')).toThrow()
  })

  it('validates text and day counts', () => {
    expect(validateText('hello', 10)).toBe('hello')
    expect(validateDays(30)).toBe(30)
    expect(() => validateText('too long', 3)).toThrow()
    expect(() => validateDays(9999)).toThrow()
  })

  it('safeJoin stays inside the base directory', () => {
    const base = path.resolve('/tmp/bujo-test')
    expect(safeJoin(base, 'daily', '2026-06-02.md')).toBe(path.resolve(base, 'daily', '2026-06-02.md'))
    expect(() => safeJoin(base, 'daily', '../../x.md')).toThrow()
    expect(() => safeJoin(base, path.resolve('/tmp/x.md'))).toThrow()
  })
})
