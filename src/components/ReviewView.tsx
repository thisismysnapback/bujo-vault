import React, { useState, useEffect, useCallback } from 'react';
import { useVault } from '../store/VaultContext';
import { Sparkles, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subMonths, addMonths, subDays, startOfWeek, addDays } from 'date-fns';
import { generateReview, getHeatmap, getReview, getStats, hasDesktopApi, listReviews } from '../services/desktop';
import { getTerminalPrompt } from '../lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatsData {
  period: {
    rate: number;
    prevRate: number;
    greenDays: number;
    daysTracked: number;
    weekdayAvg: number;
    weekendAvg: number;
  };
  dowRates: number[];
  dowEntries: number[];
  dowLoggedDays: number[];
  journal: {
    periodEntries: number;
    entriesPerTrackedDay: number;
    activeDays: number;
    quietDays: number;
    mix: { tasks: number; notes: number; events: number };
    signals: { lowEnergy: number; stress: number; satisfaction: number; pride: number };
    themes: Array<{ label: string; count: number }>;
    openLoops: Array<{ text: string; date: string; kind: string }>;
  };
  allTime: { rate: number; daysTracked: number; perfectDays: number };
  bestStreak: number;
  currentStreak: number;
}

type HeatmapData = Record<string, { count: number; rate: number; tasks: number; notes: number; events: number }>;

const PERIODS: { label: string; days: number }[] = [
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: '365d', days: 365 },
];

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function HeatmapGrid({ heatmap }: { heatmap: HeatmapData }) {
  const today = new Date();
  const startDate = startOfWeek(subDays(today, 363), { weekStartsOn: 1 });

  const weeks: { date: Date; data: HeatmapData[string] | null }[][] = [];
  let current = startDate;

  while (current <= today) {
    const week: { date: Date; data: HeatmapData[string] | null }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = format(addDays(current, d), 'yyyy-MM-dd');
      const dayDate = addDays(current, d);
      week.push({ date: dayDate, data: heatmap[dateStr] || null });
    }
    weeks.push(week);
    current = addDays(current, 7);
  }

  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const month = week[0].date.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ col: i, label: format(week[0].date, 'MMM').toLowerCase() });
      lastMonth = month;
    }
  });

  function cellClass(data: HeatmapData[string] | null, dayDate: Date): string {
    if (dayDate > today) return 'heatmap-cell-future';
    if (!data || data.count === 0) return 'heatmap-cell-empty';
    if (data.count >= 8) return 'heatmap-cell-max';
    if (data.count >= 5) return 'heatmap-cell-high';
    if (data.count >= 3) return 'heatmap-cell-mid';
    return 'heatmap-cell-low';
  }

  const DOW_LABELS = ['m', '', 'w', '', 'f', '', 's'];

  return (
    <div>
      {/* Month labels */}
      <div className="heatmap-months">
        {weeks.map((_, i) => {
          const label = monthLabels.find(m => m.col === i);
          return (
            <div key={i} className="heatmap-month-label">
              {label ? label.label : ''}
            </div>
          );
        })}
      </div>

      {/* Grid rows: day of week */}
      <div className="heatmap-body">
        {/* DOW labels */}
        <div className="heatmap-dow-col">
          {DOW_LABELS.map((l, i) => (
            <div key={i} className="heatmap-dow-label">
              {l}
            </div>
          ))}
        </div>

        {/* Week columns */}
        <div className="heatmap-weeks">
          {weeks.map((week, wi) => (
            <div key={wi} className="heatmap-week">
              {week.map((day, di) => (
                <div
                  key={di}
                  title={day.data ? `${format(day.date, 'MMM d')}: ${day.data.count} entries (${day.data.notes} notes, ${day.data.tasks} tasks, ${day.data.events} events)` : `${format(day.date, 'MMM d')}: no entries`}
                  className={`heatmap-cell ${cellClass(day.data, day.date)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="heatmap-legend">
        <span className="heatmap-legend-text">// none</span>
        {[
          'heatmap-legend-low',
          'heatmap-legend-mid',
          'heatmap-legend-high',
          'heatmap-legend-max',
        ].map((className) => (
          <div key={className} className={`heatmap-legend-swatch ${className}`} />
        ))}
        <span className="heatmap-legend-text">many entries</span>
      </div>
    </div>
  );
}

// ─── Day of week bar chart ────────────────────────────────────────────────────

function DowChart({ entries, loggedDays }: { entries: number[]; loggedDays: number[] }) {
  const labels = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
  const max = Math.max(1, ...entries);

  return (
    <div className="dow-chart">
      {labels.map((label, i) => (
        <div key={i} className="dow-row">
          <span className="dow-label">{label}</span>
          <div className="dow-track">
            <svg className="dow-svg" viewBox="0 0 100 12" preserveAspectRatio="none">
              <rect
                className={`dow-bar ${entries[i] === 0 ? 'dow-bar-empty' : ''}`}
                width={Math.round((entries[i] / max) * 100)}
                height="12"
                rx="2"
              />
            </svg>
          </div>
          <span
            className={`dow-value ${entries[i] > 0 ? 'dow-value-active' : 'dow-value-empty'}`}
          >
            {entries[i] > 0 ? `${entries[i]} / ${loggedDays[i]}d` : '-'}
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
    <div className="flex flex-wrap gap-1.5">
      {periods.map((p) => (
        <button
          key={p.days}
          onClick={() => onChange(p.days)}
          className={`period-btn ${active === p.days ? 'period-btn-active' : 'period-btn-inactive'}`}
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
    <div className="stats-section">
      <div className="stats-section-header">
        <span>{icon}</span>
        <span className="stats-section-title">{title}</span>
      </div>
      <div className="stats-section-subtitle">
        // {subtitle}
      </div>
      {children}
    </div>
  );
}

// ─── Stat line ────────────────────────────────────────────────────────────────

function StatLine({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <div className="stat-line">
      {label}:{' '}
      <span className="stat-value">{value}</span>
      {trend !== undefined && trend !== 0 && (
        <span className={trend > 0 ? 'stat-trend-up' : 'stat-trend-down'}>
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
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = useCallback(async (days: number) => {
    if (!hasDesktopApi()) {
      setError('desktop bridge not available — restart BuJo from the desktop shortcut.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getStats(days);
      if (!data) {
        setError('stats endpoint returned no data (desktop app not responding).');
      } else {
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
      setError(err instanceof Error ? err.message : 'failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats(periodDays);
  }, [periodDays, loadStats]);

  useEffect(() => {
    getHeatmap().then(data => {
      if (data) setHeatmapData(data);
    }).catch(console.error);
  }, []);

  const handlePeriodChange = (days: number) => {
    setPeriodDays(days);
  };

  const totalTracked = stats?.allTime.daysTracked ?? 0;
  const currentStreak = stats?.currentStreak ?? streak;
  const bestStreak = stats?.bestStreak ?? 0;
  const journal = stats?.journal;
  const mixTotal = journal ? Math.max(1, journal.mix.tasks + journal.mix.notes + journal.mix.events) : 1;

  return (
    <div className="panel-page">
      {/* Terminal prompt */}
      <div className="panel-command">
        <span className="terminal-prompt">{getTerminalPrompt()}</span>
        <span className="terminal-muted"> $ </span>
        <span className="terminal-command-text">stats</span>
      </div>

      {loading ? (
        <div className="panel-loading">loading...</div>
      ) : error ? (
        <div className="panel-error">// {error}</div>
      ) : !hasDesktopApi() ? (
        <div className="panel-small-muted">
          // stats require the desktop app
        </div>
      ) : (
        <>
          {/* quick glance */}
          <Section icon="*" title="quick glance" subtitle="your logging rhythm, not a productivity grade">
            <StatLine label="days logged" value={`${journal?.activeDays ?? 0}/${periodDays}`} />
            <StatLine label="entries captured" value={`${journal?.periodEntries ?? 0}`} />
            <StatLine label="avg per logged day" value={`${journal?.entriesPerTrackedDay ?? 0}`} />
            <StatLine label="all-time logged days" value={totalTracked.toString()} />
          </Section>

          {/* streaks */}
          <Section icon="~" title="streaks" subtitle="consecutive days with any real entry">
            <StatLine label="current streak" value={`${currentStreak} days`} />
            <StatLine label="best streak" value={`${bestStreak} days`} />
          </Section>

          {/* entry mix */}
          <Section icon="|" title="entry mix" subtitle="what kind of material you are capturing">
            <div className="mb-3">
              <PeriodFilter periods={PERIODS} active={periodDays} onChange={handlePeriodChange} />
            </div>
            {stats && (
              <>
                <StatLine label="notes / reflections" value={`${journal?.mix.notes ?? 0} (${Math.round(((journal?.mix.notes ?? 0) / mixTotal) * 100)}%)`} />
                <StatLine label="tasks / open loops" value={`${journal?.mix.tasks ?? 0} (${Math.round(((journal?.mix.tasks ?? 0) / mixTotal) * 100)}%)`} />
                <StatLine label="events / happened" value={`${journal?.mix.events ?? 0} (${Math.round(((journal?.mix.events ?? 0) / mixTotal) * 100)}%)`} />
              </>
            )}
          </Section>

          {journal && (
            <Section icon=":" title="signals" subtitle="soft patterns from the words you used">
              <StatLine label="low energy" value={`${journal.signals.lowEnergy}`} />
              <StatLine label="stress / pressure" value={`${journal.signals.stress}`} />
              <StatLine label="satisfaction / okayness" value={`${journal.signals.satisfaction}`} />
              <StatLine label="pride / wins" value={`${journal.signals.pride}`} />
            </Section>
          )}

          {heatmapData && Object.keys(heatmapData).length > 0 && (
            <Section icon="#" title="contributions" subtitle="activity intensity over the past year">
              <HeatmapGrid heatmap={heatmapData || {}} />
              <div className="section-note">
                // darker means quiet; brighter means more captured
              </div>
            </Section>
          )}

          {stats?.dowEntries && (
            <Section icon="+" title="day rhythm" subtitle="which weekdays tend to hold more logging">
              <div className="mb-3">
                <PeriodFilter periods={PERIODS} active={periodDays} onChange={handlePeriodChange} />
              </div>
              <DowChart entries={stats.dowEntries} loggedDays={stats.dowLoggedDays} />
            </Section>
          )}

          {journal && journal.themes.length > 0 && (
            <Section icon="@" title="recurring threads" subtitle="topics that kept showing up">
              {journal.themes.map(theme => (
                <div key={theme.label}>
                  <StatLine label={theme.label} value={`${theme.count}`} />
                </div>
              ))}
            </Section>
          )}

          {journal && journal.openLoops.length > 0 && (
            <Section icon=">" title="open loops" subtitle="actions and commitments still worth seeing">
              <div className="flex flex-col gap-2">
                {journal.openLoops.map((loop, index) => (
                  <div key={`${loop.date}-${index}`} className="open-loop-row">
                    <span className="open-loop-date">{loop.date}</span>
                    <span> / {loop.text}</span>
                  </div>
                ))}
              </div>
              <div className="section-note">
                // task completion still exists, but it is no longer the main story of stats
              </div>
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

export function MonthlyReviewTab() {
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
    listReviews(monthKey).then(setStatus).catch(console.error);
  }, [monthKey]);

  useEffect(() => {
    if (status[activePerspective]) {
      setIsLoading(true);
      getReview(monthKey, activePerspective)
        .then((result) => setContent(result?.content ?? ''))
        .catch(console.error)
        .finally(() => setIsLoading(false));
    } else {
      setContent('');
    }
  }, [monthKey, activePerspective, status]);

  const handleGenerate = async (perspective: string) => {
    setIsGenerating(true);
    setError('');
    try {
      const result = await generateReview(monthKey, perspective, Boolean(status[perspective]));
      if (!result) setError('desktop app required');
      else if (result.error) setError(result.error);
      else {
        setContent(result.content);
        setStatus(await listReviews(monthKey));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const availableCount = Object.values(status).filter(Boolean).length;

  return (
    <div className="panel-page">
      {/* Terminal prompt */}
      <div className="panel-command">
        <span className="terminal-prompt">{getTerminalPrompt()}</span>
        <span className="terminal-muted"> $ </span>
        <span className="terminal-command-text">review</span>
      </div>

      {/* Month nav */}
      <div className="review-month-nav">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="review-nav-button">
          <ChevronLeft size={14} />
        </button>
        <span className="review-month-label">{monthLabel.toLowerCase()}</span>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="review-nav-button">
          <ChevronRight size={14} />
        </button>
        <span className="review-count">
          {availableCount}/7 perspectives
        </span>
      </div>

      {/* Perspective tabs */}
      <div className="review-tabs">
        {PERSPECTIVES.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePerspective(p.id)}
            className={[
              'review-tab',
              activePerspective === p.id ? 'review-tab-active' : status[p.id] ? 'review-tab-ready' : 'review-tab-empty',
            ].join(' ')}
          >
            [{p.label}{status[p.id] ? ' ●' : ''}]
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="review-content">
        <div className="review-content-header">
          <div>
            <div className="review-title">
              {PERSPECTIVES.find(p => p.id === activePerspective)?.label}
            </div>
            <div className="review-subtitle">
              // {PERSPECTIVES.find(p => p.id === activePerspective)?.desc}
            </div>
          </div>
          <button
            onClick={() => handleGenerate(activePerspective)}
            disabled={isGenerating}
            className={`review-generate ${isGenerating ? 'review-generate-disabled' : ''}`}
          >
            {isGenerating ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
            {status[activePerspective] ? 'regen' : 'generate'}
          </button>
        </div>

        {error && <div className="panel-error mb-3">{error}</div>}

        {isLoading ? (
          <div className="panel-small-muted">loading...</div>
        ) : content ? (
          <pre className="review-output">
            {content}
          </pre>
        ) : (
          <div className="panel-small-muted">
            <div>// no analysis generated yet</div>
            <div className="mt-1 text-faint">
              // click generate to analyze {monthLabel.toLowerCase()} from the {PERSPECTIVES.find(p => p.id === activePerspective)?.label} perspective
            </div>
          </div>
        )}
      </div>

      {activePerspective !== 'synthesis' && availableCount >= 3 && !status['synthesis'] && (
        <div className="synthesis-callout">
          <div className="synthesis-callout-hint">
            // {availableCount} perspectives available — ready for synthesis
          </div>
          <button
            onClick={() => { setActivePerspective('synthesis'); handleGenerate('synthesis'); }}
            disabled={isGenerating}
            className="synthesis-callout-btn"
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
  return (
    <div className="view-shell">
      <div className="coach-body">
        <AnalyticsTab />
      </div>
    </div>
  );
}
