import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyView } from '../DailyView';
import type { DailyLog } from '../../types';

const updateEntry = vi.fn();
const clearDay = vi.fn();
const undo = vi.fn();
const dismissAutoCompletion = vi.fn();
const clearPendingNavigateDate = vi.fn();
let pendingNavigateDate: string | null = null;
let logs: Record<string, DailyLog> = {};
let promptMocks: Array<{ id: string; text: string; tags: ['focus'] }> = [];

vi.mock('../../store/VaultContext', () => ({
  useVault: () => ({
    logs,
    updateEntry,
    clearDay,
    undo,
    autoCompletions: [],
    dismissAutoCompletion,
    pendingNavigateDate,
    clearPendingNavigateDate,
  }),
}));

const loadTodayHabits = vi.fn();
const toggleHabitCompletion = vi.fn();
const getCoachNudge = vi.fn();
const getOriginalInput = vi.fn();
const summarizeDay = vi.fn();

vi.mock('../../services/desktop', () => ({
  getCoachNudge: (date: string) => getCoachNudge(date),
  getOriginalInput: (date: string) => getOriginalInput(date),
  loadTodayHabits: (date: string) => loadTodayHabits(date),
  summarizeDay: (date: string) => summarizeDay(date),
  toggleHabitCompletion: (habitId: string, date: string) => toggleHabitCompletion(habitId, date),
}));

vi.mock('../../lib/utils', () => ({
  getGreeting: () => 'keep going',
  getTerminalPrompt: () => 'tester@vault',
  getTodayDateString: () => '2026-06-03',
}));

vi.mock('../../lib/journalPrompts', () => ({
  buildPromptInput: (prompt: { text: string }) => `n ${prompt.text}`,
  drawDailyPrompts: () => ({ prompts: promptMocks, cycleId: 'cycle-1' }),
  remainingPromptsInCycle: () => 31 - promptMocks.length,
}));

vi.mock('../EntryItem', () => ({
  EntryItem: ({ entry, isFocused }: any) => (
    <div data-testid="entry" data-focused={isFocused ? 'true' : 'false'}>
      {entry.content}
    </div>
  ),
}));

vi.mock('../InputBar', () => ({
  InputBar: ({ date, prefill, onPrefillConsumed }: { date: string; prefill?: string; onPrefillConsumed?: () => void }) => (
    <div data-testid="input-bar">
      <span>{date}</span>
      {prefill && <button onClick={onPrefillConsumed}>{prefill}</button>}
    </div>
  ),
}));

describe('DailyView', () => {
  beforeEach(() => {
    updateEntry.mockReset();
    clearDay.mockReset();
    undo.mockReset();
    dismissAutoCompletion.mockReset();
    clearPendingNavigateDate.mockReset();
    loadTodayHabits.mockReset();
    toggleHabitCompletion.mockReset();
    getCoachNudge.mockReset();
    getOriginalInput.mockReset();
    summarizeDay.mockReset();
    pendingNavigateDate = null;
    promptMocks = [];
    logs = {
      '2026-06-03': {
        date: '2026-06-03',
        entries: [
          { id: 'task-1', kind: 'task', status: 'active', type: 'task', content: 'first task', timestamp: 1 },
        ],
      },
    };
    loadTodayHabits.mockResolvedValue({ habits: [], completedIds: [] });
    toggleHabitCompletion.mockResolvedValue({ completed: true });
    getCoachNudge.mockResolvedValue({ nudge: '', source: 'rule' });
    getOriginalInput.mockResolvedValue({ exists: false, content: '' });
    summarizeDay.mockResolvedValue({ summary: 'summary text' });
    (window as any).requestIdleCallback = (callback: () => void) => {
      callback();
      return 1;
    };
    (window as any).cancelIdleCallback = vi.fn();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('consumes pending date navigation from the vault context', async () => {
    pendingNavigateDate = '2026-06-05';

    render(<DailyView />);

    await waitFor(() => expect(clearPendingNavigateDate).toHaveBeenCalledOnce());
    expect(screen.getByText('log 2026-06-05')).toBeInTheDocument();
    expect(screen.getByTestId('input-bar')).toHaveTextContent('2026-06-05');
  });

  it('uses keyboard focus shortcuts to complete the focused task', () => {
    render(<DailyView />);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByTestId('entry')).toHaveAttribute('data-focused', 'true');

    fireEvent.keyDown(window, { key: 'x' });

    expect(updateEntry).toHaveBeenCalledWith('2026-06-03', 'task-1', { type: 'done' });
  });

  it('navigates with previous, next, and today date buttons', () => {
    render(<DailyView />);
    const buttons = screen.getAllByRole('button');

    fireEvent.click(buttons[0]);
    expect(screen.getByText('log 2026-06-02')).toBeInTheDocument();

    fireEvent.click(buttons[2]);
    expect(screen.getByText('log 2026-06-03')).toBeInTheDocument();

    fireEvent.click(buttons[2]);
    expect(screen.getByText('log 2026-06-04')).toBeInTheDocument();

    fireEvent.click(screen.getByText('today'));
    expect(screen.getByText('log 2026-06-03')).toBeInTheDocument();
  });

  it('renders entries in model sort order', () => {
    logs = {
      '2026-06-03': {
        date: '2026-06-03',
        entries: [
          { id: 'done-1', kind: 'task', status: 'done', type: 'done', content: 'done task', timestamp: 1 },
          { id: 'task-1', kind: 'task', status: 'active', type: 'task', content: 'plain task', timestamp: 2 },
          { id: 'priority-1', kind: 'task', status: 'active', type: 'priority', content: 'priority task', timestamp: 3, meta: { priority: true } },
        ],
      },
    };

    render(<DailyView />);

    expect(screen.getAllByTestId('entry').map(entry => entry.textContent)).toEqual([
      'priority task',
      'plain task',
      'done task',
    ]);
  });

  it('uses the keyboard kill shortcut on the focused task', () => {
    render(<DailyView />);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'k' });

    expect(updateEntry).toHaveBeenCalledWith('2026-06-03', 'task-1', { type: 'killed' });
  });

  it('asks before clearing a day and respects cancellation', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<DailyView />);

    fireEvent.click(screen.getByText('[clear all]'));
    expect(clearDay).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('[clear all]'));
    expect(clearDay).toHaveBeenCalledWith('2026-06-03');
  });

  it('routes the keyboard clear shortcut through the same cleanup as the button', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    getOriginalInput.mockResolvedValue({ exists: true, content: 'raw imported text' });
    render(<DailyView />);

    fireEvent.click(await screen.findByText('[original]'));
    expect(screen.getByText('raw imported text')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Delete', ctrlKey: true });

    await waitFor(() => expect(clearDay).toHaveBeenCalledWith('2026-06-03'));
    expect(confirm).toHaveBeenCalledWith('Clear all entries and original input for 2026-06-03?');
    expect(screen.queryByText('raw imported text')).not.toBeInTheDocument();
  });

  it('loads and toggles today habits inline', async () => {
    loadTodayHabits.mockResolvedValue({ habits: [{ id: 'habit-1', name: 'water' }], completedIds: [] });
    render(<DailyView />);

    await screen.findByText(/water/);
    fireEvent.click(screen.getByText(/water/));

    expect(toggleHabitCompletion).toHaveBeenCalledWith('habit-1', '2026-06-03');
    await waitFor(() => expect(screen.getByText('[x]')).toBeInTheDocument());
  });

  it('shows and dismisses coach nudges for the selected day', async () => {
    getCoachNudge.mockResolvedValue({ nudge: 'take one small step', source: 'rule' });
    render(<DailyView />);

    await screen.findByText('// coach: take one small step');
    fireEvent.click(screen.getAllByRole('button').at(-1)!);

    await waitFor(() => expect(screen.queryByText('// coach: take one small step')).not.toBeInTheDocument());
    expect(window.localStorage.getItem('bujo:nudge:dismissed:2026-06-03')).toBe('1');
  });

  it('prefills the input from a selected journal prompt', async () => {
    promptMocks = [{ id: 'prompt-1', text: 'name one honest thing', tags: ['focus'] }];
    render(<DailyView />);

    fireEvent.click(screen.getByText('// prompts for this day'));
    fireEvent.click(await screen.findByText('// name one honest thing'));

    expect(screen.getByTestId('input-bar')).toHaveTextContent('n name one honest thing');
  });
});
