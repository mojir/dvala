import type { HistoryEntry } from './StateHistory'
import { getDb, idbClear, idbGet, idbPut, openDb, FILE_HISTORIES_STORE } from './idb'

const STATE_KEY = 'state'

interface PersistedFileHistory {
  history: HistoryEntry[]
  index: number
}

let historyCache: Record<string, PersistedFileHistory> = {}

export async function initFileHistories(): Promise<void> {
  try {
    await openDb()
    historyCache = (await idbGet<Record<string, PersistedFileHistory>>(FILE_HISTORIES_STORE, STATE_KEY)) ?? {}
  } catch {
    historyCache = {}
  }
}

export function getFileHistory(fileId: string): PersistedFileHistory | undefined {
  return historyCache[fileId]
}

export function setFileHistory(fileId: string, history: PersistedFileHistory): void {
  historyCache = { ...historyCache, [fileId]: history }
  if (getDb())
    idbPut(FILE_HISTORIES_STORE, STATE_KEY, historyCache)
}

export function deleteFileHistory(fileId: string): void {
  if (!(fileId in historyCache))
    return
  const { [fileId]: _removed, ...rest } = historyCache
  historyCache = rest
  if (getDb())
    idbPut(FILE_HISTORIES_STORE, STATE_KEY, historyCache)
}

export function pruneFileHistories(validFileIds: string[]): void {
  const validIds = new Set(validFileIds)
  let changed = false
  const nextCache: Record<string, PersistedFileHistory> = {}

  Object.entries(historyCache).forEach(([fileId, history]) => {
    if (validIds.has(fileId)) {
      nextCache[fileId] = history
    } else {
      changed = true
    }
  })

  if (!changed)
    return

  historyCache = nextCache
  if (getDb())
    idbPut(FILE_HISTORIES_STORE, STATE_KEY, historyCache)
}

export function clearAllFileHistories(): void {
  historyCache = {}
  if (getDb())
    idbClear(FILE_HISTORIES_STORE)
}
