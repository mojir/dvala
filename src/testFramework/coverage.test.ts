import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runTestFile } from './index'
import { computeCoverageSummary } from './coverage'
import type { FileCoverageSummary } from './coverage'

const exampleProjectDir = path.resolve(__dirname, '../../examples/project')

/**
 * Run a test file from the example project with coverage enabled
 * and return the per-file coverage summaries.
 */
async function getCoverage(testFileName: string): Promise<FileCoverageSummary[]> {
  const testPath = path.join(exampleProjectDir, 'tests', testFileName)
  const result = await runTestFile({ testPath, coverage: true })
  expect(result.bailout).toBeUndefined()
  return computeCoverageSummary([result])
}

function findFile(summaries: FileCoverageSummary[], fileName: string): FileCoverageSummary {
  const found = summaries.find(s => s.path.endsWith(fileName))
  if (!found) {
    const available = summaries.map(s => s.path).join(', ')
    throw new Error(`No coverage for ${fileName}. Available: ${available}`)
  }
  return found
}

describe('dvala code coverage', () => {
  it('geometry.dvala has 100% line and expression coverage', async () => {
    const summaries = await getCoverage('geometry.test.dvala')
    const geo = findFile(summaries, 'geometry.dvala')

    expect(geo.linesHit).toBe(geo.linesFound)
    expect(geo.exprsHit).toBe(geo.exprsFound)
    expect(geo.uncoveredLines).toEqual([])
  })

  it('constants.dvala has 100% line coverage', async () => {
    const summaries = await getCoverage('constants.test.dvala')
    const constants = findFile(summaries, 'constants.dvala')

    expect(constants.linesHit).toBe(constants.linesFound)
    expect(constants.uncoveredLines).toEqual([])
  })

  it('stats.dvala has 100% line coverage', async () => {
    const summaries = await getCoverage('stats.test.dvala')
    const stats = findFile(summaries, 'stats.dvala')

    expect(stats.linesHit).toBe(stats.linesFound)
    expect(stats.uncoveredLines).toEqual([])
  })

  it('math.dvala has partial coverage (isEven is untested)', async () => {
    const summaries = await getCoverage('math.test.dvala')
    const math = findFile(summaries, 'math.dvala')

    // math.dvala exports isEven but geometry.test.dvala doesn't test it
    expect(math.linesHit).toBeGreaterThan(0)
    expect(math.linesHit).toBeLessThan(math.linesFound)
    expect(math.uncoveredLines.length).toBeGreaterThan(0)
  })

  it('coverage summaries include source file paths', async () => {
    const summaries = await getCoverage('geometry.test.dvala')

    // Should have at least the lib file and possibly the test file
    expect(summaries.length).toBeGreaterThanOrEqual(1)
    // All paths should be absolute
    for (const s of summaries) {
      expect(s.path.startsWith('/')).toBe(true)
    }
  })
})
