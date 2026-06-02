import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { EntryType, ViewType } from '../types';
import {
  buildCommandPaletteItems,
  captureContentForCommand,
  filterCommandPaletteItems,
  getCommandPalettePlaceholder,
  type CommandPaletteItem,
} from '../lib/commandPalette';
import { getTodayDateString } from '../lib/utils';

interface CommandPaletteProps {
  currentView: ViewType;
  hasEntriesToday: boolean;
  onClose: () => void;
  onNavigate: (view: ViewType) => void;
  onAddEntry: (type: EntryType, content: string) => void;
  onClearToday: () => void;
  onUndo: () => void;
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  zIndex: 50,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '12vh',
};

const panelStyle: React.CSSProperties = {
  width: 'min(640px, calc(100vw - 32px))',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
};

export function CommandPalette({
  currentView,
  hasEntriesToday,
  onClose,
  onNavigate,
  onAddEntry,
  onClearToday,
  onUndo,
}: CommandPaletteProps) {
  const today = getTodayDateString();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(
    () => buildCommandPaletteItems({ currentView, today, hasEntriesToday }),
    [currentView, hasEntriesToday, today]
  );
  const filtered = useMemo(() => filterCommandPaletteItems(commands, query), [commands, query]);
  const selected = filtered[selectedIndex];
  const trimmedQuery = query.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const runCommand = (command?: CommandPaletteItem) => {
    if (!command) {
      if (trimmedQuery) {
        onAddEntry('task', trimmedQuery);
        onClose();
      }
      return;
    }

    if (command.kind === 'navigation' && command.view) {
      onNavigate(command.view);
      onClose();
      return;
    }

    if (command.kind === 'capture') {
      const content = captureContentForCommand(command, trimmedQuery);
      if (content) {
        onAddEntry(command.entryType ?? 'task', content);
      } else {
        onNavigate('daily');
      }
      onClose();
      return;
    }

    if (command.id === 'action:undo') {
      onUndo();
      onClose();
      return;
    }

    if (command.id === 'action:clear-today') {
      onClearToday();
      onClose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(index => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(index => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(selected);
    }
  };

  return (
    <div style={backdropStyle} onMouseDown={onClose}>
      <div style={panelStyle} onMouseDown={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)', padding: '14px 16px' }}>
          <Search size={16} style={{ color: 'var(--text-faint)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getCommandPalettePlaceholder(query)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
          />
          <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>esc</span>
        </div>

        <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <button
              onClick={() => runCommand(undefined)}
              style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-muted)', textAlign: 'left', padding: '12px', fontFamily: 'inherit', cursor: trimmedQuery ? 'pointer' : 'default' }}
            >
              {trimmedQuery ? `add task: ${trimmedQuery}` : '// no commands found'}
            </button>
          ) : (
            filtered.map((command, index) => {
              const active = index === selectedIndex;
              return (
                <button
                  key={command.id}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => runCommand(command)}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '12px',
                    alignItems: 'center',
                    background: active ? 'rgba(212, 175, 55, 0.10)' : 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span>
                    <span style={{ display: 'block', fontSize: '13px', color: active ? 'var(--gold)' : 'var(--text)' }}>{command.label}</span>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>{command.description}</span>
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{command.shortcut ?? command.kind}</span>
                </button>
              );
            })
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', fontSize: '11px', color: 'var(--text-faint)', display: 'flex', gap: '16px' }}>
          <span>↵ run</span>
          <span>↑↓ move</span>
          <span>type text + ↵ to add task</span>
        </div>
      </div>
    </div>
  );
}
