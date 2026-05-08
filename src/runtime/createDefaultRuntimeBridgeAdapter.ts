import type { DvalaBundle } from '../bundler/interface'
import type { DvalaModule } from '../builtin/modules/interface'
import {
  type DvalaRunAsyncOptions,
  type RuntimeResumeOptions,
  type RuntimeRunResult,
  type RuntimeSnapshot,
} from '@mojir/dvala-runtime'
import { createDvala } from '../createDvala'
import { resume, type ResumeOptions } from '../resume'
import type { BridgeRunnerOptions, RuntimeBridgeExecutionContext } from './runtimeBridgeOptions'

function withRuntimeModules(modules: BridgeRunnerOptions['modules']): DvalaModule[] | undefined {
  return modules as DvalaModule[] | undefined
}

export function toRuntimeRunOptions(context?: RuntimeBridgeExecutionContext): DvalaRunAsyncOptions | undefined {
  if (!context) return undefined
  return {
    ...context.programRunOptions,
    effectHandlers: context.handlers,
  }
}

export function toRuntimeResumeOptions(
  modules: BridgeRunnerOptions['modules'],
  context?: RuntimeBridgeExecutionContext,
): RuntimeResumeOptions {
  return {
    handlers: context?.handlers,
    modules: withRuntimeModules(modules),
    maxSnapshots: context?.programRunOptions?.maxSnapshots,
    disableAutoCheckpoint: context?.programRunOptions?.disableAutoCheckpoint,
    terminalSnapshot: context?.programRunOptions?.terminalSnapshot,
  }
}

function toRootResumeOptions(
  modules: BridgeRunnerOptions['modules'],
  context?: RuntimeBridgeExecutionContext,
): ResumeOptions {
  return {
    ...toRuntimeResumeOptions(modules, context),
    modules: withRuntimeModules(modules),
  }
}

interface RuntimeBridgeProgramAdapter {
  runProgram: (source: string | DvalaBundle, context?: RuntimeBridgeExecutionContext) => Promise<RuntimeRunResult>
  resumeProgram: (
    snapshot: RuntimeSnapshot,
    value: unknown,
    context?: RuntimeBridgeExecutionContext,
  ) => Promise<RuntimeRunResult>
}

export function createDefaultRuntimeBridgeAdapter(options: BridgeRunnerOptions): RuntimeBridgeProgramAdapter {
  const runner = createDvala(options)

  return {
    runProgram(source, context) {
      return runner.runAsync(source, toRuntimeRunOptions(context))
    },
    resumeProgram(snapshot, value, context) {
      return resume(snapshot, value, toRootResumeOptions(options.modules, context))
    },
  }
}
