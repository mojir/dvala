import { DvalaError } from './errors'
import type { DvalaModule } from './builtin/modules/interface'
import { createContextStack } from './evaluator/ContextStack'
import { evaluate, evaluateWithEffects, evaluateWithSyncEffects } from './evaluator/trampoline'
import { tokenize } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parse } from './parser'
import type { Ast } from './parser/types'
import { initCoreDvalaSources } from './builtin/normalExpressions/initCoreDvala'
import { Cache } from './Dvala/Cache'
import type { Handlers, RunResult, SyncHandlers } from './evaluator/effectTypes'

export interface CreateDvalaOptions {
  modules?: DvalaModule[]
  bindings?: Record<string, unknown>
  effectHandlers?: Handlers
  syncHandlers?: SyncHandlers
  cache?: number
  /** Enable debug tokenization: captures source positions for better error messages. */
  debug?: boolean
}

export interface DvalaRunOptions {
  bindings?: Record<string, unknown>
  syncHandlers?: SyncHandlers
  pure?: boolean
}

export interface DvalaRunAsyncOptions {
  bindings?: Record<string, unknown>
  effectHandlers?: Handlers
  pure?: boolean
}

export interface DvalaRunner {
  run: (source: string, options?: DvalaRunOptions) => unknown
  runAsync: (source: string, options?: DvalaRunAsyncOptions) => Promise<RunResult>
}

export function createDvala(options?: CreateDvalaOptions): DvalaRunner {
  initCoreDvalaSources()

  const modules = options?.modules
    ? new Map(options.modules.map(m => [m.name, m]))
    : undefined
  const factoryBindings = options?.bindings
  const factoryEffectHandlers = options?.effectHandlers
  const factorySyncHandlers = options?.syncHandlers
  const debug = options?.debug ?? false
  const cache = options?.cache ? new Cache(options.cache) : null

  function buildAst(source: string): Ast {
    if (cache) {
      const cached = cache.get(source)
      if (cached)
        return cached
    }
    const tokenStream = tokenize(source, debug, undefined)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const ast: Ast = { body: parse(minified), hasDebugData: debug }
    cache?.set(source, ast)
    return ast
  }

  function mergeBindings(runBindings?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!factoryBindings && !runBindings)
      return undefined
    return { ...factoryBindings, ...runBindings }
  }

  function mergeSyncHandlers(runSyncHandlers?: SyncHandlers): SyncHandlers | undefined {
    if (!factorySyncHandlers && !runSyncHandlers)
      return undefined
    // Run handlers first (checked first), factory handlers fill in the rest.
    // For same key, run overrides factory.
    const result: SyncHandlers = { ...runSyncHandlers }
    if (factorySyncHandlers) {
      for (const [k, v] of Object.entries(factorySyncHandlers)) {
        if (!(k in result))
          result[k] = v
      }
    }
    return result
  }

  function mergeEffectHandlers(runEffectHandlers?: Handlers): Handlers | undefined {
    if (!factoryEffectHandlers && !runEffectHandlers)
      return undefined
    // Run handlers first (checked first), factory handlers fill in the rest.
    // For same key, run overrides factory.
    const result: Handlers = { ...runEffectHandlers }
    if (factoryEffectHandlers) {
      for (const [k, v] of Object.entries(factoryEffectHandlers)) {
        if (!(k in result))
          result[k] = v
      }
    }
    return result
  }

  function assertNotPureWithHandlers(
    pure: boolean,
    syncHandlers: SyncHandlers | undefined,
    effectHandlers: Handlers | undefined,
  ): void {
    if (!pure)
      return
    const hasSyncHandlers = syncHandlers && Object.keys(syncHandlers).length > 0
    const hasEffectHandlers = effectHandlers && Object.keys(effectHandlers).length > 0
    if (hasSyncHandlers || hasEffectHandlers) {
      throw new TypeError('Cannot use pure mode with effect handlers')
    }
  }

  return {
    run(source: string, runOptions?: DvalaRunOptions): unknown {
      const bindings = mergeBindings(runOptions?.bindings)
      const syncHandlers = mergeSyncHandlers(runOptions?.syncHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, syncHandlers, undefined)

      const contextStack = createContextStack({ bindings }, modules, pure)
      const ast = buildAst(source)

      if (syncHandlers) {
        return evaluateWithSyncEffects(ast, contextStack, syncHandlers)
      }

      const result = evaluate(ast, contextStack)
      if (result instanceof Promise) {
        throw new TypeError('Unexpected async result in run(). Use runAsync() for async operations.')
      }
      return result
    },

    async runAsync(source: string, runOptions?: DvalaRunAsyncOptions): Promise<RunResult> {
      const bindings = mergeBindings(runOptions?.bindings)
      const effectHandlers = mergeEffectHandlers(runOptions?.effectHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, undefined, effectHandlers)

      try {
        const contextStack = createContextStack({ bindings }, modules, pure)
        const ast = buildAst(source)
        return await evaluateWithEffects(ast, contextStack, effectHandlers, undefined, {
          values: bindings,
          modules,
        })
      }
      catch (error) {
        if (error instanceof DvalaError) {
          return { type: 'error', error }
        }
        if (error instanceof TypeError) {
          throw error
        }
        return { type: 'error', error: new DvalaError(`${error}`, undefined) }
      }
    },
  }
}
