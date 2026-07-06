import { ipcMain } from 'electron'
import { buildHabitCompletionMatrix, buildHabitStats, toggleHabitCompletion, type HabitEntry, type HabitsFile } from '../habits'
import { assertTrustedSender } from '../ipcSecurity'

export interface HabitHandlerDeps {
  readHabitsFile: () => HabitsFile
  writeHabitsFile: (data: HabitsFile) => void
  makeId: () => string
  localDateStr: (offsetDays?: number) => string
}

export function registerHabitHandlers(deps: HabitHandlerDeps): void {
  ipcMain.handle('habits_list', async () => {
    const data = deps.readHabitsFile()
    return data.habits.filter(h => !h.archived)
  })

  ipcMain.handle('habits_create', async (event, name: string, frequency: string, emoji?: string) => {
    assertTrustedSender(event)
    const data = deps.readHabitsFile()
    const habit: HabitEntry = {
      id: deps.makeId(),
      name,
      frequency: (frequency as HabitEntry['frequency']) || 'daily',
      created: deps.localDateStr(0),
      archived: false,
      ...(emoji ? { emoji } : {}),
    }
    data.habits.push(habit)
    deps.writeHabitsFile(data)
    return habit
  })

  ipcMain.handle('habits_update', async (event, id: string, updates: Partial<Pick<HabitEntry, 'name' | 'frequency' | 'emoji' | 'archived'>>) => {
    assertTrustedSender(event)
    const data = deps.readHabitsFile()
    const idx = data.habits.findIndex(h => h.id === id)
    if (idx === -1) return { success: false, error: 'habit not found' }
    data.habits[idx] = { ...data.habits[idx], ...updates }
    deps.writeHabitsFile(data)
    return { success: true }
  })

  ipcMain.handle('habits_delete', async (event, id: string) => {
    assertTrustedSender(event)
    const data = deps.readHabitsFile()
    const idx = data.habits.findIndex(h => h.id === id)
    if (idx === -1) return { success: false, error: 'habit not found' }
    data.habits[idx].archived = true
    deps.writeHabitsFile(data)
    return { success: true }
  })

  ipcMain.handle('habits_toggle', async (event, id: string, date: string) => {
    assertTrustedSender(event)
    const result = toggleHabitCompletion(deps.readHabitsFile(), id, date)
    deps.writeHabitsFile(result.data)
    return { completed: result.completed }
  })

  ipcMain.handle('habits_stats', async () => {
    return buildHabitStats(deps.readHabitsFile(), deps.localDateStr(0))
  })

  ipcMain.handle('habits_matrix', async (_, startDate: string, days: number) => {
    return buildHabitCompletionMatrix(deps.readHabitsFile(), startDate, days)
  })
}
