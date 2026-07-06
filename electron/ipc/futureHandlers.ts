import { ipcMain } from 'electron'
import { existsSync, writeFileSync } from 'fs'
import * as path from 'path'
import type { UndoRecord } from '../vaultFs'
import { assertTrustedSender } from '../ipcSecurity'
import { safeJoin, validateText } from '../ipcValidation'

export interface FutureHandlerDeps {
  getVaultPath: () => string
  readTextSafe: (filePath: string) => string
  pushUndo: (record: UndoRecord | undefined) => void
}

export function registerFutureHandlers(deps: FutureHandlerDeps): void {
  ipcMain.handle('vault_get_future', async () => {
    const filePath = safeJoin(deps.getVaultPath(), 'future', 'future.md')
    const result: Record<string, string[]> = {}

    if (existsSync(filePath)) {
      const content = deps.readTextSafe(filePath)
      let currentMonth = 'Unscheduled'
      result[currentMonth] = []
      for (const line of content.split('\n')) {
        if (line.startsWith('## ')) {
          currentMonth = line.slice(3).trim()
          result[currentMonth] = []
        } else if (line.startsWith('> ')) {
          result[currentMonth].push(line.slice(2).trim())
        }
      }
    }

    return result
  })

  ipcMain.handle('vault_append_future_entry', async (event, monthLabel: string, content: string) => {
    assertTrustedSender(event)
    const filePath = path.join(deps.getVaultPath(), 'future', 'future.md')

    if (!existsSync(filePath)) {
      writeFileSync(filePath, `# Future Log\n\n`)
    }

    const before = deps.readTextSafe(filePath)
    const line = `> ${content}\n`
    let updated = before

    const monthHeader = `## ${monthLabel}`
    if (!before.includes(monthHeader)) {
      updated = before.trimEnd() + `\n\n${monthHeader}\n\n${line}`
    } else {
      const idx = before.indexOf(monthHeader) + monthHeader.length
      const beforeSection = before.slice(0, idx)
      const afterSection = before.slice(idx)
      const nextNewline = afterSection.indexOf('\n\n')
      if (nextNewline !== -1) {
        updated = beforeSection + afterSection.slice(0, nextNewline) + '\n' + line.trim() + afterSection.slice(nextNewline)
      } else {
        updated = beforeSection + '\n\n' + line
      }
    }

    writeFileSync(filePath, updated)
    deps.pushUndo({ description: `added future: ${content}`, changes: [{ filePath, before, after: updated }] })

    return { success: true }
  })

  ipcMain.handle('vault_update_future_entry', async (event, monthLabel: string, oldContent: string, type: string, content: string) => {
    assertTrustedSender(event)
    const safeMonth = validateText(monthLabel, 120, 'monthLabel')
    const safeOldContent = validateText(oldContent, 20_000, 'oldContent')
    const safeContent = validateText(content, 20_000, 'content')
    const filePath = path.join(deps.getVaultPath(), 'future', 'future.md')
    if (!existsSync(filePath)) return { error: 'Future log not found' }

    const before = deps.readTextSafe(filePath)
    const symbol = type === 'done' ? 'x' : type === 'killed' ? 'k' : '>'
    const updated = replaceFutureLine(before, safeMonth, safeOldContent, `${symbol} ${safeContent}`)
    if (!updated) return { error: 'Entry not found' }

    writeFileSync(filePath, updated)
    deps.pushUndo({ description: `updated future: ${safeContent}`, changes: [{ filePath, before, after: updated }] })
    return { success: true }
  })

  ipcMain.handle('vault_delete_future_entry', async (event, monthLabel: string, content: string) => {
    assertTrustedSender(event)
    const safeMonth = validateText(monthLabel, 120, 'monthLabel')
    const safeContent = validateText(content, 20_000, 'content')
    const filePath = path.join(deps.getVaultPath(), 'future', 'future.md')
    if (!existsSync(filePath)) return { error: 'Future log not found' }

    const before = deps.readTextSafe(filePath)
    const updated = replaceFutureLine(before, safeMonth, safeContent, null)
    if (!updated) return { error: 'Entry not found' }

    writeFileSync(filePath, updated)
    deps.pushUndo({ description: `deleted future: ${safeContent}`, changes: [{ filePath, before, after: updated }] })
    return { success: true }
  })

  ipcMain.handle('future_mark_done', async (event, text: string) => {
    assertTrustedSender(event)
    const futurePath = path.join(deps.getVaultPath(), 'future', 'future.md')
    if (!existsSync(futurePath)) return { error: 'Future log not found' }

    const content = deps.readTextSafe(futurePath)
    const oldLine = `> ${text}`
    const newLine = `x ${text}`
    if (!content.includes(oldLine)) return { error: 'Entry not found' }

    writeFileSync(futurePath, content.replace(oldLine, newLine))
    return { success: true }
  })
}

function replaceFutureLine(content: string, monthLabel: string, oldContent: string, replacement: string | null): string | null {
  const lines = content.split('\n')
  let inSection = false
  let found = false
  const nextLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      inSection = line.slice(3).trim() === monthLabel
      nextLines.push(line)
      continue
    }

    const isMatch = inSection && /^([>xk])\s+/.test(line) && line.slice(2).trim() === oldContent
    if (isMatch) {
      found = true
      if (replacement) nextLines.push(replacement)
      continue
    }

    nextLines.push(line)
  }

  return found ? nextLines.join('\n') : null
}
