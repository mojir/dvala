import type { Snapshot } from '../../../../src/evaluator/effectTypes'
import { inspectPlaygroundSnapshotBindingsThroughBackend } from '../runtimeBackend'

export async function extractSnapshotBindings(snapshot: Snapshot): Promise<Readonly<Record<string, unknown>>> {
  return inspectPlaygroundSnapshotBindingsThroughBackend({ snapshot })
}