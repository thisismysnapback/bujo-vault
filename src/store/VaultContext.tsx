import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { DailyLog, Entry, EntryType, ViewType } from '../types';
import { entryToLegacyType, legacyTypeToEntryFields, normalizeEntry } from '../lib/entryModel';
import { getDesktopApi } from '../services/desktop';

export type EntrySource =
  | { kind: 'daily'; date: string }
  | { kind: 'monthly'; monthKey: string }
  | { kind: 'future'; monthLabel: string };

export type AutoCompletionNotice = {
  key: string;
  date: string;
  task: string;
  evidence: string;
  daysStalled: number;
};

interface VaultContextType {
  logs: Record<string, DailyLog>;
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  navigateToDate: (date: string) => void;
  pendingNavigateDate: string | null;
  clearPendingNavigateDate: () => void;
  addEntry: (date: string, type: EntryType, content: string) => Promise<void>;
  addMonthlyEntry: (monthKey: string, type: EntryType, content: string) => Promise<void>;
  addFutureEntry: (monthLabel: string, content: string) => Promise<void>;
  updateEntry: (date: string, id: string, updates: Partial<Entry>) => Promise<void>;
  updateEntrySource: (source: EntrySource, id: string, updates: Partial<Entry>) => Promise<void>;
  deleteEntry: (date: string, id: string) => Promise<void>;
  deleteEntrySource: (source: EntrySource, id: string) => Promise<void>;
  clearDay: (date: string) => Promise<void>;
  addMultipleEntries: (date: string, entries: { type: EntryType; content: string }[]) => Promise<void>;
  migrateEntry: (entryId: string, fromDate: string, toDate: string) => Promise<void>;
  undo: () => Promise<void>;
  loadMonthly: (year: number, month: number) => void;
  loadFuture: () => void;
  searchVault: (query: string, mode?: 'text' | 'semantic') => Promise<Entry[]>;
  streak: number;
  autoCompletions: AutoCompletionNotice[];
  dismissAutoCompletion: (key: string) => void;
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

function makeOptimisticEntry(date: string, type: EntryType, content: string): Entry {
  return normalizeEntry({
    id: `optimistic:${date}:${crypto.randomUUID()}`,
    ...legacyTypeToEntryFields(type),
    type,
    content,
    timestamp: Date.now(),
    source_date: date,
  });
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<Record<string, DailyLog>>({});
  const [currentView, setCurrentView] = useState<ViewType>('daily');
  const [pendingNavigateDate, setPendingNavigateDate] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [streak, setStreak] = useState(0);
  const [autoCompletions, setAutoCompletions] = useState<AutoCompletionNotice[]>([]);
  const pendingDayWritesRef = useRef(new Map<string, number>());

  const markDayWriteStart = (date: string) => {
    pendingDayWritesRef.current.set(date, (pendingDayWritesRef.current.get(date) ?? 0) + 1);
  };

  const markDayWriteDone = (date: string) => {
    const next = (pendingDayWritesRef.current.get(date) ?? 1) - 1;
    if (next <= 0) {
      window.setTimeout(() => pendingDayWritesRef.current.delete(date), 250);
    } else {
      pendingDayWritesRef.current.set(date, next);
    }
  };

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
          if (pendingDayWritesRef.current.has(date)) return;
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

  const navigateToDate = useCallback((date: string) => {
    setPendingNavigateDate(date);
    setCurrentView('daily');
  }, []);

  const clearPendingNavigateDate = useCallback(() => {
    setPendingNavigateDate(null);
  }, []);

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

  const recordAutoCompletions = async (matches?: Array<{ date: string; id: string; daysStalled: number; task: string; evidence: string }>) => {
    if (!matches?.length) return;
    const stamped = Date.now();
    const notices = matches.map(match => ({
      key: `${match.date}:${match.id}:${stamped}`,
      date: match.date,
      task: match.task,
      evidence: match.evidence,
      daysStalled: match.daysStalled,
    }));
    setAutoCompletions(prev => [...notices, ...prev].slice(0, 4));
    for (const match of matches) {
      await reloadDay(match.date);
    }
  };

  const dismissAutoCompletion = useCallback((key: string) => {
    setAutoCompletions(prev => prev.filter(item => item.key !== key));
  }, []);

  const addEntry = async (date: string, type: EntryType, content: string) => {
    const optimisticEntry = makeOptimisticEntry(date, type, content);
    setLogs((prev) => {
      const dayLog = prev[date] || { date, entries: [] };
      return {
        ...prev,
        [date]: {
          ...dayLog,
          entries: [...dayLog.entries, optimisticEntry],
        },
      };
    });

    const api = getDesktopApi();
    if (!api) return;

    try {
      markDayWriteStart(date);
      const result = await api.appendEntry(date, type, content) as {
        success?: boolean;
        entry?: any;
        autoCompleted?: Array<{ date: string; id: string; daysStalled: number; task: string; evidence: string }>;
        error?: string;
      };
      if (result.error) throw new Error(result.error);
      if (result.entry) {
        const persistedEntry = mapEntries([result.entry])[0];
        setLogs(prev => {
          const dayLog = prev[date];
          if (!dayLog) return prev;
          return {
            ...prev,
            [date]: {
              ...dayLog,
              entries: dayLog.entries.map(e => e.id === optimisticEntry.id ? persistedEntry : e),
            },
          };
        });
      }
      await recordAutoCompletions(result.autoCompleted);
      api.analyticsStreak().then(setStreak).catch(() => {});
    } catch (err) {
      console.error('Failed to add entry:', err);
      setLogs(prev => {
        const dayLog = prev[date];
        if (!dayLog) return prev;
        return {
          ...prev,
          [date]: { ...dayLog, entries: dayLog.entries.filter(e => e.id !== optimisticEntry.id) },
        };
      });
      throw err;
    } finally {
      markDayWriteDone(date);
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
    const dayLog = logs[date];
    if (!dayLog) return;
    const entry = dayLog.entries.find(e => e.id === id);
    if (!entry) return;
    const legacyType = updates.type ? updates.type : entryToLegacyType(entry);

    setLogs((prev) => {
      const currentLog = prev[date];
      if (!currentLog) return prev;
      return {
        ...prev,
        [date]: {
          ...currentLog,
          entries: currentLog.entries.map((e) => {
            if (e.id !== id) return e;
            if (updates.type) {
              return normalizeEntry({ ...e, ...legacyTypeToEntryFields(updates.type), ...updates });
            }
            return { ...e, ...updates };
          }),
        },
      };
    });

    const api = getDesktopApi();
    if (!api) return;

    markDayWriteStart(date);
    try {
      const result = await api.updateEntry(date, id, legacyType, updates.content || entry.content);
      if (result.error) {
        await reloadAndMap(() => api.getDay(date), date, setLogs);
        throw new Error(result.error);
      }
    } finally {
      markDayWriteDone(date);
    }
  };

  const deleteEntry = async (date: string, id: string) => {
    const dayLog = logs[date];
    if (!dayLog) return;

    setLogs((prev) => {
      const currentLog = prev[date];
      if (!currentLog) return prev;
      return {
        ...prev,
        [date]: {
          ...currentLog,
          entries: currentLog.entries.filter((e) => e.id !== id),
        },
      };
    });

    const api = getDesktopApi();
    if (!api) return;

    markDayWriteStart(date);
    try {
      const result = await api.deleteEntry(date, id);
      if (result.error) {
        await reloadAndMap(() => api.getDay(date), date, setLogs);
        throw new Error(result.error);
      }
    } finally {
      markDayWriteDone(date);
    }
  };

  const updateEntrySource = async (source: EntrySource, id: string, updates: Partial<Entry>) => {
    if (source.kind === 'daily') return updateEntry(source.date, id, updates);
    if (source.kind === 'future') {
      const api = getDesktopApi();
      const key = source.monthLabel + '-future';
      const futureLog = logs[key];
      const entry = futureLog?.entries.find(e => e.id === id);
      if (!entry) return;
      if (api?.updateFutureEntry) {
        const legacyType = updates.type ? updates.type : entryToLegacyType(entry);
        const result = await api.updateFutureEntry(source.monthLabel, entry.content, legacyType, updates.content || entry.content);
        if (result.error) throw new Error(result.error);
        await loadFuture();
      }
      return;
    }
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
    if (source.kind === 'future') {
      const api = getDesktopApi();
      const key = source.monthLabel + '-future';
      const futureLog = logs[key];
      const entry = futureLog?.entries.find(e => e.id === id);
      if (!entry) return;
      if (api?.deleteFutureEntry) {
        const result = await api.deleteFutureEntry(source.monthLabel, entry.content);
        if (result.error) throw new Error(result.error);
        await loadFuture();
      }
      return;
    }
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
      markDayWriteStart(date);
      try {
        const result = await api.clearDay(date);
        if (result.error) throw new Error(result.error);
      } finally {
        markDayWriteDone(date);
      }
    }
    setLogs(prev => {
      const newLogs = { ...prev };
      delete newLogs[date];
      return newLogs;
    });
  };

  const addMultipleEntries = async (date: string, entries: { type: EntryType; content: string }[]) => {
    const api = getDesktopApi();
    if (api?.appendEntriesBatch) {
      const optimisticEntries = entries.map(entry => makeOptimisticEntry(date, entry.type, entry.content));
      setLogs(prev => {
        const dayLog = prev[date] || { date, entries: [] };
        return {
          ...prev,
          [date]: {
            ...dayLog,
            entries: [...dayLog.entries, ...optimisticEntries],
          },
        };
      });

      try {
        markDayWriteStart(date);
        const result = await api.appendEntriesBatch(date, entries);
        if (result.error) throw new Error(result.error);
        if (result.entries) {
          const persistedEntries = mapEntries(result.entries);
          setLogs(prev => {
            const dayLog = prev[date];
            if (!dayLog) return prev;
            return {
              ...prev,
              [date]: {
                ...dayLog,
                entries: [
                  ...dayLog.entries.filter(e => !optimisticEntries.some(opt => opt.id === e.id)),
                  ...persistedEntries,
                ],
              },
            };
          });
        }
        await recordAutoCompletions(result.autoCompleted);
      } catch (err) {
        console.error('Failed to add entries batch:', err);
        setLogs(prev => {
          const dayLog = prev[date];
          if (!dayLog) return prev;
          return {
            ...prev,
            [date]: {
              ...dayLog,
              entries: dayLog.entries.filter(e => !optimisticEntries.some(opt => opt.id === e.id)),
            },
          };
        });
        throw err;
      } finally {
        markDayWriteDone(date);
      }
      return;
    }

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
        navigateToDate,
        pendingNavigateDate,
        clearPendingNavigateDate,
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
        autoCompletions,
        dismissAutoCompletion,
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
