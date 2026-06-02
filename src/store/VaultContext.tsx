import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { DailyLog, Entry, EntryType, ViewType } from '../types';
import { entryToLegacyType, legacyTypeToEntryFields, normalizeEntry } from '../lib/entryModel';
import { getDesktopApi } from '../services/desktop';

export type EntrySource = { kind: 'daily'; date: string } | { kind: 'monthly'; monthKey: string };

interface VaultContextType {
  logs: Record<string, DailyLog>;
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  addEntry: (date: string, type: EntryType, content: string) => void;
  addMonthlyEntry: (monthKey: string, type: EntryType, content: string) => void;
  addFutureEntry: (monthLabel: string, content: string) => void;
  updateEntry: (date: string, id: string, updates: Partial<Entry>) => Promise<void>;
  updateEntrySource: (source: EntrySource, id: string, updates: Partial<Entry>) => Promise<void>;
  deleteEntry: (date: string, id: string) => Promise<void>;
  deleteEntrySource: (source: EntrySource, id: string) => Promise<void>;
  clearDay: (date: string) => Promise<void>;
  addMultipleEntries: (date: string, entries: { type: EntryType; content: string }[]) => void;
  migrateEntry: (entryId: string, fromDate: string, toDate: string) => Promise<void>;
  undo: () => Promise<void>;
  loadMonthly: (year: number, month: number) => void;
  loadFuture: () => void;
  searchVault: (query: string, mode?: 'text' | 'semantic') => Promise<Entry[]>;
  streak: number;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

function mapEntries(rawEntries: Array<{
  id: string;
  type?: string;
  kind?: Entry['kind'];
  status?: Entry['status'];
  meta?: Entry['meta'];
  content: string;
  timestamp: number;
  source_date?: string;
  display?: string;
}>): Entry[] {
  return rawEntries.map(e => normalizeEntry(e));
}

async function reloadAndMap(getter: () => Promise<any>, key: string, setLogs: React.Dispatch<React.SetStateAction<Record<string, DailyLog>>>) {
  const data = await getter();
  setLogs(prev => ({
    ...prev,
    [key]: {
      date: data.date,
      entries: mapEntries(data.entries),
    },
  }));
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<Record<string, DailyLog>>({});
  const [currentView, setCurrentView] = useState<ViewType>('daily');
  const [isLoaded, setIsLoaded] = useState(false);
  const [streak, setStreak] = useState(0);

  const loadDailyLogs = useCallback(async () => {
    const api = getDesktopApi();
    if (!api) return;
    try {
      const range = await api.getRange(30);
      const newLogs: Record<string, DailyLog> = {};
      for (const day of range) {
        newLogs[day.date] = {
          date: day.date,
          entries: mapEntries(day.entries),
        };
      }
      setLogs(prev => ({ ...prev, ...newLogs }));
      const s = await api.analyticsStreak();
      setStreak(s);
    } catch (err) {
      console.error('Failed to load daily logs:', err);
    }
  }, []);

  useEffect(() => {
    const api = getDesktopApi();
    if (api) {
      api.vaultEnsure().then(() => {
        return loadDailyLogs();
      }).then(() => {
        return api.startListening();
      }).then(() => {
        setIsLoaded(true);
      }).catch(err => {
        console.error('Failed to initialize vault:', err);
        setIsLoaded(true);
      });

      const unsubscribe = api.onVaultChanged((label: string) => {
        if (label.startsWith('day:')) {
          const date = label.slice(4);
          reloadDay(date);
        } else {
          loadDailyLogs();
        }
      });

      return () => unsubscribe();
    } else {
      setIsLoaded(true);
    }
  }, [loadDailyLogs]);

  const reloadDay = async (date: string) => {
    const api = getDesktopApi();
    if (!api) return;
    try {
      const day = await api.getDay(date);
      setLogs(prev => ({
        ...prev,
        [date]: {
          date: day.date,
          entries: mapEntries(day.entries),
        },
      }));
    } catch (err) {
      console.error('Failed to reload day:', err);
    }
  };

  const addEntry = async (date: string, type: EntryType, content: string) => {
    const api = getDesktopApi();
    if (api) {
      await api.appendEntry(date, type, content);
      await reloadAndMap(() => api.getDay(date), date, setLogs);
      setStreak(await api.analyticsStreak());
    } else {
      setLogs((prev) => {
        const dayLog = prev[date] || { date, entries: [] };
        const fields = legacyTypeToEntryFields(type);
        const newEntry: Entry = {
          id: crypto.randomUUID(),
          ...fields,
          type,
          content,
          timestamp: Date.now(),
        };
        return {
          ...prev,
          [date]: {
            ...dayLog,
            entries: [...dayLog.entries, newEntry],
          },
        };
      });
    }
  };

  const addMonthlyEntry = async (monthKey: string, type: EntryType, content: string) => {
    const api = getDesktopApi();
    if (api) {
      await api.appendMonthlyEntry(monthKey, type, content);
      await reloadAndMap(
        () => api.getMonthly(parseInt(monthKey.slice(0, 4)), parseInt(monthKey.slice(5, 7))),
        monthKey, setLogs
      );
    } else {
      setLogs((prev) => {
        const dayLog = prev[monthKey] || { date: monthKey, entries: [] };
        return {
          ...prev,
          [monthKey]: {
            ...dayLog,
            entries: [...dayLog.entries, {
              id: crypto.randomUUID(),
              ...legacyTypeToEntryFields(type),
              type,
              content,
              timestamp: Date.now(),
            }],
          },
        };
      });
    }
  };

  const addFutureEntry = async (monthLabel: string, content: string) => {
    const api = getDesktopApi();
    if (api) {
      await api.appendFutureEntry(monthLabel, content);
      await loadFuture();
    } else {
      const key = monthLabel + '-future';
      setLogs((prev) => {
        const dayLog = prev[key] || { date: key, entries: [] };
        return {
          ...prev,
          [key]: {
            ...dayLog,
            entries: [...dayLog.entries, {
              id: crypto.randomUUID(),
              kind: 'task',
              status: 'active',
              type: 'task' as EntryType,
              content,
              timestamp: Date.now(),
            }],
          },
        };
      });
    }
  };

  const updateEntry = async (date: string, id: string, updates: Partial<Entry>) => {
    const api = getDesktopApi();
    if (api) {
      const dayLog = logs[date];
      if (!dayLog) return;
      const entry = dayLog.entries.find(e => e.id === id);
      if (!entry) return;
      const legacyType = updates.type ? updates.type : entryToLegacyType(entry);
      const result = await api.updateEntry(date, id, legacyType, updates.content || entry.content);
      if (result.error) throw new Error(result.error);
      await reloadAndMap(() => api.getDay(date), date, setLogs);
    } else {
      setLogs((prev) => {
        const dayLog = prev[date];
        if (!dayLog) return prev;
        return {
          ...prev,
          [date]: {
            ...dayLog,
            entries: dayLog.entries.map((e) => {
              if (e.id !== id) return e;
              if (updates.type) {
                return normalizeEntry({ ...e, ...legacyTypeToEntryFields(updates.type), ...updates });
              }
              return { ...e, ...updates };
            }),
          },
        };
      });
    }
  };

  const deleteEntry = async (date: string, id: string) => {
    const api = getDesktopApi();
    if (api) {
      const result = await api.deleteEntry(date, id);
      if (result.error) throw new Error(result.error);
      await reloadAndMap(() => api.getDay(date), date, setLogs);
    } else {
      setLogs((prev) => {
        const dayLog = prev[date];
        if (!dayLog) return prev;
        return {
          ...prev,
          [date]: {
            ...dayLog,
            entries: dayLog.entries.filter((e) => e.id !== id),
          },
        };
      });
    }
  };

  const updateEntrySource = async (source: EntrySource, id: string, updates: Partial<Entry>) => {
    if (source.kind === 'daily') return updateEntry(source.date, id, updates);
    const api = getDesktopApi();
    if (api) {
      const monthLog = logs[source.monthKey];
      if (!monthLog) return;
      const entry = monthLog.entries.find(e => e.id === id);
      if (!entry) return;
      const legacyType = updates.type ? updates.type : entryToLegacyType(entry);
      const result = await api.updateMonthlyEntry(source.monthKey, id, legacyType, updates.content || entry.content);
      if (result.error) throw new Error(result.error);
      await reloadAndMap(
        () => api.getMonthly(parseInt(source.monthKey.slice(0, 4)), parseInt(source.monthKey.slice(5, 7))),
        source.monthKey, setLogs
      );
      return;
    }
    return updateEntry(source.monthKey, id, updates);
  };

  const deleteEntrySource = async (source: EntrySource, id: string) => {
    if (source.kind === 'daily') return deleteEntry(source.date, id);
    const api = getDesktopApi();
    if (api) {
      const result = await api.deleteMonthlyEntry(source.monthKey, id);
      if (result.error) throw new Error(result.error);
      await reloadAndMap(
        () => api.getMonthly(parseInt(source.monthKey.slice(0, 4)), parseInt(source.monthKey.slice(5, 7))),
        source.monthKey, setLogs
      );
      return;
    }
    return deleteEntry(source.monthKey, id);
  };

  const clearDay = async (date: string) => {
    const api = getDesktopApi();
    if (api) {
      const result = await api.clearDay(date);
      if (result.error) throw new Error(result.error);
    }
    setLogs(prev => {
      const newLogs = { ...prev };
      delete newLogs[date];
      return newLogs;
    });
  };

  const addMultipleEntries = async (date: string, entries: { type: EntryType; content: string }[]) => {
    for (const entry of entries) {
      await addEntry(date, entry.type, entry.content);
    }
  };

  const migrateEntry = async (entryId: string, fromDate: string, toDate: string) => {
    const api = getDesktopApi();
    if (api) {
      const result = await api.migrateEntry(fromDate, toDate, entryId);
      if (result.error) throw new Error(result.error);
      await reloadDay(fromDate);
      await reloadDay(toDate);
    } else {
      setLogs((prev) => {
        const sourceLog = prev[fromDate];
        if (!sourceLog) return prev;

        const entryIndex = sourceLog.entries.findIndex(e => e.id === entryId);
        if (entryIndex === -1) return prev;

        const entry = sourceLog.entries[entryIndex];
        const updatedSourceEntries = [...sourceLog.entries];

        updatedSourceEntries[entryIndex] = { ...entry, status: 'migrated', type: 'migrated' };

        const targetLog = prev[toDate] || { date: toDate, entries: [] };

        const newEntry: Entry = {
          ...entry,
          id: crypto.randomUUID(),
          status: 'active',
          type: 'task',
          timestamp: Date.now()
        };

        return {
          ...prev,
          [fromDate]: { ...sourceLog, entries: updatedSourceEntries },
          [toDate]: { ...targetLog, entries: [...targetLog.entries, newEntry] }
        };
      });
    }
  };

  const undo = useCallback(async () => {
    const api = getDesktopApi();
    if (api) {
      const result = await api.undo();
      if (result.error) {
        console.error('Undo failed:', result.error);
        return;
      }
      const filePaths = result.filePaths ?? (result.filePath ? [result.filePath] : []);
      for (const filePath of filePaths) {
        const dayMatch = filePath.match(/[\\/]daily[\\/](.+)\.md$/);
        if (dayMatch) await reloadDay(dayMatch[1]);
        const monthMatch = filePath.match(/[\\/]monthly[\\/](.+)\.md$/);
        if (monthMatch) {
          const [year, month] = monthMatch[1].split('-').map(Number);
          await loadMonthly(year, month);
        }
      }
    }
  }, []);

  const loadMonthly = useCallback(async (year: number, month: number) => {
    const api = getDesktopApi();
    if (!api) return;
    const monthData = await api.getMonthly(year, month);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    setLogs(prev => ({
      ...prev,
      [monthKey]: {
        date: monthData.date,
        entries: mapEntries(monthData.entries),
      },
    }));
  }, []);

  const loadFuture = useCallback(async () => {
    const api = getDesktopApi();
    if (!api) return;
    const futureData = await api.getFuture();
    const newLogs: Record<string, DailyLog> = {};
    for (const [monthKey, items] of Object.entries(futureData)) {
      const key = monthKey + '-future';
      newLogs[key] = {
        date: key,
        entries: items.map(content => ({
          id: crypto.randomUUID(),
          kind: 'task' as const,
          status: 'active' as const,
          type: 'task' as EntryType,
          content,
          timestamp: Date.now(),
        })),
      };
    }
    setLogs(prev => ({ ...prev, ...newLogs }));
  }, []);

  const searchVault = async (query: string, mode: 'text' | 'semantic' = 'text'): Promise<Entry[]> => {
    const api = getDesktopApi();
    if (api) {
      const results = await api.search(query, mode);
      return results.map(e => normalizeEntry(e));
    }
    return [];
  };

  if (!isLoaded) return null;

  return (
    <VaultContext.Provider
      value={{
        logs,
        currentView,
        setCurrentView,
        addEntry,
        addMonthlyEntry,
        addFutureEntry,
        updateEntry,
        updateEntrySource,
        deleteEntry,
        deleteEntrySource,
        clearDay,
        addMultipleEntries,
        migrateEntry,
        undo,
        loadMonthly,
        loadFuture,
        searchVault,
        streak,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (context === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}
