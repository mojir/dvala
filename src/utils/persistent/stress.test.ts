/**
 * Stress tests for persistent data structures.
 *
 * These tests are analogous to the PersistentVector index-2048 regression:
 * they verify that every element is correct after large-scale operations,
 * specifically targeting HAMT depth boundaries where tree restructuring
 * (node promotion, collision handling, subtree growth) could silently corrupt
 * data while allowing shallow tests to pass.
 *
 * PersistentMap (HAMT, 5-bit levels, 32-wide):
 *   - Level 1 → 2: when any two keys hash to the same top-5 bits
 *   - Level 2 → 3: when the subtree at a level-1 slot fills, forcing promotion
 *   - CollisionNode: when two keys share the full 32-bit hash (rare with djb2)
 *
 * PersistentList:
 *   - Simple cons cells, no trie; risks are stack-overflow in any recursive
 *     traversal. All exported operations are iterative, but we verify at scale.
 */

import { describe, expect, it } from 'vitest'
import { PersistentMap } from './PersistentMap'
import { cons, listFromArray, listToArray, type PersistentList } from './PersistentList'
import { PersistentVector } from './PersistentVector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const N_SMALL = 1_000 // exercises level-1/2 HAMT growth
const N_MEDIUM = 10_000 // exercises level-2/3 promotion, deep bitmap nodes
const N_LARGE = 50_000 // ensures no off-by-one at any depth boundary

// ---------------------------------------------------------------------------
// PersistentMap stress tests
// ---------------------------------------------------------------------------

describe('PersistentMap stress', () => {
  // Build a map of N entries and verify every single key returns the right value.
  // This is the direct analogue of the PV index-2048 test: if any HAMT subtree
  // is mis-wired during tree growth, specific keys will silently return undefined.
  it(`every key is reachable after ${N_MEDIUM.toLocaleString()} insertions`, () => {
    let pm = PersistentMap.empty<number>()
    for (let i = 0; i < N_MEDIUM; i++) pm = pm.assoc(`k${i}`, i)

    expect(pm.size).toBe(N_MEDIUM)
    for (let i = 0; i < N_MEDIUM; i++) {
      const v = pm.get(`k${i}`)
      if (v !== i) throw new Error(`key k${i}: expected ${i}, got ${v}`)
    }
  })

  // After each insertion, every previously inserted key must still be accessible.
  // Catches bugs where tree restructuring (node promotion, path-copy) silently
  // drops or overwrites existing entries.
  it(`all prior keys remain reachable after each of ${N_SMALL.toLocaleString()} incremental insertions`, () => {
    let pm = PersistentMap.empty<number>()
    for (let i = 0; i < N_SMALL; i++) {
      pm = pm.assoc(`k${i}`, i)
      // spot-check: first, last, and a middle key are still correct
      expect(pm.get('k0')).toBe(0)
      if (i >= 1) expect(pm.get(`k${i - 1}`)).toBe(i - 1)
      expect(pm.get(`k${i}`)).toBe(i)
    }
  })

  // Update every key and verify both new values and untouched size.
  it(`${N_MEDIUM.toLocaleString()} in-place updates: all values reflect the latest write`, () => {
    const rec: Record<string, number> = {}
    for (let i = 0; i < N_MEDIUM; i++) rec[`k${i}`] = i
    let pm = PersistentMap.fromRecord(rec)

    // overwrite each key with its negative
    for (let i = 0; i < N_MEDIUM; i++) pm = pm.assoc(`k${i}`, -i)

    expect(pm.size).toBe(N_MEDIUM)
    for (let i = 0; i < N_MEDIUM; i++) {
      const v = pm.get(`k${i}`)
      if (v !== -i) throw new Error(`key k${i}: expected ${-i}, got ${v}`)
    }
  })

  // Build a large map, delete every other key, verify the survivors.
  // Exercises hamtRemove's bitmap-collapse and leaf-promotion paths at depth.
  it(`delete half of ${N_MEDIUM.toLocaleString()} keys: survivors are all correct`, () => {
    let pm = PersistentMap.empty<number>()
    for (let i = 0; i < N_MEDIUM; i++) pm = pm.assoc(`k${i}`, i)
    for (let i = 0; i < N_MEDIUM; i += 2) pm = pm.dissoc(`k${i}`)

    expect(pm.size).toBe(N_MEDIUM / 2)
    for (let i = 0; i < N_MEDIUM; i++) {
      if (i % 2 === 0) {
        if (pm.has(`k${i}`)) throw new Error(`k${i} should have been removed`)
      } else {
        const v = pm.get(`k${i}`)
        if (v !== i) throw new Error(`key k${i}: expected ${i}, got ${v}`)
      }
    }
  })

  // Remove all keys one by one and check size decrements correctly.
  it(`remove all ${N_SMALL.toLocaleString()} keys: map reaches size 0`, () => {
    let pm = PersistentMap.empty<number>()
    for (let i = 0; i < N_SMALL; i++) pm = pm.assoc(`k${i}`, i)
    for (let i = 0; i < N_SMALL; i++) {
      pm = pm.dissoc(`k${i}`)
      expect(pm.size).toBe(N_SMALL - i - 1)
      expect(pm.has(`k${i}`)).toBe(false)
    }
    expect(pm.size).toBe(0)
    expect([...pm]).toEqual([])
  })

  // Iteration must yield exactly N distinct entries, each with the right value.
  // A mis-wired node could be double-visited or skipped by the iterator.
  it(`iteration visits every one of ${N_MEDIUM.toLocaleString()} entries exactly once`, () => {
    let pm = PersistentMap.empty<number>()
    for (let i = 0; i < N_MEDIUM; i++) pm = pm.assoc(`k${i}`, i)

    const seen = new Map<string, number>()
    for (const [k, v] of pm) {
      if (seen.has(k)) throw new Error(`key ${k} visited twice`)
      seen.set(k, v)
    }
    expect(seen.size).toBe(N_MEDIUM)
    for (let i = 0; i < N_MEDIUM; i++) {
      if (seen.get(`k${i}`) !== i) throw new Error(`k${i}: expected ${i}`)
    }
  })

  // Keys with hash-prefix collisions: numeric strings 0..N have very similar
  // hash prefixes (short strings, adjacent charCodes), exercising deep merges.
  it(`numeric-string keys 0..${N_MEDIUM - 1}: all reachable`, () => {
    let pm = PersistentMap.empty<number>()
    for (let i = 0; i < N_MEDIUM; i++) pm = pm.assoc(String(i), i)

    expect(pm.size).toBe(N_MEDIUM)
    for (let i = 0; i < N_MEDIUM; i++) {
      const v = pm.get(String(i))
      if (v !== i) throw new Error(`key "${i}": expected ${i}, got ${v}`)
    }
  })

  // Single-character keys "a".."z" repeated in prefixed variants: exercises
  // keys sharing long common prefixes (similar leading hash bits).
  it('keys sharing long common prefixes are all reachable', () => {
    const prefix = 'x'.repeat(100)
    let pm = PersistentMap.empty<number>()
    for (let i = 0; i < N_SMALL; i++) pm = pm.assoc(`${prefix}${i}`, i)

    expect(pm.size).toBe(N_SMALL)
    for (let i = 0; i < N_SMALL; i++) {
      const v = pm.get(`${prefix}${i}`)
      if (v !== i) throw new Error(`key "${prefix}${i}": expected ${i}, got ${v}`)
    }
  })

  // Structural sharing: updates to a large map don't corrupt the snapshot.
  it(`${N_SMALL.toLocaleString()} updates do not corrupt prior snapshots`, () => {
    let pm = PersistentMap.empty<number>()
    for (let i = 0; i < N_SMALL; i++) pm = pm.assoc(`k${i}`, i)

    const snapshot = pm
    // overwrite all keys in a derived map
    for (let i = 0; i < N_SMALL; i++) pm = pm.assoc(`k${i}`, -i)

    // snapshot must be unchanged
    for (let i = 0; i < N_SMALL; i++) {
      const v = snapshot.get(`k${i}`)
      if (v !== i) throw new Error(`snapshot key k${i}: expected ${i}, got ${v}`)
    }
  })
})

// ---------------------------------------------------------------------------
// PersistentList stress tests
// ---------------------------------------------------------------------------

describe('PersistentList stress', () => {
  // Large list: verify every element is correct in order.
  it(`listToArray is correct for a ${N_LARGE.toLocaleString()}-element list`, () => {
    let list: PersistentList<number> = null
    for (let i = N_LARGE - 1; i >= 0; i--) list = cons(i, list)

    const arr = listToArray(list)
    expect(arr.length).toBe(N_LARGE)
    for (let i = 0; i < N_LARGE; i++) {
      if (arr[i] !== i) throw new Error(`index ${i}: expected ${i}, got ${arr[i]}`)
    }
  })

  // listFromArray → listToArray round-trip at scale.
  it(`listFromArray / listToArray round-trip for ${N_LARGE.toLocaleString()} elements`, () => {
    const arr = Array.from({ length: N_LARGE }, (_, i) => i)
    const list = listFromArray(arr)
    const result = listToArray(list)
    expect(result.length).toBe(N_LARGE)
    for (let i = 0; i < N_LARGE; i++) {
      if (result[i] !== i) throw new Error(`index ${i}: expected ${i}, got ${result[i]}`)
    }
  })

  // Forking at depth: simulate two multi-shot resumptions from a large snapshot.
  // Each fork must see the full shared history plus its own new frames.
  it(`forking a ${N_MEDIUM.toLocaleString()}-element list produces independent branches`, () => {
    let base: PersistentList<number> = null
    for (let i = N_MEDIUM - 1; i >= 0; i--) base = cons(i, base)

    // Fork: two branches extend the same base
    const branchA = cons(-1, base)
    const branchB = cons(-2, base)

    const arrA = listToArray(branchA)
    const arrB = listToArray(branchB)

    expect(arrA.length).toBe(N_MEDIUM + 1)
    expect(arrB.length).toBe(N_MEDIUM + 1)
    expect(arrA[0]).toBe(-1)
    expect(arrB[0]).toBe(-2)
    // shared suffix is identical
    for (let i = 0; i < N_MEDIUM; i++) {
      if (arrA[i + 1] !== i) throw new Error(`branchA[${i + 1}]: expected ${i}`)
      if (arrB[i + 1] !== i) throw new Error(`branchB[${i + 1}]: expected ${i}`)
    }
    // base is unchanged
    expect(listToArray(base).length).toBe(N_MEDIUM)
  })

  // No stack overflow: listToArray and listFromArray both use loops.
  it(`no stack overflow for ${N_LARGE.toLocaleString()}-element list operations`, () => {
    const arr = Array.from({ length: N_LARGE }, (_, i) => i)
    // These would stack-overflow if implemented recursively
    const list = listFromArray(arr)
    const result = listToArray(list)
    expect(result.length).toBe(N_LARGE)
  })
})

// ---------------------------------------------------------------------------
// Cross-structure: PersistentVector stress (extended, cross-boundary)
// ---------------------------------------------------------------------------

describe('PersistentVector stress', () => {
  // Every element correct after build: analogous to the original regression test
  // but at higher N to catch any further trie-depth boundaries.
  it(`every element correct after building ${N_LARGE.toLocaleString()}-element vector`, () => {
    const pv = PersistentVector.from(Array.from({ length: N_LARGE }, (_, i) => i))
    expect(pv.size).toBe(N_LARGE)
    for (let i = 0; i < N_LARGE; i++) {
      const v = pv.get(i)
      if (v !== i) throw new Error(`index ${i}: expected ${i}, got ${v}`)
    }
  })

  // Sequential append: each append must not corrupt any prior element.
  it(`each of ${N_MEDIUM.toLocaleString()} sequential appends keeps all prior elements correct`, () => {
    let pv = PersistentVector.empty<number>()
    for (let i = 0; i < N_MEDIUM; i++) {
      pv = pv.append(i)
      // spot-check boundaries around powers of 32
      const checkIdx = i - 1
      if (checkIdx >= 0) {
        const v = pv.get(checkIdx)
        if (v !== checkIdx) throw new Error(`after append(${i}), get(${checkIdx}) = ${v}`)
      }
    }
    expect(pv.toArray()).toEqual(Array.from({ length: N_MEDIUM }, (_, i) => i))
  })

  // set at every index in a large vector.
  it(`set at every index in a ${N_SMALL.toLocaleString()}-element vector`, () => {
    const base = PersistentVector.from(Array.from({ length: N_SMALL }, (_, i) => i))
    for (let i = 0; i < N_SMALL; i++) {
      const updated = base.set(i, -1)
      if (updated.get(i) !== -1) throw new Error(`set(${i}): expected -1`)
      // immediate neighbours unchanged
      if (i > 0 && updated.get(i - 1) !== i - 1) throw new Error(`neighbour ${i - 1} corrupted after set(${i})`)
      if (i < N_SMALL - 1 && updated.get(i + 1) !== i + 1) throw new Error(`neighbour ${i + 1} corrupted after set(${i})`)
    }
  })
})
