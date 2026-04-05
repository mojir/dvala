import { getDb, idbClear, idbGet, idbPut, SAVED_PROGRAMS_STORE } from './idb'

export interface SavedProgram {
  id: string
  name: string
  code: string
  context: string
  createdAt: number
  updatedAt: number
  locked: boolean
}

const STATE_KEY = 'state'

let programCache: SavedProgram[] = []

function normalizePrograms(entries: SavedProgram[]): { entries: SavedProgram[]; changed: boolean } {
  let changed = false
  const usedIds = new Set<string>()

  const normalized = entries.map(entry => {
    const existingId = typeof entry.id === 'string' ? entry.id.trim() : ''
    const needsNewId = existingId === '' || usedIds.has(existingId)
    const id = needsNewId ? crypto.randomUUID() : existingId
    usedIds.add(id)
    if (id !== entry.id)
      changed = true
    return id === entry.id ? entry : { ...entry, id }
  })

  return { entries: normalized, changed }
}

export function initPrograms(): Promise<void> {
  return idbGet<SavedProgram[]>(SAVED_PROGRAMS_STORE, STATE_KEY).then(entries => {
    const normalized = normalizePrograms(entries ?? [])
    programCache = normalized.entries
    if (normalized.changed && getDb())
      idbPut(SAVED_PROGRAMS_STORE, STATE_KEY, normalized.entries)
  }).catch(() => {
    programCache = []
  })
}

export function getSavedPrograms(): SavedProgram[] {
  return programCache
}

export function setSavedPrograms(entries: SavedProgram[]): void {
  const normalized = normalizePrograms(entries)
  programCache = normalized.entries
  if (getDb()) idbPut(SAVED_PROGRAMS_STORE, STATE_KEY, normalized.entries)
}

export function clearAllPrograms(): void {
  programCache = []
  if (getDb()) idbClear(SAVED_PROGRAMS_STORE)
}
