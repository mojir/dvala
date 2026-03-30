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
