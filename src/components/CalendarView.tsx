import { useState, useMemo } from 'react';
import { useVault } from '../store/VaultContext';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTerminalPrompt, getTodayDateString } from '../lib/utils';
import { DailyLog } from '../types';

export function CalendarView() {
  const { logs, navigateToDate } = useVault();
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
    navigateToDate(dateStr);
  };

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToday = () => setCurrentMonth(new Date());

  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const todayStr = getTodayDateString();

  return (
    <div className="calendar-shell">
      <div className="calendar-header">
        <div className="calendar-command">
          {getTerminalPrompt()} $ cal
        </div>
        <div className="calendar-title-row">
          <h1 className="calendar-title">
            {format(currentMonth, 'MMMM yyyy').toLowerCase()}
          </h1>
          <div className="calendar-nav">
            <button onClick={prevMonth} className="calendar-nav-button"><ChevronLeft size={18} /></button>
            <button onClick={goToday} className="calendar-nav-button calendar-today-button">today</button>
            <button onClick={nextMonth} className="calendar-nav-button"><ChevronRight size={18} /></button>
          </div>
        </div>
        <p className="calendar-subtitle">
          // {format(currentMonth, 'MMMM yyyy').toLowerCase()} overview
        </p>
      </div>

      <div className="calendar-scroll">
        <div className="calendar-weekdays">
          {weekdays.map(day => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
        </div>

        <div className="calendar-grid">
          {days.map((day, idx) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const entry = entryMap[dateStr];
            const inMonth = isSameMonth(day, currentMonth);
            const isTodayDate = dateStr === todayStr;

            return (
              <button
                key={idx}
                onClick={() => handleDayClick(day)}
                className={[
                  'calendar-day',
                  !inMonth ? 'calendar-day-outside' : '',
                  isTodayDate ? 'calendar-day-today' : '',
                ].filter(Boolean).join(' ')}
              >
                <span>{format(day, 'd')}</span>
                {entry && entry.count > 0 && (
                  <div className="calendar-dots">
                    {entry.hasPriority && <span className="calendar-dot calendar-dot-priority" />}
                    {entry.hasDone && <span className="calendar-dot calendar-dot-done" />}
                    {!entry.hasPriority && !entry.hasDone && <span className="calendar-dot calendar-dot-entry" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="calendar-legend">
          <div className="calendar-legend-item">
            <span className="calendar-legend-dot calendar-dot-priority" />
            has priorities
          </div>
          <div className="calendar-legend-item">
            <span className="calendar-legend-dot calendar-dot-done" />
            has completed
          </div>
          <div className="calendar-legend-item">
            <span className="calendar-legend-dot calendar-dot-entry" />
            has entries
          </div>
        </div>
      </div>
    </div>
  );
}
