# BuJo Vault Implementation Status

## Canonical status — June 23, 2026

This file is the current source of truth for implementation status.

The older plans in `docs/plans/` are retained as historical execution records. Their
"current state" sections describe the repository before the work was implemented and
must not be used to determine what remains.

## Verification baseline

Verified against the current working tree on June 23, 2026:

- `npm run lint` — passed
- `npm run test` — 19 test files, 153 tests passed
- `npm run build` — passed

The working tree contains uncommitted implementation work. Passing checks establish
that the current tree builds and tests cleanly; they do not mean every roadmap detail
was implemented exactly as originally specified.

## Phase status

| Phase | Status | Current implementation |
|---|---|---|
| 1 — UI restyle | Complete | Terminal-style views and shared styling are present. |
| 2 — Analytics split | Complete | Analytics and heatmap paths are separated and tested. |
| 3 — Quality heatmap | Complete | Completion-quality heatmap behavior is implemented. |
| 4 — Habits | Complete | Storage, IPC, UI, daily integration, statistics, and tests are present. |
| 5 — Entry model | Complete | Entries expose semantic `kind`, `status`, and `meta` fields while retaining legacy compatibility at file/API boundaries. |
| 6 — LLM integration | Substantially complete | Migration analysis, coach nudge, semantic search, and daily summary are implemented. See remaining reconciliation items below. |
| 7 — Service layer | Functionally complete; planned split pending | Renderer-side desktop operations are centralized in `src/services/desktop.ts`, but the proposed `coach.ts`, `vault.ts`, and `habits.ts` files were not split out. |
| 8 — Command palette | Substantially complete | Ctrl+K, fuzzy command search, navigation, entry capture, actions, and keyboard controls are implemented. Recent-entry commands are not. |

## Implemented LLM features

### 6A — Migration analysis

Implemented:

- `migrate_analyze` IPC handler
- Structured ADHD-aware migration prompt
- Sparkle action in `MigrationView`
- Inline analysis/loading response
- `// ai unavailable` fallback

Roadmap mismatch:

- The action currently appears on every stale active task, not only tasks migrated
  three or more times.
- `MigrationView` currently sends `count: 1`, so the prompt does not receive the
  task's actual migration count/history.

### 6B — LLM coach nudge

Implemented:

- `coach_nudge_llm` IPC handler
- Structured recent-entry context
- Rule-based fallback
- Silent renderer fallback
- Cache key derived from date, entry count, and latest entry timestamp
- 30-minute TTL

Roadmap mismatch:

- The cache is process memory only. The original plan requested persistence in
  Electron app data.

### 6C — Smart search

Implemented:

- `vault_search(query, mode)` with `text` and `semantic` modes
- `[text]` / `[ai]` toggle in `SearchView`
- Text-search fallback when AI is unavailable
- Semantic result normalization and tests

Roadmap mismatch:

- Results do not display the proposed `// ai` indicator while semantic mode is active.

### 6D — Daily summary

Complete:

- `daily_summary` IPC handler
- Structured daily-summary prompt
- Empty-day handling
- Summarize action shown on past days only
- Inline summary/error display

### 6E and 6F

Still deferred:

- Auto-categorization
- InputBar suggestions

## Remaining roadmap reconciliation

These are the only unfinished items inherited from the original Phases 6–8 roadmap:

1. Restrict migration analysis to genuinely stuck tasks and pass real migration
   count/history to the LLM.
2. Decide whether coach-cache persistence across app restarts is worth retaining.
   If yes, store the TTL cache under Electron app data.
3. Add a visible semantic/AI indicator to search results.
4. Either split `src/services/desktop.ts` into `coach.ts`, `vault.ts`, and `habits.ts`,
   or formally accept `desktop.ts` as the renderer service boundary.
5. Add recent-entry commands to the Command Palette, or formally remove that
   requirement.
6. Add focused regression tests for whichever reconciliation items are retained.

Items 2, 4, and 5 are architectural/product choices rather than broken functionality.

## Audit hardening roadmap

`docs/plans/2026-06-02-bujo-audit-fix-plan.md` is a separate historical hardening
plan. Its implemented work includes stable file-backed behavior, safer IPC and path
handling, explicit source routing, surfaced async errors, keyboard safety fixes, and
regression coverage.

Future hardening findings should be added here as concrete open issues instead of
creating another competing status roadmap.

## Deferred by design

- Auto-categorization and InputBar suggestions
- Repository abstraction over the preload bridge
- Zustand migration
- React Router
- SQLite
- Sync

These should only be reopened for a demonstrated product or performance need.
