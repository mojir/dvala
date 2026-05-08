export interface RuntimeSnapshot {
  readonly id: string
  readonly continuation: unknown
  readonly timestamp: number
  readonly index: number
  readonly executionId: string
  readonly message: string
  readonly terminal?: boolean
  readonly meta?: unknown
  readonly effectName?: string
  readonly effectArg?: unknown
}

export interface RuntimeContinuation {
  env: unknown
  k: unknown
  resume: () => void
  getSnapshots: () => RuntimeSnapshot[]
}

export interface RuntimeSourceMapPosition {
  source: number
  start: [number, number]
  end: [number, number]
  structuralLeaf?: boolean
}

export interface RuntimeSourceMap {
  sources: { path: string; content: string }[]
  positions: Map<number, RuntimeSourceMapPosition>
}

export interface RuntimeSourceCodeInfo {
  position: { line: number; column: number }
  code: string
  filePath?: string
}

export interface RuntimeErrorJSON {
  name: string
  message: string
  shortMessage: string
  line?: number
  column?: number
  code?: string
  filePath?: string
}

export interface RuntimeErrorLike {
  name: string
  message: string
  shortMessage: string
  errorType: string
  sourceCodeInfo?: RuntimeSourceCodeInfo
  attachCallStack(entries: unknown[]): void
  getCodeMarker(): string | undefined
  toJSON(): RuntimeErrorJSON
}

export type RuntimeNodeEvalHook =
  | ((node: any, getContinuation: () => RuntimeContinuation) => void | Promise<void>)
  | undefined

export interface RuntimeEffectContext {
  effectName: string
  arg: unknown
  signal: AbortSignal
  resume: (value: unknown) => void
  fail: (msg?: string) => void
  suspend: (meta?: unknown) => void
  next: () => void
  snapshots: readonly RuntimeSnapshot[]
  checkpoint: (message: string, meta?: unknown) => RuntimeSnapshot
  resumeFrom: (snapshot: RuntimeSnapshot, value: unknown) => void
  halt: (value?: unknown) => void
  onScopeExit: (callback: () => void | Promise<void>) => void
}

export type RuntimeEffectHandler = (ctx: RuntimeEffectContext) => void | Promise<void>

export interface RuntimeHandlerRegistration {
  pattern: string
  handler: RuntimeEffectHandler
}

export type RuntimeHandlers = RuntimeHandlerRegistration[]

export interface RuntimeModuleLike {
  name: string
}

export type DvalaRunOptions =
  | { scope?: Record<string, unknown>; pure: true; effectHandlers?: never; filePath?: string }
  | { scope?: Record<string, unknown>; pure?: false; effectHandlers?: RuntimeHandlers; filePath?: string }

export type DvalaRunAsyncOptions =
  | {
      scope?: Record<string, unknown>
      pure: true
      effectHandlers?: never
      maxSnapshots?: number
      disableAutoCheckpoint?: boolean
      terminalSnapshot?: boolean
      onNodeEval?: RuntimeNodeEvalHook
      filePath?: string
    }
  | {
      scope?: Record<string, unknown>
      pure?: false
      effectHandlers?: RuntimeHandlers
      maxSnapshots?: number
      disableAutoCheckpoint?: boolean
      terminalSnapshot?: boolean
      onNodeEval?: RuntimeNodeEvalHook
      filePath?: string
    }

export type RuntimeRunResult =
  | {
      type: 'completed'
      value: unknown
      scope?: Record<string, unknown>
      snapshot?: RuntimeSnapshot
      sourceMap?: RuntimeSourceMap
    }
  | {
      type: 'suspended'
      snapshot: RuntimeSnapshot
      sourceMap?: RuntimeSourceMap
    }
  | { type: 'error'; error: RuntimeErrorLike; snapshot?: RuntimeSnapshot; sourceMap?: RuntimeSourceMap }
  | { type: 'halted'; value: unknown; snapshot?: RuntimeSnapshot; sourceMap?: RuntimeSourceMap }

export interface RuntimeResumeOptions {
  handlers?: RuntimeHandlers
  modules?: RuntimeModuleLike[]
  maxSnapshots?: number
  disableAutoCheckpoint?: boolean
  terminalSnapshot?: boolean
  scope?: Record<string, unknown>
}
