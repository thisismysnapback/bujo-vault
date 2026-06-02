import { describe, expect, it } from 'vitest'
import {
  buildCoachNudgePrompt,
  buildDailySummaryPrompt,
  buildMigrationAnalysisPrompt,
  normalizeSemanticSearchIds,
  summarizeEntriesForPrompt,
} from '../llm'

const entries = [
  {
    id: 'a',
    kind: 'task' as const,
    status: 'done' as const,
    content: 'ship parser migration',
    timestamp: 10,
    meta: { priority: true },
  },
  {
    id: 'b',
    kind: 'note' as const,
    status: 'active' as const,
    content: 'felt scattered after lunch',
    timestamp: 20,
  },
]

describe('LLM prompt helpers', () => {
  it('serializes entries with kind/status/meta instead of legacy type', () => {
    const text = summarizeEntriesForPrompt(entries)

    expect(text).toContain('kind=task status=done meta=priority')
    expect(text).toContain('ship parser migration')
    expect(text).not.toContain('type=')
  })

  it('builds migration analysis prompt from stuck task history without secrets', () => {
    const prompt = buildMigrationAnalysisPrompt({ text: 'pay card', count: 3, firstSeen: '2026-05-01', lastSeen: '2026-06-01' })

    expect(prompt.systemPrompt).toContain('ADHD-aware bullet journal migration coach')
    expect(prompt.userContent).toContain('pay card')
    expect(prompt.userContent).toContain('count: 3')
    expect(prompt.userContent).not.toMatch(/api[_ -]?key|bearer|authorization/i)
  })

  it('builds daily summary prompt and returns empty message for empty days', () => {
    expect(buildDailySummaryPrompt('2026-06-02', [])).toEqual({ empty: true, message: 'No entries to summarize' })

    const prompt = buildDailySummaryPrompt('2026-06-02', entries)
    expect(prompt.empty).toBe(false)
    if ('message' in prompt) throw new Error('expected non-empty prompt')
    expect(prompt.userContent).toContain('2026-06-02')
    expect(prompt.userContent).toContain('kind=task status=done')
  })

  it('builds coach prompt with cache key derived from latest timestamp', () => {
    const prompt = buildCoachNudgePrompt('2026-06-02', entries, 'rule fallback')

    expect(prompt.cacheKey).toBe('coach-nudge:2026-06-02:2:20')
    expect(prompt.userContent).toContain('rule fallback')
    expect(prompt.userContent).toContain('kind=note status=active')
  })

  it('normalizes semantic search ids from json or newline output and ignores unknown ids', () => {
    expect(normalizeSemanticSearchIds('["b", "unknown", "a"]', new Set(['a', 'b']))).toEqual(['b', 'a'])
    expect(normalizeSemanticSearchIds('b\na', new Set(['a', 'b']))).toEqual(['b', 'a'])
  })
})
