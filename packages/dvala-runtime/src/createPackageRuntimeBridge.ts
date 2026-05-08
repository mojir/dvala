import { type ProgramArtifactEnvelope, type SnapshotArtifactEnvelope } from './artifacts/types'
import {
  type DvalaRunAsyncOptions,
  type RuntimeHandlers,
  type RuntimeSnapshot,
  type RuntimeRunResult,
} from './types/run'
import type { DvalaRuntime, RuntimeHost, RuntimeIdentity, RuntimeSession, RuntimeSessionState } from './types/runtime'
import { createRuntime } from './createRuntime'
import { createRuntimeExecutor } from './evaluator/runtimeExecutor'

type DraftSessionKind = 'program' | 'snapshot'

export type BridgeProgramRunOptions = Omit<DvalaRunAsyncOptions, 'effectHandlers' | 'pure'>

export interface RuntimeBridgeExecutionContext {
  handlers?: RuntimeHandlers
  programRunOptions?: BridgeProgramRunOptions
}

export type RuntimeBridgeRunProgram<ProgramValue> = (
  source: ProgramValue,
  context?: RuntimeBridgeExecutionContext,
) => Promise<RuntimeRunResult>

export type RuntimeBridgeResumeProgram<SnapshotValue> = (
  snapshot: SnapshotValue,
  value: unknown,
  context?: RuntimeBridgeExecutionContext,
) => Promise<RuntimeRunResult>

interface RuntimeBridgeArtifactCompatibility<
  ProgramValue = unknown,
  SnapshotValue = RuntimeSnapshot,
  ResumeContext = RuntimeHost,
> {
  decodeProgramArtifact: (artifact: ProgramArtifactEnvelope) => ProgramValue
  decodeSnapshotArtifact: (artifact: SnapshotArtifactEnvelope) => SnapshotValue
  encodeSnapshotArtifact: (snapshot: RuntimeSnapshot) => SnapshotArtifactEnvelope | Promise<SnapshotArtifactEnvelope>
  getResumeValue?: (artifact: SnapshotArtifactEnvelope, context: ResumeContext) => unknown
}

export interface CreatePackageRuntimeBridgeOptions<
  ProgramValue = unknown,
  SnapshotValue = RuntimeSnapshot,
  ResumeContext = RuntimeHost,
> {
  identity: RuntimeIdentity
  artifactBridge: RuntimeBridgeArtifactCompatibility<ProgramValue, SnapshotValue, ResumeContext>
  hostToHandlers?: (host: RuntimeHost) => RuntimeHandlers | undefined
  programRunOptions?: BridgeProgramRunOptions
  runProgram: RuntimeBridgeRunProgram<ProgramValue>
  resumeProgram: RuntimeBridgeResumeProgram<SnapshotValue>
}

class DraftRuntimeSession implements RuntimeSession {
  public readonly id: string

  private status: RuntimeSessionState['status'] = 'idle'
  private latestSnapshot: RuntimeSnapshot | undefined
  private closed = false

  public constructor(
    id: string,
    private readonly kind: DraftSessionKind,
    private readonly runThunk: () => Promise<RuntimeRunResult>,
    private readonly encodeSnapshotArtifact: (
      snapshot: RuntimeSnapshot,
    ) => SnapshotArtifactEnvelope | Promise<SnapshotArtifactEnvelope>,
  ) {
    this.id = id
  }

  public async run(): Promise<RuntimeRunResult> {
    if (this.closed) {
      throw new Error(`dvala-runtime draft session is closed: ${this.id}`)
    }
    if (this.status !== 'idle') {
      throw new Error(`dvala-runtime draft session has already been run: ${this.id}`)
    }
    this.status = 'running'
    try {
      const result = await this.runThunk()

      if (result.type === 'suspended') {
        this.status = 'suspended'
        this.latestSnapshot = result.snapshot
        return result
      }
      if (result.type === 'completed' || result.type === 'halted') {
        this.status = 'completed'
        return result
      }
      this.status = 'failed'
      return result
    } catch (error) {
      this.status = 'failed'
      throw error
    }
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

export function createPackageRuntimeBridge<ProgramValue, SnapshotValue = RuntimeSnapshot>(
  options: CreatePackageRuntimeBridgeOptions<ProgramValue, SnapshotValue, RuntimeHost>,
): DvalaRuntime {
  let sessionCounter = 0

  function nextSessionId(kind: DraftSessionKind): string {
    sessionCounter += 1
    return `${kind}-session-${sessionCounter}`
  }

  function handlersForHost(host: RuntimeHost): RuntimeHandlers | undefined {
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
            options.runProgram(decoded, { handlers: effectHandlers, programRunOptions: options.programRunOptions }),
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
            options.resumeProgram(snapshot, resumeValue, {
              handlers: effectHandlers,
              programRunOptions: options.programRunOptions,
            }),
          options.artifactBridge.encodeSnapshotArtifact,
        )
      },
    }),
  )
}
