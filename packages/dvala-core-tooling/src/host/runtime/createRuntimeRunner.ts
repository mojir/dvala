import type { DvalaModule } from '@mojir/dvala-engine'
import type {
  DvalaRunAsyncOptions,
  DvalaRunOptions,
  RuntimeHandlers,
  RuntimeNodeEvalHook,
  RuntimeRunResult,
} from '@mojir/dvala-runtime'
import { DvalaError } from '@mojir/dvala-types'
import { createContextStack } from '@mojir/dvala-engine'
import type { FileResolver } from '@mojir/dvala-engine'
import type { Context, ParseSource, PrettyPrint } from '@mojir/dvala-engine'
import { evaluate, evaluateWithEffects, evaluateWithSyncEffects } from '@mojir/dvala-engine'
import type { Ast, SourceMap } from '@mojir/dvala-types'
import type { DvalaBundle } from '../../bundler/interface'
import { isDvalaBundle } from '../../bundler/interface'
import { toJS } from '@mojir/dvala-engine'

interface RuntimeExecutionRunner {
  run: (source: string | DvalaBundle, options?: DvalaRunOptions) => unknown
  runAsync: (source: string | DvalaBundle, options?: DvalaRunAsyncOptions) => Promise<RuntimeRunResult>
}

interface CreateRuntimeRunnerOptions {
  modules?: Map<string, DvalaModule>
  factoryEffectHandlers?: RuntimeHandlers
  factoryDisableTimeTravel: boolean
  factoryFileResolver?: FileResolver
  factoryFileResolverBaseDir?: string
  debug: boolean
  allocateNodeId: () => number
  parseSource: ParseSource
  prettyPrint: PrettyPrint
  buildAst: (source: string, filePath?: string, forceDebug?: boolean) => Ast
  emitTypeDiagnostics: (ast: Ast) => void
  scopeToGlobalContext: (scope?: Record<string, unknown>) => Context | undefined
  getAccumulatedSourceMap: () => SourceMap | undefined
  setAccumulatedSourceMap: (sourceMap: SourceMap | undefined) => void
  /**
   * Instance-level node-eval hook for `.dvala` coverage. When set, fires on every
   * run (sync and async) in addition to any per-run `onNodeEval`. The host installs
   * this when `createDvala({ coverage: true })`; it forces debug so source maps exist.
   */
  factoryOnNodeEval?: RuntimeNodeEvalHook
}

export function createRuntimeRunner(options: CreateRuntimeRunnerOptions): RuntimeExecutionRunner {
  function mergeEffectHandlers(runEffectHandlers?: RuntimeHandlers): RuntimeHandlers | undefined {
    if (!options.factoryEffectHandlers && !runEffectHandlers) return undefined
    return [...(runEffectHandlers ?? []), ...(options.factoryEffectHandlers ?? [])]
  }

  function assertNotPureWithHandlers(pure: boolean, effectHandlers: RuntimeHandlers | undefined): void {
    if (!pure) return
    const hasEffectHandlers = effectHandlers && effectHandlers.length > 0
    if (hasEffectHandlers) {
      throw new TypeError('Cannot use pure mode with effect handlers')
    }
  }

  return {
    run(source: string | DvalaBundle, runOptions?: DvalaRunOptions): unknown {
      const effectHandlers = mergeEffectHandlers(runOptions?.effectHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, effectHandlers)

      // Instance-level coverage hook. When set (createDvala({ coverage: true }) or
      // DVALA_COVERAGE=1) the `coverage` FLAG goes on the context stack so builtin
      // module imports get coverage-parsed and merged into the accumulated source map
      // (where the recorder resolves them). Crucially this does NOT force debug onto
      // the USER program: the union baseline only attributes BUILTIN `.dvala` nodes,
      // and debug-building the user program would perturb error messages (Location
      // suffixes) and embed run-varying node IDs (breaking determinism checks).
      // `options.debug` already captures explicit `coverage: true` (which DOES want a
      // debug user program for getCoverage()), so we key user-program debug on it.
      const onNodeEval = options.factoryOnNodeEval
      const coverage = !!onNodeEval
      const effectiveDebug = options.debug

      const contextStack = createContextStack({
        globalContext: options.scopeToGlobalContext(runOptions?.scope),
        modules: options.modules,
        pure,
        fileResolver: options.factoryFileResolver,
        currentFileDir: options.factoryFileResolverBaseDir,
        allocateNodeId: effectiveDebug ? options.allocateNodeId : undefined,
        debug: effectiveDebug,
        coverage,
        parseSource: options.parseSource,
        prettyPrint: options.prettyPrint,
      })
      if (coverage) {
        const accumulated = options.getAccumulatedSourceMap()
        if (accumulated) contextStack.sourceMap = accumulated
      }

      if (isDvalaBundle(source)) {
        const ast = source.ast
        if (effectHandlers) {
          return toJS(evaluateWithSyncEffects(ast, contextStack, effectHandlers, onNodeEval))
        }
        const result = evaluate(ast, contextStack, onNodeEval)
        if (result instanceof Promise)
          throw new TypeError('Unexpected async result in run(). Use runAsync() for async operations.')
        return toJS(result)
      }

      const ast = options.buildAst(source, runOptions?.filePath, effectiveDebug)
      options.emitTypeDiagnostics(ast)

      if (effectHandlers) {
        return toJS(evaluateWithSyncEffects(ast, contextStack, effectHandlers, onNodeEval))
      }

      const result = evaluate(ast, contextStack, onNodeEval)
      if (result instanceof Promise) {
        throw new TypeError('Unexpected async result in run(). Use runAsync() for async operations.')
      }
      return toJS(result)
    },

    async runAsync(source: string | DvalaBundle, runOptions?: DvalaRunAsyncOptions): Promise<RuntimeRunResult> {
      const effectHandlers = mergeEffectHandlers(runOptions?.effectHandlers)
      const pure = runOptions?.pure ?? false

      assertNotPureWithHandlers(pure, effectHandlers)

      try {
        // Merge the instance-level coverage hook with any per-run hook so both fire.
        const perRunOnNodeEval = runOptions?.onNodeEval
        const factoryOnNodeEval = options.factoryOnNodeEval
        const onNodeEval: RuntimeNodeEvalHook =
          factoryOnNodeEval && perRunOnNodeEval
            ? (node, getContinuation) => {
                void factoryOnNodeEval(node, getContinuation)
                return perRunOnNodeEval(node, getContinuation)
              }
            : (factoryOnNodeEval ?? perRunOnNodeEval)
        // Debug-build (and accumulate the source map of) the user/bundle program only
        // when its OWN coverage is wanted: explicit `coverage: true` (via options.debug)
        // or a per-run hook (runTestFile measuring a user project). The factory-only
        // DVALA_COVERAGE baseline must NOT force user-program debug — it attributes only
        // builtin `.dvala` nodes, and debugging the user program would perturb error
        // messages and embed run-varying node IDs.
        const forceDebug = options.debug || !!perRunOnNodeEval
        const effectiveDebug = forceDebug
        // Builtin module-source coverage parsing is gated on the FACTORY coverage hook
        // (createDvala coverage / DVALA_COVERAGE), not a per-run onNodeEval — so
        // runTestFile (which passes a per-run hook to measure a USER project) doesn't
        // pull builtin modules into its run.
        const coverage = !!factoryOnNodeEval
        const contextStack = createContextStack({
          globalContext: options.scopeToGlobalContext(runOptions?.scope),
          modules: options.modules,
          pure,
          fileResolver: options.factoryFileResolver,
          currentFileDir: options.factoryFileResolverBaseDir,
          allocateNodeId: effectiveDebug ? options.allocateNodeId : undefined,
          debug: effectiveDebug,
          coverage,
          parseSource: options.parseSource,
          prettyPrint: options.prettyPrint,
        })

        const ast = isDvalaBundle(source) ? source.ast : options.buildAst(source, runOptions?.filePath, forceDebug)
        if (!isDvalaBundle(source)) {
          options.emitTypeDiagnostics(ast)
        }

        if (isDvalaBundle(source) && source.ast.sourceMap && forceDebug) {
          const accumulatedSourceMap = options.getAccumulatedSourceMap()
          if (!accumulatedSourceMap) {
            options.setAccumulatedSourceMap({
              sources: [...source.ast.sourceMap.sources],
              positions: new Map(source.ast.sourceMap.positions),
            })
          } else {
            const sourceOffset = accumulatedSourceMap.sources.length
            accumulatedSourceMap.sources.push(...source.ast.sourceMap.sources)
            for (const [nodeId, pos] of source.ast.sourceMap.positions) {
              accumulatedSourceMap.positions.set(nodeId, { ...pos, source: pos.source + sourceOffset })
            }
          }
        }

        const accumulatedSourceMap = options.getAccumulatedSourceMap()
        if (accumulatedSourceMap) {
          contextStack.sourceMap = accumulatedSourceMap
        }

        const disableAutoCheckpoint = runOptions?.disableAutoCheckpoint ?? options.factoryDisableTimeTravel
        const terminalSnapshot = runOptions?.terminalSnapshot
        const result = await evaluateWithEffects(
          ast,
          contextStack,
          effectHandlers,
          runOptions?.maxSnapshots,
          {
            modules: options.modules,
          },
          !disableAutoCheckpoint,
          terminalSnapshot,
          onNodeEval,
        )
        const sourceMap = options.getAccumulatedSourceMap()
        if (result.type === 'completed') {
          return {
            ...result,
            value: toJS(result.value as never),
            scope: contextStack.getModuleScopeBindings(),
            sourceMap,
          }
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
  }
}
