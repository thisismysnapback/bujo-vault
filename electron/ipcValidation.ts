import * as path from 'path'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/
const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/
const PERSPECTIVES = new Set(['chronicle', 'coach', 'relationships', 'strengths', 'therapist', 'values-meaning', 'synthesis'])

export function validateDate(value: unknown, label = 'date'): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new Error(`${label} must be YYYY-MM-DD`)
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${label} is not a valid calendar date`)
  }
  return value
}

export function validateMonthKey(value: unknown, label = 'monthKey'): string {
  if (typeof value !== 'string' || !MONTH_RE.test(value)) throw new Error(`${label} must be YYYY-MM`)
  const month = Number(value.slice(5, 7))
  if (month < 1 || month > 12) throw new Error(`${label} month must be 01..12`)
  return value
}

export function validateSlug(value: unknown, label = 'slug'): string {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) throw new Error(`${label} must be 1-64 letters, numbers, _ or -`)
  if (value.includes('..') || value.includes('/') || value.includes('\\') || value.includes('\0')) throw new Error(`${label} contains invalid path characters`)
  return value
}

export function validatePerspective(value: unknown): string {
  const perspective = validateSlug(value, 'perspective')
  if (!PERSPECTIVES.has(perspective)) throw new Error(`unknown perspective: ${perspective}`)
  return perspective
}

export function validateText(value: unknown, maxChars: number, label = 'text'): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  if (value.length > maxChars) throw new Error(`${label} exceeds ${maxChars} characters`)
  if (value.includes('\0')) throw new Error(`${label} contains a null byte`)
  return value
}

export function validateDays(value: unknown, max = 365): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) throw new Error('days must be an integer')
  if (value < 1 || value > max) throw new Error(`days must be between 1 and ${max}`)
  return value
}

export function safeJoin(base: string, ...parts: string[]): string {
  if (!base) throw new Error('base path is required')
  for (const part of parts) {
    if (typeof part !== 'string' || part.includes('\0')) throw new Error('invalid path part')
    if (path.isAbsolute(part)) throw new Error('absolute path parts are not allowed')
  }
  const resolvedBase = path.resolve(base)
  const resolvedPath = path.resolve(resolvedBase, ...parts)
  const relative = path.relative(resolvedBase, resolvedPath)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return resolvedPath
  throw new Error('path escapes vault')
}
