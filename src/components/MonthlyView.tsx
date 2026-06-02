import React, { useState, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { EntryItem } from './EntryItem';
import { format, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function MonthlyView() {
  const { logs, addMonthlyEntry, loadMonthly } = useVault();
  const [currentDate, setCurrentDate] = useState(new Date());
  const currentMonthKey = format(currentDate, 'yyyy-MM');
  const monthLog = logs[currentMonthKey] || { date: currentMonthKey, entries: [] };
  const [value, setValue] = useState('');

  useEffect(() => {
    loadMonthly(currentDate.getFullYear(), currentDate.getMonth() + 1);
  }, [currentDate, loadMonthly]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      addMonthlyEntry(currentMonthKey, 'task', value.trim());
      setValue('');
    }
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const navBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '48px 32px 16px', maxWidth: '768px', width: '100%', margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            ryan@bujo.vault $ monthly
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 2px' }}>
            {format(currentDate, 'MMMM yyyy').toLowerCase()}
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            // monthly log
          </p>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={prevMonth} style={navBtnStyle}>
            <ChevronLeft size={20} />
          </button>
          <button onClick={nextMonth} style={navBtnStyle}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 32px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        {monthLog.entries.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '12px', padding: '16px 0' }}>
            // no entries for this month yet
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
            {monthLog.entries.map((entry) => (
              <EntryItem
                key={entry.id}
                entry={entry}
                date={currentMonthKey}
                source={{ kind: 'monthly', monthKey: currentMonthKey }}
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
            placeholder="add a monthly task..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', padding: '12px 0', fontFamily: 'inherit', fontSize: '14px' }}
          />
        </div>
      </div>
    </div>
  );
}
