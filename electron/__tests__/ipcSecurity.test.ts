import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { isTrustedSenderUrl } from '../../electron/ipcSecurity'

const __dirname = dirname(fileURLToPath(import.meta.url))
const electronDir = resolve(__dirname, '..')
const sources = [
  readFileSync(resolve(electronDir, 'main.ts'), 'utf8'),
  ...readdirSync(resolve(electronDir, 'ipc'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => readFileSync(join(electronDir, 'ipc', entry.name), 'utf8')),
]

function handlerBody(channel: string): string {
  const marker = `ipcMain.handle('${channel}'`
  const source = sources.find(candidate => candidate.includes(marker))
  expect(source, `${channel} handler should exist`).toBeTruthy()

  const start = source!.indexOf(marker)
  expect(start, `${channel} handler should exist`).toBeGreaterThanOrEqual(0)

  const bodyStart = source!.indexOf('{', start)
  expect(bodyStart, `${channel} handler should have a body`).toBeGreaterThanOrEqual(0)

  let depth = 0
  for (let i = bodyStart; i < source!.length; i++) {
    const char = source![i]
    if (char === '{') depth++
    if (char === '}') depth--
    if (depth === 0) return source!.slice(bodyStart + 1, i)
  }

  throw new Error(`could not parse ${channel} handler`)
}

function firstExecutableLine(body: string): string {
  return body
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !line.startsWith('//')) || ''
}

describe('ipcSecurity', () => {
  it('allows only dev server origins in development', () => {
    expect(isTrustedSenderUrl('http://localhost:5173/src/App.tsx', 'development')).toBe(true)
    expect(isTrustedSenderUrl('http://127.0.0.1:5173/', 'development')).toBe(true)
    expect(isTrustedSenderUrl('http://evil.test:5173/', 'development')).toBe(false)
  })

  it('allows built app file URL in production', () => {
    expect(isTrustedSenderUrl('file:///C:/app/dist/index.html', 'production')).toBe(true)
    expect(isTrustedSenderUrl('file:///C:/app/other.html', 'production')).toBe(false)
    expect(isTrustedSenderUrl('http://localhost:5173/', 'production')).toBe(false)
  })

  it('guards mutating IPC handlers before any handler logic runs', () => {
    const mutatingChannels = [
      'vault_append_future_entry',
      'vault_update_future_entry',
      'vault_delete_future_entry',
      'templates_apply',
      'dump_retry',
      'context_save',
      'context_eval_save',
      'future_mark_done',
      'habits_create',
      'habits_update',
      'habits_delete',
      'habits_toggle',
    ]

    for (const channel of mutatingChannels) {
      expect(firstExecutableLine(handlerBody(channel)), channel).toBe('assertTrustedSender(event)')
    }
  })

  it('validates template names before building template file paths', () => {
    const body = handlerBody('templates_apply')
    const slugValidation = body.indexOf("validateSlug(name, 'template name')")
    const templatePath = body.indexOf('const templatePath =')

    expect(slugValidation).toBeGreaterThanOrEqual(0)
    expect(templatePath).toBeGreaterThan(slugValidation)
  })
})
