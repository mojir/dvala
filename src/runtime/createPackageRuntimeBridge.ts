import type { DvalaBundle } from '../bundler/interface'
import type { DvalaModule } from '../builtin/modules/interface'
import { createDvala, type CreateDvalaOptions, type DvalaRunAsyncOptions } from '../createDvala'
import type { Handlers, RunResult, Snapshot } from '../evaluator/effectTypes'
import { resume } from '../resume'

import { createRuntime } from '../../packages/dvala-runtime/src/createRuntime'
import { createRuntimeExecutor } from '../../packages/dvala-runtime/src/evaluator/runtimeExecutor'
import type { ArtifactCompatibilityBridge } from '../../packages/dvala-runtime/src/artifacts/compat'
import type { SnapshotArtifactEnvelope } from '../../packages/dvala-runtime/src/artifacts/types'
import type {
  DvalaRuntime,
  RuntimeHost,
  RuntimeIdentity,
  RuntimeSession,
  RuntimeSessionState,
} from '../../packages/dvala-runtime/src/types/runtime'

type DraftSessionKind = 'program' | 'snapshot'

export type RuntimeArtifactBridge = ArtifactCompatibilityBridge<string | DvalaBundle, Snapshot, RuntimeHost>

export interface CreatePackageRuntimeBridgeOptions extends CreateDvalaOptions {
  identity: RuntimeIdentity
  artifactBridge: RuntimeArtifactBridge
  hostToHandlers?: (host: RuntimeHost) => Handlers | undefined
  programRunOptions?: Omit<DvalaRunAsyncOptions, 'effectHandlers' | 'pure'>
}

class DraftRuntimeSession implements RuntimeSession {
  public readonly id: string

  private status: RuntimeSessionState['status'] = 'idle'
  private latestSnapshot: Snapshot | undefined
  private closed = false

  public constructor(
    id: string,
    private readonly kind: DraftSessionKind,
    private readonly runThunk: () => Promise<RunResult>,
    private readonly encodeSnapshotArtifact: (
      snapshot: Snapshot,
    ) => SnapshotArtifactEnvelope | Promise<SnapshotArtifactEnvelope>,
  ) {
    this.id = id
  }

  public async run(): Promise<RunResult> {
    if (this.closed) {
      throw new Error(`dvala-runtime draft session is closed: ${this.id}`)
    }
    this.status = 'running'
    const result = await this.runThunk()

    if (result.type === 'suspended') {
      this.status = 'suspended'
      this.latestSnapshot = result.snapshot
      return result
    }
    if (result.type === 'completed') {
      this.status = 'completed'
      return result
    }
    this.status = 'failed'
    return result
  }

  public async suspend(): Promise<SnapshotArtifactEnvelope> {
    if (!this.latestSnapshot) {
      throw new Error(`dvala-runtime draft ${this.kind} session has no suspended snapshot to export`)
    }
    return this.encodeSnapshotArtifact(this.latestSnapshot)
  }

  public inspect(): RuntimeSessionState {
    return {
      status: this.status,
      snapshotCount: this.latestSnapshot ? 1 : undefined,
    }
  }

  public async close(): Promise<void> {
    this.closed = true
  }
}

export function createPackageRuntimeBridge(options: CreatePackageRuntimeBridgeOptions): DvalaRuntime {
  const runner = createDvala(options)
  let sessionCounter = 0

  function nextSessionId(kind: DraftSessionKind): string {
    sessionCounter += 1
    return `${kind}-session-${sessionCounter}`
  }

  function handlersForHost(host: RuntimeHost): Handlers | undefined {
    return options.hostToHandlers?.(host)
  }

  return createRuntime(
    options.identity,
    createRuntimeExecutor({
      async startProgram(artifact, host) {
        const decoded = options.artifactBridge.decodeProgramArtifact(artifact.artifact)
        const effectHandlers = handlersForHost(host)
        return new DraftRuntimeSession(
          nextSessionId('program'),
          'program',
          async () =>
            runner.runAsync(decoded, {
              ...options.programRunOptions,
              effectHandlers,
            }),
          options.artifactBridge.encodeSnapshotArtifact,
        )
      },
      async resumeSnapshot(artifact, host) {
        const snapshot = options.artifactBridge.decodeSnapshotArtifact(artifact.artifact)
        const effectHandlers = handlersForHost(host)
        const resumeValue = options.artifactBridge.getResumeValue?.(artifact.artifact, host)
        return new DraftRuntimeSession(
          nextSessionId('snapshot'),
          'snapshot',
          async () =>
            resume(snapshot, resumeValue, {
              handlers: effectHandlers,
              modules: options.modules as DvalaModule[] | undefined,
              maxSnapshots: options.programRunOptions?.maxSnapshots,
              disableAutoCheckpoint: options.programRunOptions?.disableAutoCheckpoint,
              terminalSnapshot: options.programRunOptions?.terminalSnapshot,
            }),
          options.artifactBridge.encodeSnapshotArtifact,
        )
      },
    }),
  )
}
