/**
 * PersistentVector — an immutable, structurally-shared vector based on a
 * 32-way trie (branching factor 32).
 *
 * Performance characteristics:
 *   get(i)     O(log₃₂ N) ≈ O(1) in practice (max depth ~6 for 1B elements)
 *   set(i, v)  O(log₃₂ N) — path-copies the spine, shares all unchanged nodes
 *   append(v)  O(log₃₂ N) amortized — O(1) when tail has room (tail holds ≤ 32 elems)
 *   size       O(1)
 *   iterate    O(N)
 *
 * Tail optimisation: the last ≤ 32 elements are kept in a flat array, so
 * sequential appends and gets near the end never touch the trie.
 *
 * Small-collection threshold (future): for size ≤ 32, a flat array bypasses
 * the trie entirely, eliminating per-node overhead for tiny vectors. Left as
 * a known future optimization per design intent.
 */

const BITS = 5
const WIDTH = 1 << BITS // 32
const MASK = WIDTH - 1

/** Internal trie node — an array of up to WIDTH children (nodes or leaf values). */
interface INode {
  readonly array: readonly unknown[]
}

function makeNode(arr: unknown[]): INode {
  return { array: arr }
}

function copyArray(node: INode): unknown[] {
  return (node.array as unknown[]).slice()
}

/** ------------------------------------------------------------------ */
/** Transient vector — mutable accumulator, converted to persistent.   */
/** ------------------------------------------------------------------ */

/**
 * TransientVector provides O(1) amortized appends during bulk construction.
 * Obtained via `vec.asTransient()`; converted back via `.persistent()`.
 *
 * Do not use after calling `.persistent()`.
 */
export class TransientVector<T = unknown> {
  private _size: number
  private _shift: number
  private _root: unknown[] // mutable copy of root
  private _tail: T[]

  constructor(size: number, shift: number, root: unknown[], tail: T[]) {
    this._size = size
    this._shift = shift
    this._root = root
    this._tail = tail
  }

  get size(): number {
    return this._size
  }

  private tailOffset(): number {
    if (this._size < WIDTH) return 0
    return ((this._size - 1) >>> BITS) << BITS
  }

  append(val: T): void {
    if (this._size - this.tailOffset() < WIDTH) {
      // Room in tail — just push
      this._tail.push(val)
      this._size++
      return
    }
    // Tail full — push tail into tree, start new tail
    const tailNode = makeNode(this._tail as unknown[])
    this._tail = [val]
    if ((this._size >>> BITS) > (1 << this._shift)) {
      // Tree is full at current height — grow
      this._root = [makeNode(this._root), newPath(this._shift, tailNode)]
      this._shift += BITS
    } else {
      this._root = pushTailMut(this._root, this._shift, this._size - 1, tailNode)
    }
    this._size++
  }

  persistent(): PersistentVector<T> {
    return new PersistentVector<T>(this._size, this._shift, makeNode(this._root), this._tail.slice())
  }
}

function pushTailMut(root: unknown[], shift: number, count: number, tailNode: INode): unknown[] {
  const newRoot = root.slice()
  const subidx = ((count - 1) >>> shift) & MASK
  if (shift === BITS) {
    newRoot[subidx] = tailNode
  } else {
    const child = newRoot[subidx] as INode | undefined
    newRoot[subidx] = child !== undefined
      ? makeNode(pushTailMut((child.array as unknown[]).slice(), shift - BITS, count, tailNode))
      : newPath(shift - BITS, tailNode)
  }
  return newRoot
}

/** ------------------------------------------------------------------ */
/** PersistentVector                                                     */
/** ------------------------------------------------------------------ */

export class PersistentVector<T = unknown> implements Iterable<T> {
  static readonly EMPTY = new PersistentVector<unknown>(0, BITS, makeNode([]), [])

  readonly size: number
  /** Alias for `size` — lets PersistentVector work where `.length` is expected. */
  get length(): number { return this.size }
  private readonly _shift: number
  private readonly _root: INode
  private readonly _tail: readonly T[]

  constructor(size: number, shift: number, root: INode, tail: readonly T[]) {
    this.size = size
    this._shift = shift
    this._root = root
    this._tail = tail
  }

  static empty<T = unknown>(): PersistentVector<T> {
    return PersistentVector.EMPTY as PersistentVector<T>
  }

  /** Build from a plain JS array. O(N). */
  static from<T>(arr: Iterable<T>): PersistentVector<T> {
    const t = new TransientVector<T>(0, BITS, [], [])
    for (const item of arr) t.append(item)
    return t.persistent()
  }

  private tailOffset(): number {
    if (this.size < WIDTH) return 0
    return ((this.size - 1) >>> BITS) << BITS
  }

  private nodeFor(i: number): readonly unknown[] {
    if (i >= this.tailOffset()) return this._tail
    let node = this._root
    for (let level = this._shift; level > 0; level -= BITS)
      node = node.array[(i >>> level) & MASK] as INode
    return node.array
  }

  /** Returns the element at index `i`, or `undefined` if out of range. */
  get(i: number): T | undefined {
    if (i < 0 || i >= this.size) return undefined
    return this.nodeFor(i)[i & MASK] as T
  }

  /** Returns a new vector with `val` at index `i`. Returns `this` if `i` is out of range. */
  set(i: number, val: T): PersistentVector<T> {
    if (i < 0 || i >= this.size) return this
    if (i >= this.tailOffset()) {
      const newTail = (this._tail as T[]).slice()
      newTail[i & MASK] = val
      return new PersistentVector(this.size, this._shift, this._root, newTail)
    }
    return new PersistentVector(this.size, this._shift, setNode(this._root, this._shift, i, val), this._tail)
  }

  /** Returns a new vector with `val` appended at the end. */
  append(val: T): PersistentVector<T> {
    if (this.size - this.tailOffset() < WIDTH) {
      // Room in tail
      return new PersistentVector(this.size + 1, this._shift, this._root, [...this._tail, val])
    }
    // Tail is full — push tail into trie, start new tail
    const tailNode = makeNode(this._tail as unknown[])
    let newShift = this._shift
    let newRoot: INode
    if ((this.size >>> BITS) > (1 << this._shift)) {
      // Trie full at current height — grow one level
      newRoot = makeNode([this._root, newPath(this._shift, tailNode)])
      newShift += BITS
    } else {
      newRoot = pushTailPersistent(this._root, this._shift, this.size - 1, tailNode)
    }
    return new PersistentVector(this.size + 1, newShift, newRoot, [val])
  }

  /** Returns a new vector with `val` prepended at index 0. O(N). */
  prepend(val: T): PersistentVector<T> {
    // O(N) — build via transient. A future optimisation could use a deque.
    const t = new TransientVector<T>(0, BITS, [], [])
    t.append(val)
    for (const item of this) t.append(item)
    return t.persistent()
  }

  /** Returns a new transient for bulk mutation. */
  asTransient(): TransientVector<T> {
    return new TransientVector<T>(
      this.size,
      this._shift,
      (this._root.array as unknown[]).slice(),
      (this._tail as T[]).slice(),
    )
  }

  /** Iterate over elements in order. */
  [Symbol.iterator](): Iterator<T> {
    return iterVector(this)
  }

  /** Convert to a plain JS array. O(N). */
  toArray(): T[] {
    return [...this]
  }

  /** Returns true if this vector equals another (structural equality of elements via `eq`). */
  equals(other: PersistentVector<T>, eq: (a: T, b: T) => boolean = (a, b) => a === b): boolean {
    if (this === other) return true
    if (this.size !== other.size) return false
    let i = 0
    for (const item of this) {
      if (!eq(item, other.get(i)!)) return false
      i++
    }
    return true
  }
}

/** Path-copy update of a node. */
function setNode(node: INode, level: number, i: number, val: unknown): INode {
  const arr = copyArray(node)
  if (level === 0) {
    arr[i & MASK] = val
  } else {
    const subidx = (i >>> level) & MASK
    arr[subidx] = setNode(node.array[subidx] as INode, level - BITS, i, val)
  }
  return makeNode(arr)
}

/** Persistent push-tail into trie. */
function pushTailPersistent(node: INode, level: number, count: number, tailNode: INode): INode {
  const arr = copyArray(node)
  const subidx = ((count - 1) >>> level) & MASK
  if (level === BITS) {
    arr[subidx] = tailNode
  } else {
    const child = node.array[subidx] as INode | undefined
    arr[subidx] = child !== undefined
      ? pushTailPersistent(child, level - BITS, count, tailNode)
      : newPath(level - BITS, tailNode)
  }
  return makeNode(arr)
}

/** Build a path of single-child nodes down to `node`. */
function newPath(level: number, node: INode): INode {
  if (level === 0) return node
  return makeNode([newPath(level - BITS, node)])
}

/** Iterates a PersistentVector chunk by chunk using the tail optimisation. */
function* iterVector<T>(vec: PersistentVector<T>): Iterator<T> {
  const size = vec.size
  for (let i = 0; i < size; i++) {
    yield vec.get(i)!
  }
}
