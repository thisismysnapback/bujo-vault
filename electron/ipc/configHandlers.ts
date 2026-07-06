import { dialog, ipcMain } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import * as path from 'path'
import { resolveAiConfig } from '../aiProvider'
import { configPath, environmentWithWindowsRegistry, readRawConfig } from '../configManager'
import { assertTrustedSender } from '../ipcSecurity'
import { validateText } from '../ipcValidation'

export interface ConfigHandlerDeps {
  getVaultPath: () => string
  setVaultPath: (vaultPath: string) => void
  closeWatcher: () => Promise<void>
  ensureVaultDirs: (vaultPath: string) => void
}

function publicConfig(config: any, vaultPath: string, error?: string) {
  const apiKey = typeof config.api_key === 'string' ? config.api_key : ''
  const envConfig = resolveAiConfig(environmentWithWindowsRegistry())
  const provider = config.provider === 'minimax' || config.provider === 'deepseek'
    ? config.provider
    : (envConfig?.provider === 'deepseek' ? 'deepseek' : 'minimax')
  return {
    has_api_key: apiKey.length > 0 || Boolean(envConfig?.apiKey),
    api_key_preview: apiKey ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : (envConfig?.apiKey ? 'from Windows environment' : ''),
    provider,
    model: typeof config.model === 'string' ? config.model : (envConfig?.model || (provider === 'deepseek' ? 'deepseek-v4-pro' : 'MiniMax-M3')),
    vault_path: typeof config.vault_path === 'string' && config.vault_path.trim() ? config.vault_path : vaultPath,
    theme: typeof config.theme === 'string' ? config.theme : 'dark',
    ...(error ? { error } : {}),
  }
}

export function registerConfigHandlers(deps: ConfigHandlerDeps): void {
  ipcMain.handle('config_get', async () => {
    try {
      return publicConfig(readRawConfig(), deps.getVaultPath())
    } catch {
      return publicConfig({}, deps.getVaultPath(), 'config unreadable')
    }
  })

  ipcMain.handle('config_save', async (event, config: any) => {
    assertTrustedSender(event)
    const filePath = configPath()
    const configDir = path.dirname(filePath)
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    let existing: any = {}
    try { existing = readRawConfig() } catch { existing = {} }
    const currentVaultPath = deps.getVaultPath()
    const nextVaultPath = typeof config?.vault_path === 'string' && config.vault_path.trim()
      ? validateText(config.vault_path.trim(), 2000, 'vault_path')
      : currentVaultPath
    const next = {
      ...existing,
      provider: config?.provider === 'deepseek' ? 'deepseek' : 'minimax',
      model: validateText(config?.model || (config?.provider === 'deepseek' ? 'deepseek-v4-pro' : 'MiniMax-M3'), 200, 'model'),
      vault_path: nextVaultPath,
      theme: validateText(config?.theme || 'dark', 50, 'theme'),
    }
    if (config?.clear_api_key) {
      delete next.api_key
    } else if (typeof config?.api_key === 'string' && config.api_key.trim()) {
      next.api_key = validateText(config.api_key.trim(), 10_000, 'api_key')
    }
    writeFileSync(filePath, JSON.stringify(next, null, 2))
    if (nextVaultPath !== currentVaultPath) {
      await deps.closeWatcher()
      deps.setVaultPath(nextVaultPath)
      deps.ensureVaultDirs(nextVaultPath)
    }
    return { success: true }
  })

  ipcMain.handle('vault_pick_folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Vault Folder',
      defaultPath: deps.getVaultPath(),
    })
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    return { path: result.filePaths[0] }
  })
}
