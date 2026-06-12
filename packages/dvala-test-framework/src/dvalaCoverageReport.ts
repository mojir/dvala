import fs from 'node:fs'
import path from 'node:path'
import type { SourceMap } from '@mojir/dvala-types'
import { dvalaSpanKey, minifyTokenStream, parseToAst, tokenize } from '@mojir/dvala-core-tooling'
import { computeCoverageSummary, generateLcovFromSummaries } from './coverage'
import { generateCoverageHtmlFiles } from './coverageHtml'
import type { TestRunResult } from './result'

/**
 * Report generation for the suite-wide `.dvala` builtin coverage UNION baseline
 * (`DVALA_COVERAGE=1`), covering BOTH core and module `.dvala` files.
 *
 * The model: each vitest worker records the *source spans* of evaluated builtin
 * `.dvala` nodes (span-keyed — robust to the node-ID variance of lazily-imported
 * modules) and dumps them at worker exit. A globalSetup teardown merges all dumps,
 * builds the "found" denominator by parsing every builtin `.dvala` file fresh from
 * disk, maps the hit spans back onto that parse, and renders the report under
 * `coverage-dvala/`. Report-only — not a gate.
 */

/** Output directory for the rendered `.dvala` report (sibling of c8's `coverage/`). */
export const DVALA_COVERAGE_DIR = path.resolve(process.cwd(), 'coverage-dvala')
const workersDir = (reportDir: string): string => path.join(reportDir, '.workers')

/** Glob scope for the report — engine builtins (core + modules), excluding test files. */
const BUILTIN_GLOB = 'packages/dvala-engine/src/builtin/**/*.dvala'
const INCLUDE = [BUILTIN_GLOB]

/**
 * Flush one worker's accumulated union hit-spans to its per-pid dump file. Keyed by
 * pid and OVERWRITTEN on each call (the global span map only grows, so the last flush
 * is complete). Called from a per-file `afterAll` — reliable, unlike
 * `process.on('exit')` for pooled workers. Sync; no-op when nothing was recorded.
 */
export function dumpWorkerCoverage(hitSpans: Map<string, number>, reportDir: string = DVALA_COVERAGE_DIR): void {
  if (hitSpans.size === 0) return
  const dir = workersDir(reportDir)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${process.pid}.json`), JSON.stringify([...hitSpans]))
}

/** Parse one builtin `.dvala` file from disk into a single-source AST (with source map). */
function parseBuiltinFile(relPath: string): { sourceMap: SourceMap; source: string } | undefined {
  const source = fs.readFileSync(relPath, 'utf-8')
  const tokens = tokenize(source, /* debug */ true, relPath)
  const ast = parseToAst(
    minifyTokenStream(tokens, { removeWhiteSpace: true }),
    (() => {
      let n = 0
      return () => n++
    })(),
  )
  if (!ast.sourceMap) return undefined
  return { sourceMap: ast.sourceMap, source }
}

/**
 * Merge all worker dumps and render the report under `coverage-dvala/`. Returns a
 * one-line summary, or `undefined` when no dumps were produced. The "found" set is
 * built by parsing every builtin `.dvala` file fresh from disk (the denominator),
 * then hit spans are mapped back onto that parse so the existing
 * `computeCoverageSummary` machinery (line + expression coverage, uncovered-expr
 * pinpointing) renders it.
 */
export function writeDvalaCoverageReport(reportDir: string = DVALA_COVERAGE_DIR): string | undefined {
  const dumpsDir = workersDir(reportDir)
  if (!fs.existsSync(dumpsDir)) return undefined
  const files = fs.readdirSync(dumpsDir).filter(f => f.endsWith('.json'))
  if (files.length === 0) return undefined

  // Merge hit spans (sum counts) across workers.
  const hitSpans = new Map<string, number>()
  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(dumpsDir, file), 'utf-8')) as [string, number][]
    for (const [key, count] of entries) hitSpans.set(key, (hitSpans.get(key) ?? 0) + count)
  }

  // Build the denominator from disk: parse every builtin `.dvala` file, assembling a
  // synthetic combined source map + a coverage map keyed by the parse's node IDs,
  // populated from the hit spans. Then reuse computeCoverageSummary to render.
  const builtinFiles = fs
    .globSync(BUILTIN_GLOB, { cwd: process.cwd() })
    .filter(f => !f.endsWith('.test.dvala'))
    .sort()
  const sources: SourceMap['sources'] = []
  const positions: SourceMap['positions'] = new Map()
  const coverageMap = new Map<number, number>()
  for (const relPath of builtinFiles) {
    const parsed = parseBuiltinFile(relPath)
    if (!parsed) continue
    const sourceOffset = sources.length
    sources.push(...parsed.sourceMap.sources)
    for (const pos of parsed.sourceMap.positions.values()) {
      // Globally-unique id across files: offset by accumulated position count.
      const id = positions.size
      positions.set(id, { ...pos, source: pos.source + sourceOffset })
      if (pos.structuralLeaf) continue
      const src = parsed.sourceMap.sources[pos.source]
      if (!src) continue
      const count = hitSpans.get(dvalaSpanKey(src.path, pos.start, pos.end))
      if (count) coverageMap.set(id, count)
    }
  }
  const sourceMap: SourceMap = { sources, positions }

  const result: TestRunResult = { filePath: '<dvala-union>', results: [], coverageMap, sourceMap }
  const summaries = computeCoverageSummary([result], { include: INCLUDE, exclude: [] })

  fs.mkdirSync(reportDir, { recursive: true })
  // Derive lcov from the SAME summaries the HTML uses, so lcov.info and the rendered
  // report agree line-for-line (continuation-filled + uncovered lines included).
  fs.writeFileSync(path.join(reportDir, 'lcov.info'), generateLcovFromSummaries(summaries))
  for (const [rel, content] of generateCoverageHtmlFiles(summaries, process.cwd())) {
    const out = path.join(reportDir, rel)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, content)
  }

  const lines = summaries.map(s => {
    const head = `${s.path}  lines ${s.linesHit}/${s.linesFound}  exprs ${s.exprsHit}/${s.exprsFound}`
    if (s.exprsHit === s.exprsFound) return head
    const detail = s.uncoveredExprs.map(e => `    ${s.path}:${e.start[0] + 1}:${e.start[1] + 1}  ${e.text}`).join('\n')
    return `${head}\n${detail}`
  })
  const totals = summaries.reduce(
    (a, s) => ({ lh: a.lh + s.linesHit, lf: a.lf + s.linesFound, eh: a.eh + s.exprsHit, ef: a.ef + s.exprsFound }),
    { lh: 0, lf: 0, eh: 0, ef: 0 },
  )
  const pct = (n: number, d: number) => (d === 0 ? '100' : ((100 * n) / d).toFixed(1))
  const header =
    `.dvala builtin coverage (union baseline) — ${summaries.length} file(s)\n` +
    `lines ${totals.lh}/${totals.lf} (${pct(totals.lh, totals.lf)}%)  ` +
    `exprs ${totals.eh}/${totals.ef} (${pct(totals.eh, totals.ef)}%)`
  fs.writeFileSync(path.join(reportDir, 'summary.txt'), `${header}\n\n${lines.join('\n')}\n`)

  fs.rmSync(dumpsDir, { recursive: true, force: true })
  return header
}
