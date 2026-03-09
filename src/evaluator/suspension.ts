/**
 * Continuation stack serialization and deserialization.
 *
 * When a host handler calls `suspend(meta?)`, the trampoline captures the
 * continuation stack (an array of Frame objects). This module converts that
 * stack to/from a JSON string (the "suspension blob") that can be stored,
 * transferred, and later resumed in a new process.
 *
 * The main challenge is that Frame objects contain `ContextStack` class
 * instances (which hold lexical scope chains). These are not plain data
 * and may form circular references (e.g., a global context containing a
 * UserDefinedFunction whose captured env references the same global context).
 *
 * The serialization approach:
 * 1. Walk the frame tree and collect all unique ContextStack instances (by identity)
 * 2. Assign each a numeric ID
 * 3. Serialize ContextStacks separately as plain objects
 * 4. In the frame tree, replace ContextStack references with `{ __csRef: id }`
 * 5. First occurrence of each ContextStack gets `{ __csDef: id, ... }` in the
 *    contextStacks array — circular refs just become `{ __csRef: id }`
 *
 * Deserialization reverses this:
 * 1. Parse the blob and create placeholder ContextStack instances
 * 2. Deep-resolve all `__csRef` markers back to real instances
 * 3. Fill in host bindings (values, modules) on each instance
 */

import { DvalaError } from '../errors'
import type { Any } from '../interface'

import type { DvalaModule } from '../builtin/modules/interface'
import { ContextStackImpl } from './ContextStack'
import { dedupSubTrees, expandPoolRefs } from './dedupSubTrees'
import type { Context } from './interface'
import type { Snapshot } from './effectTypes'
import type { ContinuationStack } from './frames'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUSPENSION_VERSION = 2

// Default size threshold for sub-tree pooling (bytes)
const DEFAULT_DEDUP_THRESHOLD = 200

// ---------------------------------------------------------------------------
// Internal blob structure (what gets JSON-stringified)
// ---------------------------------------------------------------------------

interface SerializedContextStack {
  id: number
  contexts: unknown[] // Context[] with nested ContextStacks replaced by refs
  globalContextIndex: number
  pure: boolean
}

interface SuspensionBlobData {
  version: number
  contextStacks: SerializedContextStack[]
  k: unknown // ContinuationStack with ContextStacks replaced by refs
  meta?: Any
  snapshots?: unknown[] // Snapshot[] preserved across suspend/resume
  nextSnapshotIndex?: number
  pool?: Record<number, unknown> // Shared sub-tree pool (v2+)
}

// Marker objects embedded in the serialized data
interface CSRef { __csRef: number }

function isCSRef(value: unknown): value is CSRef {
  return value !== null
    && typeof value === 'object'
    && '__csRef' in value
    && typeof (value as CSRef).__csRef === 'number'
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize a continuation stack and optional metadata into a plain
 * JSON-compatible object tree.
 *
 * The returned object is the "continuation" stored inside a `Snapshot`.
 * It is intentionally typed as `SuspensionBlobData` internally but
 * exposed as `unknown` via the `Snapshot` interface.
 *
 * Validates that all values are serializable.
 * Throws a descriptive `DvalaError` if non-serializable values are found.
 */
export function serializeToObject(k: ContinuationStack, meta?: Any): SuspensionBlobData {
  // Phase 1: Collect all unique ContextStack instances
  const csMap = new Map<ContextStackImpl, number>()
  let nextId = 0

  function collectContextStacks(value: unknown): void {
    if (value instanceof ContextStackImpl) {
      if (csMap.has(value)) {
        return // Already visited — handles circular refs
      }
      csMap.set(value, nextId++)
      // Recurse into contexts to find nested ContextStacks (e.g., in UserDefinedFunction captured envs)
      for (const ctx of value.getContextsRaw()) {
        for (const entry of Object.values(ctx)) {
          collectContextStacks(entry.value)
        }
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectContextStacks(item)
      }
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value)) {
        collectContextStacks(v)
      }
    }
  }

  collectContextStacks(k)
  if (meta !== undefined) {
    collectContextStacks(meta)
  }

  // Phase 2: Serialize values, replacing ContextStacks with refs
  function serializeValue(value: unknown, path: string): unknown {
    if (value instanceof ContextStackImpl) {
      return { __csRef: csMap.get(value)! } satisfies CSRef
    }

    if (Array.isArray(value)) {
      return value.map((item, i) => serializeValue(item, `${path}[${i}]`))
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, v] of Object.entries(value)) {
        result[key] = serializeValue(v, `${path}.${key}`)
      }
      return result
    }
    return value
  }

  // Serialize all collected ContextStacks
  const serializedContextStacks: SerializedContextStack[] = Array.from(csMap.entries()).map(
    ([cs, id]) => ({
      id,
      contexts: cs.getContextsRaw().map((ctx, ctxIdx) => {
        const serialized: Record<string, unknown> = {}
        for (const [name, entry] of Object.entries(ctx)) {
          serialized[name] = { value: serializeValue(entry.value, `cs[${id}].contexts[${ctxIdx}].${name}`) }
        }
        return serialized
      }),
      globalContextIndex: cs.getGlobalContextIndex(),
      pure: cs.pure,
    }),
  )

  // Serialize the continuation stack
  const serializedK = serializeValue(k, 'k')

  // Serialize meta
  const serializedMeta = meta !== undefined ? serializeValue(meta, 'meta') : undefined

  const blobData: SuspensionBlobData = {
    version: SUSPENSION_VERSION,
    contextStacks: serializedContextStacks,
    k: serializedK,
    ...(serializedMeta !== undefined ? { meta: serializedMeta as Any } : {}),
  }

  return blobData
}

/**
 * Build a complete suspension blob that includes both the continuation
 * and the accumulated snapshot state.  Snapshots are already plain
 * JSON-compatible objects (their `continuation` fields were produced by
 * earlier `serializeToObject` calls), so they're embedded as-is.
 *
 * Runs sub-tree deduplication across all serialized continuations to
 * reduce blob size when snapshots share identical AST sub-trees.
 */
export function serializeSuspensionBlob(
  k: ContinuationStack,
  snapshots: unknown[],
  nextSnapshotIndex: number,
  meta?: Any,
): SuspensionBlobData {
  const base = serializeToObject(k, meta)

  if (snapshots.length > 0) {
    base.snapshots = snapshots
  }
  base.nextSnapshotIndex = nextSnapshotIndex

  // Run dedup across all serialized data to find shared sub-trees.
  // Collect all top-level objects that may share sub-trees:
  // contextStacks, k, meta, and each snapshot's continuation.
  const roots: unknown[] = [base.contextStacks, base.k]
  if (base.meta !== undefined) {
    roots.push(base.meta)
  }
  if (base.snapshots) {
    for (const snapshot of base.snapshots) {
      roots.push(snapshot)
    }
  }

  const { roots: dedupedRoots, pool } = dedupSubTrees(roots, DEFAULT_DEDUP_THRESHOLD)

  // Reassemble the blob with deduplicated data
  let rootIdx = 0
  base.contextStacks = dedupedRoots[rootIdx++] as SerializedContextStack[]
  base.k = dedupedRoots[rootIdx++]
  if (base.meta !== undefined) {
    base.meta = dedupedRoots[rootIdx++] as Any
  }
  if (base.snapshots) {
    for (let i = 0; i < base.snapshots.length; i++) {
      base.snapshots[i] = dedupedRoots[rootIdx++]
    }
  }

  if (Object.keys(pool).length > 0) {
    base.pool = pool
  }

  return base
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

/** Options for re-injecting host bindings on resume. */
export interface DeserializeOptions {
  values?: Record<string, unknown>
  modules?: Map<string, DvalaModule>
}

/**
 * Deserialize a plain object (as produced by `serializeToObject`) back into
 * a continuation stack and metadata.
 *
 * Reconstructs `ContextStack` instances with fresh host bindings from `options`.
 * Handles circular references between ContextStacks and their contained values.
 */
export function deserializeFromObject(
  blobData: unknown,
  options?: DeserializeOptions,
): { k: ContinuationStack, meta?: Any, snapshots: Snapshot[], nextSnapshotIndex: number } {
  let data = blobData as SuspensionBlobData

  if (data.version !== SUSPENSION_VERSION) {
    throw new DvalaError(
      `Unsupported suspension blob version: ${data.version} (expected ${SUSPENSION_VERSION})`,
      undefined,
    )
  }

  // If the blob has a pool (v2+), expand all pool refs before processing
  if (data.pool && Object.keys(data.pool).length > 0) {
    const pool = data.pool
    data = {
      ...data,
      contextStacks: expandPoolRefs(data.contextStacks, pool) as SerializedContextStack[],
      k: expandPoolRefs(data.k, pool),
      ...(data.meta !== undefined ? { meta: expandPoolRefs(data.meta, pool) as Any } : {}),
      ...(data.snapshots ? { snapshots: data.snapshots.map(s => expandPoolRefs(s, pool)) } : {}),
    }
    delete data.pool
  }

  // Phase 1: Create placeholder ContextStack instances for each serialized one.
  // Contexts are empty initially — filled in Phase 2 after all instances exist.
  const csMap = new Map<number, ContextStackImpl>()

  for (const scs of data.contextStacks) {
    const placeholderContexts = scs.contexts.map(() => {
      const ctx: Context = {}
      return ctx
    })
    const cs = ContextStackImpl.fromDeserialized({
      contexts: placeholderContexts,
      globalContextIndex: scs.globalContextIndex,
      values: options?.values,

      modules: options?.modules,
      pure: scs.pure,
    })
    csMap.set(scs.id, cs)
  }

  // Phase 2: Deep-resolve all values, replacing __csRef markers with real instances
  function resolveValue(value: unknown): unknown {
    if (isCSRef(value)) {
      const cs = csMap.get(value.__csRef)
      if (!cs) {
        throw new DvalaError(`Invalid suspension blob: unknown context stack ref ${value.__csRef}`, undefined)
      }
      return cs
    }
    if (Array.isArray(value)) {
      return value.map(resolveValue)
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, v] of Object.entries(value)) {
        result[key] = resolveValue(v)
      }
      return result
    }
    return value
  }

  // Fill in contexts on each ContextStack
  for (const scs of data.contextStacks) {
    const cs = csMap.get(scs.id)!
    const resolvedContexts: Context[] = scs.contexts.map(serializedCtx => {
      const ctx = serializedCtx as Record<string, { value: unknown }>
      const resolved: Context = {}
      for (const [name, entry] of Object.entries(ctx)) {
        resolved[name] = { value: resolveValue(entry.value) as Any }
      }
      return resolved
    })
    cs.setContextsFromDeserialized(resolvedContexts, scs.globalContextIndex)
  }

  // Resolve the continuation stack
  const resolvedK = resolveValue(data.k) as ContinuationStack

  // Resolve meta
  const resolvedMeta = data.meta !== undefined ? resolveValue(data.meta) as Any : undefined

  return {
    k: resolvedK,
    meta: resolvedMeta,
    snapshots: (data.snapshots ?? []) as Snapshot[],
    nextSnapshotIndex: data.nextSnapshotIndex ?? 0,
  }
}

/**
 * Extract checkpoint snapshots from a serialized continuation blob,
 * expanding any pool references so each snapshot is a self-contained blob
 * that can be passed directly to `resume()`.
 */
export function extractCheckpointSnapshots(continuation: unknown): Snapshot[] {
  const data = continuation as SuspensionBlobData
  if (!data.snapshots || data.snapshots.length === 0) {
    return []
  }
  const pool = data.pool && Object.keys(data.pool).length > 0 ? data.pool : undefined
  return data.snapshots.map(s =>
    pool ? expandPoolRefs(s, pool) as Snapshot : s as Snapshot,
  )
}
