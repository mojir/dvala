import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('initCoreDvalaSources', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('throws when evaluate returns a Promise', async () => {
    vi.doMock('../../evaluator/trampoline', () => ({
      evaluate: () => Promise.resolve(null),
    }))
    const { initCoreDvalaSources } = await import('./initCoreDvala')
    expect(() => initCoreDvalaSources()).toThrow('Core dvala sources must be synchronous')
    vi.doUnmock('../../evaluator/trampoline')
  })

  it('skips non-object results without throwing', async () => {
    vi.doMock('../../evaluator/trampoline', () => ({
      evaluate: () => 42,
    }))
    const { initCoreDvalaSources } = await import('./initCoreDvala')
    expect(() => initCoreDvalaSources()).not.toThrow()
    vi.doUnmock('../../evaluator/trampoline')
  })

  it('does not reinitialize when called a second time', async () => {
    const { initCoreDvalaSources } = await import('./initCoreDvala')
    initCoreDvalaSources()
    // second call should be a no-op (early return)
    expect(() => initCoreDvalaSources()).not.toThrow()
  })
})
