import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runTestFile } from './index'
import { computeCoverageSummary, generateLcov, generateSuiteLcov } from './coverage'
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

  it('math.dvala has partial coverage (isOdd is untested)', async () => {
    const summaries = await getCoverage('math.test.dvala')
    const math = findFile(summaries, 'math.dvala')

    // math.dvala defines isOdd but does not export or test it
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

describe('generateLcov', () => {
  it('produces a valid LCOV record from coverage data', async () => {
    const testPath = path.join(exampleProjectDir, 'tests', 'geometry.test.dvala')
    const result = await runTestFile({ testPath, coverage: true })
    expect(result.coverageMap).toBeDefined()
    expect(result.sourceMap).toBeDefined()
    const lcov = generateLcov(result.coverageMap!, result.sourceMap!)
    // LCOV records end with end_of_record and include SF: and DA: markers
    expect(lcov).toContain('SF:')
    expect(lcov).toContain('DA:')
    expect(lcov).toContain('LH:')
    expect(lcov).toContain('LF:')
    expect(lcov).toContain('end_of_record')
    // There should be a record for geometry.dvala
    expect(lcov).toMatch(/SF:.*geometry\.dvala/)
  })

  it('returns an empty string when there is nothing to report', () => {
    const empty = generateLcov(
      new Map(),
      { positions: new Map(), sources: [] },
    )
    expect(empty).toBe('')
  })

  it('skips nodes with no matching source position in the sourceMap', () => {
    // coverageMap references a nodeId that is not in sourceMap.positions
    const lcov = generateLcov(
      new Map([[999, 3]]),
      { positions: new Map(), sources: [{ path: '/tmp/a.dvala', content: '' }] },
    )
    expect(lcov).toBe('')
  })
})

describe('generateSuiteLcov', () => {
  it('aggregates LCOV records across multiple test files', async () => {
    const geomPath = path.join(exampleProjectDir, 'tests', 'geometry.test.dvala')
    const statsPath = path.join(exampleProjectDir, 'tests', 'stats.test.dvala')
    const results = await Promise.all([
      runTestFile({ testPath: geomPath, coverage: true }),
      runTestFile({ testPath: statsPath, coverage: true }),
    ])
    const lcov = generateSuiteLcov(results)
    expect(lcov).toMatch(/SF:.*geometry\.dvala/)
    expect(lcov).toMatch(/SF:.*stats\.dvala/)
  })

  it('filters out results that have no coverage data', async () => {
    // A result without coverageMap is silently skipped
    const result = await runTestFile({ testPath: path.join(exampleProjectDir, 'tests', 'geometry.test.dvala') })
    expect(result.coverageMap).toBeUndefined()
    expect(generateSuiteLcov([result])).toBe('')
  })
})

describe('computeCoverageSummary with filter', () => {
  it('reports never-evaluated files at 0% when provided via allFiles', async () => {
    const testPath = path.join(exampleProjectDir, 'tests', 'geometry.test.dvala')
    const result = await runTestFile({ testPath, coverage: true })

    // logging.dvala is never imported or tested — it should show up at 0% when in allFiles
    const loggingPath = path.join(exampleProjectDir, 'lib', 'logging.dvala')
    const summaries = computeCoverageSummary([result], {
      include: [],
      exclude: [],
      allFiles: [loggingPath],
    })

    const logging = summaries.find(s => s.path === loggingPath)
    expect(logging).toBeDefined()
    expect(logging!.linesHit).toBe(0)
    expect(logging!.linesFound).toBeGreaterThan(0)
    expect(logging!.exprsHit).toBe(0)
    expect(logging!.exprsFound).toBeGreaterThan(0)
    // Every found line is uncovered
    expect(logging!.uncoveredLines.length).toBe(logging!.linesFound)
    // Source content is attached
    expect(logging!.source).toBeDefined()
    expect(logging!.source!.length).toBeGreaterThan(0)
  })

  it('does not add never-evaluated files that cannot be parsed', async () => {
    const testPath = path.join(exampleProjectDir, 'tests', 'geometry.test.dvala')
    const result = await runTestFile({ testPath, coverage: true })

    // Point at a file that does not exist — parseFileStats returns null
    const bogusPath = path.join(exampleProjectDir, 'lib', '__does_not_exist__.dvala')
    const summaries = computeCoverageSummary([result], {
      include: [],
      exclude: [],
      allFiles: [bogusPath],
    })
    expect(summaries.find(s => s.path === bogusPath)).toBeUndefined()
  })

  it('skips allFiles entries that are already evaluated (no double-counting)', async () => {
    const testPath = path.join(exampleProjectDir, 'tests', 'geometry.test.dvala')
    const result = await runTestFile({ testPath, coverage: true })

    const geoPath = path.join(exampleProjectDir, 'lib', 'geometry.dvala')
    const summaries = computeCoverageSummary([result], {
      include: [],
      exclude: [],
      allFiles: [geoPath],
    })
    // geometry.dvala is covered (not reset to zero), still appears once
    const geos = summaries.filter(s => s.path === geoPath)
    expect(geos).toHaveLength(1)
    expect(geos[0]!.linesHit).toBeGreaterThan(0)
  })

  it('applies include/exclude glob patterns against rootDir-relative paths', async () => {
    const testPath = path.join(exampleProjectDir, 'tests', 'geometry.test.dvala')
    const result = await runTestFile({ testPath, coverage: true })

    // Include only lib/ files (relative to the example project root)
    const libOnly = computeCoverageSummary([result], {
      include: ['lib/**'],
      exclude: [],
      rootDir: exampleProjectDir,
    })
    expect(libOnly.length).toBeGreaterThan(0)
    for (const s of libOnly) {
      expect(s.path).toMatch(/\/lib\//)
    }

    // Exclude the lib/ directory — should filter all those out
    const noLib = computeCoverageSummary([result], {
      include: [],
      exclude: ['lib/**'],
      rootDir: exampleProjectDir,
    })
    for (const s of noLib) {
      expect(s.path).not.toMatch(/\/lib\//)
    }
  })
})
