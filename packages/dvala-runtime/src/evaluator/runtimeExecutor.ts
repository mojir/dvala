import type { RuntimeExecutor, RuntimeHost, RuntimeSession, VerifiedProgram, VerifiedSnapshot } from '../types/runtime'

function unimplemented(operation: string): never {
  throw new Error(`dvala-runtime evaluator adapter not implemented: ${operation}`)
}

export type RuntimeExecutorCallbacks = {
  startProgram: (artifact: VerifiedProgram, host: RuntimeHost) => Promise<RuntimeSession>
  resumeSnapshot: (artifact: VerifiedSnapshot, host: RuntimeHost) => Promise<RuntimeSession>
}

export function createRuntimeExecutor(callbacks: RuntimeExecutorCallbacks): RuntimeExecutor {
  return {
    async startProgram(artifact: VerifiedProgram, host: RuntimeHost): Promise<RuntimeSession> {
      return callbacks.startProgram(artifact, host)
    },
    async resumeSnapshot(artifact: VerifiedSnapshot, host: RuntimeHost): Promise<RuntimeSession> {
      return callbacks.resumeSnapshot(artifact, host)
    },
  }
}

export function createUnimplementedRuntimeExecutor(): RuntimeExecutor {
  return createRuntimeExecutor({
    async startProgram(_artifact: VerifiedProgram, _host: RuntimeHost): Promise<RuntimeSession> {
      return unimplemented('startProgram')
    },
    async resumeSnapshot(_artifact: VerifiedSnapshot, _host: RuntimeHost): Promise<RuntimeSession> {
      return unimplemented('resumeSnapshot')
    },
  })
}
