import { ipcMain } from 'electron'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import * as path from 'path'
import { assertTrustedSender } from '../ipcSecurity'
import { validateDate, validateSlug } from '../ipcValidation'

export interface ContextHandlerDeps {
  getVaultPath: () => string
  readTextSafe: (filePath: string) => string
}

export function registerContextHandlers(deps: ContextHandlerDeps): void {
  ipcMain.handle('templates_list', async () => {
    const templatesDir = path.join(deps.getVaultPath(), 'templates')
    if (!existsSync(templatesDir)) {
      mkdirSync(templatesDir, { recursive: true })
      writeFileSync(path.join(templatesDir, 'morning.md'), `# Morning\n\n- What are your 3 priorities today?\n- How are you feeling?\n\n`)
      writeFileSync(path.join(templatesDir, 'evening.md'), `# Evening\n\n- What did you accomplish?\n- What would you do differently?\n- What are you grateful for?\n\n`)
      writeFileSync(path.join(templatesDir, 'weekly.md'), `# Weekly Review\n\n## Wins\n\n## Challenges\n\n## Next week\n\n`)
    }
    const files = readdirSync(templatesDir).filter(f => f.endsWith('.md'))
    return files.map(f => f.replace('.md', ''))
  })

  ipcMain.handle('templates_apply', async (event, name: string, targetDate: string) => {
    assertTrustedSender(event)
    const templateName = validateSlug(name, 'template name')
    const validTargetDate = validateDate(targetDate, 'targetDate')
    const vaultPath = deps.getVaultPath()
    const templatePath = path.join(vaultPath, 'templates', `${templateName}.md`)
    if (!existsSync(templatePath)) return { error: 'Template not found' }

    const templateContent = deps.readTextSafe(templatePath)
    const targetPath = path.join(vaultPath, 'daily', `${validTargetDate}.md`)
    const existing = existsSync(targetPath) ? deps.readTextSafe(targetPath) : ''

    writeFileSync(targetPath, existing + templateContent)
    return { success: true }
  })

  ipcMain.handle('context_get', async () => {
    const contextDir = path.join(deps.getVaultPath(), 'context')
    if (!existsSync(contextDir)) mkdirSync(contextDir, { recursive: true })

    const mePath = path.join(contextDir, 'me.md')
    const evalsPath = path.join(contextDir, 'evals.md')

    return {
      me: existsSync(mePath) ? deps.readTextSafe(mePath) : '',
      evals: existsSync(evalsPath) ? deps.readTextSafe(evalsPath) : '',
    }
  })

  ipcMain.handle('context_save', async (event, section: string, content: string) => {
    assertTrustedSender(event)
    const contextDir = path.join(deps.getVaultPath(), 'context')
    if (!existsSync(contextDir)) mkdirSync(contextDir, { recursive: true })

    const mePath = path.join(contextDir, 'me.md')
    let existing = existsSync(mePath) ? deps.readTextSafe(mePath) : '# About Me\n\n'

    const header = `## ${section}`
    const regex = new RegExp(`(## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n)(.*?)(?=\\n## |\\Z)`, 's')
    if (existing.includes(header)) {
      existing = existing.replace(regex, `$1${content.trim()}\n`)
    } else {
      existing = existing.trimEnd() + `\n\n${header}\n\n${content.trim()}\n`
    }

    writeFileSync(mePath, existing)
    return { success: true }
  })

  ipcMain.handle('context_eval_save', async (event, monthLabel: string, evalText: string) => {
    assertTrustedSender(event)
    const contextDir = path.join(deps.getVaultPath(), 'context')
    if (!existsSync(contextDir)) mkdirSync(contextDir, { recursive: true })

    const evalsPath = path.join(contextDir, 'evals.md')
    let existing = existsSync(evalsPath) ? deps.readTextSafe(evalsPath) : '# Eval History\n\nMonthly pattern summaries.\n\n'
    existing = existing.trimEnd() + `\n\n## ${monthLabel}\n\n${evalText.trim()}\n`
    writeFileSync(evalsPath, existing)
    return { success: true }
  })
}
