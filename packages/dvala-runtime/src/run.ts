import { createRuntime } from './createRuntime'
import type { BoundRuntime, RuntimeExecutor, RuntimeHost, RuntimeIdentity } from './types/runtime'

export function bindRuntimeHost(identity: RuntimeIdentity, executor: RuntimeExecutor, host: RuntimeHost): BoundRuntime {
  return createRuntime(identity, executor).bindHost(host)
}
