import React, { useState, useEffect } from 'react';
import { Key, Database, Github, AlertTriangle, Download, Folder, CheckCircle, FolderOpen, XCircle } from 'lucide-react';
import { useVault } from '../store/VaultContext';
import { DailyLog } from '../types';
import { entrySymbol } from '../lib/entryModel';
import { clearDays, loadSettings, pickVaultFolder, saveSettings } from '../services/desktop';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export function SettingsView() {
  const { logs } = useVault();
  const [showConfirm, setShowConfirm] = useState(false);
  const [vaultPath, setVaultPath] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'minimax' | 'openrouter'>('minimax');
  const [model, setModel] = useState('MiniMax-M3');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadSettings().then(result => {
      if (!result) return;
      setVaultPath(result.vaultPath);
      setApiKey(result.config.has_api_key ? result.config.api_key_preview : '');
      setProvider((result.config.provider === 'openrouter' ? 'openrouter' : 'minimax'));
      setModel(result.config.model || (result.config.provider === 'openrouter' ? 'minimax/minimax-m2.7' : 'MiniMax-M3'));
    }).catch(() => {});
  }, []);

  const handleSaveConfig = async () => {
    setStatus('saving');
    try {
      const apiKeyToSave = apiKey.includes('…') ? '' : apiKey;
      const result = await saveSettings({ api_key: apiKeyToSave, provider, model, vault_path: vaultPath, theme: 'dark' });
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
    const dates = Object.keys(logs);
    if (await clearDays(dates)) window.location.reload();
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

  const sectionStyle: React.CSSProperties = {
    borderTop: '1px solid var(--border)',
    paddingTop: '24px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    borderBottom: '1px solid var(--border)',
    padding: '8px 0',
    fontSize: '13px',
    color: 'var(--text)',
    fontFamily: 'monospace',
    outline: 'none',
  };

  const iconStyle: React.CSSProperties = {
    color: 'var(--gold)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '48px 32px 16px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          ryan@bujo.vault $ config
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 2px' }}>
          settings
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          // configuration
        </p>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 32px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>

        <section style={sectionStyle}>
          <h2 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Key size={16} style={iconStyle} />
            ai configuration
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>provider</label>
              <select
                value={provider}
                onChange={(e) => {
                  const next = e.target.value as 'minimax' | 'openrouter';
                  setProvider(next);
                  setModel(next === 'minimax' ? 'MiniMax-M3' : 'minimax/minimax-m2.7');
                }}
                style={inputStyle}
              >
                <option value="minimax">MiniMax direct</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{provider === 'minimax' ? 'minimax api key' : 'openrouter api key'}</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKey.includes('…') ? 'existing key saved — enter a new key to replace' : provider === 'minimax' ? 'MINIMAX_API_KEY or paste token plan key' : 'sk-or-v1-...'}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider === 'minimax' ? 'MiniMax-M3' : 'minimax/minimax-m2.7'}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={handleSaveConfig}
                disabled={status === 'saving'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: status === 'saved' ? 'var(--green)' : status === 'error' ? 'var(--red)' : 'var(--gold)',
                  cursor: status === 'saving' ? 'wait' : 'pointer',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  padding: '4px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {status === 'saving' ? '[saving...]' :
                 status === 'saved' ? <><CheckCircle size={14} /> [saved]</> :
                 status === 'error' ? <><XCircle size={14} /> [failed]</> :
                 '[save]'}
              </button>
              {status === 'error' && <span style={{ fontSize: '11px', color: 'var(--red)' }}>{errorMsg}</span>}
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Database size={16} style={iconStyle} />
            vault location
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              where your journal files are stored. set <code style={{ color: 'var(--text)', background: 'var(--bg-hover)', padding: '2px 4px' }}>BUJO_VAULT</code> env var or pick a folder below.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {vaultPath || 'default: ~/bujo-vault'}
              </div>
              <button
                onClick={handlePickVaultFolder}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--gold)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  padding: '4px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FolderOpen size={14} /> [browse]
              </button>
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Database size={16} style={iconStyle} />
            data
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleExport} style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--gold)',
                cursor: 'pointer',
                fontSize: '13px',
                fontFamily: 'monospace',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <Download size={14} /> [export]
              </button>
              {!showConfirm ? (
                <button onClick={() => setShowConfirm(true)} style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--red)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  padding: '4px 0',
                }}>
                  [clear all data]
                </button>
              ) : (
                <div style={{ borderTop: '1px solid var(--red)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--red)', fontSize: '13px' }}>
                    <AlertTriangle size={14} /> are you sure?
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={handleClearData} style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--red)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      padding: '4px 0',
                    }}>
                      [delete everything]
                    </button>
                    <button onClick={() => setShowConfirm(false)} style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      padding: '4px 0',
                    }}>
                      [cancel]
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Github size={16} style={iconStyle} />
            about
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            based on the original cli/tui{' '}
            <a href="https://github.com/naungmon/bujo-ai" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
              bujo-ai
            </a>{' '}
            by naungmon.
          </p>
        </section>

      </div>
    </div>
  );
}
