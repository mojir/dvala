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

      const contextStack = createContextStack({
        globalContext: options.scopeToGlobalContext(runOptions?.scope),
        modules: options.modules,
        pure,
        fileResolver: options.factoryFileResolver,
        currentFileDir: options.factoryFileResolverBaseDir,
        parseSource: options.parseSource,
        prettyPrint: options.prettyPrint,
      })

      // Instance-level coverage hook (createDvala({ coverage: true })). It forces
      // debug on the instance, so source maps are already accumulated.
      const onNodeEval = options.factoryOnNodeEval

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

      const ast = options.buildAst(source, runOptions?.filePath)
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
        const forceDebug = !!onNodeEval
        const effectiveDebug = options.debug || forceDebug
        const contextStack = createContextStack({
          globalContext: options.scopeToGlobalContext(runOptions?.scope),
          modules: options.modules,
          pure,
          fileResolver: options.factoryFileResolver,
          currentFileDir: options.factoryFileResolverBaseDir,
          allocateNodeId: effectiveDebug ? options.allocateNodeId : undefined,
          debug: effectiveDebug,
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
