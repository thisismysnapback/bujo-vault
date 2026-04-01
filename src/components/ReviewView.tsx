import React, { useState, useEffect, useCallback } from 'react';
import { useVault } from '../store/VaultContext';
import { Sparkles, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subMonths, addMonths, subDays, startOfWeek, addDays } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatsData {
  heatmap: Record<string, number>;
  period: {
    rate: number;
    prevRate: number;
    greenDays: number;
    daysTracked: number;
    weekdayAvg: number;
    weekendAvg: number;
  };
  dowRates: number[]; // [sun, mon, tue, wed, thu, fri, sat]
  allTime: { rate: number; daysTracked: number; perfectDays: number };
  bestStreak: number;
  currentStreak: number;
}

// ─── Period config ────────────────────────────────────────────────────────────

const PERIODS: { label: string; days: number }[] = [
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: '365d', days: 365 },
];

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function HeatmapGrid({ heatmap }: { heatmap: Record<string, number> }) {
  const today = new Date();
  // Build 52 weeks of data (364 days back from today, aligned to weeks)
  const startDate = startOfWeek(subDays(today, 363), { weekStartsOn: 1 }); // start on Monday

  const weeks: { date: Date; count: number }[][] = [];
  let current = startDate;

  while (current <= today) {
    const week: { date: Date; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = format(addDays(current, d), 'yyyy-MM-dd');
      const dayDate = addDays(current, d);
      week.push({ date: dayDate, count: heatmap[dateStr] || 0 });
    }
    weeks.push(week);
    current = addDays(current, 7);
  }

  // Month labels: find first week where month changes
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const month = week[0].date.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ col: i, label: format(week[0].date, 'MMM').toLowerCase() });
      lastMonth = month;
    }
  });

  const maxCount = Math.max(1, ...Object.values(heatmap));

  function cellColor(count: number): string {
    if (count === 0) return '#222222';
    const intensity = count / maxCount;
    if (intensity < 0.25) return '#5c4a10';
    if (intensity < 0.5) return '#8a6f1a';
    if (intensity < 0.75) return '#c9a227';
    return '#e8bf45';
  }

  const DOW_LABELS = ['m', '', 'w', '', 'f', '', 's'];

  return (
    <div>
      {/* Month labels */}
      <div style={{ display: 'flex', gap: '2px', marginLeft: '20px', marginBottom: '4px' }}>
        {weeks.map((_, i) => {
          const label = monthLabels.find(m => m.col === i);
          return (
            <div key={i} style={{ width: '10px', fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
              {label ? label.label : ''}
            </div>
          );
        })}
      </div>

      {/* Grid rows: day of week */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {/* DOW labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '14px' }}>
          {DOW_LABELS.map((l, i) => (
            <div key={i} style={{ height: '10px', fontSize: '9px', color: 'var(--text-muted)', lineHeight: '10px', textAlign: 'right' }}>
              {l}
            </div>
          ))}
        </div>

        {/* Week columns */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {week.map((day, di) => (
                <div
                  key={di}
                  title={`${format(day.date, 'MMM d')}: ${day.count} entries`}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    background: day.date > today ? 'transparent' : cellColor(day.count),
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', marginLeft: '18px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>// less</span>
        {['#222222', '#5c4a10', '#8a6f1a', '#c9a227', '#e8bf45'].map((c, i) => (
          <div key={i} style={{ width: '10px', height: '10px', borderRadius: '2px', background: c }} />
        ))}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>more</span>
      </div>
    </div>
  );
}

// ─── Day of week bar chart ────────────────────────────────────────────────────

function DowChart({ rates }: { rates: number[] }) {
  // rates is [sun, mon, tue, wed, thu, fri, sat]
  const labels = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
  const max = Math.max(1, ...rates);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {labels.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '20px', flexShrink: 0 }}>{label}</span>
          <div style={{ flex: 1, height: '12px', background: '#222', borderRadius: '2px', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              width: `${rates[i]}%`,
              height: '100%',
              background: 'var(--gold)',
              borderRadius: '2px',
              opacity: rates[i] === 0 ? 0.2 : 1,
            }} />
          </div>
          <span style={{ fontSize: '12px', color: rates[i] > 0 ? 'var(--gold)' : 'var(--text-faint)', width: '36px', textAlign: 'right', flexShrink: 0 }}>
            {rates[i] > 0 ? `${rates[i]}%` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Period filter buttons ────────────────────────────────────────────────────

function PeriodFilter({ periods, active, onChange }: {
  periods: typeof PERIODS;
  active: number;
  onChange: (days: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {periods.map((p) => (
        <button
          key={p.days}
          onClick={() => onChange(p.days)}
          style={{
            fontSize: '12px',
            color: active === p.days ? 'var(--gold)' : 'var(--text-muted)',
            fontWeight: active === p.days ? '600' : '400',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
          }}
        >
          [{p.label}]
        </button>
      ))}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ icon, title, subtitle, children }: {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', paddingBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span>{icon}</span>
        <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{title}</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
        // {subtitle}
      </div>
      {children}
    </div>
  );
}

// ─── Stat line ────────────────────────────────────────────────────────────────

function StatLine({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.8' }}>
      {label}:{' '}
      <span style={{ color: 'var(--gold)' }}>{value}</span>
      {trend !== undefined && trend !== 0 && (
        <span style={{ color: trend > 0 ? '#4caf50' : 'var(--red)', marginLeft: '6px', fontSize: '11px' }}>
          {trend > 0 ? `↑${trend}%` : `↓${Math.abs(trend)}%`}
        </span>
      )}
    </div>
  );
}

// ─── Analytics tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const { streak } = useVault();
  const [periodDays, setPeriodDays] = useState(30);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async (days: number) => {
    if (!window.bujo) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await window.bujo.analyticsStats(days);
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(periodDays); }, [periodDays]);

  const handlePeriodChange = (days: number) => {
    setPeriodDays(days);
  };

  const totalTracked = stats?.allTime.daysTracked ?? 0;
  const avgCompletion = stats?.allTime.rate ?? 0;
  const perfectDays = stats?.allTime.perfectDays ?? 0;
  const currentStreak = stats?.currentStreak ?? streak;
  const bestStreak = stats?.bestStreak ?? 0;
  const trend = stats ? stats.period.rate - stats.period.prevRate : 0;

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 24px 40px' }}>
      {/* Terminal prompt */}
      <div style={{ fontSize: '13px', marginBottom: '24px', paddingTop: '20px' }}>
        <span style={{ color: 'var(--gold)' }}>ryan</span>
        <span style={{ color: 'var(--text-muted)' }}>@</span>
        <span style={{ color: 'var(--gold)' }}>bujo.vault</span>
        <span style={{ color: 'var(--text-muted)' }}> $ </span>
        <span style={{ color: 'var(--text)' }}>stats</span>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>loading...</div>
      ) : !window.bujo ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          // stats require the desktop app
        </div>
      ) : (
        <>
          {/* quick glance */}
          <Section icon="👁" title="quick glance" subtitle="your overall tracking summary">
            <StatLine label="days tracked" value={totalTracked.toString()} />
            <StatLine label="avg completion" value={`${avgCompletion}%`} />
            <StatLine label="perfect days" value={perfectDays.toString()} />
          </Section>

          {/* streaks */}
          <Section icon="🔥" title="streaks" subtitle="consecutive days with entries">
            <StatLine label="current streak" value={`${currentStreak} days`} />
            <StatLine label="best streak" value={`${bestStreak} days`} />
          </Section>

          {/* completion rates */}
          <Section icon="📊" title="completion rates" subtitle="how often you complete scheduled tasks">
            <div style={{ marginBottom: '12px' }}>
              <PeriodFilter periods={PERIODS} active={periodDays} onChange={handlePeriodChange} />
            </div>
            {stats && (
              <>
                <StatLine
                  label={`${PERIODS.find(p => p.days === periodDays)?.label ?? periodDays + 'd'}`}
                  value={`${stats.period.rate}%`}
                  trend={trend}
                />
                <StatLine label="all time" value={`${stats.allTime.rate}%`} />
                <StatLine label="green days" value={`${stats.period.greenDays}/${stats.period.daysTracked}`} />
                <StatLine label="weekday avg" value={`${stats.period.weekdayAvg}%`} />
                <StatLine label="weekend avg" value={`${stats.period.weekendAvg}%`} />
              </>
            )}
          </Section>

          {/* contributions */}
          {stats?.heatmap && Object.keys(stats.heatmap).length > 0 && (
            <Section icon="📅" title="contributions" subtitle="your activity over the past year">
              <HeatmapGrid heatmap={stats.heatmap} />
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                // {totalTracked} days tracked · {avgCompletion}% avg · {perfectDays} perfect days
              </div>
            </Section>
          )}

          {/* day of week */}
          {stats?.dowRates && (
            <Section icon="📅" title="day of week" subtitle="completion rates broken down by day">
              <div style={{ marginBottom: '12px' }}>
                <PeriodFilter periods={PERIODS} active={periodDays} onChange={handlePeriodChange} />
              </div>
              <DowChart rates={stats.dowRates} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ─── Monthly review tab ───────────────────────────────────────────────────────

const PERSPECTIVES = [
  { id: 'chronicle', label: 'chronicle', desc: 'what happened' },
  { id: 'coach', label: 'coach', desc: 'goals & momentum' },
  { id: 'relationships', label: 'relationships', desc: 'connection & isolation' },
  { id: 'strengths', label: 'strengths', desc: 'evidence-based positives' },
  { id: 'therapist', label: 'therapist', desc: 'emotional patterns' },
  { id: 'values-meaning', label: 'values', desc: 'alignment & purpose' },
  { id: 'synthesis', label: 'synthesis', desc: 'combined report' },
];

function MonthlyReviewTab() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const monthKey = format(currentMonth, 'yyyy-MM');
  const monthLabel = format(currentMonth, 'MMMM yyyy');

  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [activePerspective, setActivePerspective] = useState('chronicle');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (window.bujo) window.bujo.reviewList(monthKey).then(setStatus).catch(console.error);
  }, [monthKey]);

  useEffect(() => {
    if (window.bujo && status[activePerspective]) {
      setIsLoading(true);
      window.bujo.reviewGet(monthKey, activePerspective)
        .then(({ content: c }: { content: string }) => setContent(c))
        .catch(console.error)
        .finally(() => setIsLoading(false));
    } else {
      setContent('');
    }
  }, [monthKey, activePerspective, status]);

  const handleGenerate = async (perspective: string) => {
    if (!window.bujo) return;
    setIsGenerating(true);
    setError('');
    try {
      const result = perspective === 'synthesis'
        ? await window.bujo.reviewSynthesize(monthKey)
        : await window.bujo.reviewPerspective(monthKey, perspective);
      if (result.error) setError(result.error);
      else {
        setContent(result.content);
        setStatus(await window.bujo.reviewList(monthKey));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const availableCount = Object.values(status).filter(Boolean).length;

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 24px 40px' }}>
      {/* Terminal prompt */}
      <div style={{ fontSize: '13px', marginBottom: '24px', paddingTop: '20px' }}>
        <span style={{ color: 'var(--gold)' }}>ryan</span>
        <span style={{ color: 'var(--text-muted)' }}>@</span>
        <span style={{ color: 'var(--gold)' }}>bujo.vault</span>
        <span style={{ color: 'var(--text-muted)' }}> $ </span>
        <span style={{ color: 'var(--text)' }}>review</span>
      </div>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: '13px', color: 'var(--text)' }}>{monthLabel.toLowerCase()}</span>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <ChevronRight size={14} />
        </button>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {availableCount}/7 perspectives
        </span>
      </div>

      {/* Perspective tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {PERSPECTIVES.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePerspective(p.id)}
            style={{
              fontSize: '12px',
              color: activePerspective === p.id ? 'var(--gold)' : status[p.id] ? 'var(--text)' : 'var(--text-faint)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
              textDecoration: activePerspective === p.id ? 'underline' : 'none',
              textUnderlineOffset: '3px',
              textDecorationColor: 'var(--gold)',
            }}
          >
            [{p.label}{status[p.id] ? ' ●' : ''}]
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>
              {PERSPECTIVES.find(p => p.id === activePerspective)?.label}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              // {PERSPECTIVES.find(p => p.id === activePerspective)?.desc}
            </div>
          </div>
          <button
            onClick={() => handleGenerate(activePerspective)}
            disabled={isGenerating}
            style={{
              fontSize: '12px',
              color: 'var(--gold)',
              background: 'none',
              border: '1px solid var(--gold-dim)',
              borderRadius: '4px',
              padding: '4px 12px',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: isGenerating ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isGenerating ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
            {status[activePerspective] ? 'regen' : 'generate'}
          </button>
        </div>

        {error && <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '12px' }}>{error}</div>}

        {isLoading ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>loading...</div>
        ) : content ? (
          <pre style={{ fontSize: '12px', color: 'var(--text)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {content}
          </pre>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            <div>// no analysis generated yet</div>
            <div style={{ marginTop: '4px', color: 'var(--text-faint)' }}>
              // click generate to analyze {monthLabel.toLowerCase()} from the {PERSPECTIVES.find(p => p.id === activePerspective)?.label} perspective
            </div>
          </div>
        )}
      </div>

      {activePerspective !== 'synthesis' && availableCount >= 3 && !status['synthesis'] && (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            // {availableCount} perspectives available — ready for synthesis
          </div>
          <button
            onClick={() => { setActivePerspective('synthesis'); handleGenerate('synthesis'); }}
            disabled={isGenerating}
            style={{
              fontSize: '12px',
              color: 'var(--gold)',
              background: 'none',
              border: '1px solid var(--gold-dim)',
              borderRadius: '4px',
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={12} /> synthesize
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ReviewView ───────────────────────────────────────────────────────────────

export function ReviewView() {
  const [tab, setTab] = useState<'stats' | 'review'>('stats');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: '20px', padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
        {(['stats', 'review'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: '12px',
              color: tab === t ? 'var(--text)' : 'var(--text-faint)',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '1px solid var(--gold)' : '1px solid transparent',
              padding: '10px 0',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }} className="scrollbar-hide">
        {tab === 'stats' ? <AnalyticsTab /> : <MonthlyReviewTab />}
      </div>
    </div>
  );
}
