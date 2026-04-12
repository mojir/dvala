/**
 * Handler propagation across parallel branches.
 *
 * Tests for the `with propagate` keyword that harvests handlers into
 * parallel/race/settled branches at fork time.
 */

import { describe, expect, it } from 'vitest'
import { allBuiltinModules } from '../src/allModules'
import { createDvala } from '../src/createDvala'
import type { Snapshot } from '../src/evaluator/effectTypes'
import { resume as baseResume } from '../src/resume'

const dvala = createDvala({ disableAutoCheckpoint: true, modules: allBuiltinModules })

// ---------------------------------------------------------------------------
// Basic propagation
// ---------------------------------------------------------------------------

describe('basic propagation', () => {
  it('propagated error handler catches branch errors via resume', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> resume(null) end;
        parallel([-> 1 + "a", -> 42]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([null, 42])
    }
  })

  it('propagated handler abort replaces branch result only, not entire parallel', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> "failed" end;
        parallel([-> 1 + "a", -> 42]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual(['failed', 42])
    }
  })

  it('non-propagate handler does NOT reach branches (backward compat)', async () => {
    const result = await dvala.runAsync(
      `do with handler @dvala.error(e) -> resume(null) end;
        parallel([-> 1 + "a", -> 42]);
      end`,
    )
    // Error leaks to host — parallel fails
    expect(result.type).toBe('error')
  })

  it('custom effects across barrier with propagate', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @log(msg) -> resume(null) end;
        parallel([-> do perform(@log, "hello"); 42 end]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([42])
    }
  })
})

// ---------------------------------------------------------------------------
// Handler shadowing
// ---------------------------------------------------------------------------

describe('handler shadowing', () => {
  it('inner handler shadows propagated handler', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> resume("outer") end;
        parallel([
          -> do with handler @dvala.error(e) -> resume("inner") end;
            1 + "a";
          end
        ]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual(['inner'])
    }
  })
})

// ---------------------------------------------------------------------------
// Nested parallel — transitive propagation
// ---------------------------------------------------------------------------

describe('nested parallel', () => {
  it('propagated handler reaches inner parallel branches transitively', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> resume("outer") end;
        parallel([
          -> parallel([-> 1 + "a"])
        ]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Outer parallel harvests handler into Branch A.
      // Branch A runs inner parallel. Inner parallel harvests from Branch A's k,
      // which includes the propagated handler.
      // Inner branch's error is caught.
      expect(result.value).toEqual([['outer']])
    }
  })
})

// ---------------------------------------------------------------------------
// Shallow handler propagation
// ---------------------------------------------------------------------------

describe('shallow handler propagation', () => {
  it('shallow state handler propagates into branches', async () => {
    const result = await dvala.runAsync(
      `let state = (s) -> shallow handler
        @get() -> do with state(s); resume(s) end
        @set(v) -> do with state(v); resume(null) end
      end;
      do with propagate state(0);
        parallel([-> do perform(@set, 1); perform(@get) end]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([1])
    }
  })

  it('independent state per branch', async () => {
    const result = await dvala.runAsync(
      `let state = (s) -> shallow handler
        @get() -> do with state(s); resume(s) end
        @set(v) -> do with state(v); resume(null) end
      end;
      do with propagate state(0);
        parallel([
          -> do perform(@set, 1); perform(@get) end,
          -> do perform(@set, 2); perform(@get) end,
        ]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Each branch evolves independently
      expect(result.value).toEqual([1, 2])
    }
  })
})

// ---------------------------------------------------------------------------
// Settled interaction
// ---------------------------------------------------------------------------

describe('settled interaction', () => {
  it('settled without propagate — errors collected normally', async () => {
    const result = await dvala.runAsync(
      `do with handler @dvala.error(e) -> resume(null) end;
        settled([-> 1 + "a"]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // No propagate → handler doesn't reach branch → settled collects error
      const values = result.value as unknown[][]
      expect(values[0]![0]).toEqual(expect.objectContaining({ name: 'error' }))
    }
  })

  it('settled WITH propagate — user explicit choice, handler catches error', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> resume(null) end;
        settled([-> 1 + "a"]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Propagated handler catches error → branch completes normally → settled sees :ok
      const values = result.value as unknown[][]
      expect(values[0]![0]).toEqual(expect.objectContaining({ name: 'ok' }))
      expect(values[0]![1]).toBe(null)
    }
  })
})

// ---------------------------------------------------------------------------
// Transform clause stripping
// ---------------------------------------------------------------------------

describe('transform clause', () => {
  it('transform NOT applied inside branch — only outside on parallel result', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler
        @dvala.error(e) -> resume(null)
        transform result -> result ++ [99]
      end;
        parallel([-> 21]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Transform applies once to parallel result [21] ++ [99] = [21, 99],
      // NOT twice — propagated handler has transform stripped inside branch
      expect(result.value).toEqual([21, 99])
    }
  })
})

// ---------------------------------------------------------------------------
// Race mode
// ---------------------------------------------------------------------------

describe('race with propagation', () => {
  it('propagated error handler works in race mode', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> resume(null) end;
        race([
          -> 1 + "a",
          -> 42,
        ]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Both branches may complete. Branch 1 error caught → null. Branch 2 → 42.
      // Race returns first completed value — could be either, but both are valid.
      expect([null, 42]).toContain(result.value)
    }
  })
})

// ---------------------------------------------------------------------------
// Library handler propagation (effectHandler module)
// ---------------------------------------------------------------------------

describe('library handler propagation', () => {
  it('propagating library fallback handler', async () => {
    const result = await dvala.runAsync(
      `let { fallback } = import("effectHandler");
      do with propagate fallback(0);
        parallel([-> 0 / 0, -> 42]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // fallback(0) catches div-by-zero error and aborts with 0
      expect(result.value).toEqual([0, 42])
    }
  })
})

// ---------------------------------------------------------------------------
// Snapshot + resume with propagated handler
// ---------------------------------------------------------------------------

describe('snapshot with propagated handler', () => {
  it('checkpoint inside branch with propagated handler survives resume', async () => {
    let branchSnapshot: Snapshot | undefined

    const result1 = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> resume("recovered") end;
        parallel([
          -> perform(@task, "a"),
          -> 42,
        ]);
      end`,
      {
        effectHandlers: [
          {
            pattern: 'task',
            handler: async ({ suspend }) => {
              suspend({ step: 'a' })
            },
          },
        ],
      },
    )
    expect(result1.type).toBe('suspended')
    if (result1.type === 'suspended') {
      branchSnapshot = result1.snapshot
    }

    // Resume: the propagated handler should still be in the deserialized continuation
    const result2 = await baseResume(branchSnapshot!, 'resumed-a', {
      disableAutoCheckpoint: true,
    })
    expect(result2.type).toBe('completed')
    if (result2.type === 'completed') {
      expect(result2.value).toEqual(['resumed-a', 42])
    }
  })
})

// ---------------------------------------------------------------------------
// Multiple handler stacking with propagate
// ---------------------------------------------------------------------------

describe('multiple handlers', () => {
  it('multiple propagated handlers — nearest wins', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> resume("outer") end;
        do with propagate handler @dvala.error(e) -> resume("inner") end;
          parallel([-> 1 + "a"]);
        end;
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Inner propagated handler is nearer, should catch first
      expect(result.value).toEqual(['inner'])
    }
  })

  it('mixed propagate and non-propagate handlers', async () => {
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> resume("propagated") end;
        do with handler @dvala.error(e) -> resume("non-propagated") end;
          parallel([-> 1 + "a"]);
        end;
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Non-propagate handler is NOT harvested, only propagated one is.
      // The propagated handler (from outer) catches the error.
      expect(result.value).toEqual(['propagated'])
    }
  })
})

// ---------------------------------------------------------------------------
// Race — deterministic variant
// ---------------------------------------------------------------------------

describe('race deterministic', () => {
  it('race with one erroring and one succeeding branch completes', async () => {
    // Only one branch can succeed (the other errors), so the winner is deterministic
    const result = await dvala.runAsync(
      `do with propagate handler @dvala.error(e) -> do
          perform(@dvala.sleep, 100);
          resume(null);
        end end;
        race([
          -> 42,
          -> 1 + "a",
        ]);
      end`,
    )
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      // Branch 1 completes immediately with 42 — it wins the race
      expect(result.value).toBe(42)
    }
  })
})

// ---------------------------------------------------------------------------
// Edge case: `propagate` as a variable name
// ---------------------------------------------------------------------------

describe('propagate as variable name', () => {
  it('variable named propagate works with parens in with-site', () => {
    // `propagate` is a contextual keyword — wrapping in parens bypasses it
    const result = createDvala().run(
      `let propagate = handler @dvala.error(e) -> resume("ok") end;
      do with (propagate); 0 / 0 end`,
    )
    expect(result).toBe('ok')
  })

  it('variable named propagate works in non-with contexts', () => {
    const result = createDvala().run(
      'let propagate = 42; propagate + 1',
    )
    expect(result).toBe(43)
  })
})
