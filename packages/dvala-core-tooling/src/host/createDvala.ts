import { AutoCompleter } from '../AutoCompleter/AutoCompleter'
import type { DvalaModule } from '@mojir/dvala-engine'
import type { FileResolver } from '@mojir/dvala-engine'
import type { ParseSource } from '@mojir/dvala-engine'
import type { RuntimeHandlers, RuntimeRunResult } from '@mojir/dvala-runtime'
import type { Ast, AstNode, SourceMap } from '@mojir/dvala-types'
import { initCoreDvalaSources } from '@mojir/dvala-engine'
import type { DvalaBundle } from '../bundler/interface'
import { getUndefinedSymbols as standaloneGetUndefinedSymbols } from '../standaloneTooling'
import { typecheck as runTypecheck, type TypeDiagnostic, type TypecheckResult } from '../typechecker/typecheck'
import type { DvalaRunAsyncOptions, DvalaRunOptions } from '@mojir/dvala-runtime'
import { createRuntimeRunner } from './runtime/createRuntimeRunner'
import { createAstBuilder } from './runtime/createAstBuilder'
import { dvalaSpanKey, isBuiltinDvalaPath, isGlobalDvalaCoverageEnabled, recordGlobalDvalaSpan } from './dvalaCoverage'
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
  /**
   * Collect `.dvala` coverage for this instance. When enabled, every `run`/`runAsync`
   * call on this runner records evaluated node IDs (including builtin `.dvala` bodies),
   * retrievable via `getCoverage()`. Forces `debug` on so source maps exist for
   * attribution. Opt-in and off by default — `onNodeEval` per node is too costly for
   * the default hot path. See `getCoverage`.
   */
  coverage?: boolean
}

/** Coverage data collected by a `coverage: true` runner — feed to `generateLcov` / `computeCoverageSummary`. */
export interface DvalaCoverage {
  /** nodeId → number of times evaluated, accumulated across every run on this instance. */
  coverageMap: Map<number, number>
  /** Accumulated source map (builtins + user programs); maps node IDs back to source. */
  sourceMap?: SourceMap
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
  /**
   * Returns the `.dvala` coverage accumulated by this instance, or `undefined`
   * when the instance was not created with `coverage: true`.
   */
  getCoverage: () => DvalaCoverage | undefined
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
  // Per-instance node ID counter — ensures unique IDs within this runner.
  // Can be overridden via options.nodeIdAllocator for cross-instance coordination.
  let nodeIdCounter = 0
  const allocateNodeId = () => nodeIdCounter++

  const modules = options?.modules ? new Map(options.modules.map(m => [m.name, m])) : undefined
  const factoryEffectHandlers = options?.effectHandlers
  const factoryDisableTimeTravel = options?.disableAutoCheckpoint ?? false
  const factoryFileResolver = options?.fileResolver
  const factoryFileResolverBaseDir = options?.fileResolverBaseDir
  // Two coverage modes, deliberately decoupled:
  //  - `coverage: true` (attributable opt-in): forces debug + builds a per-instance
  //    map + source map, retrievable via getCoverage(). Changes debug-observable
  //    behavior, so it's strictly opt-in.
  //  - `DVALA_COVERAGE=1` (union baseline): attaches a record-only hook to EVERY
  //    instance WITHOUT forcing debug — the hook only reads node[2], and the builtin
  //    source map it needs is deterministic, so it's built once globally (below).
  //    Decoupling from debug is what keeps the baseline from perturbing error
  //    messages or leaking builtins into unrelated coverage summaries.
  const explicitCoverage = options?.coverage ?? false
  const globalCoverage = isGlobalDvalaCoverageEnabled()
  const debug = (options?.debug ?? false) || explicitCoverage
  const typecheckEnabled = options?.typecheck ?? true
  const onTypeDiagnostic = options?.onTypeDiagnostic
  const registeredModules = modules ? [...modules.values()] : undefined
  const astBuilder = createAstBuilder({
    debug,
    cacheSize: options?.cache ?? 100,
    allocateNodeId,
  })

  // Parse + register the core `.dvala` builtins, always sharing this instance's
  // node-ID allocator so builtin nodeIds don't collide with the user program (and
  // the [0, N) reservation holds in every instance — see initCoreDvalaSources).
  //
  // We build the builtin source map when EITHER coverage mode is active. It's the
  // SAME parse that assigns dvalaImpl on the first instance, so its node IDs *and*
  // structuralLeaf flags exactly match the executed builtin bodies — critical for
  // the union baseline, since onNodeEval skips structural leaves using the executed
  // node's flag, and a separately-parsed map could classify leaves differently
  // (leaf classification depends on registry state at parse time) and report false
  // uncovered/covered expressions.
  const builtinSourceMap = initCoreDvalaSources(parseSource, {
    debug: explicitCoverage || globalCoverage,
    allocateNodeId,
    // Union baseline: record the core builtins' init-time top-level coverage (root
    // object + entries + lambda definitions). These execute once here, at instance
    // construction — never during a `run` — so the run-time recorder below never sees
    // them, and they'd show permanently uncovered (module builtins don't have this
    // gap: they're import-evaluated during a run). Function bodies are unaffected —
    // they still record when invoked.
    recordSpan: globalCoverage
      ? (path, start, end) => {
          if (isBuiltinDvalaPath(path)) recordGlobalDvalaSpan(dvalaSpanKey(path, start, end))
        }
      : undefined,
  })
  if (builtinSourceMap) {
    // Seed core builtins into the accumulated map under EITHER coverage mode, so the
    // recorder (below) can resolve a builtin node's source span by id. This now also
    // happens under the global env — builtins thus appear in this instance's accumulated
    // map, but `computeCoverageSummary` excludes engine-builtin paths from a user-project
    // summary by default, so runTestFile-style reports stay clean. Module builtins are
    // merged into the same map lazily, at import time (trampoline Import path).
    if (explicitCoverage || globalCoverage) astBuilder.setAccumulatedSourceMap(builtinSourceMap)
  }

  // Recorder. Fires on every run (sync + async). Writes to the per-instance id→count map
  // for getCoverage() (attributable opt-in), and — under the global env — records the
  // builtin node's SOURCE SPAN into the process-global union (span-keyed, robust to the
  // module node-ID variance across instances).
  const coverageMap = explicitCoverage ? new Map<number, number>() : undefined
  const recordsCoverage = !!coverageMap || globalCoverage
  const factoryOnNodeEval = recordsCoverage
    ? (node: AstNode) => {
        const id = node[2]
        if (coverageMap) coverageMap.set(id, (coverageMap.get(id) ?? 0) + 1)
        if (globalCoverage) {
          const sm = astBuilder.getAccumulatedSourceMap()
          const pos = sm?.positions.get(id)
          if (sm && pos && !pos.structuralLeaf) {
            const src = sm.sources[pos.source]
            if (src && isBuiltinDvalaPath(src.path)) recordGlobalDvalaSpan(dvalaSpanKey(src.path, pos.start, pos.end))
          }
        }
      }
    : undefined

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
      factoryOnNodeEval,
    }),

    getCoverage(): DvalaCoverage | undefined {
      if (!coverageMap) return undefined
      return { coverageMap, sourceMap: astBuilder.getAccumulatedSourceMap() }
    },

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
