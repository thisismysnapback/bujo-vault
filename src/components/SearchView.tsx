import React, { useState, useEffect, useRef } from 'react';
import { useVault } from '../store/VaultContext';
import { EntryItem } from './EntryItem';
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import { Entry } from '../types';
import { getTerminalPrompt } from '../lib/utils';

interface SearchResult extends Entry {
  date: string;
}

export function SearchView() {
  const { searchVault } = useVault();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mode, setMode] = useState<'text' | 'semantic'>('text');
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!query.trim()) {
      requestIdRef.current += 1;
      setResults([]);
      setIsSearching(false);
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
  }, [query, mode, searchVault]);

  const grouped = results.reduce((acc, curr) => {
    if (!acc[curr.date]) acc[curr.date] = [];
    acc[curr.date].push(curr);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-command">
          {getTerminalPrompt()} $ search
        </div>
        <h1 className="page-title mb-4">
          search
        </h1>
        <div className="search-bar">
          <span className="search-icon"><Search size={16} /></span>
          <span className="search-prompt">&gt;</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search vault..."
            className="search-input"
          />
          <div className="search-mode-btns">
            <button
              onClick={() => setMode('text')}
              className={`search-mode-btn ${mode === 'text' ? 'search-mode-active' : 'search-mode-inactive'}`}
            >[text]</button>
            <button
              onClick={() => setMode('semantic')}
              className={`search-mode-btn ${mode === 'semantic' ? 'search-mode-active' : 'search-mode-inactive'}`}
            >[ai]</button>
          </div>
        </div>
      </div>

      <div className="page-scroll">
        {query.trim() === '' ? (
          <div className="page-empty">
            // type to search across all entries
          </div>
        ) : isSearching ? (
          <div className="page-empty">
            // searching...
          </div>
        ) : results.length === 0 ? (
          <div className="page-empty">
            // no results for "{query}"
          </div>
        ) : (
          <div>
            {(Object.entries(grouped) as [string, SearchResult[]][]).map(([date, entries]) => (
              <div key={date} className="search-group">
                <h3 className="search-group-header">
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
