/**
 * Multi-shot continuation tests (Phase 3).
 *
 * These tests verify that `resume` can be called multiple times within a single
 * effect clause, forking the continuation from the same snapshot each time.
 *
 * Before Phase 3, this was guarded by a one-shot check that threw:
 * "resume can only be called once per effect (one-shot continuation)".
 *
 * After Phase 3:
 * - The guard is removed
 * - Frames are immutable — no mutation after being pushed onto the stack
 * - `resume` simply re-uses the captured PersistentList reference (O(1) fork)
 * - Calling `resume` twice from the same clause restarts the continuation
 *   from the same point with different values
 *
 * The `chooseAll` pattern uses:
 *   handler
 *     @choose(options) -> reduce(options, (acc, x) -> acc ++ resume(x), [])
 *     transform result -> [result]
 *   end
 *
 * The transform wraps each branch's result in `[...]` so that `resume(x)`
 * always returns an array — enabling `++` to concatenate across branches.
 */

import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala({ disableAutoCheckpoint: true })

// ---------------------------------------------------------------------------
// Basic multi-shot: resume called twice in one clause
// ---------------------------------------------------------------------------

describe('multi-shot continuations', () => {
  // The simplest multi-shot: resume called twice explicitly.
  it('resume called twice explicitly returns results from both branches', () => {
    const result = dvala.run(`
      let twoShot = handler
        @flip() -> [resume(true)] ++ [resume(false)]
      end;
      do with twoShot;
        if perform(@flip) then 1 else 2 end
      end
    `)
    // First resume(true) → 1, second resume(false) → 2
    expect(result).toEqual([1, 2])
  })

  // The canonical chooseAll handler: explores all options via reduce+transform.
  // transform wraps each final result so resume(x) always returns an array.
  it('chooseAll: explores all options via reduce + transform', () => {
    const result = dvala.run(`
      let chooseAll = handler
        @choose(options) -> reduce(options, (acc, x) -> acc ++ resume(x), [])
        transform result -> [result]
      end;
      do with chooseAll;
        perform(@choose, [1, 2, 3]) * 10
      end
    `)
    expect(result).toEqual([10, 20, 30])
  })

  // Two nested chooses: cartesian product.
  it('chooseAll: cartesian product of two independent choices', () => {
    const result = dvala.run(`
      let chooseAll = handler
        @choose(options) -> reduce(options, (acc, x) -> acc ++ resume(x), [])
        transform result -> [result]
      end;
      do with chooseAll;
        let a = perform(@choose, [1, 2]);
        let b = perform(@choose, [10, 20]);
        [a, b]
      end
    `)
    // Expected: [[1,10],[1,20],[2,10],[2,20]]
    const sorted = (result as number[][]).sort((x, y) => (x[0]! - y[0]!) || (x[1]! - y[1]!))
    expect(sorted).toEqual([[1, 10], [1, 20], [2, 10], [2, 20]])
  })

  // resume called zero times (abort) still works correctly.
  it('zero-shot (abort) still works after removing one-shot guard', () => {
    const result = dvala.run(`
      let abort = handler
        @stop() -> 42
      end;
      do with abort;
        perform(@stop);
        999
      end
    `)
    expect(result).toBe(42)
  })

  // One-shot (exactly one resume) still works correctly.
  it('one-shot resume still works correctly', () => {
    const result = dvala.run(`
      let once = handler
        @ask() -> resume(7)
      end;
      do with once;
        perform(@ask) + 1
      end
    `)
    expect(result).toBe(8)
  })

  // Branches are fully independent — they don't share mutable state.
  it('branches from same choice produce independent results', () => {
    const result = dvala.run(`
      let chooseAll = handler
        @choose(options) -> reduce(options, (acc, x) -> acc ++ resume(x), [])
        transform result -> [result]
      end;
      do with chooseAll;
        let a = perform(@choose, [1, 2]);
        let b = a * 2;
        [a, b]
      end
    `)
    expect(result).toEqual([[1, 2], [2, 4]])
  })

  // Deep nesting: 3 binary choices → 2^3 = 8 paths.
  it('8 paths from 3 binary choices', () => {
    const result = dvala.run(`
      let chooseAll = handler
        @choose(options) -> reduce(options, (acc, x) -> acc ++ resume(x), [])
        transform result -> [result]
      end;
      do with chooseAll;
        let a = perform(@choose, [0, 1]);
        let b = perform(@choose, [0, 1]);
        let c = perform(@choose, [0, 1]);
        a * 4 + b * 2 + c
      end
    `)
    expect((result as number[]).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  // Handler with transform: ensure resume result flows through transform correctly.
  it('single-shot resume with transform still applies transform', () => {
    const result = dvala.run(`
      let h = handler
        @ask() -> resume(5)
        transform x -> x * 10
      end;
      do with h;
        perform(@ask) + 1
      end
    `)
    expect(result).toBe(60)
  })
})
