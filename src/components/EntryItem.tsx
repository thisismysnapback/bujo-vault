import React, { useState, useRef, useEffect } from 'react';
import { Entry, EntryType } from '../types';
import { cn } from '../lib/utils';
import { useVault } from '../store/VaultContext';

interface EntryItemProps {
  key?: string;
  entry: Entry;
  date: string;
  isFocused: boolean;
}

const SYMBOLS: Record<EntryType, string> = {
  task: '·',
  done: '×',
  migrated: '>',
  killed: '~',
  note: '–',
  event: '○',
  scheduled: '<',
  priority: '★',
};

const STYLE: Record<EntryType, React.CSSProperties> = {
  task: { color: 'var(--text)' },
  done: { color: 'var(--text-muted)', textDecoration: 'line-through' },
  migrated: { color: 'var(--gold-dim)' },
  killed: { color: 'var(--text-faint)', textDecoration: 'line-through' },
  note: { color: 'var(--text-muted)' },
  event: { color: '#7dbfa5' },
  scheduled: { color: 'var(--gold)' },
  priority: { color: 'var(--gold-bright)', fontWeight: '600' },
};

export function EntryItem({ entry, date, isFocused }: EntryItemProps) {
  const { updateEntry, deleteEntry } = useVault();
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
      updateEntry(date, entry.id, { content: editValue });
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      cancelledRef.current = true;
      setEditValue(entry.content);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    if (!cancelledRef.current) {
      updateEntry(date, entry.id, { content: editValue });
    }
    cancelledRef.current = false;
    setIsEditing(false);
  };

  const toggleStatus = () => {
    if (entry.type === 'task') updateEntry(date, entry.id, { type: 'done' });
    else if (entry.type === 'done') updateEntry(date, entry.id, { type: 'task' });
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
          ...STYLE[entry.type],
        }}
      >
        {SYMBOLS[entry.type]}
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
          <span style={{ fontSize: '13px', ...STYLE[entry.type] }}>
            {entry.content}
          </span>
        )}
      </div>

      <div className="opacity-0 group-hover:opacity-100" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-faint)', transition: 'opacity 0.1s' }}>
        <button onClick={() => updateEntry(date, entry.id, { type: 'migrated' })} title="Migrate" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>&gt;</button>
        <button onClick={() => updateEntry(date, entry.id, { type: 'killed' })} title="Kill" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>~</button>
        <button onClick={() => deleteEntry(date, entry.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>×</button>
      </div>
    </div>
  );
}
