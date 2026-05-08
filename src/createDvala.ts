import { AutoCompleter } from './AutoCompleter/AutoCompleter'
import type { DvalaModule } from './builtin/modules/interface'
import type { Context } from './evaluator/interface'
import type { FileResolver } from './evaluator/ContextStack'
import type { RuntimeHandlers, RuntimeRunResult } from '@mojir/dvala-runtime'
import { tokenize } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parseToAst } from './parser'
import type { Ast, SourceMap } from './parser/types'
import { initCoreDvalaSources } from './builtin/normalExpressions/initCoreDvala'
import { Cache } from './Cache'
import type { DvalaBundle } from './bundler/interface'
import { getUndefinedSymbols as standaloneGetUndefinedSymbols } from './tooling'
import { validateFromJS } from './utils/interop'
import { typecheck as runTypecheck, type TypeDiagnostic, type TypecheckResult } from './typechecker/typecheck'
import type { DvalaRunAsyncOptions, DvalaRunOptions } from '@mojir/dvala-runtime'
import { createRuntimeRunner } from './runtime/createRuntimeRunner'

export interface CreateDvalaOptions {
  /** Built-in modules to register (e.g. `allBuiltinModules`). */
  modules?: DvalaModule[]
  /** Factory-level effect handlers, checked after per-call handlers. */
  effectHandlers?: RuntimeHandlers
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

export type { DvalaRunAsyncOptions, DvalaRunOptions } from '@mojir/dvala-runtime'

export interface DvalaRunner {
  run: (source: string | DvalaBundle, options?: DvalaRunOptions) => unknown
  runAsync: (source: string | DvalaBundle, options?: DvalaRunAsyncOptions) => Promise<RuntimeRunResult>
  getUndefinedSymbols: (source: string, symbolsOptions?: { scope?: Record<string, unknown> }) => Set<string>
  getAutoCompleter: (program: string, position: number) => AutoCompleter
  /** Typecheck source code and return diagnostics + type map. */
  typecheck: (
    source: string,
    options?: { fileResolverBaseDir?: string; filePath?: string; fold?: boolean },
  ) => TypecheckResult
}

export function createDvala(options?: CreateDvalaOptions): DvalaRunner {
  initCoreDvalaSources()
  // Per-instance node ID counter — ensures unique IDs within this runner.
  // Can be overridden via options.nodeIdAllocator for cross-instance coordination.
  let nodeIdCounter = 0
  const allocateNodeId = () => nodeIdCounter++

  const modules = options?.modules ? new Map(options.modules.map(m => [m.name, m])) : undefined
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
      if (cached) return cached
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
    if (!filePath && !forceDebug) cache.set(source, ast)
    return ast
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
    ...createRuntimeRunner({
      modules,
      factoryEffectHandlers,
      factoryDisableTimeTravel,
      factoryFileResolver,
      factoryFileResolverBaseDir,
      debug,
      allocateNodeId,
      buildAst,
      emitTypeDiagnostics,
      scopeToGlobalContext,
      getAccumulatedSourceMap: () => accumulatedSourceMap,
      setAccumulatedSourceMap: sourceMap => {
        accumulatedSourceMap = sourceMap
      },
    }),

    getUndefinedSymbols(source: string, symbolsOptions?: { scope?: Record<string, unknown> }): Set<string> {
      const modulesList = modules ? [...modules.values()] : undefined
      return standaloneGetUndefinedSymbols(source, { scope: symbolsOptions?.scope, modules: modulesList })
    },

    getAutoCompleter(program: string, position: number): AutoCompleter {
      return new AutoCompleter(program, position, {})
    },

    typecheck(
      source: string,
      typecheckOptions?: { fileResolverBaseDir?: string; filePath?: string; fold?: boolean },
    ): TypecheckResult {
      const ast = buildAst(source, typecheckOptions?.filePath, true)
      return runTypecheck(ast, {
        modules: registeredModules,
        fileResolver: factoryFileResolver,
        fileResolverBaseDir: typecheckOptions?.fileResolverBaseDir ?? factoryFileResolverBaseDir,
        fold: typecheckOptions?.fold,
      })
    },
  }
}
