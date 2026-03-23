import { AutoCompleter } from './AutoCompleter/AutoCompleter'
import type { AutoCompleterParams } from './AutoCompleter/AutoCompleter'
import { DvalaError } from './errors'
import type { DvalaModule } from './builtin/modules/interface'
import { createContextStack } from './evaluator/ContextStack'
import { evaluate, evaluateWithEffects, evaluateWithSyncEffects } from './evaluator/trampoline-evaluator'
import { tokenize } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parseToAst } from './parser'
import { resetNodeIdCounter } from './parser/ParserContext'
import type { Ast, SourceMap } from './parser/types'
import { initCoreDvalaSources } from './builtin/normalExpressions/initCoreDvala'
import { Cache } from './Cache'
import type { DvalaBundle } from './bundler/interface'
import { isDvalaBundle } from './bundler/interface'
import type { Handlers, RunResult } from './evaluator/effectTypes'
import { getUndefinedSymbols as standaloneGetUndefinedSymbols } from './tooling'
import { EFFECT_SYMBOL, FUNCTION_SYMBOL, REGEXP_SYMBOL } from './utils/symbols'

export interface CreateDvalaOptions {
  modules?: DvalaModule[]
  bindings?: Record<string, unknown>
  effectHandlers?: Handlers
  cache?: number
  /** Enable debug tokenization: captures source positions for better error messages. */
  debug?: boolean
  /** Disable time travel features (auto-checkpointing and terminal snapshots). Enabled by default. */
  disableAutoCheckpoint?: boolean
}

/**
 * Options for `run()`. When `pure` is `true`, `effectHandlers` cannot be provided.
 */
export type DvalaRunOptions =
  | { bindings?: Record<string, unknown>; pure: true; effectHandlers?: never; filePath?: string }
  | { bindings?: Record<string, unknown>; pure?: false; effectHandlers?: Handlers; filePath?: string }

/**
 * Options for `runAsync()`. When `pure` is `true`, `effectHandlers` cannot be provided.
 * Time travel (auto-checkpointing and terminal snapshots) is enabled by default.
 * Set `disableAutoCheckpoint: true` to opt out.
 */
export type DvalaRunAsyncOptions =
  | { bindings?: Record<string, unknown>; pure: true; effectHandlers?: never; maxSnapshots?: number; disableAutoCheckpoint?: boolean; terminalSnapshot?: boolean }
  | { bindings?: Record<string, unknown>; pure?: false; effectHandlers?: Handlers; maxSnapshots?: number; disableAutoCheckpoint?: boolean; terminalSnapshot?: boolean }

export interface DvalaRunner {
  run: (source: string | DvalaBundle, options?: DvalaRunOptions) => unknown
  runAsync: (source: string | DvalaBundle, options?: DvalaRunAsyncOptions) => Promise<RunResult>
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
  resetNodeIdCounter()
  initCoreDvalaSources()

  const modules = options?.modules
    ? new Map(options.modules.map(m => [m.name, m]))
    : undefined
  const factoryBindings = options?.bindings
  const factoryEffectHandlers = options?.effectHandlers
  const factoryDisableTimeTravel = options?.disableAutoCheckpoint ?? false
  const debug = options?.debug ?? false
  // Always use an internal AST cache to ensure deterministic node IDs
  // when the same source is run multiple times.
  const cache = new Cache(options?.cache ?? 100)
  // Accumulated source map across all run() calls (debug mode only).
  // Global node IDs ensure no collisions between files.
  let accumulatedSourceMap: SourceMap | undefined

  function buildAst(source: string, filePath?: string): Ast {
    if (!filePath) {
      const cached = cache.get(source)
      if (cached)
        return cached
    }
    const tokenStream = tokenize(source, debug, filePath)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const ast: Ast = parseToAst(minified)
    // Accumulate source map from each parsed file
    if (ast.sourceMap) {
      if (!accumulatedSourceMap) {
        accumulatedSourceMap = { sources: [...ast.sourceMap.sources], positions: [...ast.sourceMap.positions] }
      } else {
        const sourceOffset = accumulatedSourceMap.sources.length
        accumulatedSourceMap.sources.push(...ast.sourceMap.sources)
        for (let i = 0; i < ast.sourceMap.positions.length; i++) {
          const pos = ast.sourceMap.positions[i]
          if (pos) {
            accumulatedSourceMap.positions[i] = { ...pos, source: pos.source + sourceOffset }
          }
        }
      }
      // Point ast's sourceMap to the accumulated one so evaluate() uses it
      ast.sourceMap = accumulatedSourceMap
    }
    if (!filePath)
      cache.set(source, ast)
    return ast
  }

  function mergeBindings(runBindings?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!factoryBindings && !runBindings)
      return undefined
    return { ...factoryBindings, ...runBindings }
  }

  function mergeEffectHandlers(runEffectHandlers?: Handlers): Handlers | undefined {
    if (!factoryEffectHandlers && !runEffectHandlers)
      return undefined
    // Run handlers first (checked first), then factory handlers.
    return [...(runEffectHandlers ?? []), ...(factoryEffectHandlers ?? [])]
  }

  function assertNotPureWithHandlers(
    pure: boolean,
    effectHandlers: Handlers | undefined,
  ): void {
    if (!pure)
      return
    const hasEffectHandlers = effectHandlers && effectHandlers.length > 0
    if (hasEffectHandlers) {
      throw new TypeError('Cannot use pure mode with effect handlers')
    }
  }

  return {
    run(source: string | DvalaBundle, runOptions?: DvalaRunOptions): unknown {
      assertSerializableBindings(runOptions?.bindings)
      const bindings = mergeBindings(runOptions?.bindings)
      const effectHandlers = mergeEffectHandlers(runOptions?.effectHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, effectHandlers)

      const contextStack = createContextStack({ bindings }, modules, pure)

      if (isDvalaBundle(source)) {
        const savedPure = contextStack.pure
        contextStack.pure = true
        for (const [name, fileSource] of source.fileModules) {
          const fileAst = buildAst(fileSource)
          const moduleContextStack = contextStack.create({})
          contextStack.registerValueModule(name, evaluate(fileAst, moduleContextStack))
        }
        contextStack.pure = savedPure
        const ast = buildAst(source.program)
        const result = evaluate(ast, contextStack)
        // Defensive guard: evaluate() currently never returns a Promise for bundle programs
        // because bundles are pure. Kept as a safety net if that invariant ever changes.
        /* v8 ignore next 2 */
        if (result instanceof Promise)
          throw new TypeError('Unexpected async result in run(). Use runAsync() for async operations.')
        return result
      }

      const ast = buildAst(source, runOptions?.filePath)

      if (effectHandlers) {
        return evaluateWithSyncEffects(ast, contextStack, effectHandlers)
      }

      const result = evaluate(ast, contextStack)
      if (result instanceof Promise) {
        throw new TypeError('Unexpected async result in run(). Use runAsync() for async operations.')
      }
      return result
    },

    async runAsync(source: string | DvalaBundle, runOptions?: DvalaRunAsyncOptions): Promise<RunResult> {
      assertSerializableBindings(runOptions?.bindings)
      const bindings = mergeBindings(runOptions?.bindings)
      const effectHandlers = mergeEffectHandlers(runOptions?.effectHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, effectHandlers)

      try {
        const contextStack = createContextStack({ bindings }, modules, pure)

        if (isDvalaBundle(source)) {
          const savedPure = contextStack.pure
          contextStack.pure = true
          for (const [name, fileSource] of source.fileModules) {
            const fileAst = buildAst(fileSource)
            const moduleContextStack = contextStack.create({})
            contextStack.registerValueModule(name, evaluate(fileAst, moduleContextStack))
          }
          contextStack.pure = savedPure
        }

        const programSource = isDvalaBundle(source) ? source.program : source
        const ast = buildAst(programSource)
        const disableAutoCheckpoint = runOptions?.disableAutoCheckpoint ?? factoryDisableTimeTravel
        const terminalSnapshot = runOptions?.terminalSnapshot
        const result = await evaluateWithEffects(ast, contextStack, effectHandlers, runOptions?.maxSnapshots, {
          values: bindings,
          modules,
        }, !disableAutoCheckpoint, terminalSnapshot)
        if (result.type === 'completed') {
          return { ...result, definedBindings: contextStack.getModuleScopeBindings() }
        }
        return result
      } catch (error) {
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
