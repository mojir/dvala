/**
 * Process-global `.dvala` coverage accumulator for the suite-wide UNION baseline
 * (`DVALA_COVERAGE=1`). Each `createDvala` instance, when coverage is active, records
 * the *source spans* of evaluated builtin `.dvala` nodes here. A vitest setup file
 * dumps this to disk at worker exit; a globalSetup teardown merges all workers' dumps
 * (by span) and computes the report against a denominator parsed fresh from disk.
 *
 * Keyed by **source span** (path + start/end), NOT node ID: builtin module node IDs
 * vary across instances (import order + which module set was registered + the per-
 * module parse cache), so an ID-keyed cross-instance merge would conflate positions.
 * Spans are stable across instances/workers. Core builtins could be ID-keyed (their
 * IDs are deterministic) but are span-keyed too, so the whole union is uniform.
 *
 * DOM/Node-free (no `fs`): only touches `process` defensively for the env check.
 */

/** True when the suite-wide union baseline is requested via `DVALA_COVERAGE=1`. */
export function isGlobalDvalaCoverageEnabled(): boolean {
  return typeof process !== 'undefined' && process.env?.DVALA_COVERAGE === '1'
}

/** True for engine builtin `.dvala` source paths (core + modules). */
export function isBuiltinDvalaPath(path: string): boolean {
  return path.includes('packages/dvala-engine/src/builtin/') && path.endsWith('.dvala')
}

/** Stable key for a builtin `.dvala` node's source span (0-based positions). */
export function dvalaSpanKey(path: string, start: [number, number], end: [number, number]): string {
  return `${path}\t${start[0]},${start[1]}\t${end[0]},${end[1]}`
}

// span-key → number of times evaluated, accumulated across every instance in this worker.
const globalHitSpans = new Map<string, number>()

/** Record one evaluation of a builtin `.dvala` expression, keyed by source span. */
export function recordGlobalDvalaSpan(key: string): void {
  globalHitSpans.set(key, (globalHitSpans.get(key) ?? 0) + 1)
}

/** Snapshot the accumulated union hit spans for dumping at worker exit. */
export function getGlobalDvalaHits(): Map<string, number> {
  return globalHitSpans
}
