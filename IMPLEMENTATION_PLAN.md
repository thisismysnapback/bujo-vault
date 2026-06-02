# Implementation Plan: BuJo Web Major Upgrade

## Status: Active 2026-04-02

**Completed:** Phase 7 setup, Phase 1 (all chunks), Phase 2+3, Phase 5, Phase 4 (Habit Tracking)
**In progress:** —
**Not started:** Phase 5 (Data Model), Phase 6 (LLM), Phase 7 (Services), Phase 8 (Command Palette)

**51/51 tests passing. Clean `tsc --noEmit`.**

---

## What's Done

### Phase 7: Test Infra + Analytics Refactor ✅
- vitest installed, configured (`vitest.config.ts`, `src/test/setup.ts`)
- `electron/analytics.ts` — pure functions extracted: `calculateStreak`, `donePendingRatio`, `priorityAlignment`, `momentumScore`, `migrationPatterns`, `killThemesAnalysis`, `noteHeavyDays`, `eventHeavyDayNudge`, `coachingNudge`, `computeHeatmap`, `countByType`
- `electron/parser.ts` — `parseEntries`, `hasExplicitPrefix`, `parseQuickInput`
- `electron/main.ts` — imports from extracted modules, wrapper functions delegate to pure versions
- 3 test files: `utils.test.ts` (9), `parsing.test.ts` (17), `analytics.test.ts` (25)

### Phase 1: Restyle All 8 Views ✅
- `index.css` — added `--green`, `--green-light` variables
- All views use: terminal prompt headers, lowercase titles, `//` subtitles, bare inputs with `>` prompt, `borderTop` separators, no rounded cards
- Files: `MonthlyView`, `FutureLog`, `MigrationView`, `SearchView`, `SettingsView`, `CoachView`, `HelpOverlay`, `CalendarView`

### Phase 2: Split analytics_stats ✅
- New `analytics_heatmap` IPC handler (365-day loop, returns `{ count, rate }` per day)
- `analytics_stats` no longer computes heatmap
- Preload binding: `analyticsHeatmap()`
- Type declaration updated in `bujo.d.ts`
- `ReviewView.tsx` — heatmap loaded once on mount, period filter changes only call `analyticsStats`

### Phase 3: Quality-Coded Heatmap ✅
- `computeHeatmap()` in `analytics.ts` returns `rate = done / (done + task + priority)`
- `HeatmapGrid` colors: green (≥1.0), light green (≥0.7), gold (≥0.4), gold-dim (>0), red (0 with entries)
- Legend updated: none → perfect swatches
- Tooltip: shows completion % and count

### Phase 5: Inline Coach Nudge on DailyView ✅
- Loads `analyticsCoach()` on mount for today's date
- Renders `// coach: {nudge}` above InputBar
- Dismiss button stores `sessionStorage` key `bujo:nudge:dismissed:{date}`

### Types Added ✅
- `src/types.ts` — `Habit`, `HabitStats` interfaces, `'habits'` added to `ViewType`

---

## What Remains

### Phase 4: Habit Tracking ✅

Habits live in their own `habits.json`. This phase does not touch `EntryType`. Do it before the data model fix.

#### 4A. Storage
- Create `{vaultPath}/habits.json` on first use
- Schema: `{ habits: Habit[], completions: Record<string, string[]> }` where completions key is `YYYY-MM-DD` and value is array of habit IDs

#### 4B. Backend IPC Handlers (`electron/main.ts`)
- `habits_list` — read habits.json, return habits where `archived === false`
- `habits_create` — add new habit with generated id, write to habits.json
- `habits_update` — update name/frequency/emoji/archived by id
- `habits_delete` — soft delete via `archived: true`
- `habits_toggle` — add/remove habit id from completions[date]
- `habits_stats` — per habit: currentStreak, bestStreak, rate30d, totalCompletions; sort by currentStreak desc

#### 4C. Frontend
- `electron/preload.ts` — 6 bindings: `habitsList`, `habitsCreate`, `habitsUpdate`, `habitsDelete`, `habitsToggle`, `habitsStats`
- `src/types/bujo.d.ts` — add method signatures to `BuJoApi`; also fix duplicate `analyticsHeatmap()` declaration (line ~57)
- `src/components/HabitView.tsx` — new component (~200 lines):
  - Header: `ryan@bujo.vault $ habits`
  - Section A: Today's habits — checkbox + name + streak count; fire emoji for ≥7 streak
  - Section B: 14-day rolling matrix (dates × habits grid)
  - Section C: `> add habit` input at bottom
  - Calls `habitsToggle` on checkbox click, reloads stats
- `src/App.tsx` — `import HabitView` + `{currentView === 'habits' && <HabitView />}`
- `src/components/TopNav.tsx` — add `{ id: 'habits', label: 'habits' }` to SUB_TABS between future and migrate
- `src/components/ReviewView.tsx` — habits stats section in stats tab: rate30d, best streak per habit

#### 4D. DailyView Integration
- Habit strip below entry list, above InputBar, only on today's date
- Inline toggles: `[x] exercise  [ ] read`
- Calls `habitsToggle` IPC on click

#### 4E. Tests
- `electron/__tests__/habits.test.ts` — streak calculation, toggle idempotency, CRUD, edge cases (empty completions, archived habits)

---

### Phase 5: Data Model Fix

Do this before Phase 6 (LLM). The current `EntryType` conflates kind and status — `migrated` and `done` are statuses, not kinds. The AI parser in `src/services/ai.ts` currently sends `migrated` as a type to the LLM prompt, which is semantically wrong. Fix this before wiring more LLM features.

#### The Problem
```ts
// Current — status and kind mixed into one field
type EntryType = 'task' | 'done' | 'migrated' | 'killed' | 'note' | 'event' | 'scheduled' | 'priority';
```

#### Target Model
```ts
type EntryKind = 'task' | 'note' | 'event';
type EntryStatus = 'active' | 'done' | 'killed' | 'migrated';

interface EntryMeta {
  priority?: boolean;        // was type === 'priority'
  scheduledFor?: string;     // was type === 'scheduled'
  migratedTo?: string;       // target date when migrated
}

interface Entry {
  id: string;
  kind: EntryKind;
  status: EntryStatus;
  content: string;
  timestamp: number;
  meta?: EntryMeta;
}
```

#### Mapping (old → new)
| Old type | kind | status | meta |
|---|---|---|---|
| `task` | `task` | `active` | — |
| `done` | `task` | `done` | — |
| `migrated` | `task` | `migrated` | `migratedTo` if available |
| `killed` | `task` | `killed` | — |
| `note` | `note` | `active` | — |
| `event` | `event` | `active` | — |
| `scheduled` | `task` | `active` | `scheduledFor` |
| `priority` | `task` | `active` | `priority: true` |

#### Migration Strategy
- Do NOT rewrite markdown files. Markdown stays as-is (source of truth).
- The converter runs in `electron/parser.ts` at parse time: `legacyTypeToEntry(type: string): { kind, status, meta }`.
- `electron/main.ts` continues writing the old symbols to markdown (backwards-compatible). Only the in-memory representation changes.
- `src/types.ts` — replace `EntryType` with `EntryKind`, `EntryStatus`, `EntryMeta`, update `Entry` interface
- `src/store/VaultContext.tsx` — update `mapEntries()`, update all `addEntry` / `updateEntry` calls to use `kind` + `status`
- `src/services/ai.ts` — update `parseDump` prompt: only send `kind` options to LLM (`task`, `note`, `event`), status always `active` for new entries
- `src/components/EntryItem.tsx` — update symbol rendering to use `kind` + `status` + `meta.priority`
- `src/components/InputBar.tsx` — update prefix → kind/status mapping
- `src/types/bujo.d.ts` — update `getDay`, `getRange`, `search` return shapes
- `electron/analytics.ts` — update `countByType` and all analytics to use new fields
- All tests — update fixtures to new shape

This is the highest-impact structural change. Affects many files but the mapping is deterministic. Do it in one PR.

---

### Phase 6: LLM Integration

Run after Phase 5. LLM features consume `Entry` (kind/status), not raw markdown strings.

#### 6A. Migration Analysis
- `electron/main.ts`: `migrate_analyze` handler — pass stuck tasks (migrated 3+ times) to LLM, return analysis string
- `MigrationView.tsx`: sparkle icon on stuck tasks, inline response on click, `// ai unavailable` fallback

#### 6B. LLM Coach Nudge
- `electron/main.ts`: `coach_nudge_llm` handler — ADHD-aware prompt using structured entry data
- Cache keyed by last entry timestamp hash, 30-min TTL (store in electron app data)
- Fallback to rule-based `coachingNudge()`
- `DailyView.tsx`: prefer LLM nudge, fall back to rule-based silently

#### 6C. Smart Search
- `electron/main.ts`: modify `vault_search` to accept `mode: 'text' | 'semantic'`
- `SearchView.tsx`: `[text] [ai]` toggle, "ai" indicator in results
- Text search fallback if LLM unavailable

#### 6D. Daily Summary
- `electron/main.ts`: `daily_summary` handler — LLM summary for a given date's entries
- `DailyView.tsx`: "summarize" button visible on past days only

#### 6E. Auto-Categorization (defer)
#### 6F. InputBar Suggestions (defer)

---

### Phase 7: Service Layer Expansion

`src/services/ai.ts` exists. Expand this directory. Components should only render and call services — no logic inside components.

#### Target structure
```
src/services/
  ai.ts           (exists — parseDump)
  coach.ts        (new — LLM + rule-based nudge, daily summary)
  vault.ts        (new — migrate logic, search, stats helpers)
  habits.ts       (new — habit streak helpers for UI use)
```

Rules:
- Services call `window.bujo.*` or run pure computations
- No React imports in services
- Components import from services, not from each other for logic

Extract from components:
- `DailyView.tsx` — coach nudge fetch logic → `coach.ts`
- `MigrationView.tsx` — migrate analysis logic → `vault.ts`
- `SearchView.tsx` — search orchestration → `vault.ts`

---

### Phase 8: Command Palette

High-impact for ADHD workflow. One keystroke to do anything.

#### Implementation
- Trigger: `Ctrl+K` (global, caught in `App.tsx` keydown listener)
- `src/components/CommandPalette.tsx` — new component:
  - Fuzzy search across: views, entry creation shortcuts, recent entries
  - Groups: `go to`, `create`, `recent`
  - Keyboard navigation: arrows + enter, `Esc` to close
  - Style: terminal-dark overlay, `> ` prompt input, no borders
- Commands include: navigate to any view, `> task: ...` (create entry inline), `> note: ...`, `> event: ...`
- `src/App.tsx` — render `<CommandPalette />` conditionally, pass `setCurrentView`

---

### Remaining Tests

- `electron/__tests__/habits.test.ts` — streak calc, toggle idempotency, CRUD (Phase 4E)
- `electron/__tests__/parser.test.ts` — `legacyTypeToEntry` mapping (Phase 5)
- `src/components/__tests__/EntryItem.test.tsx` — symbols, colors, edit mode, toggle
- `src/components/__tests__/InputBar.test.tsx` — prefixes, dump detection, enter key
- `src/components/__tests__/CommandPalette.test.tsx` — fuzzy match, keyboard nav (Phase 8)

---

## Execution Order

1. **Phase 4** — 4B (IPC) → 4C (preload + types + HabitView + wiring) → 4D (DailyView strip) → 4E (tests)
2. **Phase 5** — Data model fix in one go: parser converter → types → VaultContext → components → analytics → tests
3. **Phase 6A, 6B** — Migration analysis + LLM coach (highest value LLM features)
4. **Phase 6C, 6D** — Smart search + daily summary
5. **Phase 7** — Service extraction (clean up after LLM work is done)
6. **Phase 8** — Command palette
7. **Remaining tests** — EntryItem, InputBar, CommandPalette

---

## What This Does NOT Include (and Why)

- **Repository layer** — the preload bridge (`bujo.d.ts` + `window.bujo.*`) already is the data access boundary. Adding `VaultRepository.ts` would be a second layer over a layer.
- **Zustand** — `VaultContext.tsx` works. Replace only if it becomes a bottleneck.
- **React Router** — 9 views with no deep-linking use case. View switching via state is fine.
- **SQLite** — no scale problem yet. Add when markdown reads are measurably slow.
- **Sync** — only after everything else is stable.

---

## Key Files (Reference)

- `electron/main.ts` — all IPC handlers
- `electron/analytics.ts` — pure analytics functions
- `electron/parser.ts` — pure parsing functions; gets `legacyTypeToEntry` in Phase 5
- `electron/preload.ts` — IPC bindings exposed to renderer
- `src/types/bujo.d.ts` — API type declarations (fix duplicate `analyticsHeatmap` on line ~57)
- `src/types.ts` — `Entry`, `ViewType`, `Habit`, `HabitStats`
- `src/store/VaultContext.tsx` — app state and IPC orchestration
- `src/services/ai.ts` — AI parsing (update prompt in Phase 5)
- `src/index.css` — design tokens
- `src/components/DailyView.tsx` — inline coach nudge, habit strip (Phase 4D)
- `src/components/ReviewView.tsx` — heatmap, stats, habit section (Phase 4C)
- `src/components/TopNav.tsx` — navigation tabs
