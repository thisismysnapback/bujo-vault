import React, { useState, useEffect, useRef } from 'react';
import { useVault } from '../store/VaultContext';
import { EntryItem } from './EntryItem';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import { DailyLog, Entry } from '../types';

interface SearchResult extends Entry {
  date: string;
}

export function SearchView() {
  const { searchVault, logs } = useVault();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mode, setMode] = useState<'text' | 'semantic'>('text');
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!query.trim()) {
      const allResults: SearchResult[] = [];
      for (const [date, log] of Object.entries(logs) as [string, DailyLog][]) {
        for (const entry of log.entries) {
          allResults.push({ ...entry, date });
        }
      }
      allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setResults(allResults);
      return;
    }

    const requestId = ++requestIdRef.current;
    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const ipcResults = await searchVault(query, mode);
        const mapped: SearchResult[] = ipcResults
          .map(e => ({ ...e, date: (e as any).source_date || '' }))
          .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
        if (requestId === requestIdRef.current) setResults(mapped);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        if (requestId === requestIdRef.current) setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query, mode, logs, searchVault]);

  const grouped = results.reduce((acc, curr) => {
    if (!acc[curr.date]) acc[curr.date] = [];
    acc[curr.date].push(curr);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '48px 32px 16px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          ryan@bujo.vault $ search
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)', margin: '4px 0 16px' }}>
          search
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <span style={{ color: 'var(--text-faint)', marginRight: '8px' }}><Search size={16} /></span>
          <span style={{ color: 'var(--text-faint)', marginRight: '8px', fontSize: '14px' }}>&gt;</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search vault..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', padding: '8px 0', fontFamily: 'inherit', fontSize: '14px' }}
          />
          <div style={{ display: 'flex', gap: '4px', marginLeft: '12px' }}>
            <button onClick={() => setMode('text')} style={{ background: 'transparent', border: 'none', color: mode === 'text' ? 'var(--gold)' : 'var(--text-faint)', fontFamily: 'monospace', cursor: 'pointer' }}>[text]</button>
            <button onClick={() => setMode('semantic')} style={{ background: 'transparent', border: 'none', color: mode === 'semantic' ? 'var(--gold)' : 'var(--text-faint)', fontFamily: 'monospace', cursor: 'pointer' }}>[ai]</button>
          </div>
        </div>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: 'auto', padding: '16px 32px', maxWidth: '768px', width: '100%', margin: '0 auto' }}>
        {query.trim() === '' ? (
          <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>
            // type to search across all entries
          </div>
        ) : isSearching ? (
          <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>
            // searching...
          </div>
        ) : results.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>
            // no results for "{query}"
          </div>
        ) : (
          <div>
            {(Object.entries(grouped) as [string, SearchResult[]][]).map(([date, entries]) => (
              <div key={date} style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', paddingBottom: '8px', marginBottom: '8px', borderTop: '1px solid var(--border)' }}>
                  {format(new Date(date + 'T12:00:00'), 'MMM do, yyyy')}
                </h3>
                {entries.map((entry) => (
                  <EntryItem
                    key={entry.id}
                    entry={entry}
                    date={date}
                    source={{ kind: 'daily', date }}
                    isFocused={false}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
