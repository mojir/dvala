import { getDb, idbClear, idbGet, idbPut, SAVED_FILES_STORE } from './idb'

export interface SavedFile {
  id: string
  name: string
  code: string
  context: string
  createdAt: number
  updatedAt: number
  locked: boolean
}

const STATE_KEY = 'state'
export const DVALA_FILE_SUFFIX = '.dvala'

let fileCache: SavedFile[] = []

export function stripSavedFileSuffix(name: string): string {
  return name.trim().replace(/\.dvala$/i, '')
}

export function normalizeSavedFileName(name: string): string {
  return `${stripSavedFileSuffix(name)}${DVALA_FILE_SUFFIX}`
}

function normalizeFiles(entries: SavedFile[]): { entries: SavedFile[]; changed: boolean } {
  let changed = false
  const usedIds = new Set<string>()

  const normalized = entries.map(entry => {
    const existingId = typeof entry.id === 'string' ? entry.id.trim() : ''
    const needsNewId = existingId === '' || usedIds.has(existingId)
    const id = needsNewId ? crypto.randomUUID() : existingId
    const name = normalizeSavedFileName(entry.name)
    usedIds.add(id)
    if (id !== entry.id)
      changed = true
    if (name !== entry.name)
      changed = true
    return id === entry.id && name === entry.name ? entry : { ...entry, id, name }
  })

  return { entries: normalized, changed }
}

export function initFiles(): Promise<void> {
  return idbGet<SavedFile[]>(SAVED_FILES_STORE, STATE_KEY).then(entries => {
    const normalized = normalizeFiles(entries ?? [])
    fileCache = normalized.entries
    if (normalized.changed && getDb())
      idbPut(SAVED_FILES_STORE, STATE_KEY, normalized.entries)
  }).catch(() => {
    fileCache = []
  })
}

export function getSavedFiles(): SavedFile[] {
  return fileCache
}

export function setSavedFiles(entries: SavedFile[]): void {
  const normalized = normalizeFiles(entries)
  fileCache = normalized.entries
  if (getDb()) idbPut(SAVED_FILES_STORE, STATE_KEY, normalized.entries)
}

export function clearAllFiles(): void {
  fileCache = []
  if (getDb()) idbClear(SAVED_FILES_STORE)
}
