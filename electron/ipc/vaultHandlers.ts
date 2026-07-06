import { ipcMain } from 'electron'
import { existsSync, readdirSync } from 'fs'
import { getAiConfig } from '../configManager'
import { assertTrustedSender } from '../ipcSecurity'
import { safeJoin, validateDays, validateText } from '../ipcValidation'
import { buildSemanticSearchPrompt, normalizeSemanticSearchIds, type PromptEntry } from '../llm'
import { parseEntries, type ParsedEntry } from '../parser'
import * as vaultFs from '../vaultFs'
import type { UndoRecord } from '../vaultFs'

type AiProviderCall = (systemPrompt: string, userContent: string, maxTokens?: number) => Promise<string | null>

export interface VaultHandlerDeps {
  getVaultPath: () => string
  ensureVaultDirs: (vaultPath: string) => void
  safeResult: <T>(fn: () => T) => T | { error: string }
  pushUndo: (record: UndoRecord | undefined) => void
  popUndo: () => UndoRecord | undefined
  localDateStr: (offsetDays?: number) => string
  loadRangeUntil: (date: string, days: number) => Array<{ date: string; entries: ParsedEntry[] }>
  findAutoCompletions: (date: string, entry: ParsedEntry, logs: Array<{ date: string; entries: ParsedEntry[] }>) => Array<{ date: string; id: string; task: string }>
  readTextSafe: (filePath: string) => string
  toPromptEntry: (entry: ParsedEntry) => PromptEntry
  callAiProvider: AiProviderCall
}

export function registerVaultHandlers(deps: VaultHandlerDeps): void {
  ipcMain.handle('vault_ensure', () => {
    deps.ensureVaultDirs(deps.getVaultPath())
    return { success: true }
  })

  ipcMain.handle('vault_get_day', async (_, date: string) => {
    return deps.safeResult(() => vaultFs.getDay(deps.getVaultPath(), date))
  })

  ipcMain.handle('vault_append_entry', async (event, date: string, type: string, content: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const vaultPath = deps.getVaultPath()
      const { result, undo } = vaultFs.appendEntry(vaultPath, date, type, content)
      deps.pushUndo(undo)
      const autoCompleted = deps.findAutoCompletions(date, result.entry, deps.loadRangeUntil(date, 22))
      for (const match of autoCompleted) {
        const { undo: doneUndo } = vaultFs.updateEntry(vaultPath, match.date, match.id, 'done', match.task)
        deps.pushUndo(doneUndo)
      }
      return { ...result, autoCompleted }
    })
  })

  ipcMain.handle('vault_append_entries_batch', async (event, date: string, entries: Array<{ type: string; content: string }>) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      if (!Array.isArray(entries)) throw new Error('entries must be an array')
      const vaultPath = deps.getVaultPath()
      const { result, undo } = vaultFs.appendEntriesBatch(vaultPath, date, entries)
      deps.pushUndo(undo)
      const autoCompleted: Array<{ date: string; id: string; task: string }> = []
      const completedIds = new Set<string>()
      for (const entry of result.entries) {
        for (const match of deps.findAutoCompletions(date, entry, deps.loadRangeUntil(date, 22))) {
          const matchId = `${match.date}:${match.id}`
          if (completedIds.has(matchId)) continue
          completedIds.add(matchId)
          const { undo: doneUndo } = vaultFs.updateEntry(vaultPath, match.date, match.id, 'done', match.task)
          deps.pushUndo(doneUndo)
          autoCompleted.push(match)
        }
      }
      return { ...result, autoCompleted }
    })
  })

  ipcMain.handle('vault_update_entry', async (event, date: string, id: string, type: string, content: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const { result, undo } = vaultFs.updateEntry(deps.getVaultPath(), date, validateText(id, 200, 'id'), type, content)
      deps.pushUndo(undo)
      return result
    })
  })

  ipcMain.handle('vault_delete_entry', async (event, date: string, id: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const { result, undo } = vaultFs.deleteEntry(deps.getVaultPath(), date, validateText(id, 200, 'id'))
      deps.pushUndo(undo)
      return result
    })
  })

  ipcMain.handle('vault_get_range', async (_, days: number) => {
    return deps.safeResult(() => {
      const validDays = validateDays(days)
      const logs = []
      for (let i = validDays - 1; i >= 0; i--) {
        const dateStr = deps.localDateStr(-i)
        logs.push(vaultFs.getDay(deps.getVaultPath(), dateStr))
      }
      return logs
    })
  })

  ipcMain.handle('vault_get_monthly', async (_, year: number, month: number) => {
    return deps.safeResult(() => vaultFs.getMonthly(deps.getVaultPath(), `${year}-${String(month).padStart(2, '0')}`))
  })

  ipcMain.handle('vault_search', async (_, query: string, mode: 'text' | 'semantic' = 'text') => {
    const results: any[] = []
    const allEntries: any[] = []
    const dailyDir = safeJoin(deps.getVaultPath(), 'daily')
    const queryLower = validateText(query, 500, 'query').toLowerCase()

    if (!existsSync(dailyDir)) return results

    const files = readdirSync(dailyDir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    for (const file of files) {
      const dateStr = file.replace('.md', '')
      const content = deps.readTextSafe(safeJoin(dailyDir, file))
      if (!content) continue
      const entries = parseEntries(content, dateStr)

      for (const entry of entries) {
        allEntries.push(entry)
        if (entry.content.toLowerCase().includes(queryLower)) {
          results.push(entry)
        }
      }
    }

    if (mode !== 'semantic' || allEntries.length === 0 || !getAiConfig()) return results

    const prompt = buildSemanticSearchPrompt(query, allEntries.slice(-200).map((entry) => ({ ...deps.toPromptEntry(entry), date: entry.source_date })))
    const raw = await deps.callAiProvider(prompt.systemPrompt, prompt.userContent, 1024)
    if (!raw) return results
    const ids = normalizeSemanticSearchIds(raw, new Set(allEntries.map(entry => entry.id)))
    if (ids.length === 0) return results
    const byId = new Map(allEntries.map(entry => [entry.id, entry]))
    return ids.map(id => byId.get(id)).filter(Boolean)
  })

  ipcMain.handle('vault_clear_day', async (event, date: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const { result, undo } = vaultFs.clearDay(deps.getVaultPath(), date)
      deps.pushUndo(undo)
      return result
    })
  })

  ipcMain.handle('vault_clear_all_data', async (event) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const { result, undo } = vaultFs.clearAllJournalData(deps.getVaultPath())
      deps.pushUndo(undo)
      return result
    })
  })

  ipcMain.handle('undo_last', async (event) => {
    assertTrustedSender(event)
    const entry = deps.popUndo()
    if (!entry) return { error: 'Nothing to undo' }
    vaultFs.applyUndo(entry)
    return { description: entry.description, filePaths: entry.changes.map(change => change.filePath), filePath: entry.changes[0]?.filePath }
  })

  ipcMain.handle('migrate_entry', async (event, fromDate: string, toDate: string, entryId: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const { result, undo } = vaultFs.migrateEntry(deps.getVaultPath(), fromDate, toDate, validateText(entryId, 200, 'entryId'))
      deps.pushUndo(undo)
      return result
    })
  })

  ipcMain.handle('vault_append_monthly_entry', async (event, monthKey: string, type: string, content: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const { result, undo } = vaultFs.appendMonthlyEntry(deps.getVaultPath(), monthKey, type, content)
      deps.pushUndo(undo)
      return result
    })
  })

  ipcMain.handle('vault_update_monthly_entry', async (event, monthKey: string, id: string, type: string, content: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const { result, undo } = vaultFs.updateMonthlyEntry(deps.getVaultPath(), monthKey, validateText(id, 200, 'id'), type, content)
      deps.pushUndo(undo)
      return result
    })
  })

  ipcMain.handle('vault_delete_monthly_entry', async (event, monthKey: string, id: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => {
      const { result, undo } = vaultFs.deleteMonthlyEntry(deps.getVaultPath(), monthKey, validateText(id, 200, 'id'))
      deps.pushUndo(undo)
      return result
    })
  })

  ipcMain.handle('vault_info', async () => {
    return { path: deps.getVaultPath() }
  })
}
