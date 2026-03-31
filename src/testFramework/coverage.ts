// eslint-disable-next-line @typescript-eslint/no-require-imports
const minimatch = require('minimatch') as (path: string, pattern: string) => boolean
import fs from 'node:fs'
import type { SourceMap } from '../parser/types'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { parseToAst } from '../parser'
import type { TestRunResult } from './result'

/**
 * Convert a per-file coverage map + sourceMap into LCOV format.
 *
 * LCOV format per record:
 *   TN:<test name>
 *   SF:<source file path>
 *   DA:<1-based line number>,<hit count>
 *   LH:<lines hit>
 *   LF:<lines found>
 *   end_of_record
 *
 * Node IDs are grouped by source file and start line. A line's hit count
 * is the maximum hit count of any node starting on that line — a line is
 * covered if at least one of its nodes was evaluated.
 */
export function generateLcov(coverageMap: Map<number, number>, sourceMap: SourceMap): string {
  // Group hit counts by source index → line (0-based) → max hit count
  const bySource = new Map<number, Map<number, number>>()

  for (const [nodeId, count] of coverageMap) {
    const pos = sourceMap.positions.get(nodeId)
    if (!pos) continue
    let byLine = bySource.get(pos.source)
    if (!byLine) {
      byLine = new Map()
      bySource.set(pos.source, byLine)
    }
    const line = pos.start[0]
    byLine.set(line, Math.max(byLine.get(line) ?? 0, count))
  }

  const records: string[] = []

  for (const [sourceIdx, byLine] of bySource) {
    const sourceMeta = sourceMap.sources[sourceIdx]
    // Skip anonymous/synthetic sources (e.g. the __testBody__() wrapper call)
    if (!sourceMeta || !sourceMeta.path || sourceMeta.path === '<anonymous>') continue

    const lines = [...byLine.entries()].sort((a, b) => a[0] - b[0])
    const linesHit = lines.filter(([, count]) => count > 0).length
    const daLines = lines.map(([line, count]) => `DA:${line + 1},${count}`).join('\n')

    records.push([
      'TN:',
      `SF:${sourceMeta.path}`,
      daLines,
      `LH:${linesHit}`,
      `LF:${lines.length}`,
      'end_of_record',
    ].join('\n'))
  }

  return records.join('\n') + (records.length > 0 ? '\n' : '')
}

/**
 * Merge coverage results from multiple test files into a single LCOV report string.
 * Each test file has its own node ID space so we generate and concatenate per-file records.
 */
export function generateSuiteLcov(results: TestRunResult[]): string {
  return results
    .filter(r => r.coverageMap && r.sourceMap)
    .map(r => generateLcov(r.coverageMap!, r.sourceMap!))
    .join('')
}

export interface FileCoverageSummary {
  path: string
  linesHit: number
  linesFound: number
  /** Total unique expressions (AST nodes) found in this file's sourceMap */
  exprsFound: number
  /** Expressions that were evaluated at least once */
  exprsHit: number
  /** 1-based line numbers that were never hit */
  uncoveredLines: number[]
}

export interface CoverageFilter {
  include: string[]
  exclude: string[]
  /** Root directory for resolving relative paths in patterns. Default: process.cwd() */
  rootDir?: string
  /**
   * When provided, all absolute file paths in this list are included in the summary
   * even if never evaluated — reported with 0% coverage.
   */
  allFiles?: string[]
}

/**
 * Returns true if the given absolute file path matches the include patterns
 * and does not match the exclude patterns.
 */
function matchesFilter(filePath: string, filter: CoverageFilter): boolean {
  const root = filter.rootDir ?? process.cwd()
  // Normalise to a relative path for glob matching
  const rel = filePath.startsWith(root) ? filePath.slice(root.length).replace(/^[\\/]/, '') : filePath
  const included = filter.include.length === 0 || filter.include.some(p => minimatch(rel, p))
  const excluded = filter.exclude.some(p => minimatch(rel, p))
  return included && !excluded
}

/**
 * Compute per-source-file coverage summaries from all test run results.
 * Merges hits across test files by source path so each source file appears once.
 * When filter is provided, only files matching include/exclude patterns are returned.
 */
export function computeCoverageSummary(results: TestRunResult[], filter?: CoverageFilter): FileCoverageSummary[] {
  // Accumulate per source-file:
  //   byLine: line (0-based) → max hit count across all results
  //   exprHits: nodeId → max hit count (0 = seen but never evaluated)
  const byPath = new Map<string, Map<number, number>>()
  const exprHitsByPath = new Map<string, Map<number, number>>()

  for (const result of results) {
    if (!result.coverageMap || !result.sourceMap) continue

    // Count all nodes in the sourceMap as "found" expressions (hit count defaults to 0)
    for (const [nodeId, pos] of result.sourceMap.positions) {
      const sourceMeta = result.sourceMap.sources[pos.source]
      if (!sourceMeta?.path || sourceMeta.path === '<anonymous>') continue

      let exprHits = exprHitsByPath.get(sourceMeta.path)
      if (!exprHits) { exprHits = new Map(); exprHitsByPath.set(sourceMeta.path, exprHits) }
      // Initialise to 0 if not yet seen — don't overwrite a hit from another result
      if (!exprHits.has(nodeId)) exprHits.set(nodeId, 0)

      let byLine = byPath.get(sourceMeta.path)
      if (!byLine) { byLine = new Map(); byPath.set(sourceMeta.path, byLine) }
      if (!byLine.has(pos.start[0])) byLine.set(pos.start[0], 0)
    }

    // Record actual hit counts from the coverageMap
    for (const [nodeId, count] of result.coverageMap) {
      const pos = result.sourceMap.positions.get(nodeId)
      if (!pos) continue
      const sourceMeta = result.sourceMap.sources[pos.source]
      if (!sourceMeta?.path || sourceMeta.path === '<anonymous>') continue

      const exprHits = exprHitsByPath.get(sourceMeta.path)
      if (exprHits) exprHits.set(nodeId, Math.max(exprHits.get(nodeId) ?? 0, count))

      const byLine = byPath.get(sourceMeta.path)
      if (byLine) {
        const line = pos.start[0]
        byLine.set(line, Math.max(byLine.get(line) ?? 0, count))
      }
    }
  }

  // For files that were never evaluated, parse them to get line/expr counts at 0%
  if (filter?.allFiles) {
    for (const filePath of filter.allFiles) {
      if (byPath.has(filePath)) continue // already covered
      const stats = parseFileStats(filePath)
      if (!stats) continue
      byPath.set(filePath, stats.byLine)
      exprHitsByPath.set(filePath, stats.byExpr)
    }
  }

  return [...byPath.entries()]
    .filter(([filePath]) => !filter || matchesFilter(filePath, filter))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filePath, byLine]) => {
      const lines = [...byLine.entries()].sort((a, b) => a[0] - b[0])
      const linesHit = lines.filter(([, count]) => count > 0).length
      const uncoveredLines = lines.filter(([, count]) => count === 0).map(([line]) => line + 1)

      const exprHits = exprHitsByPath.get(filePath)!
      const exprsFound = exprHits.size
      const exprsHit = [...exprHits.values()].filter(c => c > 0).length

      return { path: filePath, linesHit, linesFound: lines.length, exprsFound, exprsHit, uncoveredLines }
    })
}

/**
 * Parse a .dvala file and return its line and expression maps initialised to 0.
 * Used for files that were never evaluated during tests (all: true mode).
 */
function parseFileStats(filePath: string): { byLine: Map<number, number>; byExpr: Map<number, number> } | null {
  try {
    const source = fs.readFileSync(filePath, 'utf-8')
    const tokenStream = tokenize(source, /* debug */ true, filePath)
    const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
    let idCounter = 0
    const ast = parseToAst(minified, () => idCounter++)
    if (!ast.sourceMap) return null

    const byLine = new Map<number, number>()
    const byExpr = new Map<number, number>()

    for (const [nodeId, pos] of ast.sourceMap.positions) {
      // Only count nodes belonging to this file (source index 0 — the only source)
      if (pos.source !== 0) continue
      byExpr.set(nodeId, 0)
      const line = pos.start[0]
      if (!byLine.has(line)) byLine.set(line, 0)
    }

    return { byLine, byExpr }
  } catch {
    return null
  }
}
