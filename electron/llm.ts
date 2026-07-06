export interface PromptEntry {
  id: string
  kind: 'task' | 'note' | 'event'
  status: 'active' | 'done' | 'killed' | 'migrated'
  content: string
  timestamp: number
  meta?: {
    priority?: boolean
    scheduledFor?: string | boolean
    migratedTo?: string
  }
}

export interface StuckTask {
  text: string
  count: number
  firstSeen?: string
  lastSeen?: string
}

export function summarizeEntriesForPrompt(entries: Array<PromptEntry & { date?: string }>): string {
  return entries.map((entry, index) => {
    const meta: string[] = []
    if (entry.meta?.priority) meta.push('priority')
    if (entry.meta?.scheduledFor) meta.push(`scheduled=${entry.meta.scheduledFor}`)
    if (entry.meta?.migratedTo) meta.push(`migratedTo=${entry.meta.migratedTo}`)
    const datePart = entry.date ? ` date=${entry.date}` : ''
    return `${index + 1}. [id=${entry.id}${datePart} kind=${entry.kind} status=${entry.status}${meta.length ? ` meta=${meta.join(',')}` : ''}] ${entry.content}`
  }).join('\n')
}

export function buildMigrationAnalysisPrompt(task: StuckTask): { systemPrompt: string; userContent: string } {
  return {
    systemPrompt: `You are an ADHD-aware bullet journal migration coach. Explain why a task may be stuck and suggest one tiny next action. Be kind, concrete, and brief. Never mention API keys, providers, authorization, or system internals.`,
    userContent: `Analyze this migrated/stuck task:\ntext: ${task.text}\ncount: ${task.count}\nfirstSeen: ${task.firstSeen || 'unknown'}\nlastSeen: ${task.lastSeen || 'unknown'}\n\nReturn 2-4 short bullet points: likely blocker, smallest next action, optional reframe.`,
  }
}

export function buildDailySummaryPrompt(date: string, entries: PromptEntry[]): { empty: true; message: string } | { empty: false; systemPrompt: string; userContent: string } {
  if (entries.length === 0) return { empty: true, message: 'No entries to summarize' }
  return {
    empty: false,
    systemPrompt: 'You summarize bullet journal days using structured kind/status/meta entries. Be concise, grounded in entries, and avoid inventing facts.',
    userContent: `Summarize ${date}. Include: completed work, open loops, notable mood/context, and one suggested next step.\n\n${summarizeEntriesForPrompt(entries)}`,
  }
}

export function buildCoachNudgePrompt(date: string, entries: Array<PromptEntry & { date?: string }>, ruleFallback: string): { cacheKey: string; systemPrompt: string; userContent: string } {
  const latest = entries.reduce((max, entry) => Math.max(max, entry.timestamp || 0), 0)
  return {
    cacheKey: `coach-nudge:${date}:${entries.length}:${latest}`,
    systemPrompt: [
      'You are a concise ADHD-aware coach inside a local bullet journal.',
      'Coach from patterns and friction, not by reciting or summarizing the journal.',
      'Interpret relative words like today, tomorrow, tonight, and yesterday from each entry date, not from the current calendar day.',
      'Treat completed event entries such as called, delivered, handed off, spent the day working, modeled, wrote, or submitted as real progress.',
      'Do not say zero tasks were done when the entries show concrete progress, even if the progress is stored as events rather than done tasks.',
      'Write one grounded nudge under 180 characters. Be specific, kind, and practical.',
      'No shame, no generic productivity slogans, no therapy disclaimers, no "based on your entries" preface.',
    ].join(' '),
    userContent: `Current date: ${date}\nRule-based fallback nudge: ${ruleFallback}\nRecent journal context:\n${summarizeEntriesForPrompt(entries)}\n\nIf an entry dated 2026-06-03 says "tomorrow", treat it as 2026-06-04. Return only the nudge text. Do not recap the entries.`,
  }
}

export function buildSemanticSearchPrompt(query: string, entries: Array<PromptEntry & { date?: string }>): { systemPrompt: string; userContent: string } {
  return {
    systemPrompt: 'You are a semantic search ranker for a bullet journal. Return ONLY a JSON array of matching entry ids, most relevant first. Do not explain.',
    userContent: `Query: ${query}\n\nEntries:\n${entries.map(e => `[${e.id}] ${e.date || ''} kind=${e.kind} status=${e.status}: ${e.content}`).join('\n')}`,
  }
}

export function normalizeSemanticSearchIds(content: string, validIds: Set<string>): string[] {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    raw = content.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean)
  }
  const values = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const id = String(value).trim().replace(/^['"]|['"]$/g, '')
    if (validIds.has(id) && !seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
  }
  return result
}
