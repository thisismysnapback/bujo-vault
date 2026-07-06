# UX & Logic Audit — BuJo Vault

I walked through every user flow as if I were the human sitting in front of the app. Here are the real issues I found, ordered by impact.

---

## 🔴 Critical — Breaks trust or loses data silently

### 1. Auto-completion happens invisibly

**What happens:** When you add an entry like `e called mom about passport`, the backend finds matching open tasks from the past 21 days and silently marks them `done`. The user sees **zero feedback** — no toast, no highlight, no indication that a task on June 2nd just got resolved.

**Why this is bad:** The whole point of BuJo is that *you* decide what's done. Having the system secretly mark tasks done behind your back breaks the journaling contract. The user will later look at their migration view and wonder "I never marked that done — did my data corrupt?"

**The code:** [vaultHandlers.ts](file:///C:/Users/Snapback/Desktop/bujoweb/electron/ipc/vaultHandlers.ts#L43-L48) returns `autoCompleted` array, but [VaultContext.tsx](file:///C:/Users/Snapback/Desktop/bujoweb/src/store/VaultContext.tsx#L185-L200) **completely ignores it**.

> [!CAUTION]
> Fix: Surface `autoCompleted` in the UI. After `addEntry` resolves, show a dismissible inline notification like:
> `// ✓ auto-resolved: "call mom about passport" (jun 2) — undo?`
> And reload the affected day's entries so the UI stays consistent.

---

### 2. Brain dump auto-detection causes false positives

**What happens:** Any input >60 chars without a prefix that contains 2+ commas, a period, or "and" is silently sent to the AI as a brain dump. Example:

> `remember to pick up the groceries, and also the dry cleaning, and the package from the post office`

This is clearly **one task**, but it triggers AI parsing because it has 2+ commas and "and". The user expected a single task entry but gets 3 separate AI-parsed entries.

**Worse:** The `isDumpMode` indicator (sparkle icon) uses a **different formula** than the actual submit handler — it doesn't check for the `split('.').length > 1` or `split(' and ').length > 1` conditions. So the user can see no sparkle icon but still trigger a dump on Enter.

**The code:** [InputBar.tsx:132](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/InputBar.tsx#L132) vs [InputBar.tsx:179](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/InputBar.tsx#L179)

> [!WARNING]
> Fix options:
> - **Option A (recommended):** Remove auto-detection entirely. Require the `dump` prefix. Brain dump is a power-user feature — it should be intentional.
> - **Option B:** Raise the threshold significantly (>120 chars AND 3+ commas). And sync the indicator formula with the submit formula.

---

### 3. Ctrl+Z hijacks text editing undo

**What happens:** [TopNav.tsx:37-46](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/TopNav.tsx#L37-L46) captures ALL Ctrl+Z globally with `e.preventDefault()`. This means:
- User is editing an entry (EntryItem double-click → edit mode)
- User types wrong text, hits Ctrl+Z to undo their typing
- Instead of undoing the text change, **the vault's last filesystem operation gets reverted**

The DailyView keyboard handler has an INPUT/TEXTAREA guard, but TopNav's Ctrl+Z handler does **not**.

> [!WARNING]
> Fix: Add the same guard as DailyView line 159:
> ```tsx
> const tag = (e.target as HTMLElement).tagName;
> if (tag === 'INPUT' || tag === 'TEXTAREA') return;
> ```

---

## 🟠 High — Confusing behavior that degrades the experience

### 4. Migration view shows today's tasks

**What happens:** [MigrationView.tsx:14-22](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/MigrationView.tsx#L14-L22) collects ALL active tasks from ALL daily dates. This includes tasks you added **5 minutes ago today**. The user opens migration view to review stale tasks and sees their fresh today-tasks mixed in, which makes no sense — you don't migrate today's tasks.

> [!IMPORTANT]
> Fix: Filter out today's date:
> ```tsx
> if (date === format(new Date(), 'yyyy-MM-dd')) continue;
> ```

### 5. Ctrl+Delete clears day without confirmation in keyboard flow

**What happens:** [DailyView.tsx:196-199](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/DailyView.tsx#L196-L199) — pressing Ctrl+Delete runs `clearDay()` directly without the `window.confirm()` gate. But the button-triggered `handleClearDay` at [line 248-258](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/DailyView.tsx#L248-L258) **does** confirm. So there are two paths to the same destructive action, and only one has a safety check.

> [!IMPORTANT]
> Fix: Route the keyboard shortcut through `handleClearDay` instead of calling `clearDay` directly.

### 6. Entry sort reorder is silent and disorienting

**What happens:** Entries are sorted by `entrySortKey` — priority first, then scheduled, then tasks, then notes, then events, then completed. When you add a note, it appears at the bottom. When you add a priority task, it jumps to the top. When you mark something done, it drops to the bottom.

The user types entries in order and the list silently rearranges. There's no animation or indication of where the entry went.

> [!TIP]
> Fix: Add a brief highlight animation when an entry changes position. Or at minimum, scroll to the entry after a status change so the user can track it.

---

## 🟡 Medium — Rough edges that confuse some users

### 7. "dump" prefix collision with real words

**What happens:** If you type `dump the old backup files from the server`, InputBar interprets this as a brain dump command and strips "dump " from the front, sending `the old backup files from the server` to the AI for parsing.

The [InputBar.tsx:119-120](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/InputBar.tsx#L119-L120) check is case-insensitive and matches any input starting with "dump ".

> [!NOTE]
> Fix: Require a colon or double-prefix: `dump:` or `dump dump`. Or change to a less collision-prone keyword like `brain:` or `parse:`.

### 8. Search loads entire vault when empty

**What happens:** [SearchView.tsx:21-31](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/SearchView.tsx) — when the query is empty, it loads ALL entries from ALL days into a flat list. For a vault with months of data, this could be hundreds/thousands of entries rendered at once. There's also no virtualization.

The empty-state text says `// type to search across all entries` but only shows while `query.trim() === ''`, and the entries are loaded underneath in the else branch. So the user sees the hint text OR the full list, depending on timing.

> [!NOTE]
> Fix: Show only the empty-state prompt when query is empty. Don't render all entries. The user came to search, not to browse everything.

### 9. FutureLog entries lack a `source` prop

**What happens:** [FutureLog.tsx:67-74](file:///C:/Users/Snapback/Desktop/bujoweb/src/components/FutureLog.tsx#L67-L74) — EntryItem is rendered without a `source` prop. This means `entrySource` falls back to `{ kind: 'daily', date: futureLogKey }`. When the user clicks edit/kill/migrate on a future entry, it calls `updateEntrySource` with `kind: 'daily'` which routes to the daily file update handler — but future entries live in a different file (`future/MONTH.md`).

This likely causes the action to silently fail or corrupt the wrong file.

> [!IMPORTANT]
> Fix: Either pass a proper source like `source={{ kind: 'future', monthKey: futureLogKey }}` and handle it in VaultContext, or add a future-specific EntryItem variant that calls the correct IPC handlers.

### 10. Coach nudge reappears every session

**What happens:** Nudge dismissal is stored in `sessionStorage` keyed by date. Session storage clears when the Electron app closes. So every time you open the app, the nudge comes back for today — even if you dismissed it earlier.

For some users this is a feature ("gentle reminder"). For others it's annoying noise they've already dismissed.

> [!NOTE]
> Fix: Use `localStorage` instead of `sessionStorage`, or limit nudge re-appearance to once per day (not once per session).

---

## 🟢 Nice-to-have — Polish items

### 11. Drag-and-drop has no visual feedback

**What happens:** Entries are draggable and TopNav tabs are drop targets, but:
- No drop zone highlighting when dragging over a valid target
- No cursor feedback (no `grabbing` cursor during drag)
- No success/failure indication after drop
- The "→ tmrw" drop target looks like plain text, not interactive

The user has no way to discover this feature exists.

### 12. Help overlay is undiscoverable

**What happens:** Press `?` to see keybindings. But `?` only works when focus is NOT in an input (since typing `?` in the input bar would just add a `?`). There's no visible button or link to open help. New users will never find it.

> [!TIP]
> Fix: Add a small `?` button to TopNav or the bottom bar.
