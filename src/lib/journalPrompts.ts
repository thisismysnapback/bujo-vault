export interface JournalPrompt {
  id: string;
  text: string;
  tags: Array<'reflection' | 'gratitude' | 'letting-go' | 'focus' | 'mood' | 'cbt' | 'courage' | 'curiosity'>;
}

export const JOURNAL_PROMPTS: JournalPrompt[] = [
  { id: 'p01', text: "what's one thing on my mind right now", tags: ['reflection', 'focus'] },
  { id: 'p02', text: 'one small win from the last 24 hours', tags: ['gratitude'] },
  { id: 'p03', text: "one thing i'm ready to let go of", tags: ['letting-go'] },
  { id: 'p04', text: 'how my energy actually feels right now, no edits', tags: ['mood', 'reflection'] },
  { id: 'p05', text: 'the next step i can take in under five minutes', tags: ['focus'] },
  { id: 'p06', text: 'something i can say to myself with kindness today', tags: ['mood', 'reflection'] },
  { id: 'p07', text: "one thing i noticed today that i usually ignore", tags: ['curiosity', 'reflection'] },
  { id: 'p08', text: 'an open loop i can close before bed', tags: ['focus'] },
  { id: 'p09', text: 'someone or something i appreciate today and why', tags: ['gratitude'] },
  { id: 'p10', text: 'a thought that feels stuck — reframe it in one line', tags: ['cbt', 'reflection'] },
  { id: 'p11', text: 'the feeling underneath the feeling i keep returning to', tags: ['mood', 'cbt'] },
  { id: 'p12', text: 'a tiny pleasure i can give myself tonight', tags: ['mood', 'gratitude'] },
  { id: 'p13', text: 'what drained me today and what fed me', tags: ['reflection'] },
  { id: 'p14', text: 'a fear i can name out loud without solving it', tags: ['courage', 'reflection'] },
  { id: 'p15', text: "if today were a chapter title, what would it be", tags: ['curiosity'] },
  { id: 'p16', text: 'one thing i did today that future-me will thank me for', tags: ['gratitude', 'focus'] },
  { id: 'p17', text: 'a boundary i held or one i wish i had held', tags: ['courage', 'reflection'] },
  { id: 'p18', text: 'where in my body am i holding tension right now', tags: ['mood'] },
  { id: 'p19', text: 'a question i keep avoiding and one honest sentence about it', tags: ['courage', 'reflection'] },
  { id: 'p20', text: 'a memory that surfaced today and what it might be pointing to', tags: ['curiosity'] },
  { id: 'p21', text: 'what does "enough" look like for today', tags: ['focus', 'mood'] },
  { id: 'p22', text: 'a story i keep telling myself that might not be true', tags: ['cbt'] },
  { id: 'p23', text: 'one thing i can stop doing that would free up energy', tags: ['focus', 'letting-go'] },
  { id: 'p24', text: "someone i haven't thanked that i should", tags: ['gratitude'] },
  { id: 'p25', text: 'what i want to feel by the end of today and one way to get there', tags: ['focus', 'mood'] },
  { id: 'p26', text: 'a part of myself i keep criticizing — what does it need from me', tags: ['cbt', 'courage'] },
  { id: 'p27', text: 'the most honest sentence i can write right now', tags: ['courage'] },
  { id: 'p28', text: 'something beautiful i almost missed today', tags: ['curiosity', 'gratitude'] },
  { id: 'p29', text: 'a small commitment i can make to myself for the next 24 hours', tags: ['focus'] },
  { id: 'p30', text: 'what would i do today if no one would ever know', tags: ['courage'] },
  { id: 'p31', text: 'one thing i want to remember about today a year from now', tags: ['gratitude', 'reflection'] },
];

export const PROMPT_BANK_SIZE = JOURNAL_PROMPTS.length;
export const DAILY_PROMPT_COUNT = 3;

export interface PromptCycleState {
  cycleId: string;
  date: string;
  usedIds: string[];
  todaysIds: string[];
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function startNewCycleId(date: string, previousCycleId: string | null): string {
  const seed = fnv1a(`${date}::${previousCycleId ?? 'first'}::${Math.random()}`);
  return seed.toString(36);
}

export function freshShuffledDeck(cycleId: string): JournalPrompt[] {
  const seed = fnv1a(`deck::${cycleId}`);
  return shuffleSeeded(JOURNAL_PROMPTS, seed);
}

export interface DailyDrawResult {
  date: string;
  cycleId: string;
  prompts: JournalPrompt[];
  remainingInCycle: number;
  cycleExhausted: boolean;
}

export function drawDailyPrompts(
  state: PromptCycleState | null,
  date: string,
  count: number = DAILY_PROMPT_COUNT,
): DailyDrawResult {
  const remainingPool: JournalPrompt[] = state
    ? JOURNAL_PROMPTS.filter(p => !state.usedIds.includes(p.id))
    : JOURNAL_PROMPTS.slice();

  if (state && state.date === date && state.todaysIds.length === count) {
    const prompts = state.todaysIds
      .map(id => JOURNAL_PROMPTS.find(p => p.id === id))
      .filter((p): p is JournalPrompt => Boolean(p));
    if (prompts.length === count) {
      return {
        date,
        cycleId: state.cycleId,
        prompts,
        remainingInCycle: remainingPool.length,
        cycleExhausted: remainingPool.length === 0,
      };
    }
  }

  const cycleExhausted = remainingPool.length === 0;
  let cycleId = state?.cycleId ?? startNewCycleId(date, null);
  let usedIds = (state?.usedIds ?? []).slice();

  if (cycleExhausted) {
    cycleId = startNewCycleId(date, cycleId);
    usedIds = [];
  }

  const pool: JournalPrompt[] = cycleExhausted
    ? JOURNAL_PROMPTS.slice()
    : JOURNAL_PROMPTS.filter(p => !usedIds.includes(p.id));

  const seed = fnv1a(`draw::${date}::${cycleId}::${usedIds.length}`);
  const shuffled = shuffleSeeded(pool, seed);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));

  return {
    date,
    cycleId,
    prompts: picked,
    remainingInCycle: Math.max(0, pool.length - picked.length),
    cycleExhausted: false,
  };
}

export function buildPromptInput(prompt: JournalPrompt): string {
  return `note ${prompt.text}`;
}

export function remainingPromptsInCycle(state: PromptCycleState | null): number {
  if (!state) return JOURNAL_PROMPTS.length;
  return Math.max(0, JOURNAL_PROMPTS.length - state.usedIds.length);
}
