import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { dvalaSpanKey, minifyTokenStream, parseToAst, tokenize } from '@mojir/dvala-core-tooling'
import { dumpWorkerCoverage, writeDvalaCoverageReport } from './dvalaCoverageReport'

const PREDICATES = 'packages/dvala-engine/src/builtin/core/predicates.dvala'

/** Pick a real non-leaf node span from a builtin file so a dumped hit actually maps. */
function firstNonLeafSpan(relPath: string): string {
  const tokens = tokenize(fs.readFileSync(relPath, 'utf-8'), true, relPath)
  let n = 0
  const ast = parseToAst(minifyTokenStream(tokens, { removeWhiteSpace: true }), () => n++)
  for (const [, pos] of ast.sourceMap!.positions) {
    if (!pos.structuralLeaf) return dvalaSpanKey(relPath, pos.start, pos.end)
  }
  throw new Error('no non-leaf node found')
}

describe('dvala coverage report writer (span-keyed)', () => {
  let dir: string
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('renders a report from merged worker dumps, against the disk denominator', () => {
    dir = path.join(os.tmpdir(), `dvala-cov-${process.pid}-${process.hrtime.bigint()}`)
    // One worker recorded a hit on a real predicates.dvala node span.
    dumpWorkerCoverage(new Map([[firstNonLeafSpan(PREDICATES), 3]]), dir)

    const summary = writeDvalaCoverageReport(dir)
    expect(summary).toContain('.dvala builtin coverage (union baseline)')

    const summaryTxt = fs.readFileSync(path.join(dir, 'summary.txt'), 'utf-8')
    // predicates.dvala appears (denominator from disk) with at least the one hit.
    const predLine = summaryTxt.split('\n').find(l => l.startsWith(PREDICATES))
    expect(predLine).toBeDefined()
    const m = predLine!.match(/exprs (\d+)\/(\d+)/)!
    expect(Number(m[2])).toBeGreaterThan(0) // found from disk
    expect(Number(m[1])).toBeGreaterThanOrEqual(1) // the dumped hit mapped

    // Modules are in scope too (denominator globs core + modules).
    expect(summaryTxt).toContain('modules/')
    expect(fs.existsSync(path.join(dir, 'lcov.info'))).toBe(true)
    expect(fs.existsSync(path.join(dir, '.workers'))).toBe(false) // scratch cleaned up
  })

  it('returns undefined when there are no dumps', () => {
    dir = path.join(os.tmpdir(), `dvala-cov-${process.pid}-${process.hrtime.bigint()}b`)
    expect(writeDvalaCoverageReport(dir)).toBeUndefined()
  })
})
