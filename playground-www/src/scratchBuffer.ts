// Scratch buffer — backed by a single workspace file at
// `.dvala-playground/scratch.dvala`. Phase 1.5 step 23c moved persistence
// onto the same `FileBackend` that holds every other workspace file; step
// 23h then retired the legacy `<scratch>` tab key + `current-file-id ===
// null` sentinels — both `tabs.ts` and `current-file-id` now use the
// scratch file's reserved ID `__scratch__` like any regular file. The
// pinned-to-top entry in the file tree and the buffer-undeletable rule
// live in the explorer renderer; the tab strip keeps scratch sticky
// (no × button) by matching on `SCRATCH_FILE_ID` rather than a separate
// tab kind.

import { getWorkspaceFiles, setWorkspaceFiles } from './fileStorage'
import type { WorkspaceFile } from './fileStorage'

/** Canonical path of the scratch buffer's backing workspace file. */
export const SCRATCH_FILE_PATH = '.dvala-playground/scratch.dvala'

/**
 * Stable ID for the scratch file. Reserved sentinel; not a UUID — that's
 * fine because the file is hidden from the UI and only internal lookups
 * see this. After Phase 1.5 step 23h, this ID is also the scratch tab's
 * key in `open-tabs` / `active-tab-key`.
 */
export const SCRATCH_FILE_ID = '__scratch__'

/** True iff `path` is the scratch buffer's canonical path. */
export function isScratchPath(path: string): boolean {
  return path === SCRATCH_FILE_PATH
}

/** The scratch buffer's `WorkspaceFile`, or `undefined` before initialization. */
export function getScratchFile(): WorkspaceFile | undefined {
  return getWorkspaceFiles().find(f => f.path === SCRATCH_FILE_PATH)
}

/** Read the scratch buffer's persisted code. Empty string if missing. */
export function getScratchCode(): string {
  return getScratchFile()?.code ?? ''
}

/** Read the scratch buffer's persisted context. Empty string if missing. */
export function getScratchContext(): string {
  return getScratchFile()?.context ?? ''
}

function writeScratch(patch: Pick<WorkspaceFile, 'code' | 'context'>): void {
  const files = getWorkspaceFiles()
  const existing = files.find(f => f.path === SCRATCH_FILE_PATH)
  const now = Date.now()
  if (existing) {
    setWorkspaceFiles(files.map(f => (f.path === SCRATCH_FILE_PATH ? { ...f, ...patch, updatedAt: now } : f)))
    return
  }
  // First write — scratch hadn't been initialized yet. Create the file in
  // place. `ensureScratchFile` normally runs at boot; this branch covers
  // tests / unusual ordering that writes before boot has run.
  const created: WorkspaceFile = {
    id: SCRATCH_FILE_ID,
    path: SCRATCH_FILE_PATH,
    code: patch.code,
    context: patch.context,
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setWorkspaceFiles([...files, created])
}

/** Persist `code` to the scratch buffer's workspace file. */
export function setScratchCode(code: string): void {
  writeScratch({ code, context: getScratchContext() })
}

/** Persist `context` to the scratch buffer's workspace file. */
export function setScratchContext(context: string): void {
  writeScratch({ code: getScratchCode(), context })
}

/** Persist both fields in one IDB write. Cheaper than two `setScratch*` calls. */
export function setScratchCodeAndContext(code: string, context: string): void {
  writeScratch({ code, context })
}

/**
 * Create the scratch workspace file if it doesn't exist yet. Idempotent;
 * safe to call from boot or recovery paths. Returns `true` if a file was
 * created, `false` if it already existed.
 */
export function ensureScratchFile(): boolean {
  if (getScratchFile()) return false
  const now = Date.now()
  const created: WorkspaceFile = {
    id: SCRATCH_FILE_ID,
    path: SCRATCH_FILE_PATH,
    code: '',
    context: '',
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setWorkspaceFiles([...getWorkspaceFiles(), created])
  return true
}
