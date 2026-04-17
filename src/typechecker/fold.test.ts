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
  const { expandType, typeVarObjectIdForDisplay: _unused } = await import('./infer') as unknown as { expandType: (t: unknown) => unknown; typeVarObjectIdForDisplay?: unknown }
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

  it('widens composite-producing builtins to Number when fold is off', async () => {
    stubFoldOff()
    const t = await inferLastTypeString('count([1, 2, 3])')
    expect(t).toBe('Number')
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
  })
})
