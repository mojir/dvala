import { AutoCompleter } from './AutoCompleter/AutoCompleter'
import { DvalaError } from './errors'
import type { DvalaModule } from './builtin/modules/interface'
import { createContextStack } from './evaluator/ContextStack'
import type { Context } from './evaluator/interface'
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
import { toJS, validateFromJS } from './utils/interop'
import { typecheck as runTypecheck, type TypeDiagnostic, type TypecheckResult } from './typechecker/typecheck'

export interface CreateDvalaOptions {
  /** Built-in modules to register (e.g. `allBuiltinModules`). */
  modules?: DvalaModule[]
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
  /**
   * Enable type checking (default: true). Source code is type-checked after parsing.
   * Type errors are reported via `onTypeDiagnostic` but do NOT block evaluation.
   * Set to `false` to skip type checking for performance.
   */
  typecheck?: boolean
  /**
   * Callback invoked with type diagnostics after type checking.
   * Only called when `typecheck: true`.
   */
  onTypeDiagnostic?: (diagnostic: TypeDiagnostic) => void
}

/**
 * Options for `run()`. When `pure` is `true`, `effectHandlers` cannot be provided.
 */
export type DvalaRunOptions =
  | { scope?: Record<string, unknown>; pure: true; effectHandlers?: never; filePath?: string }
  | { scope?: Record<string, unknown>; pure?: false; effectHandlers?: Handlers; filePath?: string }

/**
 * Options for `runAsync()`. When `pure` is `true`, `effectHandlers` cannot be provided.
 * Time travel (auto-checkpointing and terminal snapshots) is enabled by default.
 * Set `disableAutoCheckpoint: true` to opt out.
 */
export type DvalaRunAsyncOptions =
  | { scope?: Record<string, unknown>; pure: true; effectHandlers?: never; maxSnapshots?: number; disableAutoCheckpoint?: boolean; terminalSnapshot?: boolean; onNodeEval?: SnapshotState['onNodeEval']; filePath?: string }
  | { scope?: Record<string, unknown>; pure?: false; effectHandlers?: Handlers; maxSnapshots?: number; disableAutoCheckpoint?: boolean; terminalSnapshot?: boolean; onNodeEval?: SnapshotState['onNodeEval']; filePath?: string }

export interface DvalaRunner {
  run: (source: string | DvalaBundle, options?: DvalaRunOptions) => unknown
  runAsync: (source: string | DvalaBundle, options?: DvalaRunAsyncOptions) => Promise<RunResult>
  getUndefinedSymbols: (source: string, symbolsOptions?: { scope?: Record<string, unknown> }) => Set<string>
  getAutoCompleter: (program: string, position: number) => AutoCompleter
  /** Typecheck source code and return diagnostics + type map. */
  typecheck: (source: string, options?: { fileResolverBaseDir?: string; filePath?: string }) => TypecheckResult
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
  const factoryEffectHandlers = options?.effectHandlers
  const factoryDisableTimeTravel = options?.disableAutoCheckpoint ?? false
  const factoryFileResolver = options?.fileResolver
  const factoryFileResolverBaseDir = options?.fileResolverBaseDir
  const debug = options?.debug ?? false
  const typecheckEnabled = options?.typecheck ?? true
  const onTypeDiagnostic = options?.onTypeDiagnostic
  const registeredModules = modules ? [...modules.values()] : undefined
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

  // Convert a plain scope record to a globalContext for createContextStack.
  // Each value is wrapped as { value } to match the Context type.
  // fromJS converts plain JS arrays/objects to PersistentVector/PersistentMap so
  // the evaluator can operate on them correctly.
  function scopeToGlobalContext(scope?: Record<string, unknown>): Context | undefined {
    if (!scope) return undefined
    const ctx: Context = {}
    for (const [k, v] of Object.entries(scope)) {
      ctx[k] = { value: validateFromJS(v, `scope binding "${k}"`) }
    }
    return ctx
  }

  function emitTypeDiagnostics(ast: Ast): void {
    if (!typecheckEnabled) return
    const { diagnostics } = runTypecheck(ast, { modules: registeredModules })
    if (!onTypeDiagnostic) return
    for (const diagnostic of diagnostics) onTypeDiagnostic(diagnostic)
  }

  return {
    run(source: string | DvalaBundle, runOptions?: DvalaRunOptions): unknown {
      const effectHandlers = mergeEffectHandlers(runOptions?.effectHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, effectHandlers)

      const contextStack = createContextStack({ globalContext: scopeToGlobalContext(runOptions?.scope) }, modules, pure, undefined, factoryFileResolver, factoryFileResolverBaseDir)

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

      // Run typecheck pass if enabled (non-blocking — diagnostics only)
      emitTypeDiagnostics(ast)

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
      const effectHandlers = mergeEffectHandlers(runOptions?.effectHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, effectHandlers)

      try {
        const forceDebug = !!runOptions?.onNodeEval
        const effectiveDebug = debug || forceDebug
        const contextStack = createContextStack({ globalContext: scopeToGlobalContext(runOptions?.scope) }, modules, pure, undefined, factoryFileResolver, factoryFileResolverBaseDir, effectiveDebug ? allocateNodeId : undefined, effectiveDebug)

        // For AST bundles, use the pre-parsed AST directly.
        // Force debug (sourceMap building) when onNodeEval is set so nodeIds can be resolved.
        const ast = isDvalaBundle(source) ? source.ast : buildAst(source, runOptions?.filePath, forceDebug)
        if (!isDvalaBundle(source)) {
          emitTypeDiagnostics(ast)
        }
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
        // Share the accumulated source map with the context stack so that
        // runtime file imports can merge their positions into it for coverage.
        if (accumulatedSourceMap) {
          contextStack.sourceMap = accumulatedSourceMap
        }
        const disableAutoCheckpoint = runOptions?.disableAutoCheckpoint ?? factoryDisableTimeTravel
        const terminalSnapshot = runOptions?.terminalSnapshot
        const result = await evaluateWithEffects(ast, contextStack, effectHandlers, runOptions?.maxSnapshots, {
          modules,
        }, !disableAutoCheckpoint, terminalSnapshot, runOptions?.onNodeEval)
        // Include the accumulated sourceMap so callers can resolve nodeIds to positions.
        // Only present when debug mode was active (explicitly or via onNodeEval).
        const sourceMap = accumulatedSourceMap
        if (result.type === 'completed') {
          // Apply toJS to convert PV/PM to plain JS arrays/objects, matching run() semantics
          return { ...result, value: toJS(result.value as never), scope: contextStack.getModuleScopeBindings(), sourceMap }
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

    getUndefinedSymbols(source: string, symbolsOptions?: { scope?: Record<string, unknown> }): Set<string> {
      const modulesList = modules ? [...modules.values()] : undefined
      return standaloneGetUndefinedSymbols(source, { scope: symbolsOptions?.scope, modules: modulesList })
    },

    getAutoCompleter(program: string, position: number): AutoCompleter {
      return new AutoCompleter(program, position, {})
    },

    typecheck(source: string, typecheckOptions?: { fileResolverBaseDir?: string; filePath?: string }): TypecheckResult {
      const ast = buildAst(source, typecheckOptions?.filePath, true)
      return runTypecheck(ast, {
        modules: registeredModules,
        fileResolver: factoryFileResolver,
        fileResolverBaseDir: typecheckOptions?.fileResolverBaseDir ?? factoryFileResolverBaseDir,
      })
    },
  }
}
