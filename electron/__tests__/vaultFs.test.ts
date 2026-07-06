import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { appendEntriesBatch, appendEntry, appendMonthlyEntry, applyUndo, clearAllJournalData, clearDay, deleteEntry, deleteMonthlyEntry, getDay, getMonthly, migrateEntry, readTextSafe, updateEntry, updateMonthlyEntry } from '../../electron/vaultFs'

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bujo-vault-'))
  fs.mkdirSync(path.join(dir, 'daily'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'monthly'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'originals'), { recursive: true })
  return dir
}

describe('vaultFs entry operations', () => {
  it('updates and deletes daily entries using IDs returned by parsing', () => {
    const vault = tempVault()
    appendEntry(vault, '2026-06-02', 'task', 'first task')
    appendEntry(vault, '2026-06-02', 'note', 'second note')

    const parsed = getDay(vault, '2026-06-02').entries
    expect(updateEntry(vault, '2026-06-02', parsed[0].id, 'done', 'first task').result).toEqual({ success: true })
    expect(getDay(vault, '2026-06-02').entries[0]).toEqual(expect.objectContaining({ type: 'done', content: 'first task' }))

    const reparsed = getDay(vault, '2026-06-02').entries
    expect(deleteEntry(vault, '2026-06-02', reparsed[1].id).result).toEqual({ success: true })
    expect(getDay(vault, '2026-06-02').entries.map(e => e.content)).toEqual(['first task'])
  })

  it('appends multiple daily entries with one undo record', () => {
    const vault = tempVault()

    const batch = appendEntriesBatch(vault, '2026-06-02', [
      { type: 'task', content: 'first task' },
      { type: 'note', content: 'second note' },
      { type: 'event', content: 'third event' },
    ])

    expect(batch.result.entries.map(e => e.content)).toEqual(['first task', 'second note', 'third event'])
    expect(batch.undo.changes).toHaveLength(1)
    expect(getDay(vault, '2026-06-02').entries.map(e => e.type)).toEqual(['task', 'note', 'event'])

    applyUndo(batch.undo)
    expect(getDay(vault, '2026-06-02').entries).toHaveLength(0)
  })

  it('migrates with returned ID and undo restores both source and destination files', () => {
    const vault = tempVault()
    appendEntry(vault, '2026-06-02', 'task', 'move me')
    const id = getDay(vault, '2026-06-02').entries[0].id

    const migrated = migrateEntry(vault, '2026-06-02', '2026-06-03', id)
    expect(migrated.result).toEqual({ success: true })
    expect(getDay(vault, '2026-06-02').entries[0].type).toBe('migrated')
    expect(getDay(vault, '2026-06-03').entries.map(e => e.content)).toEqual(['move me'])

    applyUndo(migrated.undo!)
    expect(getDay(vault, '2026-06-02').entries[0]).toEqual(expect.objectContaining({ type: 'task', content: 'move me' }))
    expect(fs.existsSync(path.join(vault, 'daily', '2026-06-03.md'))).toBe(false)
  })

  it('updates and deletes monthly entries in monthly files only', () => {
    const vault = tempVault()
    appendMonthlyEntry(vault, '2026-06', 'task', 'monthly task')
    const id = getMonthly(vault, '2026-06').entries[0].id

    expect(updateMonthlyEntry(vault, '2026-06', id, 'done', 'monthly task').result).toEqual({ success: true })
    expect(readTextSafe(path.join(vault, 'monthly', '2026-06.md'))).toContain('x monthly task')
    expect(fs.existsSync(path.join(vault, 'daily', '2026-06.md'))).toBe(false)

    const reparsedId = getMonthly(vault, '2026-06').entries[0].id
    expect(deleteMonthlyEntry(vault, '2026-06', reparsedId).result).toEqual({ success: true })
    expect(getMonthly(vault, '2026-06').entries).toHaveLength(0)
  })

  it('rejects invalid dates instead of writing traversal paths', () => {
    const vault = tempVault()
    expect(() => appendEntry(vault, '../../evil', 'task', 'nope')).toThrow()
    expect(() => clearDay(vault, '2026-13-99')).toThrow()
  })

  it('clears daily entries and original input for the same day', () => {
    const vault = tempVault()
    appendEntry(vault, '2026-06-03', 'task', 'test entry')
    fs.writeFileSync(path.join(vault, 'originals', '2026-06-03.md'), '# Original input\n\nraw dump')

    const cleared = clearDay(vault, '2026-06-03')

    expect(cleared.result).toEqual({ success: true })
    expect(fs.existsSync(path.join(vault, 'daily', '2026-06-03.md'))).toBe(false)
    expect(fs.existsSync(path.join(vault, 'originals', '2026-06-03.md'))).toBe(false)

    applyUndo(cleared.undo!)
    expect(readTextSafe(path.join(vault, 'daily', '2026-06-03.md'))).toContain('t test entry')
    expect(readTextSafe(path.join(vault, 'originals', '2026-06-03.md'))).toContain('raw dump')
  })

  it('clears original input even when the daily file is already gone', () => {
    const vault = tempVault()
    fs.writeFileSync(path.join(vault, 'originals', '2026-06-03.md'), '# Original input\n\nraw dump')

    const cleared = clearDay(vault, '2026-06-03')

    expect(cleared.result).toEqual({ success: true })
    expect(fs.existsSync(path.join(vault, 'originals', '2026-06-03.md'))).toBe(false)
  })

  it('clears journal data folders without removing perspectives or backups', () => {
    const vault = tempVault()
    fs.mkdirSync(path.join(vault, 'perspectives'), { recursive: true })
    fs.mkdirSync(path.join(vault, '_backups'), { recursive: true })
    fs.mkdirSync(path.join(vault, 'analysis', 'coach'), { recursive: true })
    fs.writeFileSync(path.join(vault, 'daily', '2026-06-03.md'), 't task')
    fs.writeFileSync(path.join(vault, 'originals', '2026-06-03.md'), 'raw')
    fs.writeFileSync(path.join(vault, 'monthly', '2026-06.md'), 't monthly')
    fs.writeFileSync(path.join(vault, 'analysis', 'coach', '2026-06-coach.md'), 'review')
    fs.writeFileSync(path.join(vault, 'perspectives', 'coach.md'), 'coach prompt')
    fs.writeFileSync(path.join(vault, '_backups', 'keep.md'), 'backup')

    const cleared = clearAllJournalData(vault)

    expect(cleared.result).toEqual({ success: true, removed: 4 })
    expect(fs.existsSync(path.join(vault, 'daily', '2026-06-03.md'))).toBe(false)
    expect(fs.existsSync(path.join(vault, 'originals', '2026-06-03.md'))).toBe(false)
    expect(fs.existsSync(path.join(vault, 'monthly', '2026-06.md'))).toBe(false)
    expect(fs.existsSync(path.join(vault, 'analysis', 'coach', '2026-06-coach.md'))).toBe(false)
    expect(readTextSafe(path.join(vault, 'perspectives', 'coach.md'))).toBe('coach prompt')
    expect(readTextSafe(path.join(vault, '_backups', 'keep.md'))).toBe('backup')
  })
})
