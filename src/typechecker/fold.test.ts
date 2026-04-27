/**
 * Integration test for constant folding in `inferExpr`. Verifies that with
 * `DVALA_FOLD=1`, expressions involving pure builtins with literal args
 * produce `Literal` types. With the flag off (default), the existing
 * widened types are preserved.
 *
 * FOLD_ENABLED is read at module-load, so we reset modules between the
 * two settings via `vi.resetModules()` and dynamic imports.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

function stubFoldOn() {
  vi.stubEnv('DVALA_FOLD', '1')
  vi.resetModules()
}

function stubFoldOff() {
  vi.stubEnv('DVALA_FOLD', '0')
  vi.resetModules()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// Helper: typecheck a source snippet, return the inferred type of the LAST
// top-level expression node as a display string.
async function inferLastTypeString(source: string): Promise<string> {
  const { createDvala } = await import('../createDvala')
  const { expandType, typeVarObjectIdForDisplay: _unused } = (await import('./infer')) as unknown as {
    expandType: (t: unknown) => unknown
    typeVarObjectIdForDisplay?: unknown
  }
  const { typeToString } = await import('./types')
  const { simplify } = await import('./simplify')
  const dvala = createDvala()
  const result = dvala.typecheck(source)
  const lastIndex = Math.max(...result.typeMap.keys())
  const lastType = result.typeMap.get(lastIndex)
  if (!lastType) throw new Error('no type found for last node')
  return typeToString(simplify(expandType(lastType) as Parameters<typeof simplify>[0]))
}

describe('inferExpr fold integration — DVALA_FOLD=1', () => {
  it('widens to Number when fold is off', async () => {
    stubFoldOff()
    const t = await inferLastTypeString('2 + 3')
    expect(t).toBe('Number')
  })

  it('produces literal(5) for `2 + 3` when fold is on', async () => {
    stubFoldOn()
    const t = await inferLastTypeString('2 + 3')
    expect(t).toBe('5')
  })

  it('produces literal(true) for `isNumber(42)` when fold is on', async () => {
    stubFoldOn()
    const t = await inferLastTypeString('isNumber(42)')
    expect(t).toBe('true')
  })

  it('produces literal("HELLO") for `upperCase("hello")` when fold is on', async () => {
    stubFoldOn()
    const t = await inferLastTypeString('upperCase("hello")')
    expect(t).toBe('"HELLO"')
  })

  it('does NOT fold when an arg is non-literal (even with fold on)', async () => {
    stubFoldOn()
    // `inc(x)` where x has no value — fold bails, normal inference applies.
    const t = await inferLastTypeString('(x: Number) -> inc(x)')
    // The lambda's return type is Number (fold can't run — x is not a literal).
    expect(t).toContain('Number')
  })

  it('emits a @dvala.error warning when fold surfaces an effect', async () => {
    stubFoldOn()
    const { createDvala } = await import('../createDvala')
    const dvala = createDvala()
    const result = dvala.typecheck('1 / 0')
    const warnings = result.diagnostics.filter(d => d.severity === 'warning')
    expect(warnings.some(w => /@dvala\.error/.test(w.message))).toBe(true)
  })

  // --- Composite reconstruction integration (decision #10) ---
  it('folds count([1, 2, 3]) → 3 when fold is on', async () => {
    stubFoldOn()
    const t = await inferLastTypeString('count([1, 2, 3])')
    expect(t).toBe('3')
  })

  it('folds keys({ a: 1, b: 2 }) → ["a", "b"] when fold is on', async () => {
    stubFoldOn()
    const t = await inferLastTypeString('keys({ a: 1, b: 2 })')
    // Tuple of string-literal keys.
    expect(t).toBe('["a", "b"]')
  })

  it('folds reverse on a literal array when fold is on', async () => {
    stubFoldOn()
    const t = await inferLastTypeString('reverse([1, 2, 3])')
    // Tuple of number literals.
    expect(t).toBe('[3, 2, 1]')
  })

  it('widens composite-producing builtins to Integer when fold is off', async () => {
    // `count` always returns an integer count — safe to declare as Integer.
    stubFoldOff()
    const t = await inferLastTypeString('count([1, 2, 3])')
    expect(t).toBe('Integer')
  })

  // --- C8: if-literal narrowing ---
  describe('if-literal narrowing (C8)', () => {
    it('narrows to then-branch when condition folds to true', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('if 1 == 1 then "yes" else "no" end')
      expect(t).toBe('"yes"')
    })

    it('narrows to else-branch when condition folds to false', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('if 1 == 2 then "yes" else "no" end')
      expect(t).toBe('"no"')
    })

    it('narrows nested records — the motivating example from the design doc', async () => {
      stubFoldOn()
      // From design doc §Goal: the else branch is the only reachable one.
      const t = await inferLastTypeString(
        'if 1 == 2 then { type: "click", x: 3, y: 4 } else { type: "keydown", key: "Enter" } end',
      )
      expect(t).toBe('{type: "keydown", key: "Enter"}')
    })

    it('falls back to union when condition is non-literal', async () => {
      stubFoldOn()
      // The condition involves a parameter, so fold can't reduce it.
      const t = await inferLastTypeString('(b) -> if b then 1 else 2 end')
      expect(t).toContain('1 | 2')
    })

    it('widens to union when fold is off', async () => {
      stubFoldOff()
      const t = await inferLastTypeString('if 1 == 2 then "yes" else "no" end')
      expect(t).toBe('"yes" | "no"')
    })
  })

  // --- C7: && / || narrowing ---
  describe('&& / || narrowing (C7)', () => {
    it('short-circuits && on literal(false)', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('false && true')
      expect(t).toBe('false')
    })

    it('passes through && when all operands are literal(true)', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('true && true')
      expect(t).toBe('true')
    })

    it('short-circuits || on literal(true)', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('true || false')
      expect(t).toBe('true')
    })

    it('passes through || when all operands are literal(false)', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('false || false')
      expect(t).toBe('false')
    })

    it('narrows multi-operand && with first literal(false)', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('true && false && true')
      expect(t).toBe('false')
    })

    it('respects fold-off default — union of booleans', async () => {
      stubFoldOff()
      const t = await inferLastTypeString('true && false')
      expect(t).toBe('true | false')
    })

    it('bails to union on non-literal operands even with fold on', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('(b) -> b && true')
      // Function type — the body returns a union.
      expect(t).toContain('true')
    })

    // The non-Boolean short-circuit cases that previously extended C7
    // to `0` / `""` / `null` operands were removed under the Boolean-
    // surface cleanup — `&&` / `||` reject non-Boolean operands at the
    // type level, so those literal forms never reach the fold.
  })

  // --- C9: match guard-literal pruning ---
  describe('match guard-literal pruning (C9)', () => {
    it('skips a case whose guard folds to literal(false) and emits a redundant warning', async () => {
      stubFoldOn()
      const { createDvala } = await import('../createDvala')
      const dvala = createDvala()
      const result = dvala.typecheck(`
        match 42
          case n when 1 == 2 then "dead"
          case _ then "live"
        end
      `)
      const warnings = result.diagnostics.filter(d => d.severity === 'warning')
      expect(warnings.some(w => /Redundant match case — guard is always false/.test(w.message))).toBe(true)
      // Not a type error — the dead arm is pruned, not fatal.
      const errors = result.diagnostics.filter(d => d.severity === 'error')
      expect(errors).toHaveLength(0)
    })

    it('does not prune a case whose guard folds to literal(true)', async () => {
      stubFoldOn()
      const { createDvala } = await import('../createDvala')
      const dvala = createDvala()
      const result = dvala.typecheck(`
        match 42
          case n when 1 == 1 then "taken"
          case _ then "fallback"
        end
      `)
      // No diagnostics: the true-guard arm is kept, the wildcard is still
      // reachable under non-matching scrutinees, so no warnings either.
      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
    })

    it('a false-guard case leaves the remainder unhandled — exhaustiveness can fail', async () => {
      stubFoldOn()
      const { createDvala } = await import('../createDvala')
      const dvala = createDvala()
      // The `case :a` arm is pruned (false guard), leaving :a | :b
      // unhandled with no wildcard fallback. Non-exhaustive match.
      const result = dvala.typecheck(`
        let x: :a | :b = :a;
        match x
          case :a when 1 == 2 then 1
          case :b then 2
        end
      `)
      const errors = result.diagnostics.filter(d => d.severity === 'error')
      expect(errors.some(d => /Non-exhaustive match/.test(d.message))).toBe(true)
    })

    it('does not prune when fold is off — dead guards only warned via existing redundancy machinery', async () => {
      stubFoldOff()
      const { createDvala } = await import('../createDvala')
      const dvala = createDvala()
      const result = dvala.typecheck(`
        match 42
          case n when 1 == 2 then "dead"
          case _ then "live"
        end
      `)
      // Without fold, the guard is not reduced to literal(false), so C9
      // doesn't fire — no redundant-guard warning.
      const warnings = result.diagnostics.filter(d => d.severity === 'warning')
      expect(warnings.some(w => /guard is always false/.test(w.message))).toBe(false)
    })
  })

  // --- C6: user-defined function folding ---
  describe('user-defined function folding (C6)', () => {
    it('folds a pure user function with primitive args', async () => {
      stubFoldOn()
      // `double` references no outer bindings, just the builtin `+`.
      const t = await inferLastTypeString('let double = (x) -> x + x; double(21)')
      expect(t).toBe('42')
    })

    it('folds a multi-arg user function', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('let hypot = (a, b) -> sqrt(a * a + b * b); hypot(3, 4)')
      expect(t).toBe('5')
    })

    it('folds a user function returning a composite', async () => {
      stubFoldOn()
      const t = await inferLastTypeString('let pair = (x, y) -> [x, y]; pair(1, "two")')
      expect(t).toBe('[1, "two"]')
    })

    it('folds a user function that captures a literal outer binding (C6a)', async () => {
      stubFoldOn()
      // `addBase` captures `base`. C6a reconstructs the capture from the
      // outer TypeEnv and seeds the fold sandbox, so the call resolves
      // through to a literal.
      const t = await inferLastTypeString(`
        let base = 10;
        let addBase = (x) -> x + base;
        addBase(5)
      `)
      expect(t).toBe('15')
    })

    it('folds through multiple captures (C6a)', async () => {
      stubFoldOn()
      const t = await inferLastTypeString(`
        let scale = 3;
        let offset = 1;
        let transform = (x) -> x * scale + offset;
        transform(4)
      `)
      expect(t).toBe('13')
    })

    it('captures a composite-typed binding (C6a + C2/C3)', async () => {
      stubFoldOn()
      const t = await inferLastTypeString(`
        let origin = [0, 0];
        let translate = (dx, dy) -> [nth(origin, 0) + dx, nth(origin, 1) + dy];
        translate(3, 4)
      `)
      expect(t).toBe('[3, 4]')
    })

    it('silently bails when a capture is not reconstructible (no warning)', async () => {
      stubFoldOn()
      const { createDvala } = await import('../createDvala')
      const dvala = createDvala()
      // `randomBase` has a non-literal type (Number), so fold can't
      // reconstruct it. The fold bails silently — no spurious warning.
      const result = dvala.typecheck(`
        let randomBase = (n) -> n + 1;
        let current = randomBase(41);
        let addBase = (x) -> x + current;
        (v: Number) -> addBase(v)
      `)
      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
      expect(result.diagnostics.filter(d => d.severity === 'warning')).toHaveLength(0)
    })

    it('still surfaces @dvala.error when a user function provably fails', async () => {
      stubFoldOn()
      const { createDvala } = await import('../createDvala')
      const dvala = createDvala()
      const result = dvala.typecheck(`
        let reciprocal = (x) -> 1 / x;
        reciprocal(0)
      `)
      const warnings = result.diagnostics.filter(d => d.severity === 'warning')
      expect(warnings.some(w => /@dvala\.error/.test(w.message))).toBe(true)
    })

    it('widens to declared return type when fold is off', async () => {
      stubFoldOff()
      const t = await inferLastTypeString('let double = (x) -> x + x; double(21)')
      expect(t).toBe('Number')
    })
  })

  // --- Per-call `fold` option (takes precedence over env default) ---
  describe('TypecheckOptions.fold — per-call override', () => {
    it('fold:true folds even when env default is off', async () => {
      stubFoldOff()
      const { createDvala } = await import('../createDvala')
      const { expandType } = await import('./infer')
      const { simplify } = await import('./simplify')
      const { typeToString } = await import('./types')
      const dvala = createDvala()
      const result = dvala.typecheck('2 + 3', { fold: true })
      const lastIndex = Math.max(...result.typeMap.keys())
      const t = typeToString(simplify(expandType(result.typeMap.get(lastIndex)!)))
      expect(t).toBe('5')
    })

    it('fold:false suppresses folding even when env default is on', async () => {
      stubFoldOn()
      const { createDvala } = await import('../createDvala')
      const { expandType } = await import('./infer')
      const { simplify } = await import('./simplify')
      const { typeToString } = await import('./types')
      const dvala = createDvala()
      const result = dvala.typecheck('2 + 3', { fold: false })
      const lastIndex = Math.max(...result.typeMap.keys())
      const t = typeToString(simplify(expandType(result.typeMap.get(lastIndex)!)))
      expect(t).toBe('Number')
    })

    it('undefined option falls back to env default', async () => {
      stubFoldOn()
      const { createDvala } = await import('../createDvala')
      const { expandType } = await import('./infer')
      const { simplify } = await import('./simplify')
      const { typeToString } = await import('./types')
      const dvala = createDvala()
      // No `fold` key — env default (on) applies.
      const result = dvala.typecheck('2 + 3')
      const lastIndex = Math.max(...result.typeMap.keys())
      const t = typeToString(simplify(expandType(result.typeMap.get(lastIndex)!)))
      expect(t).toBe('5')
    })
  })
})
