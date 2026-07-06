import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'

const repoRoot = path.resolve(__dirname, '..', '..')
const ingestScript = path.join(repoRoot, 'scripts', 'bujo-ai-ingest.mjs')

describe('bujo-ai-ingest CLI', () => {
  it('accepts one raw Life Guide text blob and lets BuJo parse entries', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bujo-ai-intake-'))
    const vault = path.join(dir, 'vault')
    const inputPath = path.join(dir, 'raw-day.txt')
    writeFileSync(inputPath, [
      '11:00 — What am I avoiding right now?',
      'I am avoiding the uncomfortable first draft.',
      '',
      '13:30 — If someone filmed the last 2 hours, what would they conclude I want?',
      'They would conclude I want low-friction distraction.',
      '',
      '21:00 — When did I feel most alive? Most dead?',
      'Alive while shipping. Dead while scrolling.',
    ].join('\n'), 'utf8')

    const raw = execFileSync(process.execPath, [ingestScript, '--vault', vault, '--date', '2026-06-19', '--input', inputPath], {
      encoding: 'utf8',
      env: { ...process.env, BUJO_AI_INGEST_DISABLE_AI: '1' },
    })
    const result = JSON.parse(raw)
    expect(result.success).toBe(true)
    expect(result.date).toBe('2026-06-19')
    expect(result.added).toBeGreaterThan(0)
    expect(['ai', 'heuristic']).toContain(result.parser)

    const original = readFileSync(path.join(vault, 'originals', '2026-06-19.md'), 'utf8')
    expect(original).toContain('11:00 — What am I avoiding right now?')
    expect(original).toContain('Alive while shipping. Dead while scrolling.')

    const daily = readFileSync(path.join(vault, 'daily', '2026-06-19.md'), 'utf8')
    expect(daily).toContain('# Friday, June 19, 2026')
    expect(daily).not.toContain('[AI Intake / life-guide')
    expect(daily).toMatch(/^[tne*<] /m)
    expect(daily).toContain('uncomfortable first draft')
  })

  it('supports one-off raw text args without caller-provided entry types', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bujo-ai-intake-single-'))
    const vault = path.join(dir, 'vault')

    const raw = execFileSync(process.execPath, [
      ingestScript,
      '--vault', vault,
      '--date', '2026-06-20',
      '--text', 'When did I feel most alive? Most dead? Alive while shipping. Dead while scrolling.',
    ], {
      encoding: 'utf8',
      env: { ...process.env, BUJO_AI_INGEST_DISABLE_AI: '1' },
    })

    const result = JSON.parse(raw)
    expect(result.success).toBe(true)
    expect(result.added).toBeGreaterThan(0)
    const daily = readFileSync(path.join(vault, 'daily', '2026-06-20.md'), 'utf8')
    expect(daily).toContain('Alive while shipping')
    expect(daily).not.toContain('[AI Intake')
  })

  it('can preserve a Life Guide day as one single note entry', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bujo-ai-intake-single-note-'))
    const vault = path.join(dir, 'vault')
    const inputPath = path.join(dir, 'raw-day.txt')
    writeFileSync(inputPath, [
      'Life Guide daily input for 2026-06-20',
      '',
      'I was avoiding making video due today, but now I finished it and delivered it to the client.',
      '',
      'I felt most alive enjoying time with my wife and watching Blender courses today.',
    ].join('\n'), 'utf8')

    const raw = execFileSync(process.execPath, [ingestScript, '--vault', vault, '--date', '2026-06-20', '--single-note', '--input', inputPath], {
      encoding: 'utf8',
      env: { ...process.env, BUJO_AI_INGEST_DISABLE_AI: '1' },
    })

    const result = JSON.parse(raw)
    expect(result.success).toBe(true)
    expect(result.added).toBe(1)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe('note')
    expect(result.entries[0].content).toContain('finished it and delivered it to the client')

    const daily = readFileSync(path.join(vault, 'daily', '2026-06-20.md'), 'utf8')
    const entryLines = daily.split('\n').filter(line => /^[tne*<] /.test(line))
    expect(entryLines).toHaveLength(1)
    expect(entryLines[0]).toContain('Life Guide daily input for 2026-06-20 I was avoiding')
  })

  it('can replace an existing day with one single note entry', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bujo-ai-intake-replace-'))
    const vault = path.join(dir, 'vault')
    const firstPath = path.join(dir, 'first.txt')
    const replacementPath = path.join(dir, 'replacement.txt')
    writeFileSync(firstPath, 'First split entry. Second split entry.', 'utf8')
    writeFileSync(replacementPath, 'Replacement Life Guide day as one string paragraph.', 'utf8')

    execFileSync(process.execPath, [ingestScript, '--vault', vault, '--date', '2026-06-20', '--input', firstPath], {
      encoding: 'utf8',
      env: { ...process.env, BUJO_AI_INGEST_DISABLE_AI: '1' },
    })

    const raw = execFileSync(process.execPath, [ingestScript, '--vault', vault, '--date', '2026-06-20', '--replace-date', '--single-note', '--input', replacementPath], {
      encoding: 'utf8',
      env: { ...process.env, BUJO_AI_INGEST_DISABLE_AI: '1' },
    })

    const result = JSON.parse(raw)
    expect(result.success).toBe(true)
    expect(result.added).toBe(1)

    const daily = readFileSync(path.join(vault, 'daily', '2026-06-20.md'), 'utf8')
    expect(daily).toContain('Replacement Life Guide day as one string paragraph.')
    expect(daily).not.toContain('First split entry')
    const entryLines = daily.split('\n').filter(line => /^[tne*<] /.test(line))
    expect(entryLines).toHaveLength(1)
  })
})
