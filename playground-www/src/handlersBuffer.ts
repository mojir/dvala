// Handlers buffer — backed by a single workspace file at
// `.dvala-playground/handlers.dvala`. Phase 1.5 step 23d adds it as a
// reserved file under the playground folder; step 23e wraps every run so
// the buffer's **result value** is installed as a boundary effect handler
// around the user's code (see `wrapWithBoundaryHandler`). The buffer is a
// regular Dvala expression — single handler, multiple effect cases,
// `effectHandler.compose(h1, h2)`, dynamically built, imported — anything
// evaluating to a handler value works.
//
// After Phase 1.5 step 23h, scratch and handlers are symmetrical: both are
// regular workspace files keyed by their reserved IDs (`__scratch__`,
// `__handlers__`). The `<scratch>` / `<handlers>` virtual tree entries
// open the underlying files via `openOrFocusFile`; the tab strip shows
// them like any other file. Visibility under `.dvala-playground/` is
// filtered out of the tree + Quick Open by 23b's renderer rules; the
// pinned virtual entries are added back explicitly by the explorer
// renderer.

import { getWorkspaceFiles, setWorkspaceFiles } from './fileStorage'
import type { WorkspaceFile } from './fileStorage'

/** Canonical path of the handlers buffer's backing workspace file. */
export const HANDLERS_FILE_PATH = '.dvala-playground/handlers.dvala'

/**
 * Stable ID for the handlers file. Reserved sentinel; not a UUID — that's
 * fine because the file is pinned/virtual; there's only one of them. After
 * 23h this ID is also the handlers tab's key, but no consumer looks it up
 * directly — they reach through `getHandlersFile().id` — so it stays
 * file-local.
 */
const HANDLERS_FILE_ID = '__handlers__'

/** True iff `path` is the handlers buffer's canonical path. */
export function isHandlersPath(path: string): boolean {
  return path === HANDLERS_FILE_PATH
}

/** The handlers buffer's `WorkspaceFile`, or `undefined` before initialization. */
export function getHandlersFile(): WorkspaceFile | undefined {
  return getWorkspaceFiles().find(f => f.path === HANDLERS_FILE_PATH)
}

/** Read the handlers buffer's persisted code. Empty string if missing. */
export function getHandlersCode(): string {
  return getHandlersFile()?.code ?? ''
}

/** Persist `code` to the handlers buffer's workspace file. Creates the file
 *  if it doesn't exist yet (defense-in-depth — `ensureHandlersFile` runs at
 *  boot, but recovery / test paths may write before that). */
export function setHandlersCode(code: string): void {
  const files = getWorkspaceFiles()
  const existing = files.find(f => f.path === HANDLERS_FILE_PATH)
  const now = Date.now()
  if (existing) {
    setWorkspaceFiles(files.map(f => (f.path === HANDLERS_FILE_PATH ? { ...f, code, updatedAt: now } : f)))
    return
  }
  const created: WorkspaceFile = {
    id: HANDLERS_FILE_ID,
    path: HANDLERS_FILE_PATH,
    code,
    context: '',
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setWorkspaceFiles([...files, created])
}

/**
 * Reserved binding name introduced by the boundary-handler wrap. Picked to
 * be unlikely to collide with anything a user might write in scratch /
 * workspace files. Shadowing it inside user code is harmless — the `with`
 * clause already captured the outer value before user code starts.
 */
const BOUNDARY_BINDING = '__playgroundBoundary__'

/**
 * Wrap `userCode` so the value of the handlers buffer becomes a boundary
 * effect handler around the run (Phase 1.5 step 23e). The handlers buffer
 * is treated as a regular Dvala expression — its **result value** is the
 * handler.
 *
 * **Recommended:** write `linear handler ... end` in the handlers buffer.
 * Linear handlers (engine-side feature, see
 * `design/active/2026-04-29_linear-handler.md`) get the host-style dispatch
 * semantics that suit the boundary use case: single-shot resume + reach
 * into `parallel(...)` / `race(...)` branches via `dispatchPerform`'s
 * barrier-crossing path. A plain `handler ... end` will still install
 * (the user can opt into Dvala-handler semantics deliberately) but loses
 * those properties — multi-shot is allowed, parallel branches are
 * isolated. The playground intentionally doesn't enforce the kind at
 * install time; the user picks per buffer.
 *
 * The wrap returns `userCode` unchanged when the buffer is empty /
 * whitespace-only, so it's invisible until the user actually puts
 * something there.
 *
 * Note on `;` placement: `with <expr>` *requires* a trailing `;` before
 * the next statement — newlines aren't statement separators in Dvala.
 * The wrap is built with explicit `;` after each `with` clause for that
 * reason.
 */
export function wrapWithBoundaryHandler(userCode: string): string {
  const handlersCode = getHandlersCode().trim()
  if (handlersCode === '') return userCode
  return `let ${BOUNDARY_BINDING} = do\n${handlersCode}\nend;\n` + `do with ${BOUNDARY_BINDING};\n${userCode}\nend`
}

/**
 * Create the handlers workspace file if it doesn't exist yet. Idempotent;
 * safe to call from boot or recovery paths. Returns `true` if a file was
 * created, `false` if it already existed.
 */
export function ensureHandlersFile(): boolean {
  if (getHandlersFile()) return false
  const now = Date.now()
  const created: WorkspaceFile = {
    id: HANDLERS_FILE_ID,
    path: HANDLERS_FILE_PATH,
    code: '',
    context: '',
    createdAt: now,
    updatedAt: now,
    locked: false,
  }
  setWorkspaceFiles([...getWorkspaceFiles(), created])
  return true
}
