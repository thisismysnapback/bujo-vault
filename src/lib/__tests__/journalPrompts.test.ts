import { describe, expect, it } from 'vitest';
import {
  DAILY_PROMPT_COUNT,
  JOURNAL_PROMPTS,
  PROMPT_BANK_SIZE,
  buildPromptInput,
  drawDailyPrompts,
  freshShuffledDeck,
  remainingPromptsInCycle,
} from '../journalPrompts';

describe('journalPrompts', () => {
  it('ships exactly 31 unique prompts', () => {
    expect(JOURNAL_PROMPTS).toHaveLength(PROMPT_BANK_SIZE);
    expect(PROMPT_BANK_SIZE).toBe(31);
    const ids = JOURNAL_PROMPTS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns 3 prompts per day by default, all unique', () => {
    const draw = drawDailyPrompts(null, '2026-06-03');
    expect(draw.prompts).toHaveLength(DAILY_PROMPT_COUNT);
    expect(DAILY_PROMPT_COUNT).toBe(3);
    const ids = draw.prompts.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is stable within a single day for a given cycle', () => {
    const a = drawDailyPrompts(null, '2026-06-03');
    const next = drawDailyPrompts(
      { cycleId: a.cycleId, date: a.date, usedIds: [...a.prompts.map(p => p.id)], todaysIds: a.prompts.map(p => p.id) },
      '2026-06-03',
    );
    expect(next.prompts.map(p => p.id)).toEqual(a.prompts.map(p => p.id));
  });

  it('produces mostly different selections across many days within a cycle', () => {
    const seen = new Set<string>();
    let state: { cycleId: string; date: string; usedIds: string[]; todaysIds: string[] } | null = null;
    let sameAsFirstCount = 0;
    const firstDraw = drawDailyPrompts(null, '2026-06-01');
    seen.add(firstDraw.prompts.map(p => p.id).join('|'));
    state = {
      cycleId: firstDraw.cycleId,
      date: firstDraw.date,
      usedIds: firstDraw.prompts.map(p => p.id),
      todaysIds: firstDraw.prompts.map(p => p.id),
    };

    for (let i = 1; i < 14; i++) {
      const d = `2026-06-${String(i + 1).padStart(2, '0')}`;
      const result = drawDailyPrompts(state, d);
      const key = result.prompts.map(p => p.id).join('|');
      const firstKey = seen.values().next().value as string;
      if (key === firstKey) sameAsFirstCount++;
      seen.add(key);
      state = {
        cycleId: result.cycleId,
        date: result.date,
        usedIds: [...state!.usedIds, ...result.prompts.map(p => p.id)],
        todaysIds: result.prompts.map(p => p.id),
      };
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);
    expect(sameAsFirstCount).toBe(0);
  });

  it('does not repeat prompts until all 31 are exhausted, then starts a new cycle', () => {
    let state: { cycleId: string; date: string; usedIds: string[]; todaysIds: string[] } | null = null;
    let previous: string[] = [];
    let drewLastDay = false;
    for (let i = 0; i < 20 && !drewLastDay; i++) {
      const d = `2026-05-${String((i % 28) + 1).padStart(2, '0')}`;
      const result = drawDailyPrompts(state, d);
      const newIds = result.prompts.map(p => p.id);
      const overlap = newIds.filter(id => previous.includes(id));
      expect(overlap).toEqual([]);
      previous = newIds;
      state = {
        cycleId: result.cycleId,
        date: result.date,
        usedIds: [...(state?.usedIds ?? []), ...newIds],
        todaysIds: newIds,
      };
      if (remainingPromptsInCycle(state) === 0) drewLastDay = true;
    }
    expect(drewLastDay).toBe(true);

    const beforeCycle2 = new Set(state!.usedIds);
    const after = drawDailyPrompts(state, '2026-12-31');
    const newCycleIds = after.prompts.map(p => p.id);
    const intersection = newCycleIds.filter(id => beforeCycle2.has(id));
    expect(intersection.length).toBeGreaterThan(0);
    expect(after.cycleId).not.toBe(state!.cycleId);
  });

  it('freshShuffledDeck returns every prompt exactly once', () => {
    const deck = freshShuffledDeck('any-cycle');
    expect(deck.map(p => p.id).sort()).toEqual(JOURNAL_PROMPTS.map(p => p.id).sort());
  });

  it('buildPromptInput prefixes with note so the prompt becomes a journal note', () => {
    const prompt = JOURNAL_PROMPTS[0];
    const built = buildPromptInput(prompt);
    expect(built.startsWith('note ')).toBe(true);
    expect(built.slice('note '.length)).toBe(prompt.text);
  });

  it('handles invalid count gracefully', () => {
    const draw = drawDailyPrompts(null, '2026-06-03', 0);
    expect(draw.prompts).toHaveLength(0);
    const all = drawDailyPrompts(null, '2026-06-03', 99);
    expect(all.prompts.length).toBeLessThanOrEqual(JOURNAL_PROMPTS.length);
  });
});
