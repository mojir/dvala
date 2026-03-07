import { AutoCompleter } from './AutoCompleter/AutoCompleter'
import type { AutoCompleterParams } from './AutoCompleter/AutoCompleter'
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
import { getUndefinedSymbols as standaloneGetUndefinedSymbols } from './tooling'
import { EFFECT_SYMBOL, FUNCTION_SYMBOL, REGEXP_SYMBOL } from './utils/symbols'

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
  filePath?: string
}

export interface DvalaRunAsyncOptions {
  bindings?: Record<string, unknown>
  effectHandlers?: Handlers
  pure?: boolean
}

export interface DvalaRunner {
  run: (source: string, options?: DvalaRunOptions) => unknown
  runAsync: (source: string, options?: DvalaRunAsyncOptions) => Promise<RunResult>
  getUndefinedSymbols: (source: string) => Set<string>
  getAutoCompleter: (program: string, position: number) => AutoCompleter
}

function assertSerializableBindings(bindings: Record<string, unknown> | undefined): void {
  if (!bindings)
    return
  for (const [key, val] of Object.entries(bindings))
    assertSerializable(val, `bindings["${key}"]`)
}

function assertSerializable(val: unknown, path: string): void {
  if (val === null || val === undefined)
    return
  if (typeof val === 'boolean' || typeof val === 'string')
    return
  if (typeof val === 'number') {
    if (!Number.isFinite(val))
      throw new TypeError(`${path} is not serializable (${val})`)
    return
  }
  if (typeof val === 'function')
    throw new TypeError(`${path} is not serializable (function)`)
  if (typeof val === 'object') {
    if (FUNCTION_SYMBOL in val || REGEXP_SYMBOL in val || EFFECT_SYMBOL in val)
      return
    if (Array.isArray(val)) {
      val.forEach((item, i) => assertSerializable(item, `${path}[${i}]`))
      return
    }
    if (Object.getPrototypeOf(val) !== Object.prototype)
      throw new TypeError(`${path} is not serializable (not a plain object)`)
    for (const [k, v] of Object.entries(val as Record<string, unknown>))
      assertSerializable(v, `${path}.${k}`)
    return
  }
  throw new TypeError(`${path} is not serializable`)
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

  function buildAst(source: string, filePath?: string): Ast {
    if (!filePath && cache) {
      const cached = cache.get(source)
      if (cached)
        return cached
    }
    const tokenStream = tokenize(source, debug, filePath)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const ast: Ast = { body: parse(minified), hasDebugData: debug }
    if (!filePath)
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
      assertSerializableBindings(runOptions?.bindings)
      const bindings = mergeBindings(runOptions?.bindings)
      const syncHandlers = mergeSyncHandlers(runOptions?.syncHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, syncHandlers, undefined)

      const contextStack = createContextStack({ bindings }, modules, pure)
      const ast = buildAst(source, runOptions?.filePath)

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
      assertSerializableBindings(runOptions?.bindings)
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

    getUndefinedSymbols(source: string): Set<string> {
      const modulesList = modules ? [...modules.values()] : undefined
      return standaloneGetUndefinedSymbols(source, { bindings: factoryBindings, modules: modulesList })
    },

    getAutoCompleter(program: string, position: number): AutoCompleter {
      const params: AutoCompleterParams = { bindings: factoryBindings }
      return new AutoCompleter(program, position, params)
    },
  }
}
