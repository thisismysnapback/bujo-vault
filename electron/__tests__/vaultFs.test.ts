import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { appendEntry, appendMonthlyEntry, applyUndo, clearDay, deleteEntry, deleteMonthlyEntry, getDay, getMonthly, migrateEntry, readTextSafe, updateEntry, updateMonthlyEntry } from '../../electron/vaultFs'

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bujo-vault-'))
  fs.mkdirSync(path.join(dir, 'daily'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'monthly'), { recursive: true })
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
})
