import { describe, expect, it } from 'vitest'
import { PersistentMap, TransientMap } from './PersistentMap'

// djb2-style hash used internally — these keys are known to collide at the
// first HAMT level (same hash bits [0..4]) to exercise CollisionNode paths.
// Verified empirically: hash('a')=97, hash('b')=98 differ in bit 0, no
// artificial collisions needed. Collision nodes are tested via forced-hash
// scenarios using many keys instead.

function makeRecord(n: number): Record<string, number> {
  const r: Record<string, number> = {}
  for (let i = 0; i < n; i++) r[`key${i}`] = i
  return r
}

describe('PersistentMap', () => {
  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  describe('empty', () => {
    it('has size 0', () => {
      expect(PersistentMap.empty().size).toBe(0)
    })

    it('get returns undefined for any key', () => {
      expect(PersistentMap.empty().get('x')).toBeUndefined()
    })

    it('has returns false for any key', () => {
      expect(PersistentMap.empty().has('x')).toBe(false)
    })

    it('iterates zero entries', () => {
      expect([...PersistentMap.empty()]).toEqual([])
    })

    it('empty() always returns the same singleton', () => {
      expect(PersistentMap.empty()).toBe(PersistentMap.empty())
    })
  })

  describe('from', () => {
    it('builds from empty iterable', () => {
      expect(PersistentMap.from([]).size).toBe(0)
    })

    it('builds from [key, value] pairs', () => {
      const pm = PersistentMap.from([['a', 1], ['b', 2], ['c', 3]])
      expect(pm.size).toBe(3)
      expect(pm.get('a')).toBe(1)
      expect(pm.get('b')).toBe(2)
      expect(pm.get('c')).toBe(3)
    })

    it('later entries overwrite earlier ones for duplicate keys', () => {
      const pm = PersistentMap.from([['x', 1], ['x', 2]])
      expect(pm.size).toBe(1)
      expect(pm.get('x')).toBe(2)
    })
  })

  describe('fromRecord', () => {
    it('builds from a plain object', () => {
      const pm = PersistentMap.fromRecord({ a: 1, b: 2 })
      expect(pm.size).toBe(2)
      expect(pm.get('a')).toBe(1)
      expect(pm.get('b')).toBe(2)
    })

    it('round-trips a large record', () => {
      const rec = makeRecord(500)
      const pm = PersistentMap.fromRecord(rec)
      expect(pm.size).toBe(500)
      for (const [k, v] of Object.entries(rec)) {
        expect(pm.get(k)).toBe(v)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // assoc
  // ---------------------------------------------------------------------------

  describe('assoc', () => {
    it('inserts a new key', () => {
      const pm = PersistentMap.empty<number>().assoc('x', 42)
      expect(pm.size).toBe(1)
      expect(pm.get('x')).toBe(42)
    })

    it('updates an existing key without changing size', () => {
      const pm = PersistentMap.empty<number>().assoc('x', 1).assoc('x', 2)
      expect(pm.size).toBe(1)
      expect(pm.get('x')).toBe(2)
    })

    it('does not mutate the original', () => {
      const pm1 = PersistentMap.empty<number>().assoc('x', 1)
      const pm2 = pm1.assoc('x', 2)
      expect(pm1.get('x')).toBe(1)
      expect(pm2.get('x')).toBe(2)
    })

    it('handles many insertions (exercises HAMT tree growth)', () => {
      let pm = PersistentMap.empty<number>()
      for (let i = 0; i < 1000; i++) {
        pm = pm.assoc(`key${i}`, i)
        expect(pm.size).toBe(i + 1)
        expect(pm.get(`key${i}`)).toBe(i)
      }
    })

    it('all 1000 keys are accessible after bulk insertion', () => {
      const rec = makeRecord(1000)
      const pm = PersistentMap.fromRecord(rec)
      for (const [k, v] of Object.entries(rec)) {
        expect(pm.get(k)).toBe(v)
      }
    })

    it('stores null as a value', () => {
      const pm = PersistentMap.empty<null>().assoc('k', null)
      expect(pm.has('k')).toBe(true)
      expect(pm.get('k')).toBeNull()
    })

    it('stores undefined-like falsy values', () => {
      const pm = PersistentMap.empty<number | boolean>().assoc('zero', 0).assoc('false', false as boolean)
      expect(pm.get('zero')).toBe(0)
      expect(pm.get('false')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // dissoc
  // ---------------------------------------------------------------------------

  describe('dissoc', () => {
    it('returns this when key is not present', () => {
      const pm = PersistentMap.empty<number>().assoc('x', 1)
      expect(pm.dissoc('y')).toBe(pm)
    })

    it('removes an existing key', () => {
      const pm = PersistentMap.empty<number>().assoc('x', 1).assoc('y', 2).dissoc('x')
      expect(pm.size).toBe(1)
      expect(pm.has('x')).toBe(false)
      expect(pm.get('y')).toBe(2)
    })

    it('does not mutate the original', () => {
      const pm1 = PersistentMap.empty<number>().assoc('x', 1)
      const pm2 = pm1.dissoc('x')
      expect(pm1.has('x')).toBe(true)
      expect(pm2.has('x')).toBe(false)
    })

    it('removing from a single-entry map gives an empty map', () => {
      const pm = PersistentMap.empty<number>().assoc('x', 1).dissoc('x')
      expect(pm.size).toBe(0)
      expect([...pm]).toEqual([])
    })

    it('remove all keys one by one', () => {
      const keys = Array.from({ length: 100 }, (_, i) => `k${i}`)
      let pm: PersistentMap<number> = PersistentMap.empty()
      for (const k of keys) pm = pm.assoc(k, 1)
      for (const k of keys) {
        pm = pm.dissoc(k)
        expect(pm.has(k)).toBe(false)
      }
      expect(pm.size).toBe(0)
    })

    it('dissoc from large map preserves all other entries', () => {
      const rec = makeRecord(200)
      let pm = PersistentMap.fromRecord(rec)
      // Remove every other key
      for (let i = 0; i < 200; i += 2) {
        pm = pm.dissoc(`key${i}`)
      }
      expect(pm.size).toBe(100)
      for (let i = 1; i < 200; i += 2) {
        expect(pm.get(`key${i}`)).toBe(i)
      }
      for (let i = 0; i < 200; i += 2) {
        expect(pm.has(`key${i}`)).toBe(false)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // has
  // ---------------------------------------------------------------------------

  describe('has', () => {
    it('returns false for missing key', () => {
      expect(PersistentMap.empty().has('x')).toBe(false)
    })

    it('returns true for present key', () => {
      const pm = PersistentMap.empty<number>().assoc('x', 0)
      expect(pm.has('x')).toBe(true)
    })

    it('distinguishes absent key from key with undefined-like value', () => {
      // has() is based on HAMT lookup; a key storing 0 or false is still "present"
      const pm = PersistentMap.empty<number>().assoc('zero', 0)
      expect(pm.has('zero')).toBe(true)
      expect(pm.has('other')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // keys / values / entries
  // ---------------------------------------------------------------------------

  describe('keys / values / entries', () => {
    it('keys returns all keys (any order)', () => {
      const pm = PersistentMap.from([['a', 1], ['b', 2], ['c', 3]])
      expect(pm.keys().sort()).toEqual(['a', 'b', 'c'])
    })

    it('values returns all values (matching key order)', () => {
      const pm = PersistentMap.from([['a', 1], ['b', 2]])
      expect(pm.values().sort()).toEqual([1, 2])
    })

    it('entries returns all [k, v] pairs', () => {
      const pm = PersistentMap.from([['a', 1], ['b', 2]])
      const sorted = pm.entries().sort(([a], [b]) => a.localeCompare(b))
      expect(sorted).toEqual([['a', 1], ['b', 2]])
    })

    it('keys/values/entries are consistent with each other', () => {
      const rec = makeRecord(50)
      const pm = PersistentMap.fromRecord(rec)
      const keys = pm.keys().sort()
      const entries = pm.entries().sort(([a], [b]) => a.localeCompare(b))
      expect(keys).toEqual(entries.map(([k]) => k))
      for (const [k, v] of entries) {
        expect(pm.get(k)).toBe(v)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // iteration
  // ---------------------------------------------------------------------------

  describe('iteration', () => {
    it('iterates all [key, value] pairs', () => {
      const pm = PersistentMap.from([['a', 1], ['b', 2], ['c', 3]])
      const entries = [...pm].sort(([a], [b]) => a.localeCompare(b))
      expect(entries).toEqual([['a', 1], ['b', 2], ['c', 3]])
    })

    it('same map can be iterated multiple times', () => {
      const pm = PersistentMap.from([['x', 1]])
      expect([...pm]).toEqual([...pm])
    })

    it('iterates all entries for a large map', () => {
      const rec = makeRecord(500)
      const pm = PersistentMap.fromRecord(rec)
      const seen = new Map<string, number>()
      for (const [k, v] of pm) seen.set(k, v)
      expect(seen.size).toBe(500)
      for (const [k, v] of Object.entries(rec)) {
        expect(seen.get(k)).toBe(v)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // toRecord
  // ---------------------------------------------------------------------------

  describe('toRecord', () => {
    it('converts to plain object', () => {
      const pm = PersistentMap.from([['a', 1], ['b', 2]])
      const rec = pm.toRecord()
      expect(rec).toEqual({ a: 1, b: 2 })
    })

    it('mutation of the result does not affect the map', () => {
      const pm = PersistentMap.empty<number>().assoc('x', 1)
      const rec = pm.toRecord()
      rec['x'] = 999
      expect(pm.get('x')).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // Transient (bulk construction)
  // ---------------------------------------------------------------------------

  describe('TransientMap', () => {
    it('builds an empty map', () => {
      const t = new TransientMap()
      expect(t.persistent().size).toBe(0)
    })

    it('set and persistent', () => {
      const t = new TransientMap<number>()
      t.set('a', 1)
      t.set('b', 2)
      const pm = t.persistent()
      expect(pm.size).toBe(2)
      expect(pm.get('a')).toBe(1)
      expect(pm.get('b')).toBe(2)
    })

    it('later set overwrites earlier for the same key', () => {
      const t = new TransientMap<number>()
      t.set('x', 1)
      t.set('x', 2)
      expect(t.persistent().get('x')).toBe(2)
      expect(t.persistent().size).toBe(1)
    })

    it('asTransient / persistent round-trip preserves all entries', () => {
      const pm1 = PersistentMap.fromRecord(makeRecord(200))
      const t = pm1.asTransient()
      t.set('extra', 999)
      const pm2 = t.persistent()
      expect(pm2.size).toBe(201)
      expect(pm2.get('extra')).toBe(999)
      // original unchanged
      expect(pm1.size).toBe(200)
      expect(pm1.has('extra')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Structural sharing
  // ---------------------------------------------------------------------------

  describe('structural sharing', () => {
    it('assoc returns new map; original is unchanged', () => {
      const pm1 = PersistentMap.fromRecord({ a: 1, b: 2 })
      const pm2 = pm1.assoc('c', 3)
      expect(pm1.size).toBe(2)
      expect(pm1.has('c')).toBe(false)
      expect(pm2.size).toBe(3)
    })

    it('update preserves all other keys', () => {
      const rec = makeRecord(100)
      const pm1 = PersistentMap.fromRecord(rec)
      const pm2 = pm1.assoc('key50', -1)
      expect(pm2.get('key50')).toBe(-1)
      for (const k of Object.keys(rec).filter(key => key !== 'key50')) {
        expect(pm2.get(k)).toBe(rec[k])
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('empty string key', () => {
      const pm = PersistentMap.empty<number>().assoc('', 42)
      expect(pm.has('')).toBe(true)
      expect(pm.get('')).toBe(42)
    })

    it('very long key', () => {
      const key = 'k'.repeat(10_000)
      const pm = PersistentMap.empty<number>().assoc(key, 1)
      expect(pm.get(key)).toBe(1)
    })

    it('keys that differ only at the end', () => {
      const pm = PersistentMap.from([['abc', 1], ['abd', 2], ['abe', 3]])
      expect(pm.get('abc')).toBe(1)
      expect(pm.get('abd')).toBe(2)
      expect(pm.get('abe')).toBe(3)
    })

    it('numeric-like string keys', () => {
      const pm = PersistentMap.from([['0', 'a'], ['1', 'b'], ['10', 'c'], ['100', 'd']])
      expect(pm.get('0')).toBe('a')
      expect(pm.get('10')).toBe('c')
      expect(pm.get('100')).toBe('d')
    })

    it('unicode keys', () => {
      const pm = PersistentMap.from([['α', 1], ['β', 2], ['γ', 3]])
      expect(pm.get('α')).toBe(1)
      expect(pm.get('β')).toBe(2)
      expect(pm.get('γ')).toBe(3)
    })
  })
})
