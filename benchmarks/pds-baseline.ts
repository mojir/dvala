/**
 * Baseline performance benchmark for persistent data structures.
 *
 * Run before implementing HAMTs to establish the current (clone-based) baseline.
 * Run again after to measure the improvement.
 *
 * Usage:
 *   npx tsx benchmarks/pds-baseline.ts
 *
 * Each scenario targets a different aspect of the O(N) clone problem:
 *
 *   Scenario 1 — Array accumulation (O(N²) total copies)
 *     Repeatedly pushes onto a growing array. Each push currently clones the
 *     whole array. For N=10000 elements: 0+1+2+...+9999 ≈ 50M element copies.
 *     HAMT reduces this to O(N log N).
 *
 *   Scenario 2 — Nested state updates (growing arrays inside a state object)
 *     Simulates a realistic workflow: a state object with an items array, a
 *     growing history log, and a growing processed list. Each step clones all
 *     three levels (outer object + two growing arrays). HAMT reduces each
 *     clone to O(log N) structural sharing.
 *
 *   Scenario 3 — Point updates on a large array (O(N) per update)
 *     Repeatedly calls assoc() on a large fixed-size array. Each update
 *     currently clones the entire array. For K updates on an N-element array:
 *     K*N total element copies. HAMT reduces each update to O(log N).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
// Import from built dist to avoid tsx issues with .dvala files in src
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createDvala } = require('../dist/index.js') as typeof import('../src/createDvala')

// ---------------------------------------------------------------------------
// Benchmark infrastructure
// ---------------------------------------------------------------------------

const RUNS = 5

interface BenchResult {
  name: string
  median: number
  min: number
  max: number
  runs: number
  times: number[]
}

interface ScenarioResult {
  scenario: string
  description: string
  results: BenchResult[]
}

interface BenchReport {
  timestamp: string
  label: string
  runs: number
  scenarios: ScenarioResult[]
}

// Accumulates results for JSON output
const report: BenchReport = {
  timestamp: new Date().toISOString(),
  label: 'baseline (clone-based)',
  runs: RUNS,
  scenarios: [],
}

let currentScenario: ScenarioResult | null = null

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function startScenario(scenario: string, description: string): void {
  currentScenario = { scenario, description, results: [] }
  report.scenarios.push(currentScenario)
}

function bench(name: string, fn: () => void): void {
  const times: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }

  const med = median(times)
  const min = Math.min(...times)
  const max = Math.max(...times)
  console.log(`  ${name}`)
  console.log(`    median: ${med.toFixed(1)}ms  min: ${min.toFixed(1)}ms  max: ${max.toFixed(1)}ms`)

  const result: BenchResult = { name, median: med, min, max, runs: RUNS, times }
  currentScenario!.results.push(result)
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const dvala = createDvala()

// Scenario 1: Array accumulation — O(N²) total clones
// Builds a 10000-element array by pushing one element at a time.
// Current cost: 0+1+2+...+9999 ≈ 50M element copies.
const SCENARIO_1_N = 10_000

const scenario1 = `
reduce(range(${SCENARIO_1_N}), (acc, x) -> push(acc, x), []);
null
`

// Scenario 2: Nested state updates — growing arrays inside a state object
// 600 iterations, each cloning:
//   - outer state object (4 fields)
//   - processed array (grows 0 → 599): total ≈ 180K copies
//   - history array (grows 0 → 599): total ≈ 180K copies
//   - stats object (3 fields): 600 copies
const SCENARIO_2_ITERS = 5_000
const SCENARIO_2_ITEMS = 1_000

const scenario2 = `
let step = (s, i) -> do
  let item = nth(s.items, mod(i, count(s.items)));
  {
    ...s,
    processed: push(s.processed, item),
    stats: { count: s.stats.count + 1, sum: s.stats.sum + item },
    history: push(s.history, { step: i, item: item })
  }
end;

let initialState = {
  items: range(${SCENARIO_2_ITEMS}),
  processed: [],
  stats: { count: 0, sum: 0 },
  history: []
};

reduce(range(${SCENARIO_2_ITERS}), step, initialState);
null
`

// Scenario 3: Point updates on a large array — O(N) per update
// 1000 updates on a 5000-element array.
// Current cost: 1000 * 5000 = 5M element copies per run.
const SCENARIO_3_ARRAY_SIZE = 20_000
const SCENARIO_3_UPDATES = 3_000

const scenario3 = `
let bigArray = range(${SCENARIO_3_ARRAY_SIZE});
reduce(range(${SCENARIO_3_UPDATES}), (arr, i) -> assoc(arr, mod(i, ${SCENARIO_3_ARRAY_SIZE}), i * 2), bigArray);
null
`

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

// Pre-parse all scenarios once. createDvala() caches ASTs by source string,
// so every timed run below hits the cache and skips parsing entirely.
// We are benchmarking evaluation only, not the parser.
dvala.run(scenario1)
dvala.run(scenario2)
dvala.run(scenario3)

console.log('\nPersistent Data Structures — Baseline Benchmark')
console.log(`(${RUNS} runs, evaluation only — parser excluded via AST cache)\n`)

console.log(`Scenario 1: Array accumulation — push ${SCENARIO_1_N.toLocaleString()} elements one by one`)
startScenario('scenario1', `Array accumulation — push ${SCENARIO_1_N.toLocaleString()} elements one by one`)
bench('current (clone-based)', () => dvala.run(scenario1))

console.log(`\nScenario 2: Nested state updates — ${SCENARIO_2_ITERS} iterations, ${SCENARIO_2_ITEMS}-item collection`)
startScenario('scenario2', `Nested state updates — ${SCENARIO_2_ITERS} iterations, ${SCENARIO_2_ITEMS}-item collection`)
bench('current (clone-based)', () => dvala.run(scenario2))

console.log(`\nScenario 3: Point updates — ${SCENARIO_3_UPDATES.toLocaleString()} assoc calls on ${SCENARIO_3_ARRAY_SIZE.toLocaleString()}-element array`)
startScenario('scenario3', `Point updates — ${SCENARIO_3_UPDATES.toLocaleString()} assoc calls on ${SCENARIO_3_ARRAY_SIZE.toLocaleString()}-element array`)
bench('current (clone-based)', () => dvala.run(scenario3))

// Persist results so the baseline survives for post-HAMT comparison
const outDir = 'benchmarks/results'
mkdirSync(outDir, { recursive: true })
const outFile = `${outDir}/pds-${report.timestamp.replace(/[:.]/g, '-')}.json`
writeFileSync(outFile, JSON.stringify(report, null, 2))
console.log(`\nBaseline recorded. Results saved to ${outFile}`)
console.log('Re-run after HAMT implementation to measure improvement.\n')
