import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultProvider, useVault } from '../VaultContext';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const emptyRange = [
  { date: '2026-06-03', entries: [], file_path: '/vault/daily/2026-06-03.md' },
];

function installApi(overrides: Record<string, unknown> = {}) {
  const api = {
    vaultEnsure: vi.fn().mockResolvedValue({ success: true }),
    getRange: vi.fn().mockResolvedValue(emptyRange),
    analyticsStreak: vi.fn().mockResolvedValue(0),
    startListening: vi.fn().mockResolvedValue(undefined),
    onVaultChanged: vi.fn().mockReturnValue(() => {}),
    appendEntry: vi.fn().mockResolvedValue({ success: true }),
    getDay: vi.fn().mockResolvedValue(emptyRange[0]),
    updateEntry: vi.fn().mockResolvedValue({ success: true }),
    deleteEntry: vi.fn().mockResolvedValue({ success: true }),
    clearDay: vi.fn().mockResolvedValue({ success: true }),
    migrateEntry: vi.fn().mockResolvedValue({ success: true }),
    undo: vi.fn().mockResolvedValue({ success: true }),
    getMonthly: vi.fn().mockResolvedValue({ date: '2026-06', entries: [] }),
    ...overrides,
  };
  (window as any).bujo = api;
  return api;
}

function Harness() {
  const { logs, addEntry, addMultipleEntries, updateEntry, deleteEntry, migrateEntry, undo } = useVault();
  const entries = logs['2026-06-03']?.entries ?? [];
  const targetEntries = logs['2026-06-04']?.entries ?? [];
  return (
    <div>
      <button onClick={() => void addEntry('2026-06-03', 'task', 'quick capture')}>add</button>
      <button onClick={() => void addMultipleEntries('2026-06-03', [
        { type: 'task', content: 'batch task' },
        { type: 'note', content: 'batch note' },
      ])}>add batch</button>
      <button onClick={() => void updateEntry('2026-06-03', entries[0]?.id ?? 'missing', { content: 'edited content' })}>edit content</button>
      <button onClick={() => void updateEntry('2026-06-03', entries[0]?.id ?? 'missing', { type: 'done' })}>done</button>
      <button onClick={() => void deleteEntry('2026-06-03', entries[0]?.id ?? 'missing')}>delete</button>
      <button onClick={() => void migrateEntry(entries[0]?.id ?? 'missing', '2026-06-03', '2026-06-04')}>migrate</button>
      <button onClick={() => void undo()}>undo</button>
      <div data-testid="entries">{entries.map(entry => `${entry.status}:${entry.content}`).join('|')}</div>
      <div data-testid="target-entries">{targetEntries.map(entry => `${entry.status}:${entry.content}`).join('|')}</div>
    </div>
  );
}

async function renderLoaded() {
  render(
    <VaultProvider>
      <Harness />
    </VaultProvider>
  );
  await screen.findByRole('button', { name: 'add' });
}

describe('VaultProvider optimistic renderer state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as any).bujo;
  });

  it('shows a newly captured entry immediately while disk persistence is still pending', async () => {
    const append = deferred<{ success: boolean }>();
    const api = installApi({ appendEntry: vi.fn().mockReturnValue(append.promise) });
    await renderLoaded();

    act(() => {
      screen.getByRole('button', { name: 'add' }).click();
    });

    expect(screen.getByTestId('entries')).toHaveTextContent('active:quick capture');
    expect(api.getDay).not.toHaveBeenCalled();

    await act(async () => {
      append.resolve({ success: true });
      await append.promise;
    });
  });

  it('updates and deletes entries immediately without waiting for a day reload', async () => {
    const update = deferred<{ success: boolean }>();
    const remove = deferred<{ success: boolean }>();
    const api = installApi({
      appendEntry: vi.fn().mockResolvedValue({ success: true }),
      updateEntry: vi.fn().mockReturnValue(update.promise),
      deleteEntry: vi.fn().mockReturnValue(remove.promise),
    });
    await renderLoaded();

    await act(async () => {
      screen.getByRole('button', { name: 'add' }).click();
    });
    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent('active:quick capture'));

    act(() => {
      screen.getByRole('button', { name: 'done' }).click();
    });
    expect(screen.getByTestId('entries')).toHaveTextContent('done:quick capture');
    expect(api.getDay).not.toHaveBeenCalled();

    await act(async () => {
      update.resolve({ success: true });
      await update.promise;
    });

    act(() => {
      screen.getByRole('button', { name: 'delete' }).click();
    });
    expect(screen.getByTestId('entries')).toHaveTextContent('');
    expect(api.getDay).not.toHaveBeenCalled();

    await act(async () => {
      remove.resolve({ success: true });
      await remove.promise;
    });
  });

  it('persists edited entry content through the desktop API', async () => {
    const api = installApi({
      getRange: vi.fn().mockResolvedValue([
        {
          date: '2026-06-03',
          entries: [{ id: 'entry-1', type: 'task', content: 'original content', timestamp: 1 }],
          file_path: '/vault/daily/2026-06-03.md',
        },
      ]),
    });
    await renderLoaded();

    await act(async () => {
      screen.getByRole('button', { name: 'edit content' }).click();
    });

    expect(screen.getByTestId('entries')).toHaveTextContent('active:edited content');
    expect(api.updateEntry).toHaveBeenCalledWith('2026-06-03', 'entry-1', 'task', 'edited content');
  });

  it('uses batch append when available and swaps optimistic entries for persisted entries', async () => {
    const api = installApi({
      appendEntriesBatch: vi.fn().mockResolvedValue({
        success: true,
        entries: [
          { id: 'persisted-1', type: 'task', content: 'batch task', timestamp: 1, source_date: '2026-06-03' },
          { id: 'persisted-2', type: 'note', content: 'batch note', timestamp: 2, source_date: '2026-06-03' },
        ],
      }),
    }) as ReturnType<typeof installApi> & { appendEntriesBatch: ReturnType<typeof vi.fn> };
    await renderLoaded();

    await act(async () => {
      screen.getByRole('button', { name: 'add batch' }).click();
    });

    expect(api.appendEntriesBatch).toHaveBeenCalledWith('2026-06-03', [
      { type: 'task', content: 'batch task' },
      { type: 'note', content: 'batch note' },
    ]);
    expect(api.appendEntry).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent('active:batch task|active:batch note'));
  });

  it('falls back to sequential single-entry appends when batch append is unavailable', async () => {
    const api = installApi();
    await renderLoaded();

    await act(async () => {
      screen.getByRole('button', { name: 'add batch' }).click();
    });

    expect(api.appendEntry).toHaveBeenCalledWith('2026-06-03', 'task', 'batch task');
    expect(api.appendEntry).toHaveBeenCalledWith('2026-06-03', 'note', 'batch note');
    expect(screen.getByTestId('entries')).toHaveTextContent('active:batch task|active:batch note');
  });

  it('reloads both days after a migrated entry succeeds', async () => {
    const api = installApi({
      getRange: vi.fn().mockResolvedValue([
        {
          date: '2026-06-03',
          entries: [{ id: 'entry-1', type: 'task', content: 'move me', timestamp: 1 }],
          file_path: '/vault/daily/2026-06-03.md',
        },
        { date: '2026-06-04', entries: [], file_path: '/vault/daily/2026-06-04.md' },
      ]),
      getDay: vi.fn((date: string) => Promise.resolve(date === '2026-06-03'
        ? { date, entries: [{ id: 'entry-1', type: 'migrated', content: 'move me', timestamp: 1 }] }
        : { date, entries: [{ id: 'entry-2', type: 'task', content: 'move me', timestamp: 2 }] })),
    });
    await renderLoaded();

    await act(async () => {
      screen.getByRole('button', { name: 'migrate' }).click();
    });

    expect(api.migrateEntry).toHaveBeenCalledWith('2026-06-03', '2026-06-04', 'entry-1');
    await waitFor(() => expect(screen.getByTestId('entries')).toHaveTextContent('migrated:move me'));
    expect(screen.getByTestId('target-entries')).toHaveTextContent('active:move me');
    expect(api.getDay).toHaveBeenCalledWith('2026-06-03');
    expect(api.getDay).toHaveBeenCalledWith('2026-06-04');
  });

  it('reloads affected daily and monthly files after undo', async () => {
    const api = installApi({
      undo: vi.fn().mockResolvedValue({
        success: true,
        filePaths: [
          'C:\\vault\\daily\\2026-06-03.md',
          'C:\\vault\\monthly\\2026-06.md',
        ],
      }),
    });
    await renderLoaded();

    await act(async () => {
      screen.getByRole('button', { name: 'undo' }).click();
    });

    expect(api.getDay).toHaveBeenCalledWith('2026-06-03');
    expect(api.getMonthly).toHaveBeenCalledWith(2026, 6);
  });
});
