import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { EntryType, ViewType } from '../types';
import {
  buildCommandPaletteItems,
  captureContentForCommand,
  filterCommandPaletteItems,
  getCommandPalettePlaceholder,
  parseFreeTextCapture,
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
        const capture = parseFreeTextCapture(trimmedQuery);
        onAddEntry(capture.type, capture.content);
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
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-search-row">
          <Search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getCommandPalettePlaceholder(query)}
            className="palette-input"
          />
          <span className="palette-shortcut">esc</span>
        </div>

        <div className="palette-results">
          {filtered.length === 0 ? (
            <button
              onClick={() => runCommand(undefined)}
              className={`palette-empty ${trimmedQuery ? 'cursor-pointer' : 'cursor-default'}`}
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
                  className={`palette-result ${active ? 'palette-result-active' : ''}`}
                >
                  <span>
                    <span className={`palette-result-label ${active ? 'palette-result-label-active' : ''}`}>{command.label}</span>
                    <span className="palette-result-desc">{command.description}</span>
                  </span>
                  <span className="palette-shortcut">{command.shortcut ?? command.kind}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="palette-footer">
          <span>↵ run</span>
          <span>↑↓ move</span>
          <span>type text + ↵ to add task</span>
        </div>
      </div>
    </div>
  );
}
