import type { CreateDvalaOptions } from '../createDvala'
import type { DvalaRunAsyncOptions, RuntimeHandlers } from '@mojir/dvala-runtime'

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

export type BridgeProgramRunOptions = Omit<DvalaRunAsyncOptions, 'effectHandlers' | 'pure'>

export interface RuntimeBridgeExecutionContext {
  handlers?: RuntimeHandlers
  programRunOptions?: BridgeProgramRunOptions
}