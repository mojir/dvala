const DB_NAME = 'dvala-playground'
const DB_VERSION = 4

export const SAVED_SNAPSHOTS_STORE = 'saved-snapshots'
export const TERMINAL_SNAPSHOTS_STORE = 'terminal-snapshots'
export const SAVED_FILES_STORE = 'saved-files'
export const FILE_HISTORIES_STORE = 'file-histories'

let dbInstance: IDBDatabase | null = null

export function getDb(): IDBDatabase | null {
  return dbInstance
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(SAVED_SNAPSHOTS_STORE))
        db.createObjectStore(SAVED_SNAPSHOTS_STORE)
      if (!db.objectStoreNames.contains(TERMINAL_SNAPSHOTS_STORE))
        db.createObjectStore(TERMINAL_SNAPSHOTS_STORE)
      if (!db.objectStoreNames.contains(SAVED_FILES_STORE))
        db.createObjectStore(SAVED_FILES_STORE)
      if (!db.objectStoreNames.contains(FILE_HISTORIES_STORE))
        db.createObjectStore(FILE_HISTORIES_STORE)
    }
    request.onsuccess = e => {
      dbInstance = (e.target as IDBOpenDBRequest).result
      resolve(dbInstance)
    }
    request.onerror = e => reject((e.target as IDBOpenDBRequest).error ?? new Error('IDBOpenDBRequest failed'))
  })
}

export function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = dbInstance!.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error ?? new Error('IDBRequest failed'))
  })
}

export function idbPut(store: string, key: string, value: unknown): void {
  const tx = dbInstance!.transaction(store, 'readwrite')
  tx.objectStore(store).put(value, key)
}

export function idbClear(store: string): void {
  const tx = dbInstance!.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
}
