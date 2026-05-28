import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParseSource } from '../../evaluator/interface'

const stubParseSource: ParseSource = () => ({ body: [], sourceMap: undefined })

describe('initCoreDvalaSources', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('throws when evaluate returns a Promise', async () => {
    vi.doMock('../../evaluator/trampoline-evaluator', () => ({
      evaluate: () => Promise.resolve(null),
    }))
    const { initCoreDvalaSources } = await import('./initCoreDvala')
    expect(() => initCoreDvalaSources(stubParseSource)).toThrow('Core dvala sources must be synchronous')
    vi.doUnmock('../../evaluator/trampoline-evaluator')
  })

  it('skips non-object results without throwing', async () => {
    vi.doMock('../../evaluator/trampoline-evaluator', () => ({
      evaluate: () => 42,
    }))
    const { initCoreDvalaSources } = await import('./initCoreDvala')
    expect(() => initCoreDvalaSources(stubParseSource)).not.toThrow()
    vi.doUnmock('../../evaluator/trampoline-evaluator')
  })

  it('does not reinitialize when called a second time', async () => {
    const { initCoreDvalaSources } = await import('./initCoreDvala')
    initCoreDvalaSources(stubParseSource)
    // second call should be a no-op (early return)
    expect(() => initCoreDvalaSources(stubParseSource)).not.toThrow()
  })
})
