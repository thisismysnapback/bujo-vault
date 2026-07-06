# BuJo Audit Fix Implementation Plan

> **Historical plan — June 2, 2026.** This document records the original audit-fix
> execution plan and is not the current project-status source. See
> [`../../IMPLEMENTATION_PLAN.md`](../../IMPLEMENTATION_PLAN.md) for the verified
> canonical status and remaining work as of June 23, 2026.

> **For Hermes:** Implement this plan in order. Do not skip tests. Each phase should end with `npm test && npm run lint && npm run build` unless explicitly noted.

**Goal:** Fix all audit findings from the BuJo phases 4-8 audit: broken entry identity/CRUD, migration false-success, IPC path validation/security, API-key exposure, monthly CRUD, analytics/UI regressions, and test gaps.

**Architecture:** First stabilize the data boundary: deterministic entry IDs, safe path helpers, typed IPC validation, and explicit daily/monthly/future source handling. Then fix UI flows that currently assume successful async operations. Finally add regression tests that exercise real file behavior, not only pure utilities.

**Tech Stack:** Electron main/preload IPC, React 19, TypeScript, Vitest, Vite, Node fs/path APIs.

---

## Phase 0: Safety Baseline

### Task 0.1: Create an audit regression test harness for filesystem code

**Objective:** Make it possible to test file-backed behavior without launching Electron.

**Files:**
- Create/modify: `electron/vaultFs.ts`
- Modify: `electron/main.ts`
- Create: `electron/__tests__/vaultFs.test.ts`

**Plan:**
1. Extract pure file-backed operations from `setupIpcHandlers()` into exported functions that accept `vaultPath` and operation args.
2. Keep IPC handlers as thin wrappers.
3. Use `fs.mkdtempSync(path.join(tmpdir(), 'bujo-vault-'))` in tests.

**Functions to extract first:**
- `getDay(vaultPath, date)`
- `appendEntry(vaultPath, date, type, content)`
- `updateEntry(vaultPath, date, id, type, content)`
- `deleteEntry(vaultPath, date, id)`
- `migrateEntry(vaultPath, fromDate, toDate, entryId)`
- `clearDay(vaultPath, date)`

**Verification:**
```bash
npm test -- electron/__tests__/vaultFs.test.ts
```
Expected initially: tests compile and existing behavior is callable through the extracted functions.

---

## Phase 1: Fix Stable Entry Identity

### Task 1.1: Replace random parsed IDs with deterministic IDs

**Objective:** Make IDs stable across parses so update/delete/migrate can find entries returned to the renderer.

**Files:**
- Modify: `electron/parser.ts`
- Test: `electron/__tests__/parsing.test.ts`
- Test: `electron/__tests__/vaultFs.test.ts`

**Implementation approach:**
- Add a deterministic ID helper in `electron/parser.ts`.
- Inputs: `fileDate`, entry line number, normalized entry line text.
- Output: stable string, e.g. `entry:${fileDate}:${lineNumber}:${shortHash}`.
- Use Node `crypto.createHash('sha256')` instead of `uuidv4()`.
- Preserve uniqueness for duplicate adjacent lines by including line number.

**Pseudo-code:**
```ts
import { createHash } from 'crypto'

export function stableEntryId(fileDate: string, lineIndex: number, rawLine: string): string {
  const digest = createHash('sha256')
    .update(`${fileDate}\n${lineIndex}\n${rawLine.trim()}`)
    .digest('hex')
    .slice(0, 12)
  return `entry:${fileDate}:${lineIndex + 1}:${digest}`
}
```

**Test cases:**
1. Parsing same content twice returns same IDs.
2. Duplicate lines on different line numbers get different IDs.
3. Update using ID returned by first parse succeeds after second parse.
4. Delete using ID returned by first parse succeeds after second parse.
5. Migrate using ID returned by first parse succeeds after second parse.

**Verification:**
```bash
npm test -- electron/__tests__/parsing.test.ts electron/__tests__/vaultFs.test.ts
npm run lint
```

### Task 1.2: Surface backend operation errors in `VaultContext`

**Objective:** Stop the renderer from pretending failed update/delete/migrate/clear operations succeeded.

**Files:**
- Modify: `src/store/VaultContext.tsx`
- Test: `src/services/__tests__/desktop.test.ts` or new `src/store/__tests__/VaultContext.test.tsx`

**Implementation approach:**
- For each IPC call returning `{ error?: string }`, check result before mutating/reloading.
- Throw or log a structured error and keep state unchanged.
- Add UI error display only if needed; do not silently mutate local state on backend failure.

**Affected functions:**
- `updateEntry`
- `deleteEntry`
- `clearDay`
- `migrateEntry`
- `undo`

---

## Phase 2: Fix Migration Flow

### Task 2.1: Await migration/done/kill actions before marking processed

**Objective:** MigrationView should only hide an item after backend success.

**Files:**
- Modify: `src/components/MigrationView.tsx`
- Test: `src/components/__tests__/MigrationView.test.tsx`

**Implementation approach:**
- Change handlers to `async`.
- Add local `pendingActionIds` state.
- Only call `setProcessed` after awaited operation completes.
- Show a small inline error if operation fails.

### Task 2.2: Filter MigrationView to daily logs only

**Objective:** Prevent monthly/future pseudo-logs from entering daily migration review.

**Files:**
- Modify: `src/components/MigrationView.tsx`
- Test: `src/components/__tests__/MigrationView.test.tsx`

**Implementation approach:**
```ts
const DAILY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
```
Skip non-matching log keys before formatting or acting.

**Test cases:**
1. `2026-06` monthly log is ignored.
2. `March 2026-future` future log is ignored.
3. Valid daily active task appears.

---

## Phase 3: Secure IPC Path Handling

### Task 3.1: Add centralized path and argument validation

**Objective:** Block path traversal and invalid IPC arguments at the main-process boundary.

**Files:**
- Create: `electron/ipcValidation.ts`
- Test: `electron/__tests__/ipcValidation.test.ts`
- Modify: `electron/main.ts` / extracted `electron/vaultFs.ts`

**Implementation requirements:**
- `validateDate(value): string` accepts only `YYYY-MM-DD` and rejects invalid calendar dates.
- `validateMonthKey(value): string` accepts only `YYYY-MM` with month `01..12`.
- `validateSlug(value, label): string` accepts only `[A-Za-z0-9_-]{1,64}`.
- `validatePerspective(value)` allowlists known perspectives.
- `safeJoin(base, ...parts)` resolves paths and rejects anything outside `base`.
- `validateText(value, maxChars, label)` rejects non-string and huge strings.
- `validateDays(value, max = 365)` rejects non-finite, <1, >max.

**Test cases:**
- Reject `../../outside` date.
- Reject absolute paths.
- Reject `2026-13-99`.
- Reject template names with `/`, `\\`, `..`, null byte.
- `safeJoin(vault, 'daily', '2026-06-02.md')` succeeds.
- `safeJoin(vault, 'daily', '../../x.md')` fails.

### Task 3.2: Apply validation to all path-bearing IPC handlers

**Objective:** Ensure all renderer-controlled path components are validated.

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/vaultFs.ts`
- Test: `electron/__tests__/vaultFs.test.ts`
- Test: `electron/__tests__/ipcValidation.test.ts`

**Handlers to update:**
- `vault_get_day`
- `vault_append_entry`
- `vault_update_entry`
- `vault_delete_entry`
- `vault_get_range`
- `vault_get_monthly`
- `vault_search`
- `vault_clear_day`
- `migrate_entry`
- `vault_append_monthly_entry`
- `templates_apply`
- `analytics_stats`
- `habits_matrix`
- `context_save`
- `context_eval_save`
- `review_perspective`
- `review_synthesize`
- `review_list`
- `review_get`

### Task 3.3: Add IPC sender origin validation

**Objective:** Ensure only the app renderer can invoke privileged IPC handlers.

**Files:**
- Create: `electron/ipcSecurity.ts`
- Test: `electron/__tests__/ipcSecurity.test.ts`
- Modify: `electron/main.ts`

**Implementation approach:**
- Add `assertTrustedSender(event)`.
- Dev allowlist: `http://localhost:5173/`, `http://127.0.0.1:5173/`.
- Production allowlist: app `file://` URL for built `dist/index.html`.
- Call it at the start of destructive/sensitive handlers.

---

## Phase 4: Protect API Key and Config

### Task 4.1: Stop returning raw API keys to renderer

**Objective:** Prevent `window.bujo.configGet()` from exposing the full secret.

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/bujo.d.ts`
- Modify: `src/services/desktop.ts`
- Modify: `src/components/SettingsView.tsx`
- Test: `electron/__tests__/config.test.ts`

**Implementation approach:**
`config_get` returns:
```ts
{
  has_api_key: boolean,
  api_key_preview: string,
  provider: 'minimax' | 'openrouter',
  model: string,
  vault_path: string,
  theme: string
}
```

`config_save` behavior:
- Blank/undefined `api_key`: preserve existing key.
- New non-empty `api_key`: save it.
- Explicit `clear_api_key: true`: remove it.
- Validate provider/model/theme.

### Task 4.2: Handle corrupt config and habits JSON safely

**Objective:** Avoid crashes or silent destructive resets.

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/habits.ts` if needed
- Test: `electron/__tests__/config.test.ts`
- Test: `electron/__tests__/habits.test.ts`

**Implementation approach:**
- `config_get` catches JSON parse errors and returns defaults plus `{ error: 'config unreadable' }`.
- For corrupt `habits.json`, rename to `habits.json.bak.<timestamp>` before returning empty defaults.
- Do not overwrite corrupt file until user creates/toggles a habit.

---

## Phase 5: Monthly CRUD and Source-Aware Entries

### Task 5.1: Add explicit source context for entries rendered in `EntryItem`

**Objective:** Stop monthly entries from using daily CRUD paths.

**Files:**
- Modify: `src/components/EntryItem.tsx`
- Modify: `src/components/DailyView.tsx`
- Modify: `src/components/MonthlyView.tsx`
- Modify: `src/types.ts`

**Implementation approach:**
Add prop:
```ts
source: { kind: 'daily'; date: string } | { kind: 'monthly'; monthKey: string }
```
DailyView passes daily source. MonthlyView passes monthly source.

### Task 5.2: Implement monthly update/delete IPC handlers

**Objective:** Allow monthly entries to be edited/deleted/status-changed correctly.

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/bujo.d.ts`
- Modify: `src/store/VaultContext.tsx`
- Test: `electron/__tests__/vaultFs.test.ts`

**New IPC methods:**
- `vault_update_monthly_entry(monthKey, id, type, content)`
- `vault_delete_monthly_entry(monthKey, id)`

---

## Phase 6: Undo Transactions

### Task 6.1: Replace single-file undo records with transaction records

**Objective:** Make undo accurate for operations that modify multiple files.

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/vaultFs.ts`
- Test: `electron/__tests__/vaultFs.test.ts`

**Implementation approach:**
```ts
type UndoFileChange = { filePath: string; before: string | null; after: string | null }
type UndoRecord = { changes: UndoFileChange[]; description: string }
```

Rules:
- `before: null` means file did not exist before.
- `after: null` means file deleted.
- Undo applies all changes in reverse order.

**Migration test:**
1. Create source day with task.
2. Migrate to tomorrow.
3. Assert source marked migrated and destination has task.
4. Undo.
5. Assert source restored and destination restored/deleted as appropriate.

---

## Phase 7: AI/Review/Analytics UI Bugs

### Task 7.1: Fix heatmap render gate

**Objective:** Display heatmap data that is already loaded.

**Files:**
- Modify: `src/components/ReviewView.tsx`

**Fix:**
```tsx
{heatmapData && Object.keys(heatmapData).length > 0 && (...)}
```

### Task 7.2: Add force regeneration for review perspectives

**Objective:** Make the `regen` button actually regenerate.

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/bujo.d.ts`
- Modify: `src/services/desktop.ts`
- Modify: `src/components/ReviewView.tsx`

**Implementation:**
- Add optional `force = false` to `reviewPerspective(monthKey, perspective, force)`.
- If `force`, skip existing analysis cache and overwrite file after successful AI response.
- UI passes `force=true` when status already exists.

### Task 7.3: Add consistent prompt-injection framing to all LLM prompts

**Objective:** Reduce review/search/summary prompt injection risk.

**Files:**
- Modify: `electron/llm.ts`
- Modify: `electron/main.ts` review/synthesis direct prompts
- Test: `electron/__tests__/llm.test.ts`

---

## Phase 8: Command Palette and Keyboard Polish

### Task 8.1: Strip command words from command-palette capture content

**Objective:** `note idea` should store `idea`, not `note idea`.

**Files:**
- Modify: `src/lib/commandPalette.ts`
- Modify: `src/components/CommandPalette.tsx`
- Test: `src/lib/__tests__/commandPalette.test.ts`

**Implementation approach:**
Add helper:
```ts
export function captureContentForCommand(command: CommandPaletteItem, query: string): string
```

### Task 8.2: Fix DailyView clear shortcut target

**Objective:** Clear the currently viewed date, not always today.

**Files:**
- Modify: `src/components/DailyView.tsx`

**Fix:**
```ts
clearDay(dateRef.current)
```

### Task 8.3: Fix HabitView stale date across midnight

**Objective:** HabitView should use the current date while app remains open.

**Files:**
- Modify: `src/components/HabitView.tsx`

**Implementation approach:**
- Move `today` into component state.
- Refresh every minute or on window focus.
- Use current state value for loads/toggles.

---

## Phase 9: Search and Settings Behavior

### Task 9.1: Prevent stale search results from overwriting newer queries

**Objective:** Latest query should win even if earlier search resolves later.

**Files:**
- Modify: `src/components/SearchView.tsx`

**Implementation approach:**
- Use incrementing request ID in a ref.
- Only apply results if request ID matches latest.
- Guard invalid/missing `source_date` before formatting.

### Task 9.2: Clarify or fix settings export/clear-all scope

**Objective:** Export and clear-all should match user expectations.

**Files:**
- Modify: `src/components/SettingsView.tsx`
- Possibly add IPC: `vault_export_all`, `vault_clear_all`

**Recommended approach:**
- Prefer main-process vault-wide operations over renderer-memory-only `logs`.
- Export all vault directories/files into zip.
- Clear all should require confirmation and should operate only under validated `vaultPath`.

---

## Phase 10: Final Regression Pass

### Task 10.1: Add integration tests for the audit’s core failures

**Must-have regression tests:**
1. Stable IDs across parse.
2. Daily update using returned ID.
3. Daily delete using returned ID.
4. Daily migrate using returned ID.
5. Migration undo restores both files.
6. Path traversal rejected for date/month/template/perspective.
7. Monthly update/delete uses monthly file.
8. Heatmap renders when `heatmapData` exists.
9. Command palette strips capture prefixes.
10. Clear shortcut uses viewed date.

### Task 10.2: Run full verification

```bash
npm test && npm run lint && npm run build
```

### Task 10.3: Manual smoke test

```bash
npm run dev -- --host=localhost
```

Smoke checklist:
- Add entry.
- Mark done.
- Edit entry.
- Delete entry.
- Migrate entry to tomorrow.
- Undo migration.
- Add monthly entry, edit it, delete it.
- Open command palette and add note/event/priority.
- Open stats and verify heatmap displays if data exists.
- Open review and verify regen bypasses cache.
- Open habits and toggle today.

---

## Suggested Implementation Order Summary

1. Extract file-backed vault operations and add tests.
2. Fix stable IDs.
3. Fix renderer false-success/error handling.
4. Fix MigrationView async behavior and daily-only filtering.
5. Add IPC path validation and sender validation.
6. Protect API key/config handling.
7. Add monthly CRUD.
8. Replace undo with multi-file transactions.
9. Fix heatmap, review regen, prompt framing.
10. Fix command palette, clear shortcut, HabitView stale date.
11. Fix search race and settings export/clear-all scope.
12. Run full automated and manual verification.

## Definition of Done

- `npm test && npm run lint && npm run build` passes.
- Core entry actions work after reloading/parsing files.
- No IPC handler writes outside validated vault paths.
- Renderer can no longer read raw API keys through `configGet`.
- Monthly entries have source-correct CRUD.
- Migration actions do not disappear unless backend succeeds.
- Undo migration restores both source and destination.
- Heatmap and regen UI behave as advertised.
- Tests cover the audited regressions, not just pure utility behavior.
