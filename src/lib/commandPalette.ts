import { EntryType, ViewType } from '../types';

export type CommandPaletteItemKind = 'navigation' | 'action' | 'capture';

export interface CommandPaletteItem {
  id: string;
  kind: CommandPaletteItemKind;
  label: string;
  description: string;
  keywords: string[];
  shortcut?: string;
  view?: ViewType;
  entryType?: EntryType;
  priority: number;
}

export interface CommandPaletteBuildOptions {
  currentView: ViewType;
  today: string;
  hasEntriesToday: boolean;
}

const NAV_ITEMS: Array<Omit<CommandPaletteItem, 'kind' | 'priority'>> = [
  { id: 'nav:daily', label: 'Go to today', description: 'Open the daily log', keywords: ['log', 'today', 'daily'], shortcut: 'g t', view: 'daily' },
  { id: 'nav:calendar', label: 'Go to calendar', description: 'Browse days on the calendar', keywords: ['calendar', 'date'], shortcut: 'g c', view: 'calendar' },
  { id: 'nav:monthly', label: 'Go to monthly', description: 'Open the monthly log', keywords: ['month', 'monthly'], shortcut: 'g m', view: 'monthly' },
  { id: 'nav:future', label: 'Go to future log', description: 'Open future planning', keywords: ['future', 'plan'], shortcut: 'g f', view: 'future' },
  { id: 'nav:habits', label: 'Go to habits', description: 'Track habits and streaks', keywords: ['habit', 'habits', 'streak'], shortcut: 'g h', view: 'habits' },
  { id: 'nav:migration', label: 'Go to migration', description: 'Review pending tasks', keywords: ['migrate', 'migration', 'stuck'], shortcut: 'g r', view: 'migration' },
  { id: 'nav:review', label: 'Go to stats', description: 'Open stats and monthly review', keywords: ['stats', 'review', 'analytics'], shortcut: 'g s', view: 'review' },
  { id: 'nav:coach', label: 'Go to coach', description: 'Open coaching insights', keywords: ['coach', 'nudge'], shortcut: 'g o', view: 'coach' },
  { id: 'nav:search', label: 'Go to search', description: 'Search across the vault', keywords: ['search', 'find'], shortcut: 'g /', view: 'search' },
  { id: 'nav:settings', label: 'Go to settings', description: 'Configure vault and AI provider', keywords: ['settings', 'config', 'provider'], shortcut: 'g ,', view: 'settings' },
];

const CAPTURE_ITEMS: Array<Omit<CommandPaletteItem, 'kind' | 'priority'>> = [
  { id: 'capture:task', label: 'Add task', description: 'Capture a task on today', keywords: ['task', 'todo', 'add'], shortcut: 't', entryType: 'task' },
  { id: 'capture:note', label: 'Add note', description: 'Capture a note on today', keywords: ['note', 'thought', 'add'], shortcut: 'n', entryType: 'note' },
  { id: 'capture:event', label: 'Add event', description: 'Capture an event on today', keywords: ['event', 'meeting', 'appointment', 'add'], shortcut: 'e', entryType: 'event' },
  { id: 'capture:priority', label: 'Add priority task', description: 'Capture a priority task on today', keywords: ['priority', 'important', 'urgent'], shortcut: '!', entryType: 'priority' },
];

export function buildCommandPaletteItems(options: CommandPaletteBuildOptions): CommandPaletteItem[] {
  const capture = CAPTURE_ITEMS.map((item, index) => ({
    ...item,
    kind: 'capture' as const,
    priority: item.id === 'capture:priority' ? 290 : 100 + index,
  }));
  const navigation = NAV_ITEMS.map((item, index) => ({
    ...item,
    kind: 'navigation' as const,
    priority: item.view === options.currentView ? 190 : 200 + index,
  }));
  const actions: CommandPaletteItem[] = [
    {
      id: 'action:undo',
      kind: 'action',
      label: 'Undo last change',
      description: 'Undo the most recent vault edit',
      keywords: ['undo', 'revert', 'cmd z', 'ctrl z'],
      shortcut: 'Cmd/Ctrl Z',
      priority: 300,
    },
  ];

  if (options.hasEntriesToday) {
    actions.push({
      id: 'action:clear-today',
      kind: 'action',
      label: `Clear today (${options.today})`,
      description: 'Delete all entries from today',
      keywords: ['clear', 'delete', 'today', 'reset'],
      shortcut: '⌘⌫',
      priority: 320,
    });
  }

  return [...capture, ...navigation, ...actions].sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreCommand(command: CommandPaletteItem, query: string): number {
  if (!query) return 0;
  const haystackParts = [command.label, command.description, command.shortcut ?? '', ...command.keywords].map(normalize);
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  let best = Number.POSITIVE_INFINITY;
  for (const part of haystackParts) {
    if (part === normalizedQuery) best = Math.min(best, 0);
    else if (part.startsWith(normalizedQuery)) best = Math.min(best, 1);
    else if (part.includes(normalizedQuery)) best = Math.min(best, 2);
    else if (normalizedQuery.split(' ').every(token => part.includes(token))) best = Math.min(best, 3);
  }
  return best;
}

export function filterCommandPaletteItems(commands: CommandPaletteItem[], query: string): CommandPaletteItem[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [...commands].sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));

  return commands
    .map(command => ({ command, score: scoreCommand(command, normalizedQuery) }))
    .filter(result => Number.isFinite(result.score))
    .sort((a, b) => a.score - b.score || a.command.priority - b.command.priority || a.command.label.localeCompare(b.command.label))
    .map(result => result.command);
}

export function captureContentForCommand(command: CommandPaletteItem, query: string): string {
  const trimmed = query.trim();
  if (command.kind !== 'capture' || !trimmed) return trimmed;
  const prefixesByType: Partial<Record<EntryType, RegExp>> = {
    task: /^(?:task|todo|t)[:\s]+/i,
    note: /^(?:note|thought|n)[:\s]+/i,
    event: /^(?:event|meeting|appointment|e)[:\s]+/i,
    priority: /^(?:priority|important|urgent|p)[:\s]+/i,
  };
  return trimmed.replace(prefixesByType[command.entryType ?? 'task'] ?? /^/, '').trim();
}

export function getCommandPalettePlaceholder(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `add task: ${trimmed}` : 'type a command or new task...';
}
