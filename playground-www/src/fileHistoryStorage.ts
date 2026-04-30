import { SCRATCH_FILE_ID } from './scratchBuffer'
import type { HistoryEntry } from './StateHistory'
import { getDb, idbClear, idbGet, idbPut, openDb, FILE_HISTORIES_STORE } from './idb'

const STATE_KEY = 'state'

/** Legacy scratch history bucket key, retired in Phase 1.5 step 23h. */
const LEGACY_SCRATCH_KEY = '<scratch>'

interface PersistedFileHistory {
  history: HistoryEntry[]
  index: number
}

let historyCache: Record<string, PersistedFileHistory> = {}

export async function initFileHistories(): Promise<void> {
  try {
    await openDb()
    historyCache = (await idbGet<Record<string, PersistedFileHistory>>(FILE_HISTORIES_STORE, STATE_KEY)) ?? {}
    // Phase 1.5 step 23h: rename the legacy `<scratch>` history bucket onto
    // the scratch file's reserved ID. Pre-1.0 we don't owe a migration story,
    // but the silent rename keeps existing scratch undo/redo intact across
    // the cutover. Skips if the new ID is already populated (defense against
    // re-running the migration after a partial write).
    const legacy = historyCache[LEGACY_SCRATCH_KEY]
    if (legacy && !historyCache[SCRATCH_FILE_ID]) {
      const { [LEGACY_SCRATCH_KEY]: _legacy, ...rest } = historyCache
      historyCache = { ...rest, [SCRATCH_FILE_ID]: legacy }
      if (getDb()) idbPut(FILE_HISTORIES_STORE, STATE_KEY, historyCache)
    } else if (legacy) {
      const { [LEGACY_SCRATCH_KEY]: _drop, ...rest } = historyCache
      historyCache = rest
      if (getDb()) idbPut(FILE_HISTORIES_STORE, STATE_KEY, historyCache)
    }
  } catch {
    historyCache = {}
  }
}

export function getFileHistory(fileId: string): PersistedFileHistory | undefined {
  return historyCache[fileId]
}

export function setFileHistory(fileId: string, history: PersistedFileHistory): void {
  historyCache = { ...historyCache, [fileId]: history }
  if (getDb()) idbPut(FILE_HISTORIES_STORE, STATE_KEY, historyCache)
}

export function deleteFileHistory(fileId: string): void {
  if (!(fileId in historyCache)) return
  const { [fileId]: _removed, ...rest } = historyCache
  historyCache = rest
  if (getDb()) idbPut(FILE_HISTORIES_STORE, STATE_KEY, historyCache)
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

  if (!changed) return

  historyCache = nextCache
  if (getDb()) idbPut(FILE_HISTORIES_STORE, STATE_KEY, historyCache)
}

export function clearAllFileHistories(): void {
  historyCache = {}
  if (getDb()) idbClear(FILE_HISTORIES_STORE)
}
