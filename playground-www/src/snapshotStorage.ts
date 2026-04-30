// Snapshot persistence — Phase 1.5 step 23i moved each snapshot to its own
// workspace file at `.dvala-playground/snapshots/<id>.json`. The entry's
// metadata (kind, timestamp, lock state, name, run-result fields) lives in
// the file's `code` field as a JSON-stringified payload. The previous
// `SAVED_SNAPSHOTS_STORE` / `TERMINAL_SNAPSHOTS_STORE` IDB array stores
// were retired; this module reads and writes through `fileStorage` so the
// snapshots travel with the rest of the workspace's persistence.
//
// **Why files, not arrays.** Phase 3 (CLI mode + `BridgeBackend`) treats
// `.dvala-playground/` like any other workspace path; the watcher reflects
// external edits to snapshot files into the playground. A per-file backing
// keeps web mode and CLI mode on the same shape — no per-mode storage
// adapter for snapshots, no migration when CLI lands.
//
// **Why no in-memory cache.** `fileStorage`'s own `fileCache` holds every
// workspace file — adding a parallel saved/terminal cache here was the
// pre-23i shape and is now dead weight: every read derives from the source
// of truth, parses the small JSON payload, and buckets by `kind`. Snapshot
// counts stay in the tens, so the parse cost on every list render is
// invisible.
//
// **API split.** `getSavedSnapshots()` / `getTerminalSnapshots()` survive
// as filtering wrappers over the workspace-file list. The 90 existing
// consumers in `scripts.ts` + `scripts/sidePanels.ts` keep their indexed
// access, sort order (saved: insertion order with newest first; terminal:
// newest first, ring-buffered to `MAX_TERMINAL_SNAPSHOTS`).

import type { Snapshot } from '../../src/evaluator/effectTypes'
import { SNAPSHOTS_FOLDER, isInSnapshotsFolder } from './filePath'
import { getWorkspaceFiles, setWorkspaceFiles } from './fileStorage'
import type { WorkspaceFile } from './fileStorage'
import { SAVED_SNAPSHOTS_STORE, TERMINAL_SNAPSHOTS_STORE, getDb, idbClear, openDb } from './idb'

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
  resultType: 'completed' | 'error' | 'halted'
  result?: string
}

type SnapshotEntry = SavedSnapshot | TerminalSnapshotEntry

/**
 * Boot init. Two responsibilities:
 *  - Open the IDB (so subsequent file writes can persist).
 *  - Wipe the legacy `SAVED_SNAPSHOTS_STORE` / `TERMINAL_SNAPSHOTS_STORE`
 *    arrays. Pre-1.0, no migration story owed; the user starts fresh.
 *    Idempotent — once cleared, the wipe is a no-op on every subsequent
 *    boot.
 */
export async function init(): Promise<void> {
  try {
    await openDb()
    if (getDb()) {
      idbClear(SAVED_SNAPSHOTS_STORE)
      idbClear(TERMINAL_SNAPSHOTS_STORE)
    }
  } catch {
    // Boot continues even if IDB is unavailable; reads later degrade
    // gracefully via empty workspace-file lists.
  }
}

/**
 * Read every snapshot workspace file once, parse the payloads, drop any
 * malformed entries. Used by `getSavedSnapshots` / `getTerminalSnapshots`
 * to derive the typed lists; not exported because the saved/terminal split
 * is the public API.
 */
function readAllSnapshotEntries(): { entry: SnapshotEntry; file: WorkspaceFile }[] {
  const out: { entry: SnapshotEntry; file: WorkspaceFile }[] = []
  for (const file of getWorkspaceFiles()) {
    if (!isInSnapshotsFolder(file.path)) continue
    try {
      const parsed = JSON.parse(file.code) as unknown
      if (!isSnapshotEntry(parsed)) continue
      out.push({ entry: parsed, file })
    } catch {
      // Malformed payload — skip. Pre-1.0; users who hand-edited a snapshot
      // file shouldn't crash the playground. The bad file stays on disk
      // until manually deleted (visible at the file-backend level only,
      // since the snapshots folder is hidden from the file tree).
    }
  }
  return out
}

function isSnapshotEntry(value: unknown): value is SnapshotEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.kind !== 'saved' && v.kind !== 'terminal') return false
  if (typeof v.snapshot !== 'object' || v.snapshot === null) return false
  if (typeof v.savedAt !== 'number') return false
  return true
}

/**
 * Saved snapshots — user-pinned checkpoints. Returned in newest-first order
 * (sorted by `savedAt`), matching the pre-23i contract callers depend on.
 */
export function getSavedSnapshots(): SavedSnapshot[] {
  return readAllSnapshotEntries()
    .map(({ entry }) => entry)
    .filter((entry): entry is SavedSnapshot => entry.kind === 'saved')
    .sort((a, b) => b.savedAt - a.savedAt)
}

/**
 * Recent terminal snapshots — auto-captured at the end of each run.
 * Newest-first; the ring-buffer cap is enforced by `setTerminalSnapshots`.
 */
export function getTerminalSnapshots(): TerminalSnapshotEntry[] {
  return readAllSnapshotEntries()
    .map(({ entry }) => entry)
    .filter((entry): entry is TerminalSnapshotEntry => entry.kind === 'terminal')
    .sort((a, b) => b.savedAt - a.savedAt)
}

/**
 * Replace the saved-snapshot list. Diffs against existing saved snapshot
 * files: writes new entries, updates changed ones in place, deletes any
 * saved file that didn't make it into `entries`. Terminal snapshot files
 * are left alone — they live in the same folder but have their own setter.
 */
export function setSavedSnapshots(entries: SavedSnapshot[]): void {
  writeKindedEntries('saved', entries)
}

export function setTerminalSnapshots(entries: TerminalSnapshotEntry[]): void {
  writeKindedEntries('terminal', entries)
}

function writeKindedEntries<E extends SnapshotEntry>(kind: E['kind'], entries: E[]): void {
  const allFiles = getWorkspaceFiles()

  // Walk the workspace files once to:
  //   - find existing snapshot files of the kind being rewritten (so we can
  //     drop them — the new `entries` list is the full replacement set)
  //   - build a snapshot.id → existing-WorkspaceFile lookup so re-writes
  //     preserve `id` and `createdAt` across path shifts. Path shifts
  //     happen when an entry's neighbours get added or deleted (see
  //     `snapshotPath`'s disambiguator), but the snapshot.id is permanent.
  const existingById = new Map<string, WorkspaceFile>()
  const existingOfKind: WorkspaceFile[] = []
  for (const file of allFiles) {
    if (!isInSnapshotsFolder(file.path)) continue
    let entryKind: SnapshotEntry['kind'] | null = null
    let snapshotId: string | null = null
    try {
      const parsed = JSON.parse(file.code) as unknown
      if (isSnapshotEntry(parsed)) {
        entryKind = parsed.kind
        snapshotId = parsed.snapshot.id
      }
    } catch {
      // Skip malformed; left untouched.
    }
    if (snapshotId !== null) existingById.set(snapshotId, file)
    if (entryKind === kind) existingOfKind.push(file)
  }

  const droppedOfKind = new Set(existingOfKind)
  const keep = allFiles.filter(file => !droppedOfKind.has(file))
  const now = Date.now()
  // Seed `seenPaths` with paths of surviving snapshot files (the other
  // kind that we're not rewriting). Without this, a saved snapshot at
  // savedAt=1000 written while a terminal snapshot already lives at
  // `1000.json` would collide on path — the disambiguator only knows
  // about same-batch collisions otherwise. `setWorkspaceFiles` would
  // silently rename one of them via `uniqueFilePath`, leaving the path
  // out of step with what `snapshotPath` would compute next time.
  const seenPaths = new Set<string>()
  for (const file of keep) {
    if (isInSnapshotsFolder(file.path)) seenPaths.add(file.path)
  }
  const written: WorkspaceFile[] = []

  for (const entry of entries) {
    const path = snapshotPath(entry, seenPaths)
    seenPaths.add(path)
    const code = JSON.stringify(entry)
    const existing = existingById.get(entry.snapshot.id)
    written.push({
      // Workspace-file id stays bonded to `snapshot.id` for the lifetime
      // of the snapshot — that's the stable identifier consumers (and
      // future tab keys, per 23j) can rely on, even when path shifts due
      // to disambiguator reordering.
      id: entry.snapshot.id,
      path,
      code,
      context: '',
      createdAt: existing?.createdAt ?? entry.savedAt ?? now,
      updatedAt: now,
      // Locked at the snapshot-entry level (saved snapshots can be locked
      // by the user); the workspace-file `locked` flag is decoupled — it
      // controls editor read-only state, which doesn't apply to snapshot
      // files since they aren't editable from the playground UI.
      locked: false,
    })
  }

  setWorkspaceFiles([...keep, ...written])
}

/**
 * Build the canonical file path for a snapshot entry. The path's id segment
 * is `<savedAt>` (millisecond timestamp) by default; if a sibling already
 * claimed that exact path during the current write batch we append
 * `-<n>` until we land on something free. The `seen` set is the per-batch
 * collision tracker; the workspace-file map is implicitly deduped by the
 * caller writing the full set in one `setWorkspaceFiles` call.
 */
function snapshotPath(entry: SnapshotEntry, seen: Set<string>): string {
  const base = `${SNAPSHOTS_FOLDER}/${entry.savedAt}.json`
  if (!seen.has(base)) return base
  let n = 2
  while (seen.has(`${SNAPSHOTS_FOLDER}/${entry.savedAt}-${n}.json`)) n += 1
  return `${SNAPSHOTS_FOLDER}/${entry.savedAt}-${n}.json`
}

/**
 * Clear every snapshot — both kinds. Used by the "Clear IndexedDB" flow
 * which also wipes workspace files separately. Only deletes files inside
 * the snapshots folder; workspace files elsewhere stay put.
 */
export function clearAll(): void {
  setWorkspaceFiles(getWorkspaceFiles().filter(file => !isInSnapshotsFolder(file.path)))
}
