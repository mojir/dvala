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

export function initPrograms(): Promise<void> {
  return idbGet<SavedProgram[]>(SAVED_PROGRAMS_STORE, STATE_KEY).then(entries => {
    programCache = entries ?? []
  }).catch(() => {
    programCache = []
  })
}

export function getSavedPrograms(): SavedProgram[] {
  return programCache
}

export function setSavedPrograms(entries: SavedProgram[]): void {
  programCache = entries
  if (getDb()) idbPut(SAVED_PROGRAMS_STORE, STATE_KEY, entries)
}

export function clearAllPrograms(): void {
  programCache = []
  if (getDb()) idbClear(SAVED_PROGRAMS_STORE)
}
