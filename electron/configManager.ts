import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import * as path from 'path'
import { resolveAiConfig } from './aiProvider'
import { validateText } from './ipcValidation'

const DEFAULT_VAULT_PATH = path.join(homedir(), 'OneDrive', 'Documents', 'Main', 'BuJo')
const WINDOWS_ENV_KEYS = ['BUJO_AI_KEY', 'BUJO_AI_PROVIDER', 'BUJO_AI_MODEL', 'MINIMAX_API_KEY', 'DEEPSEEK_API_KEY'] as const

function readTextSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
  } catch {
    try {
      return readFileSync(filePath, 'latin1')
    } catch {
      return ''
    }
  }
}

export function configPath(): string {
  return path.join(homedir(), '.bujo-electron', 'config.json')
}

export function readRawConfig(): any {
  const filePath = configPath()
  if (!existsSync(filePath)) return {}
  return JSON.parse(readTextSafe(filePath))
}

export function resolveVaultPath(): string {
  const envPath = process.env.BUJO_VAULT
  if (envPath) {
    if (envPath.includes('..')) throw new Error('BUJO_VAULT may not contain ..')
    return envPath
  }
  try {
    const config = readRawConfig()
    if (typeof config.vault_path === 'string' && config.vault_path.trim()) {
      return validateText(config.vault_path.trim(), 2000, 'vault_path')
    }
  } catch {
    // Fall back to the project vault if the config is unreadable.
  }
  return DEFAULT_VAULT_PATH
}

function readWindowsEnvironmentVariable(name: typeof WINDOWS_ENV_KEYS[number]): string | undefined {
  if (process.platform !== 'win32') return undefined
  try {
    const script = `[Environment]::GetEnvironmentVariable('${name}', 'User'); if (-not $?) { exit 0 }`
    const value = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 2000,
    }).trim()
    if (value) return value
  } catch { /* ignore and try machine env */ }

  try {
    const script = `[Environment]::GetEnvironmentVariable('${name}', 'Machine'); if (-not $?) { exit 0 }`
    const value = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 2000,
    }).trim()
    return value || undefined
  } catch {
    return undefined
  }
}

export function environmentWithWindowsRegistry(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const key of WINDOWS_ENV_KEYS) {
    if (!env[key]) env[key] = readWindowsEnvironmentVariable(key)
  }
  return env
}

export function getAiConfig() {
  const envConfig = resolveAiConfig(environmentWithWindowsRegistry())
  if (envConfig) return envConfig

  const filePath = configPath()
  if (existsSync(filePath)) {
    try {
      const config = JSON.parse(readTextSafe(filePath))
      if (config.api_key) {
        return resolveAiConfig({
          BUJO_AI_KEY: config.api_key,
          BUJO_AI_PROVIDER: config.provider,
          BUJO_AI_MODEL: config.model,
        })
      }
    } catch { /* ignore */ }
  }
  return null
}
