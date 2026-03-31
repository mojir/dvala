import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runTestFile } from '../../src/testFramework'
import { isSuccess } from '../../src/testFramework/result'

const examplesDir = path.resolve(__dirname, '../../examples/project/tests')

describe('test runner with file imports', () => {
  it('math.test.dvala imports from ../lib/math.dvala', async () => {
    const result = await runTestFile({ testPath: path.join(examplesDir, 'math.test.dvala') })
    if (result.bailout) {
      expect.unreachable(`Bailout: ${result.bailout instanceof Error ? result.bailout.message : result.bailout}`)
    }
    expect(isSuccess(result)).toBe(true)
    expect(result.results.length).toBe(12)
  })

  it('stats.test.dvala imports from ../lib/stats.dvala', async () => {
    const result = await runTestFile({ testPath: path.join(examplesDir, 'stats.test.dvala') })
    expect(isSuccess(result)).toBe(true)
    expect(result.results.length).toBe(10)
  })

  it('constants.test.dvala imports from ../lib/constants.dvala', async () => {
    const result = await runTestFile({ testPath: path.join(examplesDir, 'constants.test.dvala') })
    expect(isSuccess(result)).toBe(true)
    expect(result.results.length).toBe(3)
  })
})
