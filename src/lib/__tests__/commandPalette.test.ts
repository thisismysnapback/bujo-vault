import { describe, expect, it } from 'vitest';
import {
  buildCommandPaletteItems,
  captureContentForCommand,
  filterCommandPaletteItems,
  getCommandPalettePlaceholder,
  parseFreeTextCapture,
} from '../commandPalette';

describe('command palette model', () => {
  it('builds navigation, action, and capture commands', () => {
    const commands = buildCommandPaletteItems({ currentView: 'daily', today: '2026-06-02', hasEntriesToday: true });

    expect(commands.map(command => command.id)).toContain('nav:search');
    expect(commands.map(command => command.id)).toContain('action:undo');
    expect(commands.map(command => command.id)).toContain('capture:task');
    expect(commands.map(command => command.id)).toContain('action:clear-today');
  });

  it('filters by label, keywords, and shortcut text while keeping highest-ranked matches first', () => {
    const commands = buildCommandPaletteItems({ currentView: 'daily', today: '2026-06-02', hasEntriesToday: true });

    expect(filterCommandPaletteItems(commands, 'stats').map(command => command.id)).toEqual(['nav:review']);
    expect(filterCommandPaletteItems(commands, 'habit').map(command => command.id)[0]).toBe('nav:habits');
    expect(filterCommandPaletteItems(commands, 'cmd z').map(command => command.id)).toEqual(['action:undo']);
  });

  it('returns deterministic empty-query ordering grouped by command priority', () => {
    const commands = buildCommandPaletteItems({ currentView: 'daily', today: '2026-06-02', hasEntriesToday: false });

    expect(filterCommandPaletteItems(commands, '').slice(0, 4).map(command => command.id)).toEqual([
      'capture:task',
      'capture:note',
      'capture:event',
      'nav:daily',
    ]);
    expect(filterCommandPaletteItems(commands, '').map(command => command.id)).not.toContain('action:clear-today');
  });

  it('uses a typed capture query as the placeholder preview', () => {
    expect(getCommandPalettePlaceholder('buy oat milk')).toBe('add task: buy oat milk');
    expect(getCommandPalettePlaceholder('')).toBe('type a command or new task...');
  });

  it('strips capture command prefixes from stored content', () => {
    const commands = buildCommandPaletteItems({ currentView: 'daily', today: '2026-06-02', hasEntriesToday: false });
    const note = commands.find(command => command.id === 'capture:note')!;
    const event = commands.find(command => command.id === 'capture:event')!;
    const priority = commands.find(command => command.id === 'capture:priority')!;

    expect(captureContentForCommand(note, 'note idea')).toBe('idea');
    expect(captureContentForCommand(event, 'event team sync')).toBe('team sync');
    expect(captureContentForCommand(priority, 'priority ship audit fixes')).toBe('ship audit fixes');
  });

  it('parses free-text capture prefixes before falling back to tasks', () => {
    expect(parseFreeTextCapture('note: keep this thought')).toEqual({ type: 'note', content: 'keep this thought' });
    expect(parseFreeTextCapture('event team sync')).toEqual({ type: 'event', content: 'team sync' });
    expect(parseFreeTextCapture('priority ship audit fixes')).toEqual({ type: 'priority', content: 'ship audit fixes' });
    expect(parseFreeTextCapture('buy oat milk')).toEqual({ type: 'task', content: 'buy oat milk' });
  });
});
