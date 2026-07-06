import React, { useState, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { EntryItem } from './EntryItem';
import { format, addMonths } from 'date-fns';
import { getTerminalPrompt } from '../lib/utils';

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
    <div className="page-shell">
      <div className="page-header">
        <div className="page-command">
          {getTerminalPrompt()} $ future
        </div>
        <h1 className="page-title">
          future log
        </h1>
        <p className="page-subtitle">
          // upcoming months
        </p>
      </div>

      <div className="page-scroll">
        <div className="future-month-tabs">
          {months.map((m) => (
            <button
              key={m.key}
              onClick={() => setSelectedMonth(m.key)}
              className={`future-month-btn ${selectedMonth === m.key ? 'future-month-btn-active' : 'future-month-btn-inactive'}`}
            >
              [{m.label}]
            </button>
          ))}
        </div>

        {futureLog.entries.length === 0 ? (
          <div className="page-empty">
            // no entries for {months.find(m => m.key === selectedMonth)?.label} yet
          </div>
        ) : (
          <div className="page-entries">
            {futureLog.entries.map((entry) => (
              <EntryItem
                key={entry.id}
                entry={entry}
                date={futureLogKey}
                source={{ kind: 'future', monthLabel: months.find(m => m.key === selectedMonth)?.label || selectedMonth }}
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
            placeholder={`add a task for ${months.find(m => m.key === selectedMonth)?.label}...`}
            className="page-text-input"
          />
        </div>
      </div>
    </div>
  );
}
