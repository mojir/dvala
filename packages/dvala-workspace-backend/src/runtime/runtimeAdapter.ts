import { allBuiltinModules } from '@mojir/dvala-core-tooling'
import { createDvala, resume, retrigger, extractCheckpointSnapshots } from '../../../../src'
import { Debugger, deserializeFromObject } from '../../../../src/internal'
import type { ContextStack } from '../../../../src/internal'
import type { ContinuationStack } from '../../../../src/internal'
import type { RuntimeRunResult, RuntimeSnapshot } from '@mojir/dvala-runtime'

import type { BackendDocumentStore } from '../documentStore'
import type {
  BackendSnapshotBindingsInspectionRequest,
  BackendSnapshotInspectionRequest,
  BackendSnapshotValidationRequest,
  BackendSessionInspectionResult,
  BackendSessionResumeRequest,
  BackendSessionStartRequest,
} from '../requests'

interface BackendRuntimeSessionHandle {
  sessionId: string
  runResult: RuntimeRunResult
}

export interface BackendRuntimeAdapter {
  start(request: BackendSessionStartRequest): Promise<BackendRuntimeSessionHandle>
  resume(request: BackendSessionResumeRequest): Promise<BackendRuntimeSessionHandle>
  inspectSnapshot(request: BackendSnapshotInspectionRequest): Promise<readonly RuntimeSnapshot[]>
  inspectSnapshotBindings(request: BackendSnapshotBindingsInspectionRequest): Promise<Readonly<Record<string, unknown>>>
  validateSnapshot(request: BackendSnapshotValidationRequest): Promise<RuntimeSnapshot | null>
  inspect(sessionId: string): Promise<BackendSessionInspectionResult>
  stop(sessionId: string): Promise<void>
}

interface BackendRuntimeSessionRecord {
  status: BackendSessionInspectionResult['status']
  lastUpdatedAt: number
}

const PLAYGROUND_FOLDER = '.dvala-playground'

function isInPlaygroundFolder(path: string): boolean {
  return path === PLAYGROUND_FOLDER || path.startsWith(`${PLAYGROUND_FOLDER}/`)
}

function folderFromPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function resolvePlaygroundPath(fromDir: string, importPath: string): string {
  const isAbsolute = importPath.startsWith('/')
  const segments = isAbsolute || fromDir === '' ? [] : fromDir.split('/').filter(seg => seg !== '')
  for (const segment of importPath.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) {
        throw new Error(`Import path escapes workspace root: '${importPath}' from '${fromDir}'`)
      }
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

function runtimeBaseDir(path?: string): string {
  if (!path || isInPlaygroundFolder(path)) return ''
  return folderFromPath(path)
}

function createRuntimeFileResolver(documents: BackendDocumentStore) {
  return (importPath: string, fromDir: string): string => {
    const resolved = resolvePlaygroundPath(isInPlaygroundFolder(fromDir) ? '' : fromDir, importPath)
    if (isInPlaygroundFolder(resolved)) {
      throw new Error(
        `Cannot import '${importPath}' from '${fromDir || '<root>'}': ${PLAYGROUND_FOLDER}/ is playground state, not part of the deployable project`,
      )
    }
    const exact = documents.getEffectiveSource(resolved)
    if (exact !== undefined) return exact

    const withSuffix = documents.getEffectiveSource(`${resolved}.dvala`)
    if (withSuffix !== undefined) return withSuffix

    throw new Error(`File not found: ${importPath} (resolved from '${fromDir}' to '${resolved}')`)
  }
}

function createRuntimeRunner(documents: BackendDocumentStore, path?: string, debug?: boolean) {
  return createDvala({
    ...(debug ? { debug: true } : {}),
    modules: allBuiltinModules,
    fileResolver: createRuntimeFileResolver(documents),
    fileResolverBaseDir: runtimeBaseDir(path),
  })
}

function statusFromRunResult(result: RuntimeRunResult): BackendSessionInspectionResult['status'] {
  switch (result.type) {
    case 'suspended':
      return 'suspended'
    case 'error':
      return 'failed'
    case 'completed':
    case 'halted':
      return 'completed'
  }
}

function hasEnv(value: unknown): value is { env: ContextStack } {
  return typeof value === 'object' && value !== null && 'env' in value && value.env !== undefined
}

function hasOuterEnv(value: unknown): value is { outerEnv: ContextStack } {
  return typeof value === 'object' && value !== null && 'outerEnv' in value && value.outerEnv !== undefined
}

function getEnvFromContinuation(k: ContinuationStack): ContextStack | null {
  let node: unknown = k
  while (typeof node === 'object' && node !== null && 'head' in node && 'tail' in node) {
    const frame = node.head
    if (hasEnv(frame)) return frame.env
    if (hasOuterEnv(frame)) return frame.outerEnv
    node = node.tail
  }
  return null
}

function extractSnapshotBindings(
  snapshot: BackendSnapshotBindingsInspectionRequest['snapshot'],
): Record<string, unknown> {
  const deserialized = deserializeFromObject(snapshot.continuation)
  const env =
    getEnvFromContinuation(deserialized.k) ?? (hasEnv(deserialized.initialStep) ? deserialized.initialStep.env : null)

  if (!env) return {}

  return Debugger.extractBindings({
    env,
    k: deserialized.k,
    resume: () => {},
    getSnapshots: () => deserialized.snapshots,
  })
}

function hasValidRuntimeContinuation(continuation: unknown): boolean {
  try {
    deserializeFromObject(continuation)
    return true
  } catch {
    return false
  }
}

function asRuntimeSnapshot(value: unknown): RuntimeSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('id' in value) || typeof value.id !== 'string') return null
  if (!('continuation' in value)) return null
  if (!hasValidRuntimeContinuation(value.continuation)) return null
  if (!('timestamp' in value) || typeof value.timestamp !== 'number') return null
  if (!('index' in value) || typeof value.index !== 'number') return null
  if (!('executionId' in value) || typeof value.executionId !== 'string') return null
  if (!('message' in value) || typeof value.message !== 'string') return null
  if ('terminal' in value && value.terminal !== undefined && typeof value.terminal !== 'boolean') return null
  if ('effectName' in value && value.effectName !== undefined && typeof value.effectName !== 'string') return null

  const checkpointSnapshots = extractCheckpointSnapshots(value.continuation)
  for (const checkpointSnapshot of checkpointSnapshots) {
    if (!asRuntimeSnapshot(checkpointSnapshot)) return null
  }

  return value as RuntimeSnapshot
}

export function createBackendRuntimeAdapter(documents: BackendDocumentStore): BackendRuntimeAdapter {
  const sessions = new Map<string, BackendRuntimeSessionRecord>()
  let sessionCounter = 0

  function createSessionId(): string {
    sessionCounter += 1
    return `backend-session-${sessionCounter}`
  }

  function updateSession(sessionId: string, status: BackendSessionInspectionResult['status']): void {
    sessions.set(sessionId, {
      status,
      lastUpdatedAt: Date.now(),
    })
  }

  return {
    async start(request: BackendSessionStartRequest): Promise<BackendRuntimeSessionHandle> {
      const sessionId = createSessionId()
      updateSession(sessionId, 'running')

      const runOptions = request.pure
        ? {
            pure: true as const,
            ...(request.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
            ...(request.terminalSnapshot ? { terminalSnapshot: true } : {}),
            ...(request.path ? { filePath: request.path } : {}),
          }
        : {
            ...(request.effectHandlers ? { effectHandlers: request.effectHandlers } : {}),
            ...(request.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
            ...(request.terminalSnapshot ? { terminalSnapshot: true } : {}),
            ...(request.path ? { filePath: request.path } : {}),
          }

      const runResult = await createRuntimeRunner(documents, request.path, request.debug).runAsync(
        request.source,
        runOptions,
      )
      updateSession(sessionId, statusFromRunResult(runResult))
      return { sessionId, runResult }
    },

    async resume(request: BackendSessionResumeRequest): Promise<BackendRuntimeSessionHandle> {
      const sessionId = createSessionId()
      updateSession(sessionId, 'running')

      const runResult = request.snapshot.effectName
        ? await retrigger(request.snapshot, {
            handlers: request.effectHandlers,
            modules: allBuiltinModules,
            ...(request.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
            ...(request.terminalSnapshot ? { terminalSnapshot: true } : {}),
          })
        : await resume(request.snapshot, request.value, {
            handlers: request.effectHandlers,
            modules: allBuiltinModules,
            ...(request.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
            ...(request.terminalSnapshot ? { terminalSnapshot: true } : {}),
          })

      updateSession(sessionId, statusFromRunResult(runResult))
      return { sessionId, runResult }
    },

    async inspectSnapshot(request: BackendSnapshotInspectionRequest): Promise<readonly RuntimeSnapshot[]> {
      return extractCheckpointSnapshots(request.snapshot.continuation)
    },

    async inspectSnapshotBindings(
      request: BackendSnapshotBindingsInspectionRequest,
    ): Promise<Readonly<Record<string, unknown>>> {
      return extractSnapshotBindings(request.snapshot)
    },

    async validateSnapshot(request: BackendSnapshotValidationRequest): Promise<RuntimeSnapshot | null> {
      return asRuntimeSnapshot(request.value)
    },

    async inspect(sessionId: string): Promise<BackendSessionInspectionResult> {
      const session = sessions.get(sessionId)
      if (session) {
        return {
          ok: true,
          sessionId,
          status: session.status,
          lastUpdatedAt: session.lastUpdatedAt,
        }
      }

      return {
        ok: true,
        sessionId,
        status: 'missing',
      }
    },

    async stop(sessionId: string): Promise<void> {
      sessions.delete(sessionId)
    },
  }
}
