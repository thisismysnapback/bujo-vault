import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryItem } from '../EntryItem';
import type { Entry } from '../../types';
import { entrySymbol } from '../../lib/entryModel';

const updateEntrySource = vi.fn();
const deleteEntrySource = vi.fn();

vi.mock('../../store/VaultContext', () => ({
  useVault: () => ({ updateEntrySource, deleteEntrySource }),
}));

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    kind: 'task',
    status: 'active',
    type: 'task',
    content: 'test task',
    timestamp: 1,
    ...overrides,
  };
}

describe('EntryItem', () => {
  beforeEach(() => {
    updateEntrySource.mockReset();
    deleteEntrySource.mockReset();
  });

  it('saves inline edits with Enter', () => {
    render(<EntryItem entry={entry()} date="2026-06-03" isFocused={false} />);

    fireEvent.click(screen.getByTitle('Edit'));
    const input = screen.getByDisplayValue('test task');
    fireEvent.change(input, { target: { value: 'edited task' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateEntrySource).toHaveBeenCalledWith({ kind: 'daily', date: '2026-06-03' }, 'entry-1', { content: 'edited task' });
  });

  it('cancels inline edits with Escape', () => {
    render(<EntryItem entry={entry()} date="2026-06-03" isFocused={false} />);

    fireEvent.doubleClick(screen.getByText('test task'));
    const input = screen.getByDisplayValue('test task');
    fireEvent.change(input, { target: { value: 'edited task' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(updateEntrySource).not.toHaveBeenCalled();
    expect(screen.getByText('test task')).toBeInTheDocument();
  });

  it('renders the correct symbol for entry kind, status, and metadata', () => {
    const cases: Array<Partial<Entry>> = [
      { kind: 'task', status: 'active', type: 'task' },
      { kind: 'task', status: 'done', type: 'done' },
      { kind: 'task', status: 'killed', type: 'killed' },
      { kind: 'task', status: 'migrated', type: 'migrated' },
      { kind: 'note', status: 'active', type: 'note' },
      { kind: 'event', status: 'active', type: 'event' },
      { kind: 'task', status: 'active', type: 'priority', meta: { priority: true } },
      { kind: 'task', status: 'active', type: 'scheduled', meta: { scheduledFor: '2026-06-04' } },
    ];

    for (const overrides of cases) {
      const current = entry(overrides);
      const { container, unmount } = render(<EntryItem entry={current} date="2026-06-03" isFocused={false} />);
      expect(container.querySelector('span')).toHaveTextContent(entrySymbol(current));
      unmount();
    }
  });

  it('toggles active tasks to done and done tasks back to active', () => {
    const { rerender, container } = render(<EntryItem entry={entry()} date="2026-06-03" isFocused={false} />);
    fireEvent.click(container.querySelector('span')!);
    expect(updateEntrySource).toHaveBeenCalledWith({ kind: 'daily', date: '2026-06-03' }, 'entry-1', { type: 'done' });

    updateEntrySource.mockReset();
    rerender(<EntryItem entry={entry({ status: 'done', type: 'done' })} date="2026-06-03" isFocused={false} />);
    fireEvent.click(container.querySelector('span')!);
    expect(updateEntrySource).toHaveBeenCalledWith({ kind: 'daily', date: '2026-06-03' }, 'entry-1', { type: 'task' });
  });

  it('wires hover actions and drag data', () => {
    const { container } = render(<EntryItem entry={entry()} date="2026-06-03" isFocused={false} />);

    fireEvent.click(screen.getByTitle('Migrate'));
    expect(updateEntrySource).toHaveBeenCalledWith({ kind: 'daily', date: '2026-06-03' }, 'entry-1', { type: 'migrated' });

    fireEvent.click(screen.getByTitle('Kill'));
    expect(updateEntrySource).toHaveBeenCalledWith({ kind: 'daily', date: '2026-06-03' }, 'entry-1', { type: 'killed' });

    fireEvent.click(screen.getByTitle('Delete'));
    expect(deleteEntrySource).toHaveBeenCalledWith({ kind: 'daily', date: '2026-06-03' }, 'entry-1');

    const setData = vi.fn();
    fireEvent.dragStart(container.firstElementChild!, {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith('application/json', JSON.stringify({ id: 'entry-1', date: '2026-06-03' }));
  });
});
