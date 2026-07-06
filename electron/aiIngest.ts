import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import * as path from 'path'
import { callChatCompletion } from './aiProvider'
import { aiParseDump, heuristicParseDump } from './aiParseDump'
import { getAiConfig, resolveVaultPath } from './configManager'
import { validateDate, validateText, safeJoin } from './ipcValidation'
import * as vaultFs from './vaultFs'

export interface AiIngestOptions {
  date: string
  text: string
  vaultPath?: string
  mode?: 'parse' | 'single-note'
  replaceDate?: boolean
}

export interface AiIngestResult {
  success: true
  date: string
  vaultPath: string
  dailyFilePath: string
  originalFilePath: string
  added: number
  entries: Array<{ type: string; content: string }>
  parser: 'ai' | 'heuristic'
}

function originalDumpPath(vaultPath: string, date: string): string {
  return safeJoin(vaultPath, 'originals', `${validateDate(date)}.md`)
}

function readTextSafe(filePath: string): string {
  try { return readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') } catch { return '' }
}

function appendOriginalInput(vaultPath: string, date: string, text: string): string {
  const filePath = originalDumpPath(vaultPath, date)
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const before = existsSync(filePath) ? readTextSafe(filePath) : `# Original input for ${date}\n\n`
  const stamp = new Date().toISOString()
  const needsGap = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  writeFileSync(filePath, `${before}${needsGap}## ai-ingest ${stamp}\n\n${text}\n`, 'utf8')
  return filePath
}

async function callConfiguredAiProvider(systemPrompt: string, userContent: string, maxTokens = 4096): Promise<string | null> {
  if (process.env.BUJO_AI_INGEST_DISABLE_AI === '1') return null
  const config = getAiConfig()
  if (!config) return null
  const result = await callChatCompletion(config, systemPrompt, userContent, maxTokens)
  return result.ok ? result.content : null
}

export async function ingestRawAiInput(options: AiIngestOptions): Promise<AiIngestResult> {
  const date = validateDate(options.date)
  const text = validateText(options.text, 80_000, 'text')
  if (!text.trim()) throw new Error('text is required')

  const vaultPath = options.vaultPath?.trim() || resolveVaultPath()
  if (options.replaceDate) vaultFs.clearDay(vaultPath, date)
  const originalFilePath = appendOriginalInput(vaultPath, date, text)

  if (options.mode === 'single-note') {
    const singleLineText = text.replace(/\s+/g, ' ').trim()
    const entries = [{ type: 'note', content: singleLineText }]
    const { result } = vaultFs.appendEntriesBatch(vaultPath, date, entries)
    const dailyFilePath = safeJoin(vaultPath, 'daily', `${date}.md`)

    return {
      success: true,
      date,
      vaultPath,
      dailyFilePath,
      originalFilePath,
      added: result.entries.length,
      entries,
      parser: 'heuristic',
    }
  }

  const aiParsed = await aiParseDump(text, date, callConfiguredAiProvider)
  const parsed = aiParsed && aiParsed.length > 0 ? aiParsed : heuristicParseDump(text)
  const parser = aiParsed && aiParsed.length > 0 ? 'ai' : 'heuristic'
  const entries = parsed.map(([type, content]) => ({ type, content }))
  const { result } = vaultFs.appendEntriesBatch(vaultPath, date, entries)
  const dailyFilePath = safeJoin(vaultPath, 'daily', `${date}.md`)

  return {
    success: true,
    date,
    vaultPath,
    dailyFilePath,
    originalFilePath,
    added: result.entries.length,
    entries,
    parser,
  }
}
