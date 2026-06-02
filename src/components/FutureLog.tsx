import React, { useState, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { EntryItem } from './EntryItem';
import { format, addMonths } from 'date-fns';

export function FutureLog() {
  const { logs, addFutureEntry, loadFuture } = useVault();
  const [value, setValue] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(addMonths(new Date(), 1), 'yyyy-MM'));

  useEffect(() => {
    loadFuture();
  }, [loadFuture]);

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = addMonths(new Date(), i + 1);
    return {
      key: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy').toLowerCase(),
    };
  });

  const futureLogKey = selectedMonth + '-future';
  const futureLog = logs[futureLogKey] || { date: futureLogKey, entries: [] };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      const monthLabel = months.find(m => m.key === selectedMonth)?.label || selectedMonth;
      addFutureEntry(monthLabel, value.trim());
      setValue('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '48px 32px 16px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          ryan@bujo.vault $ future
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 2px' }}>
          future log
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          // upcoming months
        </p>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 32px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
          {months.map((m) => (
            <button
              key={m.key}
              onClick={() => setSelectedMonth(m.key)}
              style={{
                background: selectedMonth === m.key ? 'transparent' : 'transparent',
                border: 'none',
                color: selectedMonth === m.key ? 'var(--gold)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px 0',
                fontSize: '13px',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
            >
              [{m.label}]
            </button>
          ))}
        </div>

        {futureLog.entries.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '12px', padding: '16px 0' }}>
            // no entries for {months.find(m => m.key === selectedMonth)?.label} yet
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
            {futureLog.entries.map((entry) => (
              <EntryItem
                key={entry.id}
                entry={entry}
                date={futureLogKey}
                isFocused={false}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '16px 32px 32px', maxWidth: '768px', width: '100%', margin: '0 auto', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <span style={{ color: 'var(--text-faint)', marginRight: '8px', fontSize: '14px' }}>&gt;</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`add a task for ${months.find(m => m.key === selectedMonth)?.label}...`}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', padding: '12px 0', fontFamily: 'inherit', fontSize: '14px' }}
          />
        </div>
      </div>
    </div>
  );
}
