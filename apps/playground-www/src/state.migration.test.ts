// @vitest-environment happy-dom
// Boot-time migration coverage for the localStorage rewrites added in Phase
// 1.5 step 23h (and the silent-wipe block from 23f). The migrations run
// during `state.ts` module init, so we exercise them by setting localStorage
// values + `vi.resetModules()` before each `await import('./state')`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCRATCH_FILE_ID = '__scratch__'
const LEGACY_SCRATCH_KEY = '<scratch>'

/**
 * In-memory localStorage used by these tests. We stash the values directly
 * into `window.localStorage` (jsdom default) but reset between cases so each
 * import sees a clean slate.
 */
function setItem(key: string, value: string): void {
  localStorage.setItem(key, value)
}

function getItem(key: string): string | null {
  return localStorage.getItem(key)
}

beforeEach(() => {
  localStorage.clear()
  // `state.ts` runs its top-level migration on first import. Reset the module
  // graph so each case re-runs that init against fresh localStorage.
  vi.resetModules()
})

afterEach(() => {
  localStorage.clear()
})

describe('Phase 1.5 step 23f silent wipe', () => {
  it('removes retired bindings/effect-handler localStorage keys on init', async () => {
    setItem('playground-current-context-entry-kind', '"binding"')
    setItem('playground-current-context-binding-name', '"foo"')
    setItem('playground-context-scroll-top', '0')
    setItem('playground-context-selection-start', '0')
    setItem('playground-context-selection-end', '0')
    setItem('playground-new-context-name', '"x"')
    setItem('playground-new-context-value', '"42"')

    await import('./state')

    expect(getItem('playground-current-context-entry-kind')).toBeNull()
    expect(getItem('playground-current-context-binding-name')).toBeNull()
    expect(getItem('playground-context-scroll-top')).toBeNull()
    expect(getItem('playground-context-selection-start')).toBeNull()
    expect(getItem('playground-context-selection-end')).toBeNull()
    expect(getItem('playground-new-context-name')).toBeNull()
    expect(getItem('playground-new-context-value')).toBeNull()
  })

  it('strips bindings + effectHandlers from a stored context blob, leaving siblings intact', async () => {
    // The context slot is double-JSON-encoded: outer JSON.stringify wraps
    // the inner JSON.stringify of the actual context object.
    const contextObj = {
      bindings: { x: 42 },
      effectHandlers: [{ pattern: 'host.add', handler: '({ resume }) => resume(0)' }],
      __ui: { someUiState: true },
    }
    setItem('playground-context', JSON.stringify(JSON.stringify(contextObj)))

    await import('./state')

    const raw = getItem('playground-context')!
    const inner = JSON.parse(JSON.parse(raw) as string) as Record<string, unknown>
    expect(inner.bindings).toBeUndefined()
    expect(inner.effectHandlers).toBeUndefined()
    expect(inner.__ui).toEqual({ someUiState: true })
  })

  it('leaves a single-encoded context blob alone (the migration only rewrites double-encoded forms)', async () => {
    // Single-encoded value (not double-stringified) won't satisfy the inner
    // `typeof parsed === 'string'` guard, so the migration silently no-ops.
    // The wider state.ts load loop later parses the same value and stores
    // it as-is — the bindings/effectHandlers stripping doesn't apply, but
    // there's also no UI surface that reads them post-23f.
    const single = JSON.stringify({ bindings: { x: 1 } })
    setItem('playground-context', single)

    await import('./state')

    expect(getItem('playground-context')).toBe(single)
  })
})

describe('Phase 1.5 step 23h tab-state migration', () => {
  it("rewrites a legacy {kind:'scratch'} entry in open-tabs to {kind:'file', id:SCRATCH_FILE_ID}", async () => {
    setItem('playground-open-tabs', JSON.stringify([{ kind: 'scratch' }, { kind: 'file', id: 'a' }]))

    await import('./state')

    const migrated = JSON.parse(getItem('playground-open-tabs')!) as { kind: string; id?: string }[]
    expect(migrated).toEqual([
      { kind: 'file', id: SCRATCH_FILE_ID },
      { kind: 'file', id: 'a' },
    ])
  })

  it('leaves a clean open-tabs list untouched', async () => {
    const clean = [
      { kind: 'file', id: SCRATCH_FILE_ID },
      { kind: 'file', id: 'a' },
    ]
    setItem('playground-open-tabs', JSON.stringify(clean))

    await import('./state')

    expect(JSON.parse(getItem('playground-open-tabs')!)).toEqual(clean)
  })

  it('leaves a non-array open-tabs value alone (the migration only rewrites arrays)', async () => {
    // Object-shaped value bypasses the `Array.isArray` guard inside the
    // migration; the load loop's later `JSON.parse` happily restores it as
    // an object, which is malformed for `PersistedTab[]` but not the
    // migration's problem.
    const objectShaped = JSON.stringify({ unexpected: 'shape' })
    setItem('playground-open-tabs', objectShaped)

    await import('./state')

    expect(getItem('playground-open-tabs')).toBe(objectShaped)
  })

  it("rewrites '<scratch>' active-tab-key to SCRATCH_FILE_ID", async () => {
    setItem('playground-active-tab-key', JSON.stringify(LEGACY_SCRATCH_KEY))

    await import('./state')

    expect(getItem('playground-active-tab-key')).toBe(JSON.stringify(SCRATCH_FILE_ID))
  })

  it('leaves a non-legacy active-tab-key alone', async () => {
    setItem('playground-active-tab-key', JSON.stringify('some-uuid'))

    await import('./state')

    expect(getItem('playground-active-tab-key')).toBe(JSON.stringify('some-uuid'))
  })

  it('rewrites the legacy null current-file-id to SCRATCH_FILE_ID', async () => {
    setItem('playground-current-file-id', 'null')

    await import('./state')

    expect(getItem('playground-current-file-id')).toBe(JSON.stringify(SCRATCH_FILE_ID))
  })

  it('leaves a non-null current-file-id alone', async () => {
    setItem('playground-current-file-id', JSON.stringify('some-uuid'))

    await import('./state')

    expect(getItem('playground-current-file-id')).toBe(JSON.stringify('some-uuid'))
  })

  it('handles all three migrations on a single boot', async () => {
    setItem('playground-open-tabs', JSON.stringify([{ kind: 'scratch' }, { kind: 'file', id: 'a' }]))
    setItem('playground-active-tab-key', JSON.stringify(LEGACY_SCRATCH_KEY))
    setItem('playground-current-file-id', 'null')

    await import('./state')

    expect(JSON.parse(getItem('playground-open-tabs')!)).toEqual([
      { kind: 'file', id: SCRATCH_FILE_ID },
      { kind: 'file', id: 'a' },
    ])
    expect(getItem('playground-active-tab-key')).toBe(JSON.stringify(SCRATCH_FILE_ID))
    expect(getItem('playground-current-file-id')).toBe(JSON.stringify(SCRATCH_FILE_ID))
  })
})
