import type { DvalaBundle } from '../bundler/interface'
import {
  createRuntime,
  createRuntimeExecutor,
  type ArtifactCompatibilityBridge,
  type DvalaRunAsyncOptions,
  type RuntimeRunResult,
  type DvalaRuntime,
  type RuntimeHandlers,
  type RuntimeHost,
  type RuntimeIdentity,
  type RuntimeResumeOptions,
  type RuntimeSession,
  type RuntimeSessionState,
  type RuntimeSnapshot,
  type SnapshotArtifactEnvelope,
} from '@mojir/dvala-runtime'
import {
  createDefaultRuntimeBridgeAdapter,
  toRuntimeResumeOptions,
  toRuntimeRunOptions,
} from './createDefaultRuntimeBridgeAdapter'
import type { BridgeProgramRunOptions, BridgeRunnerOptions, RuntimeBridgeExecutionContext } from './runtimeBridgeOptions'

type DraftSessionKind = 'program' | 'snapshot'

export type RuntimeArtifactBridge = ArtifactCompatibilityBridge<string | DvalaBundle, RuntimeSnapshot, RuntimeHost>

export interface CreatePackageRuntimeBridgeOptions extends BridgeRunnerOptions {
  identity: RuntimeIdentity
  artifactBridge: RuntimeArtifactBridge
  hostToHandlers?: (host: RuntimeHost) => RuntimeHandlers | undefined
  programRunOptions?: BridgeProgramRunOptions
  runProgram?: (source: string | DvalaBundle, options?: DvalaRunAsyncOptions) => Promise<RuntimeRunResult>
  resumeProgram?: (snapshot: RuntimeSnapshot, value: unknown, options?: RuntimeResumeOptions) => Promise<RuntimeRunResult>
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
  const defaultAdapter = options.runProgram || options.resumeProgram ? undefined : createDefaultRuntimeBridgeAdapter(options)
  let sessionCounter = 0

  function nextSessionId(kind: DraftSessionKind): string {
    sessionCounter += 1
    return `${kind}-session-${sessionCounter}`
  }

  function handlersForHost(host: RuntimeHost): RuntimeHandlers | undefined {
    return options.hostToHandlers?.(host)
  }

  function runProgram(source: string | DvalaBundle, context?: RuntimeBridgeExecutionContext): Promise<RuntimeRunResult> {
    if (options.runProgram) return options.runProgram(source, toRuntimeRunOptions(context))
    return defaultAdapter!.runProgram(source, context)
  }

  function resumeProgram(
    snapshot: RuntimeSnapshot,
    value: unknown,
    context?: RuntimeBridgeExecutionContext,
  ): Promise<RuntimeRunResult> {
    if (options.resumeProgram) return options.resumeProgram(snapshot, value, toRuntimeResumeOptions(options.modules, context))
    return defaultAdapter!.resumeProgram(snapshot, value, context)
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
          async () => runProgram(decoded, { handlers: effectHandlers, programRunOptions: options.programRunOptions }),
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
          async () => resumeProgram(snapshot, resumeValue, { handlers: effectHandlers, programRunOptions: options.programRunOptions }),
          options.artifactBridge.encodeSnapshotArtifact,
        )
      },
    }),
  )
}
