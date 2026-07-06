#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'
import esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const bundledCli = join(repoRoot, '.bujo-ai-ingest-cache', 'ai-ingest-cli.mjs')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) args[key] = true
      else {
        args[key] = next
        i++
      }
    }
  }
  return args
}

function usage() {
  return `Usage:
  npm run ai:ingest -- --input C:\\path\\to\\raw-day.txt
  npm run ai:ingest -- --date YYYY-MM-DD --text "raw long string"
  npm run ai:ingest -- --date YYYY-MM-DD --single-note --input C:\\path\\to\\raw-day.txt
  npm run ai:ingest -- --date YYYY-MM-DD --replace-date --single-note --input C:\\path\\to\\raw-day.txt
  type raw-day.txt | npm run ai:ingest -- --date YYYY-MM-DD

Contract:
  Life Guide sends ONE raw text blob only. No JSON. No n/t/e decisions.
  BuJo saves the raw blob to originals/ and uses its own smart parser to decide entries.
`
}

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readStdinIfAvailable() {
  if (process.stdin.isTTY) return ''
  return readFileSync(0, 'utf8')
}

function buildBundle() {
  mkdirSync(dirname(bundledCli), { recursive: true })
  esbuild.buildSync({
    entryPoints: [join(repoRoot, 'electron', 'aiIngestCli.ts')],
    outfile: bundledCli,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['electron', 'chokidar'],
    logLevel: 'silent',
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const inputText = typeof args.input === 'string'
    ? readFileSync(args.input, 'utf8')
    : typeof args.text === 'string'
      ? args.text
      : readStdinIfAvailable()

  if (!inputText.trim()) {
    console.error(JSON.stringify({ success: false, error: 'Provide raw text via --input, --text, or stdin.' }, null, 2))
    process.exitCode = 1
    return
  }

  buildBundle()
  const mod = await import(pathToFileURL(bundledCli).href + `?t=${Date.now()}`)
  const result = await mod.runAiIngestCli({
    date: typeof args.date === 'string' ? args.date : todayLocal(),
    text: inputText,
    vaultPath: typeof args.vault === 'string' ? args.vault : undefined,
    mode: args['single-note'] === true ? 'single-note' : 'parse',
    replaceDate: args['replace-date'] === true,
  })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => {
  console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
