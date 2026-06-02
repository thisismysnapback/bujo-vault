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

function entryStyle(entry: Entry): React.CSSProperties {
  if (entry.kind === 'note') return { color: 'var(--text-muted)' };
  if (entry.kind === 'event') return { color: '#7dbfa5' };
  if (entry.status === 'done') return { color: 'var(--text-muted)', textDecoration: 'line-through' };
  if (entry.status === 'migrated') return { color: 'var(--gold-dim)' };
  if (entry.status === 'killed') return { color: 'var(--text-faint)', textDecoration: 'line-through' };
  if (entry.meta?.priority) return { color: 'var(--gold-bright)', fontWeight: '600' };
  if (entry.meta?.scheduledFor) return { color: 'var(--gold)' };
  return { color: 'var(--text)' };
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
      onDoubleClick={() => setIsEditing(true)}
      className="group"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '4px 6px',
        borderRadius: '3px',
        cursor: 'grab',
        background: isFocused ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span
        onClick={toggleStatus}
        style={{
          width: '16px',
          textAlign: 'center',
          fontSize: '13px',
          flexShrink: 0,
          cursor: 'pointer',
          userSelect: 'none',
          ...entryStyle(entry),
        }}
      >
        {entrySymbol(entry)}
      </span>

      <div style={{ flex: 1 }}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <span style={{ fontSize: '13px', ...entryStyle(entry) }}>
            {entry.content}
          </span>
        )}
      </div>

      <div className="opacity-0 group-hover:opacity-100" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-faint)', transition: 'opacity 0.1s' }}>
        <button onClick={() => updateEntrySource(entrySource, entry.id, { type: 'migrated' })} title="Migrate" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>&gt;</button>
        <button onClick={() => updateEntrySource(entrySource, entry.id, { type: 'killed' })} title="Kill" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>~</button>
        <button onClick={() => deleteEntrySource(entrySource, entry.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>×</button>
      </div>
    </div>
  );
}
