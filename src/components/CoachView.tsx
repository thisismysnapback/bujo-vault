import React, { useEffect, useState } from 'react';
import { getCoachData } from '../services/desktop';
import { MonthlyReviewTab } from './ReviewView';
import { getTerminalPrompt } from '../lib/utils';

interface CoachData {
  period: string; streak: number; momentum: string; completionRate: number;
  priorityAlignment: number; totalEntries: number; taskEntries?: number;
  progressEntries: number;
  stuckTasks: Array<{ text: string; count: number }>;
  killThemes: Record<string, number>;
  eventDensity: Record<string, { days: number; completionRate: number }>;
  noteHeavyDays: string[]; nudge: string; empty: boolean;
  productiveTime: string; tasksPerDayAvg: number;
}

interface CoachViewProps {
  onClose: () => void;
}

export function CoachView({ onClose }: CoachViewProps) {
  const [tab, setTab] = useState<'insights' | 'review'>('insights');
  const [data, setData] = useState<CoachData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getCoachData().then(d => {
      if (d) {
        setData(d);
      } else {
        setError('IPC not available');
      }
      setLoading(false);
    }).catch((err) => {
      setError(err.message || 'Failed to load');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const momentumClass = {
    building: 'coach-momentum-good',
    steady: 'coach-momentum-mid',
    stalling: 'coach-momentum-mid',
    stalled: 'coach-momentum-low',
    new: 'coach-faint',
  }[data?.momentum || ''] || 'coach-faint';

  const renderBody = () => {
    if (tab === 'review') return <MonthlyReviewTab />;

    if (loading) return (
      <div className="coach-center">
      <p className="coach-copy">// analyzing...</p>
      </div>
    );

    if (error) return (
      <div className="coach-center">
      <div className="coach-center-card">
        <p className="coach-title">not ready yet</p>
        <p className="coach-copy">
          {error === 'IPC not available'
            ? 'open this app from the electron window, not a browser.'
            : 'start capturing entries. you need at least 3 today to unlock coaching.'}
        </p>
      </div>
      </div>
    );

    if (!data) return (
      <div className="coach-center">
      <p className="coach-copy">// no data available</p>
      </div>
    );

    if (data.empty) return (
      <div className="coach-center">
      <div className="coach-center-card">
        <p className="coach-title">
          {data.totalEntries === 0 ? "nothing captured yet." :
           data.totalEntries === 1 ? "one entry. keep going." :
           `${data.totalEntries} entries. you're warming up.`}
        </p>
        <p className="coach-copy">
          {data.totalEntries === 0 ? 'log a few real notes first; coaching will stay evidence-based.' :
           data.streak >= 3 ? `${data.streak} day streak. coaching unlocks with a little more material.` :
           "capture 3+ entries to unlock coaching."}
        </p>
      </div>
      </div>
    );

    const hasTaskPatterns = (data.taskEntries ?? 0) > 0;
    const hasProgress = data.progressEntries > 0;
    const showTaskMetrics = hasTaskPatterns && !hasProgress;
    const productiveValue = data.productiveTime === 'not enough data'
      ? 'not enough'
      : data.productiveTime.split(' ')[0];

    return (
      <div className="view-shell">
      <div className="coach-header">
        <div className="coach-command">
          {getTerminalPrompt()} $ coach
        </div>
        <h1 className="coach-heading">
          coach
        </h1>
        <p className="coach-period">
          // {data.period}
        </p>
      </div>

      <div className="coach-scroll">
        <div className="coach-summary">
          <span className={`coach-momentum ${momentumClass}`}>{data.momentum}</span>
          {showTaskMetrics ? (
            <>
              <span className="coach-summary-muted">{Math.round(data.completionRate * 100)}% completion</span>
              <span className="coach-summary-muted">{Math.round(data.priorityAlignment * 100)}% priority aligned</span>
            </>
          ) : hasProgress ? (
            <>
              <span className="coach-summary-muted">{data.progressEntries} progress {data.progressEntries === 1 ? 'item' : 'items'}</span>
              <span className="coach-summary-muted">{data.totalEntries} journal {data.totalEntries === 1 ? 'entry' : 'entries'}</span>
            </>
          ) : (
            <span className="coach-summary-muted">{data.totalEntries} journal {data.totalEntries === 1 ? 'entry' : 'entries'}</span>
          )}
          {data.streak >= 3 && <span className="coach-summary-muted">{data.streak}d streak</span>}
        </div>

        <div className="coach-metrics">
          {showTaskMetrics ? (
            <>
              <MetricCard label="completion" value={`${Math.round(data.completionRate * 100)}%`} />
              <MetricCard label="priority aligned" value={`${Math.round(data.priorityAlignment * 100)}%`} />
              <MetricCard label="tasks/day" value={data.tasksPerDayAvg.toString()} />
              <MetricCard label="productive" value={productiveValue} />
            </>
          ) : hasProgress ? (
            <>
              <MetricCard label="progress" value={data.progressEntries.toString()} />
              <MetricCard label="journal entries" value={data.totalEntries.toString()} />
              <MetricCard label="open loops" value={(data.taskEntries ?? 0).toString()} />
              <MetricCard label="streak" value={`${data.streak}d`} />
            </>
          ) : (
            <>
              <MetricCard label="journal entries" value={data.totalEntries.toString()} />
              <MetricCard label="task patterns" value="not enough" />
              <MetricCard label="productive" value={productiveValue} />
              <MetricCard label="streak" value={`${data.streak}d`} />
            </>
          )}
        </div>

        {data.stuckTasks.length > 0 && (
          <Section title="stuck tasks (migrated 3+ times)">
            {data.stuckTasks.map((t, i) => (
              <div key={i} className="coach-stuck-row">
                <span className="coach-faint">&gt;</span>
                {t.text}
                <span className="coach-tiny-faint">({t.count}x)</span>
              </div>
            ))}
          </Section>
        )}

        {Object.keys(data.killThemes).length > 0 && (
          <Section title="kill patterns">
            <div className="coach-tag-list">
              {Object.entries(data.killThemes).slice(0, 5).map(([theme, count]) => (
                <span key={theme} className="coach-kill-tag">
                  {theme} ({count})
                </span>
              ))}
            </div>
          </Section>
        )}

        {showTaskMetrics && data.eventDensity && (
          <Section title="event density impact">
            <div className="coach-density-grid">
              {(['low', 'medium', 'high'] as const).map((bucket) => {
                const d = data.eventDensity[bucket];
                return (
                  <div key={bucket} className="coach-density-row">
                    <span className="coach-muted-label">{bucket}:</span>{' '}
                    <span className="coach-value">{Math.round(d.completionRate * 100)}%</span>
                    <span className="coach-tiny-faint"> ({d.days}d)</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {data.noteHeavyDays.length > 0 && (
          <Section title="high-reflection days">
            <p className="coach-note">
              {data.noteHeavyDays.join(', ')} - lots of raw material captured.
            </p>
          </Section>
        )}

        <div className="coach-nudge-final">
          <p className="coach-nudge-text">// {data.nudge}</p>
        </div>
      </div>
      </div>
    );
  };

  return (
    <div className="view-shell">
      <div className="coach-tabs">
        {(['insights', 'review'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`coach-tab ${tab === t ? 'coach-tab-active' : 'coach-tab-inactive'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="coach-body">
        {renderBody()}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="coach-section">
      <h3 className="coach-section-title">{title}</h3>
      <div className="coach-section-body">{children}</div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="coach-metric">
      <div className="coach-metric-value">{value}</div>
      <div className="coach-metric-label">{label}</div>
    </div>
  );
}
