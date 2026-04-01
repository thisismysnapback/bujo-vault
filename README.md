# BuJo Vault

Desktop bullet journal app. Electron + React + TypeScript + Tailwind. Terminal aesthetic, monospace throughout.

## Develop

```
npm install
npm run electron:dev
```

## Build

```
npm run build
npx electron-builder --win
```

Output: `dist-electron/win-unpacked/BuJo Vault.exe`

## Navigation

Top tab bar: `log | stats | coach | search | settings`

Log sub-tabs: `today | calendar | monthly | future | migrate`

Drag entries onto `monthly`, `future`, or `→ tmrw` to migrate them.

## Stats view

- **quick glance** — all-time days tracked, avg completion, perfect days
- **streaks** — current + best streak
- **completion rates** — period filter `[14d] [30d] [60d] [90d] [180d] [365d]` with trend vs previous period, weekday/weekend split
- **contributions** — GitHub-style heatmap of the past year
- **day of week** — per-weekday completion bar chart for the selected period

## Vault

Entries stored as markdown in `~/bujo-vault/`:

```
daily/        YYYY-MM-DD.md
monthly/      YYYY-MM.md
future/       future.md
perspectives/ 6 review prompts
analysis/     generated reviews
```

## Entry prefixes

```
t / task     task
n / note     note
e / event    event
p / *        priority
x / done     done
k / kill     killed
< / >        scheduled / migrated
```

Suffix `!` or words `important`/`urgent` also mark priority.
Long input (>60 chars, no prefix) is auto-routed to AI brain-dump parser.

## Config

API key and model via `~/.bujo-electron/config.json` or Settings view.
Uses OpenRouter (`OPENROUTER_API_KEY` env var also accepted).

Based on [bujo-ai](https://github.com/naungmon/bujo-ai).
