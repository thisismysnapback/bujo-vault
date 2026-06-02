import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import * as path from 'path'
import { parseEntries, stableEntryId } from './parser'
import type { ParsedEntry } from './parser'
import { safeJoin, validateDate, validateMonthKey, validateText } from './ipcValidation'

export const SYMBOL_MAP: Record<string, string> = { task: 't', done: 'x', migrated: '>', scheduled: '<', killed: 'k', note: 'n', event: 'e', priority: '*' }

export type UndoFileChange = { filePath: string; before: string | null; after: string | null }
export type UndoRecord = { changes: UndoFileChange[]; description: string }

export function readTextSafe(filePath: string): string {
  try { return readFileSync(filePath, 'utf8') } catch { return '' }
}

export function headerForDate(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function dailyPath(vaultPath: string, date: string): string {
  return safeJoin(vaultPath, 'daily', `${validateDate(date)}.md`)
}

function monthlyPath(vaultPath: string, monthKey: string): string {
  return safeJoin(vaultPath, 'monthly', `${validateMonthKey(monthKey)}.md`)
}

function ensureParent(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function lineIndexForEntry(content: string, fileDate: string, id: string): number {
  const entries = parseEntries(content, fileDate)
  if (!entries.some(e => e.id === id)) return -1
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim()
    if (!stripped || stripped.startsWith('#')) continue
    if (stableEntryId(fileDate, i, stripped) === id) return i
  }
  return -1
}

export function getDay(vaultPath: string, date: string): { date: string; entries: ParsedEntry[]; file_path: string } {
  const validDate = validateDate(date)
  const filePath = dailyPath(vaultPath, validDate)
  if (!existsSync(filePath)) return { date: validDate, entries: [], file_path: filePath }
  return { date: validDate, entries: parseEntries(readTextSafe(filePath), validDate), file_path: filePath }
}

export function getMonthly(vaultPath: string, monthKey: string): { date: string; entries: ParsedEntry[]; header: string; file_path: string } {
  const validMonth = validateMonthKey(monthKey)
  const filePath = monthlyPath(vaultPath, validMonth)
  const [year, month] = validMonth.split('-').map(Number)
  let header = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
  if (!existsSync(filePath)) return { date: validMonth, entries: [], header, file_path: filePath }
  const content = readTextSafe(filePath)
  for (const line of content.split('\n')) {
    if (line.startsWith('# ')) { header = line.slice(2).trim(); break }
  }
  return { date: validMonth, entries: parseEntries(content, validMonth), header, file_path: filePath }
}

export function appendEntry(vaultPath: string, date: string, type: string, content: string): { result: { success: true }; undo: UndoRecord } {
  const validDate = validateDate(date)
  const safeContent = validateText(content, 20_000, 'content')
  const filePath = dailyPath(vaultPath, validDate)
  ensureParent(filePath)
  if (!existsSync(filePath)) writeFileSync(filePath, `# ${headerForDate(validDate)}\n\n`)
  const before = readTextSafe(filePath)
  const sym = SYMBOL_MAP[type] || 't'
  const after = before + `${sym} ${safeContent}\n`
  writeFileSync(filePath, after)
  return { result: { success: true }, undo: { description: `added ${sym} ${safeContent}`, changes: [{ filePath, before, after }] } }
}

export function appendMonthlyEntry(vaultPath: string, monthKey: string, type: string, content: string): { result: { success: true }; undo: UndoRecord } {
  const validMonth = validateMonthKey(monthKey)
  const safeContent = validateText(content, 20_000, 'content')
  const filePath = monthlyPath(vaultPath, validMonth)
  ensureParent(filePath)
  const [year, month] = validMonth.split('-').map(Number)
  if (!existsSync(filePath)) writeFileSync(filePath, `# ${new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}\n\n`)
  const before = readTextSafe(filePath)
  const sym = SYMBOL_MAP[type] || 't'
  const after = before + `${sym} ${safeContent}\n`
  writeFileSync(filePath, after)
  return { result: { success: true }, undo: { description: `added monthly ${sym} ${safeContent}`, changes: [{ filePath, before, after }] } }
}

export function updateEntry(vaultPath: string, date: string, id: string, type: string, content: string): { result: { success?: boolean; error?: string }; undo?: UndoRecord } {
  const validDate = validateDate(date)
  const safeContent = validateText(content, 20_000, 'content')
  const filePath = dailyPath(vaultPath, validDate)
  return updateEntryFile(filePath, validDate, id, type, safeContent, `updated to ${type} ${safeContent}`)
}

export function updateMonthlyEntry(vaultPath: string, monthKey: string, id: string, type: string, content: string): { result: { success?: boolean; error?: string }; undo?: UndoRecord } {
  const validMonth = validateMonthKey(monthKey)
  const safeContent = validateText(content, 20_000, 'content')
  const filePath = monthlyPath(vaultPath, validMonth)
  return updateEntryFile(filePath, validMonth, id, type, safeContent, `updated monthly to ${type} ${safeContent}`)
}

function updateEntryFile(filePath: string, fileDate: string, id: string, type: string, content: string, description: string) {
  if (!existsSync(filePath)) return { result: { error: 'File not found' } }
  const before = readTextSafe(filePath)
  const lineIndex = lineIndexForEntry(before, fileDate, id)
  if (lineIndex === -1) return { result: { error: 'Entry not found' } }
  const lines = before.split('\n')
  const sym = SYMBOL_MAP[type] || 't'
  lines[lineIndex] = `${sym} ${content}`
  const after = lines.join('\n')
  writeFileSync(filePath, after)
  return { result: { success: true }, undo: { description, changes: [{ filePath, before, after }] } }
}

export function deleteEntry(vaultPath: string, date: string, id: string): { result: { success?: boolean; error?: string }; undo?: UndoRecord } {
  const validDate = validateDate(date)
  return deleteEntryFile(dailyPath(vaultPath, validDate), validDate, 'deleted entry')
  function deleteEntryFile(filePath: string, fileDate: string, description: string) {
    if (!existsSync(filePath)) return { result: { error: 'File not found' } }
    const before = readTextSafe(filePath)
    const lineIndex = lineIndexForEntry(before, fileDate, id)
    if (lineIndex === -1) return { result: { error: 'Entry not found' } }
    const lines = before.split('\n')
    lines.splice(lineIndex, 1)
    const after = lines.join('\n')
    writeFileSync(filePath, after)
    return { result: { success: true }, undo: { description, changes: [{ filePath, before, after }] } }
  }
}

export function deleteMonthlyEntry(vaultPath: string, monthKey: string, id: string): { result: { success?: boolean; error?: string }; undo?: UndoRecord } {
  const validMonth = validateMonthKey(monthKey)
  const filePath = monthlyPath(vaultPath, validMonth)
  if (!existsSync(filePath)) return { result: { error: 'File not found' } }
  const before = readTextSafe(filePath)
  const lineIndex = lineIndexForEntry(before, validMonth, id)
  if (lineIndex === -1) return { result: { error: 'Entry not found' } }
  const lines = before.split('\n')
  lines.splice(lineIndex, 1)
  const after = lines.join('\n')
  writeFileSync(filePath, after)
  return { result: { success: true }, undo: { description: 'deleted monthly entry', changes: [{ filePath, before, after }] } }
}

export function clearDay(vaultPath: string, date: string): { result: { success?: boolean; error?: string }; undo?: UndoRecord } {
  const validDate = validateDate(date)
  const filePath = dailyPath(vaultPath, validDate)
  if (!existsSync(filePath)) return { result: { error: 'File not found' } }
  const before = readTextSafe(filePath)
  unlinkSync(filePath)
  return { result: { success: true }, undo: { description: `cleared ${validDate}`, changes: [{ filePath, before, after: null }] } }
}

export function migrateEntry(vaultPath: string, fromDate: string, toDate: string, entryId: string): { result: { success?: boolean; error?: string }; undo?: UndoRecord } {
  const validFrom = validateDate(fromDate, 'fromDate')
  const validTo = validateDate(toDate, 'toDate')
  const srcPath = dailyPath(vaultPath, validFrom)
  if (!existsSync(srcPath)) return { result: { error: 'Source not found' } }
  const srcBefore = readTextSafe(srcPath)
  const entries = parseEntries(srcBefore, validFrom)
  const entry = entries.find(e => e.id === entryId)
  const lineIndex = lineIndexForEntry(srcBefore, validFrom, entryId)
  if (!entry || lineIndex === -1) return { result: { error: 'Entry not found' } }

  const srcLines = srcBefore.split('\n')
  srcLines[lineIndex] = `> ${entry.content}`
  const srcAfter = srcLines.join('\n')
  writeFileSync(srcPath, srcAfter)

  const dstPath = dailyPath(vaultPath, validTo)
  ensureParent(dstPath)
  const dstExisted = existsSync(dstPath)
  const dstBefore = dstExisted ? readTextSafe(dstPath) : `# ${headerForDate(validTo)}\n\n`
  const sym = SYMBOL_MAP[entry.type || 'task'] || 't'
  const dstAfter = dstBefore + `${sym} ${entry.content}\n`
  writeFileSync(dstPath, dstAfter)

  return {
    result: { success: true },
    undo: { description: `migrated ${entry.content}`, changes: [{ filePath: srcPath, before: srcBefore, after: srcAfter }, { filePath: dstPath, before: dstExisted ? dstBefore : null, after: dstAfter }] },
  }
}

export function applyUndo(record: UndoRecord): void {
  for (const change of [...record.changes].reverse()) {
    if (change.before === null) {
      if (existsSync(change.filePath)) unlinkSync(change.filePath)
    } else {
      ensureParent(change.filePath)
      writeFileSync(change.filePath, change.before)
    }
  }
}
