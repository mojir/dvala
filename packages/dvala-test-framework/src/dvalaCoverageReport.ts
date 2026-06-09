import fs from 'node:fs'
import path from 'node:path'
import type { SourceMap, SourceMapPosition } from '@mojir/dvala-types'
import { computeCoverageSummary, generateLcov } from './coverage'
import { generateCoverageHtmlFiles } from './coverageHtml'
import type { TestRunResult } from './result'

/**
 * Report generation for the suite-wide `.dvala` builtin coverage UNION baseline
 * (`DVALA_COVERAGE=1`). The model: each vitest worker dumps its accumulated union
 * coverage to a JSON file at exit; after the run a globalSetup teardown merges all
 * dumps into a separate report under `coverage-dvala/` (distinct from the c8 TS
 * report under `coverage/`). Report-only — not a gate.
 */

/** Output directory for the rendered `.dvala` report (sibling of c8's `coverage/`). */
export const DVALA_COVERAGE_DIR = path.resolve(process.cwd(), 'coverage-dvala')
/** Scratch directory (under the report dir) for per-worker dumps; removed after the report. */
const workersDir = (reportDir: string): string => path.join(reportDir, '.workers')

/** Glob scope for the report — engine builtins only (see design decision 6). */
const INCLUDE = ['packages/dvala-engine/src/builtin/**/*.dvala']

interface WorkerDump {
  counts: [number, number][]
  sources: SourceMap['sources']
  positions: [number, SourceMapPosition][]
}

/**
 * Flush one worker's accumulated union coverage to its per-pid dump file.
 *
 * Counts are filtered to nodes present in the builtin source map, so user-program
 * node IDs (which collide across instances) never enter the union. The dump file is
 * keyed by pid and OVERWRITTEN on each call: the global map only grows, so the last
 * flush per worker is complete. This is called from a per-file `afterAll` (reliable,
 * unlike `process.on('exit')` whose timing vs. globalSetup teardown is unspecified
 * for pooled workers). Sync; no-op when there's nothing to report.
 */
export function dumpWorkerCoverage(
  coverageMap: Map<number, number>,
  sourceMap: SourceMap | undefined,
  reportDir: string = DVALA_COVERAGE_DIR,
): void {
  if (!sourceMap || coverageMap.size === 0) return

  const counts: [number, number][] = []
  for (const [id, count] of coverageMap) {
    if (sourceMap.positions.has(id)) counts.push([id, count])
  }
  if (counts.length === 0) return

  const dir = workersDir(reportDir)
  fs.mkdirSync(dir, { recursive: true })
  const dump: WorkerDump = {
    counts,
    sources: sourceMap.sources,
    positions: [...sourceMap.positions],
  }
  fs.writeFileSync(path.join(dir, `${process.pid}.json`), JSON.stringify(dump))
}

/**
 * Merge all worker dumps into a single report (LCOV + HTML + text summary) under
 * `coverage-dvala/`, then remove the scratch dumps. Returns a one-line summary, or
 * `undefined` when no dumps were produced (nothing exercised builtins). Idempotent
 * enough to run once from a teardown hook.
 */
export function writeDvalaCoverageReport(reportDir: string = DVALA_COVERAGE_DIR): string | undefined {
  const dumpsDir = workersDir(reportDir)
  if (!fs.existsSync(dumpsDir)) return undefined
  const files = fs.readdirSync(dumpsDir).filter(f => f.endsWith('.json'))
  if (files.length === 0) return undefined

  const coverageMap = new Map<number, number>()
  let sourceMap: SourceMap | undefined
  for (const file of files) {
    const dump = JSON.parse(fs.readFileSync(path.join(dumpsDir, file), 'utf-8')) as WorkerDump
    for (const [id, count] of dump.counts) {
      coverageMap.set(id, (coverageMap.get(id) ?? 0) + count)
    }
    // The builtin source map is identical across workers — take the first.
    sourceMap ??= { sources: dump.sources, positions: new Map(dump.positions) }
  }
  if (!sourceMap) return undefined

  const result: TestRunResult = { filePath: '<dvala-union>', results: [], coverageMap, sourceMap }
  const summaries = computeCoverageSummary([result], { include: INCLUDE, exclude: [] })

  fs.mkdirSync(reportDir, { recursive: true })
  fs.writeFileSync(path.join(reportDir, 'lcov.info'), generateLcov(coverageMap, sourceMap))

  // HTML tree (relative builtin paths resolve against cwd inside the generator).
  for (const [rel, content] of generateCoverageHtmlFiles(summaries, process.cwd())) {
    const out = path.join(reportDir, rel)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, content)
  }

  // Text summary. For each file, the headline counts followed by the precise
  // location (line:col) + snippet of every uncovered expression — the actionable
  // signal, since uncovered exprs often sit on otherwise-covered lines.
  const lines = summaries.map(s => {
    const head = `${s.path}  lines ${s.linesHit}/${s.linesFound}  exprs ${s.exprsHit}/${s.exprsFound}`
    if (s.exprsHit === s.exprsFound) return head
    const detail = s.uncoveredExprs.map(e => `    ${s.path}:${e.start[0] + 1}:${e.start[1] + 1}  ${e.text}`).join('\n')
    return `${head}\n${detail}`
  })
  const totals = summaries.reduce(
    (acc, s) => ({
      lh: acc.lh + s.linesHit,
      lf: acc.lf + s.linesFound,
      eh: acc.eh + s.exprsHit,
      ef: acc.ef + s.exprsFound,
    }),
    { lh: 0, lf: 0, eh: 0, ef: 0 },
  )
  const pct = (n: number, d: number) => (d === 0 ? '100' : ((100 * n) / d).toFixed(1))
  const header =
    `.dvala builtin coverage (union baseline) — ${summaries.length} file(s)\n` +
    `lines ${totals.lh}/${totals.lf} (${pct(totals.lh, totals.lf)}%)  ` +
    `exprs ${totals.eh}/${totals.ef} (${pct(totals.eh, totals.ef)}%)`
  const summaryText = `${header}\n\n${lines.join('\n')}\n`
  fs.writeFileSync(path.join(reportDir, 'summary.txt'), summaryText)

  // Clean up scratch dumps; leave the report in place.
  fs.rmSync(dumpsDir, { recursive: true, force: true })

  return header
}
