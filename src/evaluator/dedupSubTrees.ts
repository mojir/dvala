/**
 * Sub-tree deduplication for serialized continuation blobs.
 *
 * Identifies structurally identical sub-trees across multiple root objects,
 * stores each unique sub-tree once in a shared pool, and replaces duplicates
 * with compact references (`{ __poolRef: id }`).
 *
 * Works bottom-up: children are deduplicated before parents, so a parent
 * node that contains pool references can itself be pooled if it appears
 * multiple times with the same pool references.
 */

import { contentHash } from './contentHash'

// ---------------------------------------------------------------------------
// Pool reference marker
// ---------------------------------------------------------------------------

interface PoolRef { __poolRef: number }

export function isPoolRef(value: unknown): value is PoolRef {
  return value !== null
    && typeof value === 'object'
    && '__poolRef' in value
    && typeof (value as PoolRef).__poolRef === 'number'
    && Object.keys(value as object).length === 1
}

// ---------------------------------------------------------------------------
// Deep structural equality
// ---------------------------------------------------------------------------

// deepEqual is only called when two sub-trees produce the same contentHash.
// Most branches below guard against hash collisions and cannot be reached
// in practice, so they are excluded from coverage.
/* v8 ignore start */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b)
    return true
  if (a === null || b === null)
    return false
  if (typeof a !== typeof b)
    return false

  if (Array.isArray(a)) {
    if (!Array.isArray(b))
      return false
    if (a.length !== b.length)
      return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i]))
        return false
    }
    return true
  }

  if (typeof a !== 'object')
    return false

  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)
  if (aKeys.length !== bKeys.length)
    return false
  for (const key of aKeys) {
    if (!(key in bObj))
      return false
    if (!deepEqual(aObj[key], bObj[key]))
      return false
  }
  return true
}
/* v8 ignore stop */

// ---------------------------------------------------------------------------
// Size estimation
// ---------------------------------------------------------------------------

function estimateSize(value: unknown): number {
  if (value === null)
    return 4
  if (value === undefined)
    return 9

  const type = typeof value
  if (type === 'boolean')
    return value ? 4 : 5
  if (type === 'number')
    return String(value).length
  if (type === 'string')
    return (value as string).length + 2

  if (Array.isArray(value)) {
    let size = 2 // [ ]
    for (let i = 0; i < value.length; i++) {
      size += estimateSize(value[i]) + 1 // +1 for comma
    }
    return size
  }

  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
  let size = 2 // { }
  for (const key of keys) {
    size += key.length + 2 + 1 + estimateSize(obj[key]) + 1 // "key": value,
  }
  return size
}

// ---------------------------------------------------------------------------
// Sub-tree info collected during the walk
// ---------------------------------------------------------------------------

interface SubTreeInfo {
  hash: number
  value: unknown
  size: number
  /** Locations where this sub-tree appears (for replacement) */
  locations: Array<{ parent: unknown[] | Record<string, unknown>, key: number | string }>
}

// ---------------------------------------------------------------------------
// dedupSubTrees
// ---------------------------------------------------------------------------

/**
 * Deduplicate identical sub-trees across multiple root values.
 *
 * @param roots - Array of root values to scan for duplicates
 * @param threshold - Minimum estimated byte size for a sub-tree to be pooled (default 200)
 * @returns Object with rewritten roots and the shared pool
 */
export function dedupSubTrees(
  roots: unknown[],
  threshold: number = 200,
): { roots: unknown[], pool: Record<number, unknown> } {
  // Phase 1: Deep-clone roots so we can mutate them in-place
  const clonedRoots = roots.map(r => deepClone(r))

  // Phase 2: Walk all roots bottom-up, collecting hash → SubTreeInfo[]
  // Group by hash; entries with the same hash get structural equality checked.
  const hashGroups = new Map<number, SubTreeInfo[]>()

  for (let rootIdx = 0; rootIdx < clonedRoots.length; rootIdx++) {
    walkAndCollect(clonedRoots[rootIdx], hashGroups, null, rootIdx)
  }

  // Phase 3: Find groups with multiple occurrences that meet the threshold
  const pool: Record<number, unknown> = {}
  let nextId = 0

  // Process groups sorted by size descending — pool larger sub-trees first
  const groups = Array.from(hashGroups.values())
    .flat()
    .filter(info => info.locations.length > 1 && info.size >= threshold)
    .sort((a, b) => b.size - a.size)

  // Track which pool IDs have been assigned to which sub-tree values
  const alreadyPooled = new Map<SubTreeInfo, number>()

  for (const info of groups) {
    // A SubTreeInfo appears exactly once in groups; this guard is defensive.
    /* v8 ignore next 2 */
    if (alreadyPooled.has(info))
      continue

    const id = nextId++
    pool[id] = info.value
    alreadyPooled.set(info, id)

    // Replace all locations with pool refs
    for (const loc of info.locations) {
      if (Array.isArray(loc.parent)) {
        loc.parent[loc.key as number] = { __poolRef: id }
      }
      else {
        (loc.parent)[loc.key as string] = { __poolRef: id }
      }
    }
  }

  return { roots: clonedRoots, pool }
}

/**
 * Walk a value tree bottom-up, collecting sub-tree info.
 * Only arrays and objects are candidates for pooling (primitives are too small).
 */
function walkAndCollect(
  value: unknown,
  hashGroups: Map<number, SubTreeInfo[]>,
  parentInfo: { parent: unknown[] | Record<string, unknown>, key: number | string } | null,
  _rootIdx: number,
): number {
  if (value === null || typeof value !== 'object') {
    return contentHash(value)
  }

  if (Array.isArray(value)) {
    // Walk children first (bottom-up)
    for (let i = 0; i < value.length; i++) {
      walkAndCollect(value[i], hashGroups, { parent: value, key: i }, _rootIdx)
    }
  }
  else {
    const obj = value as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      walkAndCollect(obj[key], hashGroups, { parent: obj, key }, _rootIdx)
    }
  }

  // Compute hash for this node (after children may have been replaced by pool refs)
  const hash = contentHash(value)
  const size = estimateSize(value)

  // Only track if it meets minimum size and has a parent (root nodes aren't replaced)
  if (parentInfo && size >= 1) {
    let group = hashGroups.get(hash)
    if (!group) {
      group = []
      hashGroups.set(hash, group)
    }

    // Find an existing info entry with structural equality
    let found: SubTreeInfo | undefined
    for (const existing of group) {
      if (deepEqual(existing.value, value)) {
        found = existing
        break
      }
    }

    if (found) {
      found.locations.push(parentInfo)
    }
    else {
      group.push({
        hash,
        value: deepClone(value),
        size,
        locations: [parentInfo],
      })
    }
  }

  return hash
}

// ---------------------------------------------------------------------------
// expandPoolRefs
// ---------------------------------------------------------------------------

/**
 * Recursively expand all `{ __poolRef: id }` markers in a value tree,
 * replacing them with the corresponding pool values.
 *
 * Pool values themselves may contain pool refs (nested pooling),
 * which are expanded recursively.
 *
 * @throws Error if a pool ref references an unknown ID
 */
export function expandPoolRefs(value: unknown, pool: Record<number, unknown>): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (isPoolRef(value)) {
    const id = value.__poolRef
    if (!(id in pool)) {
      throw new Error(`Unknown pool ref: ${id}`)
    }
    // Recursively expand the pool entry itself (it may contain nested refs)
    return expandPoolRefs(pool[id], pool)
  }

  if (Array.isArray(value)) {
    return value.map(item => expandPoolRefs(item, pool))
  }

  const obj = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    result[key] = expandPoolRefs(obj[key], pool)
  }
  return result
}

// ---------------------------------------------------------------------------
// Deep clone utility
// ---------------------------------------------------------------------------

function deepClone(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => deepClone(item))
  }

  const obj = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    result[key] = deepClone(obj[key])
  }
  return result
}
