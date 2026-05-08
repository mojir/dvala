import type { DvalaBundle } from '../bundler/interface'
import type { DvalaModule } from '../builtin/modules/interface'
import {
  type DvalaRunAsyncOptions,
  type RuntimeModuleLike,
  type RuntimeResumeOptions,
  type RuntimeRunResult,
  type RuntimeSnapshot,
} from '@mojir/dvala-runtime'
import { createDvala } from '../createDvala'
import { resume } from '../resume'
import type { BridgeRunnerOptions } from './runtimeBridgeOptions'

export interface RuntimeBridgeProgramAdapter {
  runProgram: (source: string | DvalaBundle, options?: DvalaRunAsyncOptions) => Promise<RuntimeRunResult>
  resumeProgram: (snapshot: RuntimeSnapshot, value: unknown, options?: RuntimeResumeOptions) => Promise<RuntimeRunResult>
}

export function createDefaultRuntimeBridgeAdapter(options: BridgeRunnerOptions): RuntimeBridgeProgramAdapter {
  const runner = createDvala(options)

  return {
    runProgram(source, runOptions) {
      return runner.runAsync(source, runOptions)
    },
    resumeProgram(snapshot, value, resumeOptions) {
      return resume(snapshot, value, {
        ...resumeOptions,
        modules: resumeOptions?.modules as DvalaModule[] | undefined,
      })
    },
  }
}

export function withRuntimeModules(
  modules: BridgeRunnerOptions['modules'],
): RuntimeModuleLike[] | undefined {
  return modules as RuntimeModuleLike[] | undefined
}