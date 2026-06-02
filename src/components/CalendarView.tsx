import React, { useState, useMemo } from 'react';
import { useVault } from '../store/VaultContext';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTodayDateString } from '../lib/utils';
import { DailyLog } from '../types';

export function CalendarView() {
  const { logs, setCurrentView } = useVault();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => {
    const result: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      result.push(day);
      day = addDays(day, 1);
    }
    return result;
  }, [calStart.getTime(), calEnd.getTime()]);

  const entryMap = useMemo(() => {
    const map: Record<string, { count: number; hasPriority: boolean; hasDone: boolean }> = {};
    for (const [date, log] of Object.entries(logs) as [string, DailyLog][]) {
      if (date.includes('-monthly') || date.includes('-future')) continue;
      map[date] = {
        count: log.entries.length,
        hasPriority: log.entries.some(e => e.meta?.priority),
        hasDone: log.entries.some(e => e.kind === 'task' && e.status === 'done'),
      };
    }
    return map;
  }, [logs]);

  const handleDayClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    (window as any).__bujoNavigateDate = dateStr;
    setCurrentView('daily');
  };

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToday = () => setCurrentMonth(new Date());

  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const navBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const todayStr = getTodayDateString();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '48px 32px 16px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          ryan@bujo.vault $ cal
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 2px' }}>
            {format(currentMonth, 'MMMM yyyy').toLowerCase()}
          </h1>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={prevMonth} style={navBtnStyle}><ChevronLeft size={18} /></button>
            <button onClick={goToday} style={{ ...navBtnStyle, padding: '6px 12px', fontSize: '12px' }}>today</button>
            <button onClick={nextMonth} style={navBtnStyle}><ChevronRight size={18} /></button>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          // {format(currentMonth, 'MMMM yyyy').toLowerCase()} overview
        </p>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 32px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
          {weekdays.map(day => (
            <div key={day} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)', padding: '8px 0', fontWeight: 500 }}>
              {day}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {days.map((day, idx) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const entry = entryMap[dateStr];
            const inMonth = isSameMonth(day, currentMonth);
            const isTodayDate = dateStr === todayStr;

            return (
              <button
                key={idx}
                onClick={() => handleDayClick(day)}
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  background: isTodayDate ? 'var(--bg-hover)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: inMonth ? 'var(--text)' : 'var(--text-faint)',
                  fontWeight: isTodayDate ? 500 : 400,
                  transition: 'background 0.1s',
                  padding: 0,
                }}
              >
                <span>{format(day, 'd')}</span>
                {entry && entry.count > 0 && (
                  <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
                    {entry.hasPriority && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--gold-bright)' }} />}
                    {entry.hasDone && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#4caf50' }} />}
                    {!entry.hasPriority && !entry.hasDone && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-faint)' }} />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', padding: '0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold-bright)' }} />
            has priorities
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4caf50' }} />
            has completed
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-faint)' }} />
            has entries
          </div>
        </div>
      </div>
    </div>
  );
}
