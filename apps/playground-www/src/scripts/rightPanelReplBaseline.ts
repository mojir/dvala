import type { Snapshot } from '@mojir/dvala-engine'
import { inspectPlaygroundSnapshotBindingsThroughBackend } from '../runtimeBackend'

export async function extractSnapshotBindings(snapshot: Snapshot): Promise<Readonly<Record<string, unknown>>> {
  return inspectPlaygroundSnapshotBindingsThroughBackend({ snapshot })
}