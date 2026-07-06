export type EntryKind = 'task' | 'note' | 'event'
export type EntryStatus = 'active' | 'done' | 'killed' | 'migrated'

export interface EntryMeta {
  priority?: boolean
  scheduledFor?: string | boolean
  migratedTo?: string
}
