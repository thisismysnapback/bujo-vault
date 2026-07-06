import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '../CommandPalette';
import type { EntryType, ViewType } from '../../types';

const onClose = vi.fn();
const onNavigate = vi.fn();
const onAddEntry = vi.fn();
const onClearToday = vi.fn();
const onUndo = vi.fn();

function renderPalette(overrides: Partial<{
  currentView: ViewType;
  hasEntriesToday: boolean;
  onClose: () => void;
  onNavigate: (view: ViewType) => void;
  onAddEntry: (type: EntryType, content: string) => void;
  onClearToday: () => void;
  onUndo: () => void;
}> = {}) {
  return render(
    <CommandPalette
      currentView={overrides.currentView ?? 'daily'}
      hasEntriesToday={overrides.hasEntriesToday ?? false}
      onClose={overrides.onClose ?? onClose}
      onNavigate={overrides.onNavigate ?? onNavigate}
      onAddEntry={overrides.onAddEntry ?? onAddEntry}
      onClearToday={overrides.onClearToday ?? onClearToday}
      onUndo={overrides.onUndo ?? onUndo}
    />
  );
}

function paletteInput(): HTMLInputElement {
  return screen.getByPlaceholderText('type a command or new task...');
}

describe('CommandPalette', () => {
  beforeEach(() => {
    onClose.mockReset();
    onNavigate.mockReset();
    onAddEntry.mockReset();
    onClearToday.mockReset();
    onUndo.mockReset();
  });

  it('closes on Escape', () => {
    renderPalette();

    fireEvent.keyDown(paletteInput(), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('navigates to the exact matching view command with Enter', () => {
    renderPalette();

    const input = paletteInput();
    fireEvent.change(input, { target: { value: 'search' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('search');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses arrow-key selection before running a command', () => {
    renderPalette();

    const input = paletteInput();
    fireEvent.change(input, { target: { value: 'go' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('calendar');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a task from unmatched free text', () => {
    renderPalette();

    const input = paletteInput();
    fireEvent.change(input, { target: { value: 'water the plants' } });
    expect(screen.getByText('add task: water the plants')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAddEntry).toHaveBeenCalledWith('task', 'water the plants');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('captures typed content with the selected entry type', () => {
    renderPalette();

    const input = paletteInput();
    fireEvent.change(input, { target: { value: 'note: keep this thought' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAddEntry).toHaveBeenCalledWith('note', 'keep this thought');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs clear today when that action is available', () => {
    renderPalette({ hasEntriesToday: true });

    fireEvent.click(screen.getByText(/^Clear today/));

    expect(onClearToday).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
