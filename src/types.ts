export type EntryType = 'task' | 'done' | 'migrated' | 'killed' | 'note' | 'event' | 'scheduled' | 'priority';

export type EntryKind = 'task' | 'note' | 'event';
export type EntryStatus = 'active' | 'done' | 'killed' | 'migrated';

export interface EntryMeta {
  priority?: boolean;
  scheduledFor?: string | boolean;
  migratedTo?: string;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  status: EntryStatus;
  meta?: EntryMeta;
  /** Legacy markdown boundary type. Prefer kind/status/meta in app code. */
  type?: EntryType;
  content: string;
  timestamp: number;
  source_date?: string;
  display?: string;
}

export interface DailyLog {
  date: string;
  entries: Entry[];
}

export type ViewType = 'daily' | 'calendar' | 'monthly' | 'future' | 'migration' | 'review' | 'search' | 'coach' | 'settings' | 'habits';

export interface Habit {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'custom';
  created: string;
  archived: boolean;
  emoji?: string;
}

export interface HabitStats {
  habit: Habit;
  currentStreak: number;
  bestStreak: number;
  rate30d: number;
  totalCompletions: number;
}
