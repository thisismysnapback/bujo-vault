import { describe, expect, it } from 'vitest';
import { entrySortKey, entrySymbol, entryToLegacyType, legacyTypeToEntryFields, normalizeEntry } from '../entryModel';
import type { Entry, EntryType } from '../../types';

const legacyTypes: EntryType[] = ['task', 'done', 'migrated', 'killed', 'note', 'event', 'scheduled', 'priority'];

function entry(partial: Partial<Entry>): Entry {
  return {
    id: partial.id ?? 'id',
    kind: partial.kind ?? 'task',
    status: partial.status ?? 'active',
    content: partial.content ?? 'content',
    timestamp: partial.timestamp ?? 1,
    ...(partial.meta ? { meta: partial.meta } : {}),
    ...(partial.type ? { type: partial.type } : {}),
  };
}

describe('entryModel', () => {
  it('round-trips legacy entry types through modern fields', () => {
    for (const type of legacyTypes) {
      expect(entryToLegacyType(legacyTypeToEntryFields(type))).toBe(type);
    }
  });

  it('normalizes legacy-only and modern-only entries', () => {
    expect(normalizeEntry({ id: 'a', type: 'scheduled', content: 'call tomorrow', timestamp: 1 })).toEqual(
      expect.objectContaining({ kind: 'task', status: 'active', meta: { scheduledFor: true }, type: 'scheduled' })
    );
    expect(normalizeEntry({ id: 'b', kind: 'note', status: 'active', content: 'thought', timestamp: 1 })).toEqual(
      expect.objectContaining({ kind: 'note', status: 'active', type: 'note' })
    );
  });

  it('returns a symbol for every legacy entry type', () => {
    for (const type of legacyTypes) {
      expect(entrySymbol(normalizeEntry({ id: type, type, content: type, timestamp: 1 }))).toBeTruthy();
    }
  });

  it('sorts scheduled tasks before regular tasks but after priorities', () => {
    expect([
      entrySortKey(entry({ meta: { priority: true } })),
      entrySortKey(entry({ meta: { scheduledFor: true } })),
      entrySortKey(entry({ kind: 'task', status: 'active' })),
      entrySortKey(entry({ kind: 'event' })),
      entrySortKey(entry({ kind: 'note' })),
      entrySortKey(entry({ status: 'killed' })),
      entrySortKey(entry({ status: 'done' })),
      entrySortKey(entry({ status: 'migrated' })),
    ]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
