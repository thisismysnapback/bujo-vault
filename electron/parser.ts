import { createHash } from 'crypto'
import type { EntryKind, EntryMeta, EntryStatus } from './types'

export interface ParsedEntry {
  id: string
  /** Legacy markdown boundary type. App code should prefer kind/status/meta. */
  type?: string
  kind: EntryKind
  status: EntryStatus
  meta?: EntryMeta
  content: string
  timestamp: number
  source_date: string
  display: string
  symbol: string
}

export function legacyTypeToEntryFields(type: string): { kind: EntryKind; status: EntryStatus; meta?: EntryMeta } {
  switch (type) {
    case 'done':
      return { kind: 'task', status: 'done' }
    case 'migrated':
      return { kind: 'task', status: 'migrated' }
    case 'killed':
      return { kind: 'task', status: 'killed' }
    case 'note':
      return { kind: 'note', status: 'active' }
    case 'event':
      return { kind: 'event', status: 'active' }
    case 'scheduled':
      return { kind: 'task', status: 'active', meta: { scheduledFor: true } }
    case 'priority':
      return { kind: 'task', status: 'active', meta: { priority: true } }
    case 'task':
    default:
      return { kind: 'task', status: 'active' }
  }
}

export function entryFieldsToLegacyType(entry: { type?: string; kind?: EntryKind; status?: EntryStatus; meta?: EntryMeta }): string {
  if (entry.type) return entry.type
  if (entry.kind === 'note') return 'note'
  if (entry.kind === 'event') return 'event'
  if (entry.status === 'done') return 'done'
  if (entry.status === 'migrated') return 'migrated'
  if (entry.status === 'killed') return 'killed'
  if (entry.meta?.priority) return 'priority'
  if (entry.meta?.scheduledFor) return 'scheduled'
  return 'task'
}

export function stableEntryId(fileDate: string, lineIndex: number, rawLine: string): string {
  const digest = createHash('sha256')
    .update(`${fileDate}\n${lineIndex}\n${rawLine.trim()}`)
    .digest('hex')
    .slice(0, 12)
  return `entry:${fileDate}:${lineIndex + 1}:${digest}`
}

export function parseEntries(content: string, fileDate: string): ParsedEntry[] {
  const unicodePrefixes: [string, string][] = [
    ['·', 'task'], ['×', 'done'], ['~', 'killed'], ['–', 'note'], ['○', 'event'], ['★', 'priority']
  ]
  const entries: ParsedEntry[] = []
  const lines = content.split('\n')

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const stripped = line.trim()
    if (!stripped || stripped.startsWith('#')) continue

    let sym: string | null = null
    let text = ''
    const asciiMap: Record<string, string> = { 't': 'task', 'x': 'done', '>': 'migrated', '<': 'scheduled', 'k': 'killed', 'n': 'note', 'e': 'event', '*': 'priority' }

    for (const [ascii, type] of Object.entries(asciiMap)) {
      const prefix = ascii + ' '
      if (stripped.startsWith(prefix)) {
        sym = type
        text = stripped.slice(prefix.length).trim()
        break
      }
    }

    if (!sym) {
      for (const [uni, type] of unicodePrefixes) {
        if (stripped.startsWith(uni)) {
          sym = type
          text = stripped.slice(uni.length).trim()
          break
        }
      }
    }

    if (sym) {
      const displayMap: Record<string, string> = {
        'task': '·', 'done': '×', 'migrated': '>', 'scheduled': '←', 'killed': '~', 'note': '–', 'event': '○', 'priority': '★'
      }
      entries.push({
        id: stableEntryId(fileDate, lineIndex, stripped),
        type: sym,
        ...legacyTypeToEntryFields(sym),
        content: text,
        timestamp: Date.now(),
        source_date: fileDate,
        display: displayMap[sym] || sym,
        symbol: displayMap[sym] || sym,
      })
    }
  }

  return entries
}

export function hasExplicitPrefix(text: string): boolean {
  const stripped = text.trim()
  if (stripped.length > 2 && stripped[1] === ' ' && 'tnekx>*<'.includes(stripped[0])) {
    return true
  }
  const lower = stripped.toLowerCase()
  const prefixes = ['task ', 'note ', 'event ', 'priority ', 'done ', 'kill ']
  for (const p of prefixes) {
    if (lower.startsWith(p)) return true
  }
  if (stripped.startsWith('!') || stripped.endsWith('!')) return true
  return false
}

export function parseQuickInput(text: string): [string, string] {
  const stripped = text.trim()
  if (!stripped) return ['task', '']

  const lower = stripped.toLowerCase()

  if (lower.startsWith('note ') || lower.startsWith('note:') || lower.startsWith('n:')) {
    const rest = lower.startsWith('note:') ? stripped.slice(5) : lower.startsWith('note ') ? stripped.slice(5) : stripped.slice(2)
    return ['note', rest.trim()]
  }
  if (lower.startsWith('event ') || lower.startsWith('event:') || lower.startsWith('e:')) {
    const rest = lower.startsWith('event:') ? stripped.slice(6) : lower.startsWith('event ') ? stripped.slice(6) : stripped.slice(2)
    return ['event', rest.trim()]
  }
  if (lower.startsWith('done:') || lower.startsWith('done ')) {
    return ['done', stripped.slice(5).trim()]
  }
  if (lower.startsWith('kill ') || lower.startsWith('k ')) {
    return ['killed', stripped.slice(lower.startsWith('kill ') ? 5 : 2).trim()]
  }
  if (stripped.endsWith('!') || stripped.startsWith('!')) {
    return ['priority', stripped.replace(/!/g, '').trim()]
  }
  if (lower.includes(' important') || lower.includes(' urgent')) {
    let cleaned = stripped
    for (const kw of [' important', ' urgent', ' Important', ' Urgent']) {
      cleaned = cleaned.replace(new RegExp(kw, 'gi'), '')
    }
    return ['priority', cleaned.trim()]
  }
  if (lower.startsWith('priority ') || (lower.startsWith('p ') && !lower.startsWith('pi'))) {
    return ['priority', stripped.slice(lower.startsWith('priority ') ? 9 : 2).trim()]
  }
  if (lower.startsWith('< ')) return ['scheduled', stripped.slice(2).trim()]
  if (lower.startsWith('> ')) return ['migrated', stripped.slice(2).trim()]
  if (lower.startsWith('task ') || lower.startsWith('t ')) {
    return ['task', stripped.slice(lower.startsWith('task ') ? 5 : 2).trim()]
  }

  return ['task', stripped]
}
