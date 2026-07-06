import React, { useState, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { EntryItem } from './EntryItem';
import { format, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTerminalPrompt } from '../lib/utils';

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

  return (
    <div className="page-shell">
      <div className="page-header-split">
        <div>
          <div className="page-command">
            {getTerminalPrompt()} $ monthly
          </div>
          <h1 className="page-title">
            {format(currentDate, 'MMMM yyyy').toLowerCase()}
          </h1>
          <p className="page-subtitle">
            // monthly log
          </p>
        </div>
        <div className="monthly-nav">
          <button onClick={prevMonth} className="monthly-nav-btn">
            <ChevronLeft size={20} />
          </button>
          <button onClick={nextMonth} className="monthly-nav-btn">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="page-scroll">
        {monthLog.entries.length === 0 ? (
          <div className="page-empty">
            // no entries for this month yet
          </div>
        ) : (
          <div className="page-entries">
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

      <div className="page-bottom">
        <div className="page-input-row">
          <span className="page-prompt-char">&gt;</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="add a monthly task..."
            className="page-text-input"
          />
        </div>
      </div>
    </div>
  );
}
