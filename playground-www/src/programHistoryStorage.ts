import type { HistoryEntry } from './StateHistory'
import { getDb, idbClear, idbGet, idbPut, openDb, PROGRAM_HISTORIES_STORE } from './idb'

const STATE_KEY = 'state'

export interface PersistedProgramHistory {
  history: HistoryEntry[]
  index: number
}

let historyCache: Record<string, PersistedProgramHistory> = {}

export async function initProgramHistories(): Promise<void> {
  try {
    await openDb()
    historyCache = (await idbGet<Record<string, PersistedProgramHistory>>(PROGRAM_HISTORIES_STORE, STATE_KEY)) ?? {}
  } catch {
    historyCache = {}
  }
}

export function getProgramHistory(programId: string): PersistedProgramHistory | undefined {
  return historyCache[programId]
}

export function setProgramHistory(programId: string, history: PersistedProgramHistory): void {
  historyCache = { ...historyCache, [programId]: history }
  if (getDb())
    idbPut(PROGRAM_HISTORIES_STORE, STATE_KEY, historyCache)
}

export function deleteProgramHistory(programId: string): void {
  if (!(programId in historyCache))
    return
  const { [programId]: _removed, ...rest } = historyCache
  historyCache = rest
  if (getDb())
    idbPut(PROGRAM_HISTORIES_STORE, STATE_KEY, historyCache)
}

export function pruneProgramHistories(validProgramIds: string[]): void {
  const validIds = new Set(validProgramIds)
  let changed = false
  const nextCache: Record<string, PersistedProgramHistory> = {}

  Object.entries(historyCache).forEach(([programId, history]) => {
    if (validIds.has(programId)) {
      nextCache[programId] = history
    } else {
      changed = true
    }
  })

  if (!changed)
    return

  historyCache = nextCache
  if (getDb())
    idbPut(PROGRAM_HISTORIES_STORE, STATE_KEY, historyCache)
}

export function clearAllProgramHistories(): void {
  historyCache = {}
  if (getDb())
    idbClear(PROGRAM_HISTORIES_STORE)
}
