import type { Snapshot } from '../../src/evaluator/effectTypes'

export interface SavedSnapshot {
  kind: 'saved'
  snapshot: Snapshot
  savedAt: number
  locked: boolean
  name?: string
}

export interface TerminalSnapshotEntry {
  kind: 'terminal'
  snapshot: Snapshot
  savedAt: number
  resultType: 'completed' | 'error'
  result?: string
}

const DB_NAME = 'dvala-playground'
const DB_VERSION = 1
const SAVED_STORE = 'saved-snapshots'
const TERMINAL_STORE = 'terminal-snapshots'
const STATE_KEY = 'state'

let db: IDBDatabase | null = null
let savedCache: SavedSnapshot[] = []
let terminalCache: TerminalSnapshotEntry[] = []

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = e => {
      const database = (e.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(SAVED_STORE)) {
        database.createObjectStore(SAVED_STORE)
      }
      if (!database.objectStoreNames.contains(TERMINAL_STORE)) {
        database.createObjectStore(TERMINAL_STORE)
      }
    }
    request.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    request.onerror = e => reject((e.target as IDBOpenDBRequest).error ?? new Error('IDBOpenDBRequest failed'))
  })
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db!.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error ?? new Error('IDBRequest failed'))
  })
}

function idbPut(store: string, key: string, value: unknown): void {
  const tx = db!.transaction(store, 'readwrite')
  tx.objectStore(store).put(value, key)
}

export async function init(): Promise<void> {
  try {
    db = await openDB()
    savedCache = (await idbGet<SavedSnapshot[]>(SAVED_STORE, STATE_KEY)) ?? []
    terminalCache = (await idbGet<TerminalSnapshotEntry[]>(TERMINAL_STORE, STATE_KEY)) ?? []
  } catch {
    savedCache = []
    terminalCache = []
  }
}

export function getSavedSnapshots(): SavedSnapshot[] {
  return savedCache
}

export function setSavedSnapshots(entries: SavedSnapshot[]): void {
  savedCache = entries
  if (db) idbPut(SAVED_STORE, STATE_KEY, entries)
}

export function getTerminalSnapshots(): TerminalSnapshotEntry[] {
  return terminalCache
}

export function setTerminalSnapshots(entries: TerminalSnapshotEntry[]): void {
  terminalCache = entries
  if (db) idbPut(TERMINAL_STORE, STATE_KEY, entries)
}

export function clearAll(): void {
  savedCache = []
  terminalCache = []
  if (db) {
    const tx = db.transaction([SAVED_STORE, TERMINAL_STORE], 'readwrite')
    tx.objectStore(SAVED_STORE).clear()
    tx.objectStore(TERMINAL_STORE).clear()
  }
}
