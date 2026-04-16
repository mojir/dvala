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
})
