import { AutoCompleter } from '../AutoCompleter/AutoCompleter'
import type { DvalaModule } from '@mojir/dvala-engine'
import type { FileResolver } from '@mojir/dvala-engine'
import type { ParseSource } from '@mojir/dvala-engine'
import type { RuntimeHandlers, RuntimeRunResult } from '@mojir/dvala-runtime'
import type { Ast } from '@mojir/dvala-types'
import { initCoreDvalaSources } from '@mojir/dvala-engine'
import type { DvalaBundle } from '../bundler/interface'
import { getUndefinedSymbols as standaloneGetUndefinedSymbols } from '../standaloneTooling'
import { typecheck as runTypecheck, type TypeDiagnostic, type TypecheckResult } from '../typechecker/typecheck'
import type { DvalaRunAsyncOptions, DvalaRunOptions } from '@mojir/dvala-runtime'
import { createRuntimeRunner } from './runtime/createRuntimeRunner'
import { createAstBuilder } from './runtime/createAstBuilder'
import { scopeToGlobalContext } from '@mojir/dvala-engine'
import { prettyPrint } from '../prettyPrint'
import { parseToAst } from '../parser'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'

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

/**
 * Host implementation of the `ParseSource` capability — the seam that lets the
 * engine compile source → Ast without depending on the parser directly.
 */
const parseSource: ParseSource = (source, opts = {}) => {
  const tokens = tokenize(source, opts.debug ?? false, opts.filePath)
  const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
  return parseToAst(minified, opts.allocateNodeId)
}

export function createDvala(options?: CreateDvalaOptions): DvalaRunner {
  initCoreDvalaSources(parseSource)
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
  const astBuilder = createAstBuilder({
    debug,
    cacheSize: options?.cache ?? 100,
    allocateNodeId,
  })

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
      parseSource,
      prettyPrint,
      buildAst: astBuilder.buildAst,
      emitTypeDiagnostics,
      scopeToGlobalContext,
      getAccumulatedSourceMap: astBuilder.getAccumulatedSourceMap,
      setAccumulatedSourceMap: astBuilder.setAccumulatedSourceMap,
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
      const ast = astBuilder.buildAst(source, typecheckOptions?.filePath, true)
      return runTypecheck(ast, {
        modules: registeredModules,
        fileResolver: factoryFileResolver,
        fileResolverBaseDir: typecheckOptions?.fileResolverBaseDir ?? factoryFileResolverBaseDir,
        fold: typecheckOptions?.fold,
        createDvala,
      })
    },
  }
}
