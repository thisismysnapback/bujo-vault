import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InputBar } from '../InputBar';

const addEntry = vi.fn();
const addMultipleEntries = vi.fn();
const parseDump = vi.fn();

vi.mock('../../store/VaultContext', () => ({
  useVault: () => ({ addEntry, addMultipleEntries }),
}));

vi.mock('../../services/ai', () => ({
  parseDump: (text: string) => parseDump(text),
}));

vi.mock('../../services/desktop', () => ({
  retryDump: vi.fn(),
  saveOriginalInput: vi.fn(),
}));

describe('InputBar draft safety', () => {
  beforeEach(() => {
    addEntry.mockReset();
    addMultipleEntries.mockReset();
    parseDump.mockReset();
    window.localStorage.clear();
  });

  it('keeps a long brain-dump draft when AI parsing fails', async () => {
    parseDump.mockRejectedValue(new Error('API key missing'));
    const text = 'dump: this is a long thought stream, with multiple clauses, and it matters enough that losing it would be bad';

    render(<InputBar date="2026-06-03" />);
    const input = screen.getByPlaceholderText('type entry or dump a brain dump...');

    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText(/kept your draft/i)).toBeInTheDocument());
    expect(input).toHaveValue(text);
    expect(addEntry).not.toHaveBeenCalled();
    expect(addMultipleEntries).not.toHaveBeenCalled();
  });

  it('does not auto-parse long comma-heavy tasks without an explicit dump prefix', async () => {
    const text = 'remember to pick up the groceries, and also the dry cleaning, and the package from the post office';

    render(<InputBar date="2026-06-03" />);
    const input = screen.getByPlaceholderText('type entry or dump a brain dump...');

    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(addEntry).toHaveBeenCalledWith('2026-06-03', 'task', text));
    expect(parseDump).not.toHaveBeenCalled();
    expect(addMultipleEntries).not.toHaveBeenCalled();
  });

  it('restores an unsent draft from local storage for the same date', () => {
    window.localStorage.setItem('bujo:draft:2026-06-03', 'saved draft');

    render(<InputBar date="2026-06-03" />);

    expect(screen.getByPlaceholderText('type entry or dump a brain dump...')).toHaveValue('saved draft');
  });
});
