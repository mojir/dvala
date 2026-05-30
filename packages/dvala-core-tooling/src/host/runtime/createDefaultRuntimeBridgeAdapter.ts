import type { DvalaBundle } from '../../bundler/interface'
import type { DvalaModule } from '@mojir/dvala-engine'
import type { CreateDvalaOptions } from '../createDvala'
import {
  type DvalaRunAsyncOptions,
  type RuntimeBridgeResumeProgram,
  type RuntimeBridgeRunProgram,
  type RuntimeBridgeExecutionContext,
  type RuntimeResumeOptions,
  type RuntimeRunResult,
  type RuntimeSnapshot,
} from '@mojir/dvala-runtime'
import { createDvala } from '../createDvala'
import { resume, type ResumeOptions } from '@mojir/dvala-engine'

export type BridgeRunnerOptions = Pick<
  CreateDvalaOptions,
  | 'modules'
  | 'effectHandlers'
  | 'cache'
  | 'debug'
  | 'disableAutoCheckpoint'
  | 'fileResolver'
  | 'fileResolverBaseDir'
  | 'typecheck'
  | 'onTypeDiagnostic'
>

function withRuntimeModules(modules: BridgeRunnerOptions['modules']): DvalaModule[] | undefined {
  return modules as DvalaModule[] | undefined
}

function toRuntimeRunOptions(context?: RuntimeBridgeExecutionContext): DvalaRunAsyncOptions | undefined {
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
    scope: context?.programRunOptions?.scope,
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

function createDefaultRuntimeBridgeAdapter(options: BridgeRunnerOptions): RuntimeBridgeProgramAdapter {
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

export interface BridgeRuntimeOverrides {
  runProgram?: (source: string | DvalaBundle, options?: DvalaRunAsyncOptions) => Promise<RuntimeRunResult>
  resumeProgram?: (
    snapshot: RuntimeSnapshot,
    value: unknown,
    options?: RuntimeResumeOptions,
  ) => Promise<RuntimeRunResult>
}

export function createRootRuntimeBridgeCallbacks(
  options: BridgeRunnerOptions,
  overrides: BridgeRuntimeOverrides = {},
): {
  runProgram: RuntimeBridgeRunProgram<string | DvalaBundle>
  resumeProgram: RuntimeBridgeResumeProgram<RuntimeSnapshot>
} {
  const defaultAdapter =
    overrides.runProgram || overrides.resumeProgram ? undefined : createDefaultRuntimeBridgeAdapter(options)

  return {
    runProgram(source, context) {
      if (overrides.runProgram) return overrides.runProgram(source, toRuntimeRunOptions(context))
      return defaultAdapter!.runProgram(source, context)
    },
    resumeProgram(snapshot, value, context) {
      if (overrides.resumeProgram)
        return overrides.resumeProgram(snapshot, value, toRuntimeResumeOptions(options.modules, context))
      return defaultAdapter!.resumeProgram(snapshot, value, context)
    },
  }
}
