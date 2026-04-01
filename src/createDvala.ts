import { AutoCompleter } from './AutoCompleter/AutoCompleter'
import type { AutoCompleterParams } from './AutoCompleter/AutoCompleter'
import { DvalaError } from './errors'
import type { DvalaModule } from './builtin/modules/interface'
import { createContextStack } from './evaluator/ContextStack'
import type { FileResolver } from './evaluator/ContextStack'
import { evaluate, evaluateWithEffects, evaluateWithSyncEffects } from './evaluator/trampoline-evaluator'
import { tokenize } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parseToAst } from './parser'
import type { Ast, SourceMap } from './parser/types'
import { initCoreDvalaSources } from './builtin/normalExpressions/initCoreDvala'
import { Cache } from './Cache'
import type { DvalaBundle } from './bundler/interface'
import { isDvalaBundle } from './bundler/interface'
import type { Handlers, RunResult, SnapshotState } from './evaluator/effectTypes'
import { getUndefinedSymbols as standaloneGetUndefinedSymbols } from './tooling'
import { toJS } from './utils/interop'
import { isPersistentMap, isPersistentVector } from './utils/persistent'
import { EFFECT_SYMBOL, FUNCTION_SYMBOL, REGEXP_SYMBOL } from './utils/symbols'

export interface CreateDvalaOptions {
  /** Built-in modules to register (e.g. `allBuiltinModules`). */
  modules?: DvalaModule[]
  /** Global bindings available to all `run()` / `runAsync()` calls. Must be JSON-serializable. */
  bindings?: Record<string, unknown>
  /** Factory-level effect handlers, checked after per-call handlers. */
  effectHandlers?: Handlers
  /** Maximum number of cached ASTs. Default: 100. */
  cache?: number
  /** Enable debug tokenization: captures source positions for better error messages. */
  debug?: boolean
  /** Disable time travel features (auto-checkpointing and terminal snapshots). Enabled by default. */
  disableAutoCheckpoint?: boolean
  /**
   * Callback to resolve file imports (`import("./path")`) at runtime.
   * Receives `(importPath, fromDir)` where `importPath` is the string from the
   * import expression and `fromDir` is the directory of the importing file.
   * Must return the file's source code as a string.
   *
   * Without a resolver, file imports throw a TypeError.
   * The `.dvala` extension is optional in import paths — the resolver should
   * try the exact path first, then append `.dvala`.
   *
   * Results are cached automatically: the same import path is only resolved once.
   * Circular imports are detected and reported as errors.
   *
   * @example
   * ```typescript
   * createDvala({
   *   fileResolver: (importPath, fromDir) => {
   *     const resolved = path.resolve(fromDir, importPath)
   *     if (fs.existsSync(resolved)) return fs.readFileSync(resolved, 'utf-8')
   *     const withExt = resolved + '.dvala'
   *     if (fs.existsSync(withExt)) return fs.readFileSync(withExt, 'utf-8')
   *     throw new Error(`File not found: ${importPath}`)
   *   },
   *   fileResolverBaseDir: './my-project',
   * })
   * ```
   */
  fileResolver?: FileResolver
  /**
   * Base directory for the first file import resolution.
   * Nested imports resolve relative to their own file's directory automatically.
   * Default: `'.'`
   */
  fileResolverBaseDir?: string
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
  | { bindings?: Record<string, unknown>; pure: true; effectHandlers?: never; maxSnapshots?: number; disableAutoCheckpoint?: boolean; terminalSnapshot?: boolean; onNodeEval?: SnapshotState['onNodeEval']; filePath?: string }
  | { bindings?: Record<string, unknown>; pure?: false; effectHandlers?: Handlers; maxSnapshots?: number; disableAutoCheckpoint?: boolean; terminalSnapshot?: boolean; onNodeEval?: SnapshotState['onNodeEval']; filePath?: string }

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
    // PersistentVector/PersistentMap are valid Dvala values — accept as-is
    if (isPersistentVector(val) || isPersistentMap(val))
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
  // Per-instance node ID counter — ensures unique IDs within this runner.
  // Can be overridden via options.nodeIdAllocator for cross-instance coordination.
  let nodeIdCounter = 0
  const allocateNodeId = () => nodeIdCounter++

  const modules = options?.modules
    ? new Map(options.modules.map(m => [m.name, m]))
    : undefined
  const factoryBindings = options?.bindings
  const factoryEffectHandlers = options?.effectHandlers
  const factoryDisableTimeTravel = options?.disableAutoCheckpoint ?? false
  const factoryFileResolver = options?.fileResolver
  const factoryFileResolverBaseDir = options?.fileResolverBaseDir
  const debug = options?.debug ?? false
  // Always use an internal AST cache to ensure deterministic node IDs
  // when the same source is run multiple times.
  const cache = new Cache(options?.cache ?? 100)
  // Accumulated source map across all run() calls (debug mode only).
  // Global node IDs ensure no collisions between files.
  let accumulatedSourceMap: SourceMap | undefined

  function buildAst(source: string, filePath?: string, forceDebug?: boolean): Ast {
    const effectiveDebug = debug || (forceDebug ?? false)
    if (!filePath && !forceDebug) {
      const cached = cache.get(source)
      if (cached)
        return cached
    }
    const tokenStream = tokenize(source, effectiveDebug, filePath)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    const ast: Ast = parseToAst(minified, allocateNodeId)
    // Accumulate source map from each parsed file
    if (ast.sourceMap) {
      if (!accumulatedSourceMap) {
        accumulatedSourceMap = { sources: [...ast.sourceMap.sources], positions: new Map(ast.sourceMap.positions) }
      } else {
        const sourceOffset = accumulatedSourceMap.sources.length
        accumulatedSourceMap.sources.push(...ast.sourceMap.sources)
        for (const [nodeId, pos] of ast.sourceMap.positions) {
          accumulatedSourceMap.positions.set(nodeId, { ...pos, source: pos.source + sourceOffset })
        }
      }
      // Point ast's sourceMap to the accumulated one so evaluate() uses it
      ast.sourceMap = accumulatedSourceMap
    }
    // Only cache when debug mode is consistent with the factory setting.
    // If forceDebug elevated debug for this call, the AST has a sourceMap that
    // would be absent from a non-debug cached entry — skip caching to avoid
    // serving a debug AST to non-debug callers (or vice versa).
    if (!filePath && !forceDebug)
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

      const contextStack = createContextStack({ bindings }, modules, pure, undefined, factoryFileResolver, factoryFileResolverBaseDir)

      if (isDvalaBundle(source)) {
        // New AST bundle format: single pre-parsed AST with all modules inlined.
        // The evaluator merges the source map into contextStack automatically.
        const ast = source.ast
        if (effectHandlers) {
          // toJS converts PersistentVector/Map to plain JS arrays/objects so
          // host code can work with standard JS values.
          return toJS(evaluateWithSyncEffects(ast, contextStack, effectHandlers) as never)
        }
        const result = evaluate(ast, contextStack)
        /* v8 ignore next 2 */
        if (result instanceof Promise)
          throw new TypeError('Unexpected async result in run(). Use runAsync() for async operations.')
        return toJS(result)
      }

      const ast = buildAst(source, runOptions?.filePath)

      if (effectHandlers) {
        return toJS(evaluateWithSyncEffects(ast, contextStack, effectHandlers) as never)
      }

      const result = evaluate(ast, contextStack)
      if (result instanceof Promise) {
        throw new TypeError('Unexpected async result in run(). Use runAsync() for async operations.')
      }
      return toJS(result)
    },

    async runAsync(source: string | DvalaBundle, runOptions?: DvalaRunAsyncOptions): Promise<RunResult> {
      assertSerializableBindings(runOptions?.bindings)
      const bindings = mergeBindings(runOptions?.bindings)
      const effectHandlers = mergeEffectHandlers(runOptions?.effectHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, effectHandlers)

      try {
        const contextStack = createContextStack({ bindings }, modules, pure, undefined, factoryFileResolver, factoryFileResolverBaseDir)

        // For AST bundles, use the pre-parsed AST directly.
        // Force debug (sourceMap building) when onNodeEval is set so nodeIds can be resolved.
        const forceDebug = !!runOptions?.onNodeEval
        const ast = isDvalaBundle(source) ? source.ast : buildAst(source, runOptions?.filePath, forceDebug)
        // For bundles, merge the bundle's sourceMap into accumulatedSourceMap so that
        // onNodeEval callers can resolve nodeIds to positions after the run.
        if (isDvalaBundle(source) && source.ast.sourceMap && forceDebug) {
          if (!accumulatedSourceMap) {
            accumulatedSourceMap = { sources: [...source.ast.sourceMap.sources], positions: new Map(source.ast.sourceMap.positions) }
          } else {
            const sourceOffset = accumulatedSourceMap.sources.length
            accumulatedSourceMap.sources.push(...source.ast.sourceMap.sources)
            for (const [nodeId, pos] of source.ast.sourceMap.positions)
              accumulatedSourceMap.positions.set(nodeId, { ...pos, source: pos.source + sourceOffset })
          }
        }
        const disableAutoCheckpoint = runOptions?.disableAutoCheckpoint ?? factoryDisableTimeTravel
        const terminalSnapshot = runOptions?.terminalSnapshot
        const result = await evaluateWithEffects(ast, contextStack, effectHandlers, runOptions?.maxSnapshots, {
          values: bindings,
          modules,
        }, !disableAutoCheckpoint, terminalSnapshot, runOptions?.onNodeEval)
        // Include the accumulated sourceMap so callers can resolve nodeIds to positions.
        // Only present when debug mode was active (explicitly or via onNodeEval).
        const sourceMap = accumulatedSourceMap
        if (result.type === 'completed') {
          // Apply toJS to convert PV/PM to plain JS arrays/objects, matching run() semantics
          return { ...result, value: toJS(result.value as never), definedBindings: contextStack.getModuleScopeBindings(), sourceMap }
        }
        return { ...result, sourceMap }
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
