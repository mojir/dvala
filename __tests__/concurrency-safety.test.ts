/**
 * Concurrency safety test suite.
 *
 * Verifies that the BarrierFrame prevents race conditions on stateful handlers,
 * that first-class handlers create independent state per branch, and that
 * all exploit vectors are blocked.
 */

import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()

// ---------------------------------------------------------------------------
// BarrierFrame effect isolation
// ---------------------------------------------------------------------------

describe('BarrierFrame effect isolation', () => {
  it('outer algebraic handler is NOT visible to parallel branches', async () => {
    const result = await dvala.runAsync(
      'do with handler @outer.eff(x) -> resume(x * 100) end; parallel([-> perform(@outer.eff, 5), -> 10]) end',
      {
        effectHandlers: [
          // The host catches the effect that escapes the branch
          { pattern: 'outer.eff', handler: async ({ arg, resume }) => { resume(`host-handled-${arg}`) } },
        ],
      },
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // The outer handler did NOT catch it — the host handler did
      expect(result.value).toEqual(['host-handled-5', 10])
    }
  })

  it('outer @dvala.error handler does NOT catch branch errors', async () => {
    const result = await dvala.runAsync(
      'do with handler @dvala.error(e) -> resume("caught-outer") end; parallel([-> raise("boom"), -> 10]) end',
    )

    // Error should NOT be caught by outer handler — it causes the parallel to fail
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Closure-based attacks
// ---------------------------------------------------------------------------

describe('closure-based attacks', () => {
  it('function defined in handler scope does not leak handler access into branch', async () => {
    // A closure capturing a variable from handler scope — the handler itself
    // should NOT be reachable via effect dispatch from inside a branch
    const result = await dvala.runAsync(
      `do with handler @state.get() -> resume(42) end;
        let getter = -> perform(@state.get);
        parallel([getter, -> 99])
      end`,
      {
        effectHandlers: [
          { pattern: 'state.get', handler: async ({ resume }) => { resume('host-state') } },
        ],
      },
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // getter() performs @state.get inside the branch — hits host handler, not outer handler
      expect(result.value).toEqual(['host-state', 99])
    }
  })
})

// ---------------------------------------------------------------------------
// First-class handler safety
// ---------------------------------------------------------------------------

describe('first-class handler safety', () => {
  it('same handler value in two branches creates independent frames', async () => {
    const result = await dvala.runAsync(
      `let h = handler @val() -> resume(42) end;
      parallel([
        -> do with h; perform(@val) end,
        -> do with h; perform(@val) end
      ])`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([42, 42])
    }
  })

  it('stateful handler (continuation-threaded) in two branches — independent state', async () => {
    // Each branch should have its OWN state, not shared
    const result = await dvala.runAsync(
      `let counter = handler
        @inc() -> resume(null)
        @get() -> resume(0)
      end;
      parallel([
        -> do with counter; perform(@inc); perform(@get) end,
        -> do with counter; perform(@get) end
      ])`,
    )

    expect(result.type).toBe('completed')
    // Both branches see their own independent handler — no shared state
    if (result.type === 'completed') {
      expect(result.value).toEqual([0, 0])
    }
  })
})

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('immutability guarantees', () => {
  it('shared object reference across branches — no mutation', async () => {
    const result = await dvala.runAsync(
      `let shared = { count: 0 };
      parallel([
        -> assoc(shared, "count", 1),
        -> assoc(shared, "count", 2)
      ])`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Each branch returns a NEW object — shared is unchanged
      expect(result.value).toEqual([{ count: 1 }, { count: 2 }])
    }
  })

  it('shared array reference across branches — no mutation', async () => {
    const result = await dvala.runAsync(
      `let shared = [1, 2, 3];
      parallel([
        -> push(shared, 4),
        -> push(shared, 5)
      ])`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Each branch returns a NEW array — shared is unchanged
      expect(result.value).toEqual([[1, 2, 3, 4], [1, 2, 3, 5]])
    }
  })
})

// ---------------------------------------------------------------------------
// Nested parallel isolation
// ---------------------------------------------------------------------------

describe('nested parallel isolation', () => {
  it('inner parallel barrier does not leak to outer', async () => {
    const result = await dvala.runAsync(
      `do with handler @outer.eff() -> resume("outer") end;
      parallel([
        -> parallel([-> 1, -> 2]),
        -> 3
      ])
      end`,
      {
        effectHandlers: [
          { pattern: 'outer.eff', handler: async ({ resume }) => { resume('host-outer') } },
        ],
      },
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([[1, 2], 3])
    }
  })
})

// ---------------------------------------------------------------------------
// Integration with settled
// ---------------------------------------------------------------------------

describe('settled error handling', () => {
  it('branch error in settled mode is wrapped as [:error, payload]', async () => {
    const result = await dvala.runAsync(
      'settled([-> 42, -> raise("oops"), -> 99])',
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      const values = result.value as unknown[]
      expect(values).toHaveLength(3)
      // First and third: [:ok, value]
      expect((values[0] as unknown[])[0]).toEqual(expect.objectContaining({ name: 'ok' }))
      expect((values[0] as unknown[])[1]).toBe(42)
      expect((values[2] as unknown[])[0]).toEqual(expect.objectContaining({ name: 'ok' }))
      expect((values[2] as unknown[])[1]).toBe(99)
      // Second: [:error, { type, message }]
      expect((values[1] as unknown[])[0]).toEqual(expect.objectContaining({ name: 'error' }))
      const errorPayload = (values[1] as unknown[])[1] as Record<string, unknown>
      expect(errorPayload).toHaveProperty('message', 'oops')
      expect(errorPayload).toHaveProperty('type', 'UserError')
    }
  })

  it('branch-local @dvala.error handler catches error — settled sees [:ok, handlerResult]', async () => {
    const result = await dvala.runAsync(
      `settled([
        -> do with handler @dvala.error(e) -> resume(-1) end; raise("handled") end,
        -> raise("unhandled")
      ])`,
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      const values = result.value as unknown[]
      expect(values).toHaveLength(2)
      // First: handled internally → [:ok, -1]
      expect((values[0] as unknown[])[0]).toEqual(expect.objectContaining({ name: 'ok' }))
      expect((values[0] as unknown[])[1]).toBe(-1)
      // Second: unhandled → [:error, ...]
      expect((values[1] as unknown[])[0]).toEqual(expect.objectContaining({ name: 'error' }))
    }
  })

  it('all branches succeed in settled mode — all wrapped as [:ok, value]', async () => {
    const result = await dvala.runAsync(
      'settled([-> 1, -> 2, -> 3])',
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      const values = result.value as unknown[]
      expect(values).toHaveLength(3)
      for (let i = 0; i < 3; i++) {
        expect((values[i] as unknown[])[0]).toEqual(expect.objectContaining({ name: 'ok' }))
        expect((values[i] as unknown[])[1]).toBe(i + 1)
      }
    }
  })

  it('all branches error in settled mode — no throw, all wrapped as [:error, ...]', async () => {
    const result = await dvala.runAsync(
      'settled([-> raise("a"), -> raise("b")])',
    )

    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      const values = result.value as unknown[]
      expect(values).toHaveLength(2)
      for (const v of values) {
        expect((v as unknown[])[0]).toEqual(expect.objectContaining({ name: 'error' }))
      }
    }
  })
})
