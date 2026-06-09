import type { SourceMap } from '@mojir/dvala-types'

/**
 * Process-global `.dvala` coverage accumulator for the suite-wide UNION baseline.
 *
 * When `DVALA_COVERAGE=1`, every `createDvala` instance auto-enables coverage and
 * records evaluated node IDs here (in addition to its own instance-level map). A
 * vitest setup file dumps this to disk at worker exit; a globalSetup teardown then
 * merges all workers' dumps into the separate `coverage-dvala/` report.
 *
 * Builtin node IDs are deterministic across instances (the [0, N) reservation in
 * initCoreDvalaSources), so summing counts keyed by node ID across all instances
 * and all workers yields a correct union for the builtin surface. User-program
 * nodes (IDs >= N) also land in the map but are filtered out at report time by the
 * builtin source map (which only carries positions for [0, N)).
 *
 * This module is intentionally DOM/Node-free (no `fs`): it only touches `process`
 * defensively for the env check, so it stays safe in browser bundles.
 */

/** True when the suite-wide union baseline is requested via `DVALA_COVERAGE=1`. */
export function isGlobalDvalaCoverageEnabled(): boolean {
  return typeof process !== 'undefined' && process.env?.DVALA_COVERAGE === '1'
}

const globalCoverageMap = new Map<number, number>()
let globalBuiltinSourceMap: SourceMap | undefined

/** Record one evaluation of a builtin/user node into the union map. */
export function recordGlobalDvalaNode(nodeId: number): void {
  globalCoverageMap.set(nodeId, (globalCoverageMap.get(nodeId) ?? 0) + 1)
}

/**
 * Register the builtin source map. First writer wins — the first instance under the
 * env is the one that assigned dvalaImpl, so its map's node IDs and structuralLeaf
 * flags align with the executed builtin bodies. Later identical writes are ignored.
 */
export function setGlobalDvalaBuiltinSourceMap(sourceMap: SourceMap): void {
  globalBuiltinSourceMap ??= sourceMap
}

/** Snapshot the accumulated union coverage for dumping at worker exit. */
export function getGlobalDvalaCoverage(): { coverageMap: Map<number, number>; sourceMap: SourceMap | undefined } {
  return { coverageMap: globalCoverageMap, sourceMap: globalBuiltinSourceMap }
}
