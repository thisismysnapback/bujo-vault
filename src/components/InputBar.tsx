import React, { useState, useRef, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { EntryType } from '../types';
import { parseDump } from '../services/ai';
import { retryDump, saveOriginalInput } from '../services/desktop';
import { Sparkles, Loader2, RotateCcw } from 'lucide-react';

interface InputBarProps {
  date: string;
  prefill?: string;
  onPrefillConsumed?: () => void;
  onEntrySaved?: () => void;
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

export function InputBar({ date, prefill, onPrefillConsumed, onEntrySaved }: InputBarProps) {
  const { addEntry, addMultipleEntries } = useVault();
  const draftKey = `bujo:draft:${date}`;
  const [value, setValue] = useState(() => {
    try {
      return window.localStorage.getItem(draftKey) || '';
    } catch {
      return '';
    }
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearDraft = () => {
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    try {
      if (value.trim()) window.localStorage.setItem(draftKey, value);
      else window.localStorage.removeItem(draftKey);
    } catch { /* ignore */ }
  }, [draftKey, value]);

  useEffect(() => {
    if (prefill && prefill.trim()) {
      setValue(prefill);
      inputRef.current?.focus();
      onPrefillConsumed?.();
    }
  }, [prefill, onPrefillConsumed]);

  const handleDump = async (text: string) => {
    setIsProcessing(true);
    setError('');
    try {
      const parsed = await parseDump(text, date);
      if (parsed && parsed.length > 0) {
        await saveOriginalInput(date, text);
        await addMultipleEntries(date, parsed);
      } else {
        await saveOriginalInput(date, text);
        await addEntry(date, 'note', text);
      }
      setValue('');
      clearDraft();
      onEntrySaved?.();
    } catch (err) {
      console.error(err);
      setError("Failed to parse dump — kept your draft. Check your API key or press Enter again to save it as a note.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = async () => {
    setIsProcessing(true);
    setError('');
    try {
      const result = await retryDump();
      if (!result) return;
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
      
      const lowerText = text.toLowerCase();
      const isDump = lowerText.startsWith('dump:') || lowerText.startsWith('brain:') || lowerText.startsWith('parse:');
      const dumpText = isDump ? text.slice(text.indexOf(':') + 1).trim() : text;
      
      if (!isDump) {
        // Brain dump parsing is intentionally explicit. Long ordinary tasks should never be split by surprise.
      } else if (dumpText) {
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

      try {
        await addEntry(date, type, content);
        setValue('');
        clearDraft();
        setError('');
        onEntrySaved?.();
      } catch (err) {
        console.error(err);
        setError('Failed to save entry — kept your draft.');
      }
    }
  };

  const lowerValue = value.toLowerCase();
  const isDumpMode = lowerValue.startsWith('dump:') || lowerValue.startsWith('brain:') || lowerValue.startsWith('parse:');

  return (
    <div className="input-bar">
      <div className="input-bar-row">
        <span className="input-bar-prompt">›</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          placeholder="type entry or dump a brain dump..."
          className={`input-bar-field ${isProcessing ? 'input-bar-disabled' : ''}`}
        />
        {isProcessing && <Loader2 size={12} className="input-bar-icon terminal-muted spin" />}
        {isDumpMode && !isProcessing && <Sparkles size={12} className="input-bar-icon text-gold" />}
        <button
          onClick={handleRetry}
          disabled={isProcessing}
          title="Retry unprocessed dumps"
          className="input-bar-retry"
        >
          <RotateCcw size={11} />
        </button>
      </div>
      {error && <div className="input-bar-error">{error}</div>}
      {retryCount !== null && <div className="input-bar-success">re-parsed {retryCount} entries.</div>}
    </div>
  );
}
