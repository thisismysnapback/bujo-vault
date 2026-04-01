import React, { useState, useRef, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { EntryType } from '../types';
import { parseDump } from '../services/ai';
import { Sparkles, Loader2, Command, RotateCcw } from 'lucide-react';

interface InputBarProps {
  date: string;
}

const PREFIX_MAP: Record<string, EntryType> = {
  't ': 'task',
  'task ': 'task',
  'n ': 'note',
  'note ': 'note',
  'e ': 'event',
  'event ': 'event',
  '* ': 'priority',
  'p ': 'priority',
  'priority ': 'priority',
  'x ': 'done',
  'done ': 'done',
  'k ': 'killed',
  'kill ': 'killed',
  '> ': 'migrated',
  '< ': 'scheduled',
};

export function InputBar({ date }: InputBarProps) {
  const { addEntry, addMultipleEntries } = useVault();
  const [value, setValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleDump = async (text: string) => {
    setIsProcessing(true);
    setError('');
    try {
      const parsed = await parseDump(text);
      if (parsed && parsed.length > 0) {
        addMultipleEntries(date, parsed);
      } else {
        addEntry(date, 'note', text);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to parse dump. Check your API key in Settings.");
    } finally {
      setIsProcessing(false);
      setValue('');
    }
  };

  const handleRetry = async () => {
    if (!window.bujo) return;
    setIsProcessing(true);
    setError('');
    try {
      const result = await window.bujo.dumpRetry();
      if (result.error) {
        setError(result.error);
      } else if (result.message) {
        setError(result.message);
      } else if (result.count && result.count > 0) {
        setRetryCount(result.count);
        setTimeout(() => setRetryCount(null), 3000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      const text = value.trim();
      
      let isDump = text.toLowerCase().startsWith('dump ');
      let dumpText = isDump ? text.substring(5).trim() : text;
      
      if (!isDump) {
        let hasPrefix = false;
        for (const prefix of Object.keys(PREFIX_MAP)) {
          if (text.toLowerCase().startsWith(prefix)) {
            hasPrefix = true;
            break;
          }
        }
        
        // Auto-detect brain dump: no prefix, > 60 chars, and contains multiple clauses/sentences
        if (!hasPrefix && text.length > 60 && (text.split(',').length > 2 || text.split('.').length > 1 || text.split(' and ').length > 1)) {
          isDump = true;
        }
      }

      if (isDump) {
        handleDump(dumpText);
        return;
      }

      // Check for prefixes
      let type: EntryType = 'task';
      let content = text;

      for (const [prefix, mappedType] of Object.entries(PREFIX_MAP)) {
        if (text.toLowerCase().startsWith(prefix)) {
          type = mappedType;
          content = text.substring(prefix.length).trim();
          break;
        }
      }

      // Check for suffix priority
      if (content.endsWith('!')) {
        type = 'priority';
        content = content.slice(0, -1).trim();
      } else if (content.toLowerCase().endsWith(' important')) {
        type = 'priority';
        content = content.slice(0, -10).trim();
      } else if (content.toLowerCase().endsWith(' urgent')) {
        type = 'priority';
        content = content.slice(0, -7).trim();
      }

      addEntry(date, type, content);
      setValue('');
      setError('');
    }
  };

  const isDumpMode = value.toLowerCase().startsWith('dump ') || (value.length > 60 && !Object.keys(PREFIX_MAP).some(p => value.toLowerCase().startsWith(p)));

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '12px', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--gold)', flexShrink: 0 }}>›</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          placeholder="type entry or dump a brain dump..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: '13px',
            fontFamily: 'inherit',
            opacity: isProcessing ? 0.5 : 1,
          }}
        />
        {isProcessing && <Loader2 size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
        {isDumpMode && !isProcessing && <Sparkles size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
        <button
          onClick={handleRetry}
          disabled={isProcessing}
          title="Retry unprocessed dumps"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', flexShrink: 0, padding: 0 }}
        >
          <RotateCcw size={11} />
        </button>
      </div>
      {error && <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '6px' }}>{error}</div>}
      {retryCount !== null && <div style={{ fontSize: '11px', color: '#4caf50', marginTop: '6px' }}>re-parsed {retryCount} entries.</div>}
    </div>
  );
}
