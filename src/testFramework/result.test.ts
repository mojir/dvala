import { describe, expect, it } from 'vitest'
import { isSuccess, isSuiteSuccess } from './result'
import type { TestRunResult, TestSuiteResult } from './result'

function run(overrides: Partial<TestRunResult>): TestRunResult {
  return { filePath: 'f.dvala', results: [], ...overrides }
}

describe('isSuccess', () => {
  it('is true for an empty result with no bailout', () => {
    expect(isSuccess(run({ results: [] }))).toBe(true)
  })

  it('is true when every test passed or was skipped', () => {
    expect(
      isSuccess(
        run({
          results: [
            { name: 'a', status: 'passed' },
            { name: 'b', status: 'skipped' },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('is false when any test failed', () => {
    expect(
      isSuccess(
        run({
          results: [
            { name: 'a', status: 'passed' },
            { name: 'b', status: 'failed', error: new Error('x') },
          ],
        }),
      ),
    ).toBe(false)
  })

  it('is false when a bailout is present, even with no failing tests', () => {
    expect(
      isSuccess(
        run({
          results: [{ name: 'a', status: 'passed' }],
          bailout: new Error('parse error'),
        }),
      ),
    ).toBe(false)
  })
})

describe('isSuiteSuccess', () => {
  it('is true for an empty suite', () => {
    const suite: TestSuiteResult = { files: [], durationMs: 0 }
    expect(isSuiteSuccess(suite)).toBe(true)
  })

  it('is true when every file succeeds', () => {
    const suite: TestSuiteResult = {
      files: [run({ results: [{ name: 'a', status: 'passed' }] }), run({ results: [{ name: 'b', status: 'passed' }] })],
      durationMs: 0,
    }
    expect(isSuiteSuccess(suite)).toBe(true)
  })

  it('is false when any file has a failure or bailout', () => {
    const suite: TestSuiteResult = {
      files: [run({ results: [{ name: 'a', status: 'passed' }] }), run({ results: [], bailout: new Error('boom') })],
      durationMs: 0,
    }
    expect(isSuiteSuccess(suite)).toBe(false)
  })
})
