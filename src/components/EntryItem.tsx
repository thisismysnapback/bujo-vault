import React, { useState, useRef, useEffect } from 'react';
import { Entry } from '../types';
import { entrySymbol } from '../lib/entryModel';
import { EntrySource, useVault } from '../store/VaultContext';

interface EntryItemProps {
  key?: string;
  entry: Entry;
  date: string;
  source?: EntrySource;
  isFocused: boolean;
}

function entryClass(entry: Entry): string {
  if (entry.kind === 'note') return 'entry-note';
  if (entry.kind === 'event') return 'entry-event';
  if (entry.status === 'done') return 'entry-done';
  if (entry.status === 'migrated') return 'entry-migrated';
  if (entry.status === 'killed') return 'entry-killed';
  if (entry.meta?.priority) return 'entry-priority';
  if (entry.meta?.scheduledFor) return 'entry-scheduled';
  return 'entry-normal';
}

export function EntryItem({ entry, date, source, isFocused }: EntryItemProps) {
  const { updateEntrySource, deleteEntrySource } = useVault();
  const entrySource = source ?? { kind: 'daily' as const, date };
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.content);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      updateEntrySource(entrySource, entry.id, { content: editValue });
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      cancelledRef.current = true;
      setEditValue(entry.content);
      setIsEditing(false);
    }
  };

  const startEditing = () => {
    setEditValue(entry.content);
    setIsEditing(true);
  };

  const handleBlur = () => {
    if (!cancelledRef.current) {
      updateEntrySource(entrySource, entry.id, { content: editValue });
    }
    cancelledRef.current = false;
    setIsEditing(false);
  };

  const toggleStatus = () => {
    if (entry.kind === 'task' && entry.status === 'active') updateEntrySource(entrySource, entry.id, { type: 'done' });
    else if (entry.kind === 'task' && entry.status === 'done') updateEntrySource(entrySource, entry.id, { type: 'task' });
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ id: entry.id, date }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDoubleClick={startEditing}
      className={`entry-row ${isFocused ? 'entry-row-focused' : ''}`}
    >
      <span
        onClick={toggleStatus}
        className={`entry-symbol ${entryClass(entry)}`}
      >
        {entrySymbol(entry)}
      </span>

      <div className="entry-content">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="entry-edit-input"
          />
        ) : (
          <span className={`entry-text ${entryClass(entry)}`}>
            {entry.content}
          </span>
        )}
      </div>

      <div className="entry-actions">
        <button onClick={startEditing} title="Edit" className="entry-action-button">e</button>
        <button onClick={() => updateEntrySource(entrySource, entry.id, { type: 'migrated' })} title="Migrate" className="entry-action-button">&gt;</button>
        <button onClick={() => updateEntrySource(entrySource, entry.id, { type: 'killed' })} title="Kill" className="entry-action-button">~</button>
        <button onClick={() => deleteEntrySource(entrySource, entry.id)} title="Delete" className="entry-action-button">×</button>
      </div>
    </div>
  );
}
