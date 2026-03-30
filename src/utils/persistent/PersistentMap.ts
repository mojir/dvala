/**
 * PersistentMap — an immutable, structurally-shared hash map based on a
 * Hash Array Mapped Trie (HAMT). Keys are always strings (Dvala objects
 * only use string keys).
 *
 * Performance characteristics:
 *   get(k)    O(log₃₂ N) ≈ O(1) in practice
 *   assoc     O(log₃₂ N) — path-copies the spine, shares unchanged nodes
 *   dissoc    O(log₃₂ N)
 *   has(k)    O(log₃₂ N)
 *   size      O(1)
 *   iterate   O(N)
 *
 * HAMT nodes:
 *   BitmapNode  — sparse 32-slot virtual node, compressed via popcount bitmap
 *   LeafNode    — single key-value pair at a resolved leaf position
 *   CollisionNode — multiple pairs sharing the same 32-bit hash
 */

const BITS = 5
const MASK = (1 << BITS) - 1 // 0x1f

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

/** djb2-style 32-bit hash for strings. */
function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h >>> 0 // unsigned 32-bit
}

/** Number of set bits in a 32-bit integer (Hamming weight / popcount). */
function popcount(n: number): number {
  n -= (n >>> 1) & 0x55555555
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  n = (n + (n >>> 4)) & 0x0f0f0f0f
  return (Math.imul(n, 0x01010101) >>> 24)
}

/** The bit in the 32-bit virtual slot for `hash` at depth `shift`. */
function bit(hash: number, shift: number): number {
  return 1 << ((hash >>> shift) & MASK)
}

/** Index into the compressed children array given `bitmap` and `bit`. */
function bitmapIndex(bitmap: number, b: number): number {
  return popcount(bitmap & (b - 1))
}

// ---------------------------------------------------------------------------
// Internal node types
// ---------------------------------------------------------------------------

interface LeafNode<V> {
  type: 'leaf'
  hash: number
  key: string
  value: V
}

interface BitmapNode<V> {
  type: 'bitmap'
  bitmap: number
  children: readonly HNode<V>[]
}

interface CollisionNode<V> {
  type: 'collision'
  hash: number
  entries: readonly (readonly [string, V])[]
}

type HNode<V> = LeafNode<V> | BitmapNode<V> | CollisionNode<V>

// ---------------------------------------------------------------------------
// HAMT operations
// ---------------------------------------------------------------------------

function hamtGet<V>(node: HNode<V> | null, key: string, hash: number, shift: number): V | undefined {
  if (node === null) return undefined

  if (node.type === 'leaf') {
    return node.key === key ? node.value : undefined
  }

  if (node.type === 'collision') {
    if (node.hash !== hash) return undefined
    const entry = node.entries.find(([k]) => k === key)
    return entry ? entry[1] : undefined
  }

  // bitmap node
  const b = bit(hash, shift)
  if (!(node.bitmap & b)) return undefined
  return hamtGet(node.children[bitmapIndex(node.bitmap, b)]!, key, hash, shift + BITS)
}

function hamtHas<V>(node: HNode<V> | null, key: string, hash: number, shift: number): boolean {
  return hamtGet(node, key, hash, shift) !== undefined
}

function hamtInsert<V>(
  node: HNode<V> | null,
  key: string,
  hash: number,
  shift: number,
  value: V,
  sizeChange: { delta: number },
): HNode<V> {
  if (node === null) {
    sizeChange.delta = 1
    return { type: 'leaf', hash, key, value }
  }

  if (node.type === 'leaf') {
    if (node.key === key) {
      // Update — no size change
      return { ...node, value }
    }
    sizeChange.delta = 1
    if (node.hash === hash) {
      // Hash collision
      return { type: 'collision', hash, entries: [[node.key, node.value], [key, value]] }
    }
    // Different hashes — create a bitmap node merging both leaves
    return mergeTwoLeaves(node, { type: 'leaf', hash, key, value }, shift)
  }

  if (node.type === 'collision') {
    if (node.hash !== hash) {
      // Wrap this collision node in a bitmap node, then insert the new leaf
      sizeChange.delta = 1
      return expandCollision(node, { type: 'leaf', hash, key, value }, shift)
    }
    const idx = node.entries.findIndex(([k]) => k === key)
    if (idx >= 0) {
      // Update existing entry in collision node — no size change
      const newEntries = node.entries.slice() as [string, V][]
      newEntries[idx] = [key, value]
      return { ...node, entries: newEntries }
    }
    // New key with same hash — add to collision node
    sizeChange.delta = 1
    return { ...node, entries: [...node.entries, [key, value]] }
  }

  // bitmap node
  const b = bit(hash, shift)
  const idx = bitmapIndex(node.bitmap, b)
  if (node.bitmap & b) {
    // Update existing child
    const newChild = hamtInsert(node.children[idx]!, key, hash, shift + BITS, value, sizeChange)
    const newChildren = node.children.slice()
    newChildren[idx] = newChild
    return { type: 'bitmap', bitmap: node.bitmap, children: newChildren }
  } else {
    // Insert new child at position idx
    sizeChange.delta = 1
    const newLeaf: LeafNode<V> = { type: 'leaf', hash, key, value }
    const newChildren = node.children.slice()
    newChildren.splice(idx, 0, newLeaf)
    return { type: 'bitmap', bitmap: node.bitmap | b, children: newChildren }
  }
}

function hamtRemove<V>(
  node: HNode<V> | null,
  key: string,
  hash: number,
  shift: number,
  sizeChange: { delta: number },
): HNode<V> | null {
  if (node === null) return null

  if (node.type === 'leaf') {
    if (node.key !== key) return node
    sizeChange.delta = -1
    return null
  }

  if (node.type === 'collision') {
    if (node.hash !== hash) return node
    const newEntries = node.entries.filter(([k]) => k !== key)
    if (newEntries.length === node.entries.length) return node // key not found
    sizeChange.delta = -1
    if (newEntries.length === 1) {
      return { type: 'leaf', hash, key: newEntries[0]![0], value: newEntries[0]![1] }
    }
    return { ...node, entries: newEntries }
  }

  // bitmap node
  const b = bit(hash, shift)
  if (!(node.bitmap & b)) return node // key not in this subtree

  const idx = bitmapIndex(node.bitmap, b)
  const child = node.children[idx]!
  const newChild = hamtRemove(child, key, hash, shift + BITS, sizeChange)

  if (newChild === child) return node // no change

  if (newChild === null) {
    // Remove this slot
    if (node.children.length === 1) return null // empty node
    const newChildren = node.children.filter((_, i) => i !== idx)
    const newBitmap = node.bitmap ^ b
    // If only one child remains and it's a leaf, collapse the bitmap node
    if (newChildren.length === 1 && newChildren[0]!.type === 'leaf') {
      return newChildren[0]!
    }
    return { type: 'bitmap', bitmap: newBitmap, children: newChildren }
  }

  const newChildren = node.children.slice()
  newChildren[idx] = newChild
  return { type: 'bitmap', bitmap: node.bitmap, children: newChildren }
}

/** Merge two leaves with different hashes into a new bitmap sub-trie. */
function mergeTwoLeaves<V>(a: LeafNode<V>, b: LeafNode<V>, shift: number): BitmapNode<V> {
  const ba = bit(a.hash, shift)
  const bb = bit(b.hash, shift)
  if (ba === bb) {
    // Same slot at this level — recurse deeper
    const child = mergeTwoLeaves(a, b, shift + BITS)
    return { type: 'bitmap', bitmap: ba, children: [child] }
  }
  const [first, second] = ba < bb ? [a, b] : [b, a]
  return { type: 'bitmap', bitmap: ba | bb, children: [first, second] }
}

/** Expand a collision node (existing at `shift`) to accommodate a new leaf at a different hash. */
function expandCollision<V>(collision: CollisionNode<V>, leaf: LeafNode<V>, shift: number): BitmapNode<V> {
  const bc = bit(collision.hash, shift)
  const bl = bit(leaf.hash, shift)
  if (bc === bl) {
    const child = expandCollision(collision, leaf, shift + BITS)
    return { type: 'bitmap', bitmap: bc, children: [child] }
  }
  const [first, second] = bc < bl ? [collision, leaf] : [leaf, collision]
  return { type: 'bitmap', bitmap: bc | bl, children: [first as HNode<V>, second as HNode<V>] }
}

// ---------------------------------------------------------------------------
// Generator for iterating HAMT nodes
// ---------------------------------------------------------------------------

function* iterHamt<V>(node: HNode<V> | null): Generator<readonly [string, V]> {
  if (node === null) return

  if (node.type === 'leaf') {
    yield [node.key, node.value]
    return
  }

  if (node.type === 'collision') {
    yield* node.entries
    return
  }

  // bitmap node
  for (const child of node.children) {
    yield* iterHamt(child)
  }
}

// ---------------------------------------------------------------------------
// TransientMap
// ---------------------------------------------------------------------------

/**
 * TransientMap provides O(1) amortized operations during bulk construction.
 * Obtained via `map.asTransient()`; converted back via `.persistent()`.
 *
 * Do not use after calling `.persistent()`.
 */
export class TransientMap<V = unknown> {
  // Use a plain JS Map internally for speed — convert to HAMT on `.persistent()`
  private _entries: Map<string, V>

  constructor(source?: PersistentMap<V>) {
    this._entries = new Map(source ? [...source] : [])
  }

  set(key: string, value: V): void {
    this._entries.set(key, value)
  }

  persistent(): PersistentMap<V> {
    return PersistentMap.from(this._entries)
  }
}

// ---------------------------------------------------------------------------
// PersistentMap
// ---------------------------------------------------------------------------

export class PersistentMap<V = unknown> implements Iterable<readonly [string, V]> {
  static readonly EMPTY = new PersistentMap<unknown>(null, 0)

  private readonly _root: HNode<V> | null
  readonly size: number

  private constructor(root: HNode<V> | null, size: number) {
    this._root = root
    this.size = size
  }

  static empty<V = unknown>(): PersistentMap<V> {
    return PersistentMap.EMPTY as PersistentMap<V>
  }

  /** Build from an iterable of [key, value] pairs. O(N). */
  static from<V>(entries: Iterable<readonly [string, V]>): PersistentMap<V> {
    let map: PersistentMap<V> = PersistentMap.empty()
    for (const [k, v] of entries) map = map.assoc(k, v)
    return map
  }

  /** Build from a plain JS object. O(N). */
  static fromRecord<V>(record: Record<string, V>): PersistentMap<V> {
    return PersistentMap.from(Object.entries(record))
  }

  /** Returns the value for `key`, or `undefined` if absent. */
  get(key: string): V | undefined {
    return hamtGet(this._root, key, hashCode(key), 0)
  }

  /** Returns true if `key` is present. */
  has(key: string): boolean {
    return hamtHas(this._root, key, hashCode(key), 0)
  }

  /** Returns a new map with `key` → `value` inserted or updated. */
  assoc(key: string, value: V): PersistentMap<V> {
    const sizeChange = { delta: 0 }
    const newRoot = hamtInsert(this._root, key, hashCode(key), 0, value, sizeChange)
    return new PersistentMap(newRoot, this.size + sizeChange.delta)
  }

  /** Returns a new map with `key` removed. Returns `this` if not found. */
  dissoc(key: string): PersistentMap<V> {
    const sizeChange = { delta: 0 }
    const newRoot = hamtRemove(this._root, key, hashCode(key), 0, sizeChange)
    if (sizeChange.delta === 0) return this
    return new PersistentMap(newRoot, this.size + sizeChange.delta)
  }

  /** Returns an array of all keys. Order is hash-determined (not insertion order). */
  keys(): string[] {
    const result: string[] = []
    for (const [k] of this) result.push(k)
    return result
  }

  /** Returns an array of all values. */
  values(): V[] {
    const result: V[] = []
    for (const [, v] of this) result.push(v)
    return result
  }

  /** Returns an array of [key, value] pairs. */
  entries(): [string, V][] {
    const result: [string, V][] = []
    for (const e of this) result.push([e[0], e[1]])
    return result
  }

  /** Iterate over [key, value] pairs. */
  [Symbol.iterator](): Iterator<readonly [string, V]> {
    return iterHamt(this._root)
  }

  /** Convert to a plain JS object (shallow). O(N). */
  toRecord(): Record<string, V> {
    const result: Record<string, V> = {}
    for (const [k, v] of this) result[k] = v
    return result
  }

  /** Returns a transient for bulk construction. */
  asTransient(): TransientMap<V> {
    return new TransientMap(this)
  }
}
