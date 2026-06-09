import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SourceMap } from '@mojir/dvala-types'
import { dumpWorkerCoverage, writeDvalaCoverageReport } from './dvalaCoverageReport'

// A builtin-scoped path so it matches the report's include glob
// (packages/dvala-engine/src/builtin/**/*.dvala).
const FILE = 'packages/dvala-engine/src/builtin/core/fixture.dvala'

// Two non-leaf nodes: node 1 on line 1 (hit), node 2 on line 2 (never hit).
function fixtureSourceMap(): SourceMap {
  return {
    sources: [{ path: FILE, content: 'aa\nbb\n' }],
    positions: new Map([
      [1, { source: 0, start: [0, 0], end: [0, 2] }],
      [2, { source: 0, start: [1, 0], end: [1, 2] }],
    ]),
  }
}

describe('dvala coverage report writer', () => {
  let dir: string

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('merges worker dumps into lcov + html + summary, pinpointing the uncovered expr', () => {
    dir = path.join(os.tmpdir(), `dvala-cov-report-${process.pid}-${process.hrtime.bigint()}`)
    const sourceMap = fixtureSourceMap()

    // One worker recorded a hit on node 1 only.
    dumpWorkerCoverage(new Map([[1, 4]]), sourceMap, dir)

    const summary = writeDvalaCoverageReport(dir)
    expect(summary).toContain('exprs 1/2') // 2 found, 1 hit

    const summaryTxt = fs.readFileSync(path.join(dir, 'summary.txt'), 'utf-8')
    expect(summaryTxt).toContain(`${FILE}  lines 1/2  exprs 1/2`)
    // The uncovered node (line 2, col 1) is pinpointed with its snippet.
    expect(summaryTxt).toContain(`${FILE}:2:1  bb`)

    const lcov = fs.readFileSync(path.join(dir, 'lcov.info'), 'utf-8')
    expect(lcov).toContain(`SF:${FILE}`)
    expect(lcov).toContain('DA:1,4') // line 1 hit 4× (generateLcov only emits lines that ran)

    // HTML file page is emitted and highlights the uncovered span.
    const htmlPath = path.join(dir, `${FILE}.html`)
    expect(fs.existsSync(htmlPath)).toBe(true)
    expect(fs.readFileSync(htmlPath, 'utf-8')).toContain('uncovered-expr')

    // Scratch dumps are cleaned up; the report remains.
    expect(fs.existsSync(path.join(dir, '.workers'))).toBe(false)
  })

  it('sums counts across multiple worker dumps', () => {
    dir = path.join(os.tmpdir(), `dvala-cov-report-${process.pid}-${process.hrtime.bigint()}b`)
    const sourceMap = fixtureSourceMap()

    // Two workers: each writes its own per-pid dump. Forge a second pid by writing
    // directly, then have the real dump cover node 2 — the union should be 2/2.
    dumpWorkerCoverage(new Map([[1, 1]]), sourceMap, dir)
    fs.writeFileSync(
      path.join(dir, '.workers', 'other.json'),
      JSON.stringify({ counts: [[2, 1]], sources: sourceMap.sources, positions: [...sourceMap.positions] }),
    )

    const summary = writeDvalaCoverageReport(dir)
    expect(summary).toContain('exprs 2/2') // node 1 from one dump, node 2 from the other
  })

  it('returns undefined when there are no dumps', () => {
    dir = path.join(os.tmpdir(), `dvala-cov-report-${process.pid}-${process.hrtime.bigint()}c`)
    expect(writeDvalaCoverageReport(dir)).toBeUndefined()
  })
})
