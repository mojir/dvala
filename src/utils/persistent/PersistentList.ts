/**
 * PersistentList — an immutable singly-linked list (cons cells).
 *
 * Used as the continuation stack in Phase 2. Forking is O(1): to take
 * a multi-shot continuation, keep the reference. Calling `resume` twice
 * restarts from the same immutable stack snapshot without copying.
 *
 * Performance characteristics:
 *   cons(v, list)  O(1)
 *   head / tail    O(1)
 *   isEmpty        O(1)
 */

export type PersistentList<T> = null | PersistentListNode<T>

export interface PersistentListNode<T> {
  readonly head: T
  readonly tail: PersistentList<T>
}

/** Prepend `value` to `list`. */
export function cons<T>(value: T, list: PersistentList<T>): PersistentListNode<T> {
  return { head: value, tail: list }
}

/** Returns true if `list` is empty. */
export function isEmpty<T>(list: PersistentList<T>): list is null {
  return list === null
}

/** Convert a PersistentList to a plain JS array. O(N). */
export function listToArray<T>(list: PersistentList<T>): T[] {
  const result: T[] = []
  let node = list
  while (node !== null) {
    result.push(node.head)
    node = node.tail
  }
  return result
}

/** Build a PersistentList from a plain JS array. O(N). Head of list = first element. */
export function listFromArray<T>(arr: T[]): PersistentList<T> {
  let list: PersistentList<T> = null
  for (let i = arr.length - 1; i >= 0; i--) {
    list = cons(arr[i]!, list)
  }
  return list
}

/** Return the first `n` elements as a new list. O(N). */
export function listTake<T>(list: PersistentList<T>, n: number): PersistentList<T> {
  const buf: T[] = []
  let node = list
  while (node !== null && buf.length < n) {
    buf.push(node.head)
    node = node.tail
  }
  return listFromArray(buf)
}

/** Skip the first `n` elements and return the rest. O(N). */
export function listDrop<T>(list: PersistentList<T>, n: number): PersistentList<T> {
  let node = list
  for (let i = 0; i < n && node !== null; i++) node = node.tail
  return node
}

/**
 * Prepend all elements of `arr` to `list`.
 * First element of `arr` becomes the new head. O(N).
 * Used for stack reconstruction: e.g. [...innerFrames, handler, ...outerK].
 */
export function listPrependAll<T>(arr: readonly T[], list: PersistentList<T>): PersistentList<T> {
  let result = list
  for (let i = arr.length - 1; i >= 0; i--) result = cons(arr[i]!, result)
  return result
}

/** Return the number of elements in the list. O(N). */
export function listSize<T>(list: PersistentList<T>): number {
  let n = 0
  let node = list
  while (node !== null) { n++; node = node.tail }
  return n
}
