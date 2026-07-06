import { ipcMain } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import * as path from 'path'
import { aiParseDump, heuristicParseDump } from '../aiParseDump'
import { getAiConfig } from '../configManager'
import { assertTrustedSender } from '../ipcSecurity'
import { safeJoin, validateDate, validateText } from '../ipcValidation'
import { buildDailySummaryPrompt, buildMigrationAnalysisPrompt, type PromptEntry } from '../llm'
import { hasExplicitPrefix, parseQuickInput, type ParsedEntry } from '../parser'

type AiProviderCall = (systemPrompt: string, userContent: string, maxTokens?: number) => Promise<string | null>

export interface AiHandlerDeps {
  getVaultPath: () => string
  readTextSafe: (filePath: string) => string
  safeResult: <T>(fn: () => T) => T | { error: string }
  localDateStr: (offsetDays?: number) => string
  callAiProvider: AiProviderCall
  coachNudgeForDate: (date: string) => Promise<{ nudge: string; source: 'llm' | 'rule' }>
  dayLogFromFile: (vaultPath: string, date: string) => { date: string; entries: ParsedEntry[]; file_path: string }
  toPromptEntry: (entry: ParsedEntry) => PromptEntry
  symbolMap: Record<string, string>
}

function originalDumpPath(vaultPath: string, date: string): string {
  return safeJoin(vaultPath, 'originals', `${validateDate(date)}.md`)
}

function appendOriginalDump(vaultPath: string, readTextSafe: (filePath: string) => string, date: string, text: string): { success: true; filePath: string } {
  const validDate = validateDate(date)
  const safeText = validateText(text, 80_000, 'text')
  const filePath = originalDumpPath(vaultPath, validDate)
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const before = existsSync(filePath) ? readTextSafe(filePath) : `# Original input for ${validDate}\n\n`
  const stamp = new Date().toISOString()
  const needsGap = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  writeFileSync(filePath, `${before}${needsGap}## ${stamp}\n\n${safeText}\n`)
  return { success: true, filePath }
}

function getOriginalDump(vaultPath: string, readTextSafe: (filePath: string) => string, date: string): { exists: boolean; content: string; filePath: string } {
  const filePath = originalDumpPath(vaultPath, date)
  if (!existsSync(filePath)) return { exists: false, content: '', filePath }
  return { exists: true, content: readTextSafe(filePath), filePath }
}

export function registerAiHandlers(deps: AiHandlerDeps): void {
  ipcMain.handle('smart_parse', async (_, text: string, logDate?: string) => {
    const validLogDate = logDate ? validateDate(logDate, 'logDate') : undefined
    if (hasExplicitPrefix(text)) {
      return [parseQuickInput(text)]
    }

    const aiResult = await aiParseDump(text, validLogDate, deps.callAiProvider)
    if (aiResult && aiResult.length > 0) {
      return aiResult
    }

    return heuristicParseDump(text)
  })

  ipcMain.handle('original_save', async (event, date: string, text: string) => {
    assertTrustedSender(event)
    return deps.safeResult(() => appendOriginalDump(deps.getVaultPath(), deps.readTextSafe, date, text))
  })

  ipcMain.handle('original_get', async (_, date: string) => {
    return deps.safeResult(() => getOriginalDump(deps.getVaultPath(), deps.readTextSafe, date))
  })

  ipcMain.handle('migrate_analyze', async (_, task: { text: string; count?: number; firstSeen?: string; lastSeen?: string } | string) => {
    if (!getAiConfig()) return { analysis: '// ai unavailable', source: 'fallback' }
    const stuckTask = typeof task === 'string' ? { text: task, count: 1 } : { text: task.text, count: task.count || 1, firstSeen: task.firstSeen, lastSeen: task.lastSeen }
    const prompt = buildMigrationAnalysisPrompt(stuckTask)
    const raw = await deps.callAiProvider(prompt.systemPrompt, prompt.userContent, 1024)
    return { analysis: raw || '// ai unavailable', source: raw ? 'llm' : 'fallback' }
  })

  ipcMain.handle('coach_nudge_llm', async (_, date: string) => {
    return deps.coachNudgeForDate(date)
  })

  ipcMain.handle('daily_summary', async (_, date: string) => {
    const log = deps.dayLogFromFile(deps.getVaultPath(), date)
    const prompt = buildDailySummaryPrompt(date, log.entries.map(deps.toPromptEntry))
    if ('message' in prompt) return { summary: prompt.message }
    if (!getAiConfig()) return { error: 'AI unavailable' }
    const raw = await deps.callAiProvider(prompt.systemPrompt, prompt.userContent, 2048)
    return raw ? { summary: raw } : { error: 'AI request failed' }
  })

  ipcMain.handle('dump_retry', async (event) => {
    assertTrustedSender(event)
    const todayPath = path.join(deps.getVaultPath(), 'daily', `${deps.localDateStr()}.md`)
    if (!existsSync(todayPath)) return { error: 'No log file for today' }

    const content = deps.readTextSafe(todayPath)
    const lines = content.split('\n')
    const unprocessed: string[] = []
    let i = 0
    while (i < lines.length) {
      if (lines[i].trim() === '## dump') {
        const dumpLines: string[] = []
        i++
        while (i < lines.length && lines[i].trim() !== '## /dump') {
          dumpLines.push(lines[i])
          i++
        }
        i++
        let hasEntries = false
        if (i < lines.length) {
          const nextLine = lines[i].trim()
          if (nextLine && 'txne*>k<'.includes(nextLine[0]) && nextLine[1] === ' ') {
            hasEntries = true
          }
        }
        if (!hasEntries && dumpLines.length) {
          unprocessed.push(dumpLines.join('\n'))
        }
      } else {
        i++
      }
    }

    if (!unprocessed.length) return { entries: [], message: 'No unprocessed dump blocks found' }

    const allEntries: Array<[string, string]> = []
    for (const rawText of unprocessed) {
      const result = await aiParseDump(rawText, undefined, deps.callAiProvider)
      if (result) allEntries.push(...result)
    }

    for (const [type, entryContent] of allEntries) {
      const sym = deps.symbolMap[type] || 't'
      const before = deps.readTextSafe(todayPath)
      writeFileSync(todayPath, before + `${sym} ${entryContent}\n`)
    }

    return { entries: allEntries, count: allEntries.length }
  })
}
