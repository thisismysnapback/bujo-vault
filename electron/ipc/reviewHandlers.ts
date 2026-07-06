import { ipcMain } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import * as path from 'path'
import { getAiConfig } from '../configManager'
import { validateMonthKey, validatePerspective } from '../ipcValidation'
import { PERSPECTIVES } from '../perspectives'

type AiProviderCall = (systemPrompt: string, userContent: string, maxTokens?: number) => Promise<string | null>

export interface ReviewHandlerDeps {
  getVaultPath: () => string
  readTextSafe: (filePath: string) => string
  callAiProvider: AiProviderCall
  cleanAiReport: (raw: string) => string
}

export function registerReviewHandlers(deps: ReviewHandlerDeps): void {
  ipcMain.handle('review_perspective', async (_, monthKey: string, perspective: string, force = false) => {
    const validMonthKey = validateMonthKey(monthKey)
    const validPerspective = validatePerspective(perspective)
    if (!getAiConfig()) return { error: 'No API key configured' }

    const vaultPath = deps.getVaultPath()
    const year = parseInt(validMonthKey.slice(0, 4))
    const month = parseInt(validMonthKey.slice(5, 7))
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthEntries: string[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${validMonthKey}-${String(d).padStart(2, '0')}`
      const filePath = path.join(vaultPath, 'daily', `${dateStr}.md`)
      if (existsSync(filePath)) {
        const content = deps.readTextSafe(filePath)
        if (content.trim()) {
          monthEntries.push(`### ${dateStr}\n${content}`)
        }
      }
    }

    if (monthEntries.length === 0) return { error: 'No journal entries found for this month' }

    const perspectivePath = path.join(vaultPath, 'perspectives', `${validPerspective}.md`)
    const systemPrompt = existsSync(perspectivePath)
      ? deps.readTextSafe(perspectivePath)
      : PERSPECTIVES[validPerspective] || ''

    if (!systemPrompt) return { error: `Perspective '${validPerspective}' not found` }

    const analysisDir = path.join(vaultPath, 'analysis', validPerspective)
    if (!existsSync(analysisDir)) mkdirSync(analysisDir, { recursive: true })
    const analysisPath = path.join(analysisDir, `${validMonthKey}-${validPerspective}.md`)
    if (!force && existsSync(analysisPath)) {
      return { content: deps.readTextSafe(analysisPath), cached: true }
    }

    const raw = await deps.callAiProvider(systemPrompt, `Analyze these journal entries for ${validMonthKey}.

Grounding rules:
- Do not turn a task into an event. For example, "call dentist tomorrow" is a task, not an appointment.
- Do not infer that something happened unless the entry says it happened.
- Keep planned tasks, scheduled events, and emotional notes distinct.
- Use the journal wording as evidence, but do not invent missing dates, attendees, or outcomes.

Entries:

${monthEntries.join('\n\n')}`, 4096)
    if (!raw) return { error: 'AI request failed' }
    const content = deps.cleanAiReport(raw)

    writeFileSync(analysisPath, content)
    return { content, cached: false }
  })

  ipcMain.handle('review_synthesize', async (_, monthKey: string) => {
    if (!getAiConfig()) return { error: 'No API key configured' }

    const vaultPath = deps.getVaultPath()
    const validMonthKey = validateMonthKey(monthKey)
    const perspectiveNames = ['chronicle', 'coach', 'relationships', 'strengths', 'therapist', 'values-meaning']
    const analyses: Record<string, string> = {}
    for (const perspective of perspectiveNames) {
      const analysisPath = path.join(vaultPath, 'analysis', perspective, `${validMonthKey}-${perspective}.md`)
      if (existsSync(analysisPath)) {
        analyses[perspective] = deps.readTextSafe(analysisPath)
      }
    }

    const availablePerspectives = Object.keys(analyses)
    if (availablePerspectives.length < 3) {
      return { error: 'Need at least 3 perspective analyses before synthesizing. Run individual perspectives first.' }
    }

    const synthDir = path.join(vaultPath, 'analysis', 'synthesis')
    if (!existsSync(synthDir)) mkdirSync(synthDir, { recursive: true })
    const synthPath = path.join(synthDir, `${validMonthKey}-synthesis.md`)

    const year = parseInt(validMonthKey.slice(0, 4))
    const month = parseInt(validMonthKey.slice(5, 7))
    const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
    const prevSynthPath = path.join(synthDir, `${prevMonth}-synthesis.md`)
    let prevFocus = ''
    if (existsSync(prevSynthPath)) {
      const prevContent = deps.readTextSafe(prevSynthPath)
      const focusMatch = prevContent.match(/## Focus Areas for Next Month[\s\S]*?(?=\n## |\n---|$)/)
      if (focusMatch) prevFocus = focusMatch[0]
    }

    const monthLabel = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const synthPrompt = `You are synthesizing a monthly review for ${monthLabel}. You have analysis from ${availablePerspectives.length} perspectives. Create a cohesive, themed final report.

${prevFocus ? `Previous month's focus areas to track:\n${prevFocus}\n\n` : ''}

Perspective analyses available: ${availablePerspectives.join(', ')}

Create a synthesis following this structure:

# Monthly Review: ${monthLabel}

## Executive Summary
[3-5 sentences - the month in a nutshell]
## What Happened This Month
## Emotional & Mental Landscape
## Values & Meaning
## Relationships & Connection
## Goals & Progress
## Patterns & Concerns
## Growth & Wins
${prevFocus ? `## Last Month's Focus Areas\n` : ''}
## Focus Areas for Next Month
[3 concrete, actionable focus areas]

Guidelines: Find the one-sentence story. Cross-reference patterns across perspectives. Don't concatenate - synthesize. Be honest.`

    const contextParts = []
    for (const [perspective, content] of Object.entries(analyses)) {
      contextParts.push(`--- ${perspective.toUpperCase()} PERSPECTIVE ---\n${content}`)
    }

    const raw = await deps.callAiProvider(synthPrompt, contextParts.join('\n\n'), 4096)
    if (!raw) return { error: 'AI request failed' }
    const content = deps.cleanAiReport(raw)

    writeFileSync(synthPath, content)
    return { content, cached: false }
  })

  ipcMain.handle('review_list', async (_, monthKey: string) => {
    const vaultPath = deps.getVaultPath()
    const validMonthKey = validateMonthKey(monthKey)
    const perspectives = ['chronicle', 'coach', 'relationships', 'strengths', 'therapist', 'values-meaning']
    const status: Record<string, boolean> = {}
    for (const perspective of perspectives) {
      const analysisPath = path.join(vaultPath, 'analysis', perspective, `${validMonthKey}-${perspective}.md`)
      status[perspective] = existsSync(analysisPath)
    }
    const synthPath = path.join(vaultPath, 'analysis', 'synthesis', `${validMonthKey}-synthesis.md`)
    status['synthesis'] = existsSync(synthPath)
    return status
  })

  ipcMain.handle('review_get', async (_, monthKey: string, perspective: string) => {
    const vaultPath = deps.getVaultPath()
    const validMonthKey = validateMonthKey(monthKey)
    const validPerspective = perspective === 'synthesis' ? 'synthesis' : validatePerspective(perspective)
    const analysisPath = validPerspective === 'synthesis'
      ? path.join(vaultPath, 'analysis', 'synthesis', `${validMonthKey}-synthesis.md`)
      : path.join(vaultPath, 'analysis', validPerspective, `${validMonthKey}-${validPerspective}.md`)
    if (!existsSync(analysisPath)) return { content: '', exists: false }
    return { content: deps.readTextSafe(analysisPath), exists: true }
  })
}
