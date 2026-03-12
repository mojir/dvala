import type { Snapshot } from '../../src/evaluator/effectTypes'
import { getDb, idbClear, idbGet, idbPut, openDb, SAVED_SNAPSHOTS_STORE, TERMINAL_SNAPSHOTS_STORE } from './idb'

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

const STATE_KEY = 'state'

let savedCache: SavedSnapshot[] = []
let terminalCache: TerminalSnapshotEntry[] = []

export async function init(): Promise<void> {
  try {
    await openDb()
    savedCache = (await idbGet<SavedSnapshot[]>(SAVED_SNAPSHOTS_STORE, STATE_KEY)) ?? []
    terminalCache = (await idbGet<TerminalSnapshotEntry[]>(TERMINAL_SNAPSHOTS_STORE, STATE_KEY)) ?? []
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
  if (getDb()) idbPut(SAVED_SNAPSHOTS_STORE, STATE_KEY, entries)
}

export function getTerminalSnapshots(): TerminalSnapshotEntry[] {
  return terminalCache
}

export function setTerminalSnapshots(entries: TerminalSnapshotEntry[]): void {
  terminalCache = entries
  if (getDb()) idbPut(TERMINAL_SNAPSHOTS_STORE, STATE_KEY, entries)
}

export function clearAll(): void {
  savedCache = []
  terminalCache = []
  if (getDb()) {
    idbClear(SAVED_SNAPSHOTS_STORE)
    idbClear(TERMINAL_SNAPSHOTS_STORE)
  }
}
