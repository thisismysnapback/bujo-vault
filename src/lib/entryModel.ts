import { Entry, EntryKind, EntryMeta, EntryStatus, EntryType } from '../types';

export function legacyTypeToEntryFields(type: string): { kind: EntryKind; status: EntryStatus; meta?: EntryMeta } {
  switch (type) {
    case 'done':
      return { kind: 'task', status: 'done' };
    case 'migrated':
      return { kind: 'task', status: 'migrated' };
    case 'killed':
      return { kind: 'task', status: 'killed' };
    case 'note':
      return { kind: 'note', status: 'active' };
    case 'event':
      return { kind: 'event', status: 'active' };
    case 'scheduled':
      return { kind: 'task', status: 'active', meta: { scheduledFor: true } };
    case 'priority':
      return { kind: 'task', status: 'active', meta: { priority: true } };
    case 'task':
    default:
      return { kind: 'task', status: 'active' };
  }
}

export function entryToLegacyType(entry: Pick<Entry, 'kind' | 'status' | 'meta'> & { type?: EntryType | string }): EntryType {
  if (entry.type) return entry.type as EntryType;
  if (entry.kind === 'note') return 'note';
  if (entry.kind === 'event') return 'event';
  if (entry.status === 'done') return 'done';
  if (entry.status === 'migrated') return 'migrated';
  if (entry.status === 'killed') return 'killed';
  if (entry.meta?.priority) return 'priority';
  if (entry.meta?.scheduledFor) return 'scheduled';
  return 'task';
}

export function normalizeEntry(raw: {
  id: string;
  type?: string;
  kind?: EntryKind;
  status?: EntryStatus;
  meta?: EntryMeta;
  content: string;
  timestamp: number;
  source_date?: string;
  display?: string;
}): Entry {
  const fields = raw.kind && raw.status
    ? { kind: raw.kind, status: raw.status, meta: raw.meta }
    : legacyTypeToEntryFields(raw.type ?? 'task');

  const meta = { ...fields.meta, ...raw.meta };

  return {
    id: raw.id,
    kind: fields.kind,
    status: fields.status,
    ...(Object.keys(meta).length ? { meta } : {}),
    type: (raw.type ?? entryToLegacyType({ kind: fields.kind, status: fields.status, meta })) as EntryType,
    content: raw.content,
    timestamp: raw.timestamp,
    source_date: raw.source_date,
    display: raw.display,
  };
}

export function entrySymbol(entry: Entry): string {
  if (entry.kind === 'note') return '–';
  if (entry.kind === 'event') return '○';
  if (entry.status === 'done') return '×';
  if (entry.status === 'migrated') return '>';
  if (entry.status === 'killed') return '~';
  if (entry.meta?.priority) return '★';
  if (entry.meta?.scheduledFor) return '←';
  return '·';
}

export function entrySortKey(entry: Entry): number {
  if (entry.kind === 'task' && entry.meta?.priority) return 0;
  if (entry.kind === 'task' && entry.meta?.scheduledFor) return 1;
  if (entry.kind === 'task' && entry.status === 'active') return 2;
  if (entry.kind === 'event') return 3;
  if (entry.kind === 'note') return 4;
  if (entry.status === 'killed') return 5;
  if (entry.status === 'done') return 6;
  if (entry.status === 'migrated') return 7;
  return 99;
}
