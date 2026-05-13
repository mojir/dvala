import fs from 'node:fs'
import path from 'node:path'

import { createBackend } from '../../packages/dvala-workspace-backend/src/index'
import type {
  BackendRuntimeAdapter,
  BackendSessionResumeRequest,
  BackendSessionStartRequest,
} from '../../packages/dvala-workspace-backend/src/index'
import type { DvalaBundle } from '../../src/bundler/interface'
import { allBuiltinModules } from '../../src/allModules'
import { createDvala } from '../../src/createDvala'
import { retrigger } from '../../src/retrigger'
import { resume } from '../../src/resume'
import type { DvalaModule } from '../../src/builtin/modules/interface'
import type { RuntimeHandlers, RuntimeRunResult, RuntimeSnapshot } from '@mojir/dvala-runtime'
import type { TypeDiagnostic } from '../../src/typechecker/typecheck'

export function createFileResolver(): (importPath: string, fromDir: string) => string {
  return (importPath: string, fromDir: string) => {
    const resolved = path.resolve(fromDir, importPath)
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, 'utf-8')
    }
    const withExtension = `${resolved}.dvala`
    if (fs.existsSync(withExtension)) {
      return fs.readFileSync(withExtension, 'utf-8')
    }
    throw new Error(`File not found: ${importPath} (tried ${resolved} and ${withExtension})`)
  }
}

interface CreateCliRuntimeClientOptions {
  context: Record<string, unknown>
  pure: boolean
  noCheck?: boolean
  fileResolverBaseDir?: string
  modules: readonly DvalaModule[]
  onTypeDiagnostic?: (diagnostic: TypeDiagnostic) => void
}

interface CliRuntimeClient {
  run: (program: string | DvalaBundle, filePath?: string) => unknown
  runAsync: (
    program: string | DvalaBundle,
    filePath?: string,
    effectHandlers?: RuntimeHandlers,
  ) => Promise<RuntimeRunResult>
  resumeSnapshot: (
    snapshot: RuntimeSnapshot,
    value?: unknown,
    effectHandlers?: RuntimeHandlers,
  ) => Promise<RuntimeRunResult>
}

export function createCliRuntimeClient(options: CreateCliRuntimeClientOptions): CliRuntimeClient {
  const runner = createDvala({
    debug: true,
    modules: [...allBuiltinModules, ...options.modules],
    fileResolver: createFileResolver(),
    fileResolverBaseDir: options.fileResolverBaseDir ?? process.cwd(),
    typecheck: !options.noCheck,
    onTypeDiagnostic: options.onTypeDiagnostic,
  })

  const sessions = new Map<string, 'running' | 'suspended' | 'completed' | 'failed'>()
  let sessionCounter = 0

  function nextSessionId(): string {
    sessionCounter += 1
    return `cli-backend-session-${sessionCounter}`
  }

  function toStatus(type: 'completed' | 'halted' | 'suspended' | 'error'): 'suspended' | 'completed' | 'failed' {
    if (type === 'suspended') return 'suspended'
    if (type === 'error') return 'failed'
    return 'completed'
  }

  const runtime: BackendRuntimeAdapter = {
    async start(request: BackendSessionStartRequest) {
      const sessionId = nextSessionId()
      sessions.set(sessionId, 'running')

      const runResult = await runner.runAsync(
        request.source,
        request.pure
          ? {
              scope: options.context,
              pure: true,
              ...(request.path ? { filePath: request.path } : {}),
              ...(request.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
              ...(request.terminalSnapshot ? { terminalSnapshot: true } : {}),
            }
          : {
              scope: options.context,
              ...(request.path ? { filePath: request.path } : {}),
              ...(request.effectHandlers ? { effectHandlers: request.effectHandlers } : {}),
              ...(request.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
              ...(request.terminalSnapshot ? { terminalSnapshot: true } : {}),
            },
      )

      sessions.set(sessionId, toStatus(runResult.type))
      return { sessionId, runResult }
    },

    async resume(request: BackendSessionResumeRequest) {
      const sessionId = nextSessionId()
      sessions.set(sessionId, 'running')

      const runResult = request.snapshot.effectName
        ? await retrigger(request.snapshot, {
            handlers: request.effectHandlers,
            modules: [...allBuiltinModules, ...options.modules],
            ...(request.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
            ...(request.terminalSnapshot ? { terminalSnapshot: true } : {}),
          })
        : await resume(request.snapshot, request.value, {
            handlers: request.effectHandlers,
            modules: [...allBuiltinModules, ...options.modules],
            ...(request.disableAutoCheckpoint ? { disableAutoCheckpoint: true } : {}),
            ...(request.terminalSnapshot ? { terminalSnapshot: true } : {}),
          })

      sessions.set(sessionId, toStatus(runResult.type))
      return { sessionId, runResult }
    },

    async inspectSnapshot() {
      throw new Error('CLI runtime client does not support inspectSnapshot.')
    },

    async inspectSnapshotBindings() {
      throw new Error('CLI runtime client does not support inspectSnapshotBindings.')
    },

    async validateSnapshot() {
      return null
    },

    async inspect(sessionId: string) {
      const status = sessions.get(sessionId)
      if (!status) {
        return {
          ok: true as const,
          sessionId,
          status: 'missing' as const,
        }
      }

      return {
        ok: true as const,
        sessionId,
        status,
        lastUpdatedAt: Date.now(),
      }
    },

    async stop(sessionId: string) {
      sessions.delete(sessionId)
    },
  }

  const backend = createBackend({ runtime })

  return {
    run: (program: string | DvalaBundle, filePath?: string) =>
      runner.run(
        program,
        options.pure ? { scope: options.context, pure: true, filePath } : { scope: options.context, filePath },
      ),

    async runAsync(program: string | DvalaBundle, filePath?: string, effectHandlers?: RuntimeHandlers) {
      if (typeof program !== 'string') {
        return runner.runAsync(
          program,
          options.pure
            ? { scope: options.context, pure: true, filePath }
            : { scope: options.context, filePath, effectHandlers },
        )
      }

      const started = await backend.startSession({
        requestId: Date.now(),
        source: program,
        ...(filePath ? { path: filePath } : {}),
        ...(options.pure ? { pure: true } : { effectHandlers }),
      })
      if (!started.ok) throw new Error(started.error.message)

      await backend.inspectSession(started.sessionId)
      await backend.stopSession(started.sessionId)
      return started.runResult
    },

    async resumeSnapshot(snapshot: RuntimeSnapshot, value?: unknown, effectHandlers?: RuntimeHandlers) {
      const resumed = await backend.resumeSnapshot({
        requestId: Date.now(),
        snapshot,
        ...(value !== undefined ? { value } : {}),
        ...(effectHandlers ? { effectHandlers } : {}),
      })
      if (!resumed.ok) throw new Error(resumed.error.message)

      await backend.inspectSession(resumed.sessionId)
      await backend.stopSession(resumed.sessionId)
      return resumed.runResult
    },
  }
}
