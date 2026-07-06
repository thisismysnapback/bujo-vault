import React, { useState, useEffect } from 'react';
import { Key, Database, Github, AlertTriangle, Download, Folder, CheckCircle, FolderOpen, XCircle } from 'lucide-react';
import { useVault } from '../store/VaultContext';
import { DailyLog } from '../types';
import { entrySymbol } from '../lib/entryModel';
import { getTerminalPrompt } from '../lib/utils';
import { clearAllData, loadSettings, pickVaultFolder, saveSettings } from '../services/desktop';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export function SettingsView() {
  const { logs } = useVault();
  type Provider = 'minimax' | 'deepseek';
  const defaultModelForProvider = (value: Provider) => (
    value === 'minimax' ? 'MiniMax-M3' : 'deepseek-v4-pro'
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [vaultPath, setVaultPath] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<Provider>('minimax');
  const [model, setModel] = useState('MiniMax-M3');
  const [terminalUsername, setTerminalUsername] = useState(getTerminalPrompt());
  const modelOptions = provider === 'minimax'
    ? ['MiniMax-M3']
    : ['deepseek-v4-pro', 'deepseek-v4-flash'];
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadSettings().then(result => {
      if (!result) return;
      setVaultPath(result.vaultPath);
      setApiKey(result.config.has_api_key ? result.config.api_key_preview : '');
      const nextProvider: Provider = result.config.provider === 'deepseek' ? 'deepseek' : 'minimax';
      setProvider(nextProvider);
      setModel(result.config.model || defaultModelForProvider(nextProvider));
    }).catch(() => {});
  }, []);

  const isApiKeyPlaceholder = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'from Windows environment' || trimmed.includes('\u2026')) return true;
    // Keep both the proper ellipsis and the older mojibake preview so neither gets submitted as an API key.
    return trimmed.includes('\u00e2\u20ac\u00a6');
  };
  const handleSaveConfig = async () => {
    setStatus('saving');
    try {
      const result = await saveSettings({
        ...(isApiKeyPlaceholder(apiKey) ? {} : { api_key: apiKey }),
        provider,
        model,
        vault_path: vaultPath,
        theme: 'dark',
      });
      if (!result) {
      try {
        localStorage.setItem('bujo-api-key', apiKey);
        localStorage.setItem('bujo-provider', provider);
        localStorage.setItem('bujo-model', model);
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 3000);
      } catch {
        setStatus('error');
        setErrorMsg('IPC not available. Set config at ~/.bujo-electron/config.json');
        setTimeout(() => setStatus('idle'), 5000);
      }
      return;
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Save failed');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  const handlePickVaultFolder = async () => {
    const path = await pickVaultFolder();
    if (path) {
      setVaultPath(path);
    }
  };

  const handleClearData = async () => {
    if (await clearAllData()) window.location.reload();
  };

  const handleExport = async () => {
    const zip = new JSZip();
    (Object.values(logs) as DailyLog[]).forEach(log => {
      let content = `# ${log.date}\n\n`;
      log.entries.forEach(e => {
        const symbol = entrySymbol(e);
        content += `${symbol} ${e.content}\n`;
      });
      zip.file(`${log.date}.md`, content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'bujo-vault.zip');
  };

  const handleTerminalUsernameChange = (value: string) => {
    const next = value.trim() || 'user@bujo.vault';
    setTerminalUsername(value);
    localStorage.setItem('bujo:username', next);
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-command">
          {getTerminalPrompt()} $ config
        </div>
        <h1 className="page-title">
          settings
        </h1>
        <p className="page-subtitle">
          // configuration
        </p>
      </div>

      <div className="page-scroll">

        <section className="settings-section">
          <h2 className="settings-section-title">
            <Key size={16} className="settings-icon" />
            ai configuration
          </h2>
          <div className="settings-field-group">
            <div>
              <label className="settings-label">provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  const next = e.target.value as Provider;
                  setProvider(next);
                  setModel(defaultModelForProvider(next));
                }}
                className="settings-input"
              >
                <option value="minimax">MiniMax direct</option>
                <option value="deepseek">DeepSeek global</option>
              </select>
            </div>
            <div>
              <label className="settings-label">{provider === 'minimax' ? 'minimax api key' : 'deepseek api key'}</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKey.includes('…') ? 'existing key saved - enter a new key to replace' : provider === 'minimax' ? 'MINIMAX_API_KEY or paste token plan key' : 'DEEPSEEK_API_KEY or sk-...'}
                className="settings-input"
              />
            </div>
            <div>
              <label className="settings-label">model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="settings-input"
              >
                {modelOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveConfig}
                disabled={status === 'saving'}
                className={[
                  'settings-action-btn',
                  status === 'saving' ? 'settings-action-btn-wait' : '',
                  status === 'saved' ? 'settings-action-btn-saved' : '',
                  status === 'error' ? 'settings-action-btn-error' : '',
                ].filter(Boolean).join(' ')}
              >
                {status === 'saving' ? '[saving...]' :
                 status === 'saved' ? <><CheckCircle size={14} /> [saved]</> :
                 status === 'error' ? <><XCircle size={14} /> [failed]</> :
                 '[save]'}
              </button>
              {status === 'error' && <span className="settings-error">{errorMsg}</span>}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">
            <Key size={16} className="settings-icon" />
            terminal
          </h2>
          <div>
            <label className="settings-label">terminal username</label>
            <input
              value={terminalUsername}
              onChange={(e) => handleTerminalUsernameChange(e.target.value)}
              placeholder="user@bujo.vault"
              className="settings-input"
            />
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">
            <Database size={16} className="settings-icon" />
            vault location
          </h2>
          <div className="settings-field-group">
            <p className="settings-about-text">
              where your journal files are stored. set <code className="settings-code">BUJO_VAULT</code> env var or pick a folder below.
            </p>
            <div className="flex items-center gap-2">
              <div className="settings-vault-path">
                {vaultPath || 'default: ~/bujo-vault'}
              </div>
              <button
                onClick={handlePickVaultFolder}
                className="settings-action-btn"
              >
                <FolderOpen size={14} /> [browse]
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">
            <Database size={16} className="settings-icon" />
            data
          </h2>
          <div className="settings-field-group">
            <div className="flex gap-3">
              <button onClick={handleExport} className="settings-action-btn">
                <Download size={14} /> [export]
              </button>
              {!showConfirm ? (
                <button onClick={() => setShowConfirm(true)} className="settings-action-btn-danger">
                  [clear all data]
                </button>
              ) : (
                <div className="settings-confirm">
                  <div className="settings-confirm-msg">
                    <AlertTriangle size={14} /> are you sure?
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleClearData} className="settings-action-btn-danger">
                      [delete everything]
                    </button>
                    <button onClick={() => setShowConfirm(false)} className="settings-action-btn-muted">
                      [cancel]
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-title">
            <Github size={16} className="settings-icon" />
            about
          </h2>
          <p className="settings-about-text">
            based on the original cli/tui{' '}
            <a href="https://github.com/naungmon/bujo-ai" target="_blank" rel="noreferrer" className="settings-about-link">
              bujo-ai
            </a>{' '}
            by naungmon.
          </p>
        </section>

      </div>
    </div>
  );
}
