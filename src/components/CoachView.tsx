import React, { useEffect, useState } from 'react';
import { getCoachData } from '../services/desktop';

interface CoachData {
  period: string; streak: number; momentum: string; completionRate: number;
  priorityAlignment: number; totalEntries: number;
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

  const momentumColor = {
    building: '#4caf50',
    steady: 'var(--gold)',
    stalling: 'var(--gold-dim)',
    stalled: 'var(--red)',
    new: 'var(--text-faint)',
  }[data?.momentum || ''] || 'var(--text-faint)';

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>// analyzing...</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px', padding: '0 32px' }}>
        <p style={{ fontSize: '20px', color: 'var(--text)', marginBottom: '12px' }}>not ready yet</p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {error === 'IPC not available'
            ? 'open this app from the electron window, not a browser.'
            : 'start capturing entries. you need at least 3 today to unlock coaching.'}
        </p>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>// no data available</p>
    </div>
  );

  if (data.empty) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px', padding: '0 32px' }}>
        <p style={{ fontSize: '20px', color: 'var(--text)', marginBottom: '12px' }}>
          {data.totalEntries === 0 ? "nothing captured yet today." :
           data.totalEntries === 1 ? "one entry. keep going." :
           `${data.totalEntries} entries. you're warming up.`}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {data.streak >= 3 ? `${data.streak} day streak. don't break it.` :
           data.streak === 0 ? "start your streak today." :
           "capture 5+ entries to unlock coaching."}
        </p>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '48px 32px 16px', maxWidth: '640px', width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          ryan@bujo.vault $ coach
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 2px' }}>
          coach
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          // {data.period}
        </p>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 32px', maxWidth: '640px', width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: momentumColor }}>{data.momentum}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{Math.round(data.completionRate * 100)}% completion</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{Math.round(data.priorityAlignment * 100)}% priority aligned</span>
          {data.streak >= 3 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{data.streak}d streak</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <MetricCard label="completion" value={`${Math.round(data.completionRate * 100)}%`} />
          <MetricCard label="priority aligned" value={`${Math.round(data.priorityAlignment * 100)}%`} />
          <MetricCard label="tasks/day" value={data.tasksPerDayAvg.toString()} />
          <MetricCard label="productive" value={data.productiveTime.split(' ')[0]} />
        </div>

        {data.stuckTasks.length > 0 && (
          <Section title="stuck tasks (migrated 3+ times)">
            {data.stuckTasks.map((t, i) => (
              <div key={i} style={{ fontSize: '13px', color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--text-faint)' }}>&gt;</span>
                {t.text}
                <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>({t.count}x)</span>
              </div>
            ))}
          </Section>
        )}

        {Object.keys(data.killThemes).length > 0 && (
          <Section title="kill patterns">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(data.killThemes).slice(0, 5).map(([theme, count]) => (
                <span key={theme} style={{ fontSize: '11px', color: 'var(--red)' }}>
                  {theme} ({count})
                </span>
              ))}
            </div>
          </Section>
        )}

        {data.eventDensity && (
          <Section title="event density impact">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {(['low', 'medium', 'high'] as const).map((bucket) => {
                const d = data.eventDensity[bucket];
                return (
                  <div key={bucket} style={{ fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{bucket}:</span>{' '}
                    <span style={{ color: 'var(--text)' }}>{Math.round(d.completionRate * 100)}%</span>
                    <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}> ({d.days}d)</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {data.noteHeavyDays.length > 0 && (
          <Section title="note-heavy days">
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {data.noteHeavyDays.join(', ')} — dumps, not daily rhythm.
            </p>
          </Section>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text)' }}>// {data.nudge}</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
      <div style={{ fontSize: '22px', fontWeight: 300, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
