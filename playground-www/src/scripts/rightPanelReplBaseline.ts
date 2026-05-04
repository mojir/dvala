import { Debugger } from '../../../src/debugger/Debugger'
import type { ContextStack } from '../../../src/evaluator/ContextStack'
import type { Snapshot } from '../../../src/evaluator/effectTypes'
import type { ContinuationStack } from '../../../src/evaluator/frames'
import { deserializeFromObject } from '../../../src/evaluator/suspension'

function hasEnv(value: unknown): value is { env: ContextStack } {
  return typeof value === 'object' && value !== null && 'env' in value && value.env !== undefined
}

function hasOuterEnv(value: unknown): value is { outerEnv: ContextStack } {
  return typeof value === 'object' && value !== null && 'outerEnv' in value && value.outerEnv !== undefined
}

function getEnvFromContinuation(k: ContinuationStack): ContextStack | null {
  let node: unknown = k
  while (typeof node === 'object' && node !== null && 'head' in node && 'tail' in node) {
    const frame = node.head
    if (hasEnv(frame)) return frame.env
    if (hasOuterEnv(frame)) return frame.outerEnv
    node = node.tail
  }
  return null
}

export function extractSnapshotBindings(snapshot: Snapshot): Record<string, unknown> {
  const deserialized = deserializeFromObject(snapshot.continuation)
  const env =
    getEnvFromContinuation(deserialized.k) ??
    (hasEnv(deserialized.initialStep) ? deserialized.initialStep.env : null)

  if (!env) return {}

  return Debugger.extractBindings({
    env,
    k: deserialized.k,
    resume: () => {},
    getSnapshots: () => deserialized.snapshots,
  })
}