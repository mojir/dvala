import type { CreateDvalaOptions } from '../createDvala'

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