import type { RuntimeHandlers, RuntimeRunResult, RuntimeSnapshot } from '@mojir/dvala-runtime'

import { createBackend } from '@mojir/dvala-workspace-backend'
import { createDvala } from '@mojir/dvala-core-tooling'
import type { WorkspaceFile } from './fileStorage'

const runtimeBackend = createBackend({ createDvala })
let requestCounter = 0

type RuntimeWorkspaceFile = Pick<WorkspaceFile, 'path' | 'code'>

function nextRequestId(): number {
  requestCounter += 1
  return requestCounter
}

// Mirrors what the backend currently has, so each sync sends only the diff
// (additions, modifications, removals) rather than re-uploading the whole
// workspace. Backend persisted-file state survives across sync calls.
let lastSyncedToBackend = new Map<string, string>()

async function syncWorkspaceSnapshot(workspaceFiles: readonly RuntimeWorkspaceFile[]): Promise<void> {
  const next = new Map(workspaceFiles.map(file => [file.path, file.code]))

  for (const path of lastSyncedToBackend.keys()) {
    if (!next.has(path)) {
      await runtimeBackend.removeFile({ path })
    }
  }

  for (const [path, code] of next) {
    if (lastSyncedToBackend.get(path) !== code) {
      await runtimeBackend.persistFile({ file: { path, code } })
    }
  }

  lastSyncedToBackend = next
}

function unwrapRuntimeResult(
  result: { ok: true; runResult: RuntimeRunResult } | { ok: false; error: { message: string } },
) {
  if (result.ok) return result.runResult
  throw new Error(result.error.message)
}

export async function runPlaygroundSessionThroughBackend(args: {
  path?: string
  source: string
  workspaceFiles: readonly RuntimeWorkspaceFile[]
  effectHandlers?: RuntimeHandlers
  debug?: boolean
  pure?: boolean
  disableAutoCheckpoint?: boolean
  terminalSnapshot?: boolean
}): Promise<RuntimeRunResult> {
  await syncWorkspaceSnapshot(args.workspaceFiles)
  return unwrapRuntimeResult(
    await runtimeBackend.startSession({
      requestId: nextRequestId(),
      path: args.path,
      source: args.source,
      ...(args.debug ? { debug: true } : {}),
      ...(args.effectHandlers ? { effectHandlers: args.effectHandlers } : {}),
      ...(args.pure ? { pure: true } : {}),
      ...(args.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
      ...(args.terminalSnapshot ? { terminalSnapshot: true } : {}),
    }),
  )
}

export async function resumePlaygroundSnapshotThroughBackend(args: {
  snapshot: RuntimeSnapshot
  workspaceFiles: readonly RuntimeWorkspaceFile[]
  value?: unknown
  effectHandlers?: RuntimeHandlers
  disableAutoCheckpoint?: boolean
  terminalSnapshot?: boolean
}): Promise<RuntimeRunResult> {
  await syncWorkspaceSnapshot(args.workspaceFiles)
  return unwrapRuntimeResult(
    await runtimeBackend.resumeSnapshot({
      requestId: nextRequestId(),
      snapshot: args.snapshot,
      ...(args.value !== undefined ? { value: args.value } : {}),
      ...(args.effectHandlers ? { effectHandlers: args.effectHandlers } : {}),
      ...(args.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
      ...(args.terminalSnapshot ? { terminalSnapshot: true } : {}),
    }),
  )
}

export async function inspectPlaygroundSnapshotThroughBackend(args: {
  snapshot: RuntimeSnapshot
}): Promise<readonly RuntimeSnapshot[]> {
  const result = await runtimeBackend.inspectSnapshot({
    requestId: nextRequestId(),
    snapshot: args.snapshot,
  })

  if (result.ok) return result.checkpointSnapshots
  throw new Error(result.error.message)
}

export async function inspectPlaygroundSnapshotBindingsThroughBackend(args: {
  snapshot: RuntimeSnapshot
}): Promise<Readonly<Record<string, unknown>>> {
  const result = await runtimeBackend.inspectSnapshotBindings({
    requestId: nextRequestId(),
    snapshot: args.snapshot,
  })

  if (result.ok) return result.bindings
  throw new Error(result.error.message)
}

export async function validatePlaygroundSnapshotThroughBackend(args: { value: unknown }): Promise<RuntimeSnapshot> {
  const result = await runtimeBackend.validateSnapshot({
    requestId: nextRequestId(),
    value: args.value,
  })

  if (result.ok) return result.snapshot
  throw new Error(result.error.message)
}
