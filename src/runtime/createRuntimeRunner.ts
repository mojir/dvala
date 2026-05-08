import type { DvalaModule } from '../builtin/modules/interface'
import type { DvalaRunAsyncOptions, DvalaRunOptions, RuntimeHandlers, RuntimeRunResult } from '@mojir/dvala-runtime'
import { DvalaError } from '../errors'
import { createContextStack } from '../evaluator/ContextStack'
import type { FileResolver } from '../evaluator/ContextStack'
import type { Context } from '../evaluator/interface'
import { evaluate, evaluateWithEffects, evaluateWithSyncEffects } from '../evaluator/trampoline-evaluator'
import type { Ast, SourceMap } from '../parser/types'
import type { DvalaBundle } from '../bundler/interface'
import { isDvalaBundle } from '../bundler/interface'
import { toJS } from '../utils/interop'

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
  buildAst: (source: string, filePath?: string, forceDebug?: boolean) => Ast
  emitTypeDiagnostics: (ast: Ast) => void
  scopeToGlobalContext: (scope?: Record<string, unknown>) => Context | undefined
  getAccumulatedSourceMap: () => SourceMap | undefined
  setAccumulatedSourceMap: (sourceMap: SourceMap | undefined) => void
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

      const contextStack = createContextStack(
        { globalContext: options.scopeToGlobalContext(runOptions?.scope) },
        options.modules,
        pure,
        undefined,
        options.factoryFileResolver,
        options.factoryFileResolverBaseDir,
      )

      if (isDvalaBundle(source)) {
        const ast = source.ast
        if (effectHandlers) {
          return toJS(evaluateWithSyncEffects(ast, contextStack, effectHandlers))
        }
        const result = evaluate(ast, contextStack)
        if (result instanceof Promise)
          throw new TypeError('Unexpected async result in run(). Use runAsync() for async operations.')
        return toJS(result)
      }

      const ast = options.buildAst(source, runOptions?.filePath)
      options.emitTypeDiagnostics(ast)

      if (effectHandlers) {
        return toJS(evaluateWithSyncEffects(ast, contextStack, effectHandlers))
      }

      const result = evaluate(ast, contextStack)
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
        const forceDebug = !!runOptions?.onNodeEval
        const effectiveDebug = options.debug || forceDebug
        const contextStack = createContextStack(
          { globalContext: options.scopeToGlobalContext(runOptions?.scope) },
          options.modules,
          pure,
          undefined,
          options.factoryFileResolver,
          options.factoryFileResolverBaseDir,
          effectiveDebug ? options.allocateNodeId : undefined,
          effectiveDebug,
        )

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
          runOptions?.onNodeEval,
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
