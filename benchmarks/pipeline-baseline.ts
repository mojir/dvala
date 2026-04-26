/**
 * Dvala pipeline performance benchmark.
 *
 * Tracks the cost of every pipeline phase (tokenize → parse → typecheck →
 * evaluate → end-to-end) across a corpus of representative programs, plus
 * a few refinement-types-specific scenarios that stress the typechecker.
 *
 * Two measurement styles, mixed deliberately:
 *
 *   ISOLATED (only the named phase runs in the inner loop):
 *     tokenize  = `tokenize(source)`             — pure tokenize cost
 *     parse     = `parseTokenStream(pre_tokens)` — pure parse cost
 *
 *   CUMULATIVE (matches the public API surface — what a user pays):
 *     typecheck = `dvala.typecheck(source)`      — tokenize + parse + typecheck
 *     run-no-tc = `dvalaNoTc.run(source)`        — tokenize + parse + evaluate
 *     run       = `dvala.run(source)`            — tokenize + parse + typecheck + evaluate
 *
 *   Why mixed: tokenize and parse are cheap and easy to isolate via the
 *   public tooling, so we measure them directly. Typecheck and evaluate
 *   need significant context-stack setup to call in isolation, so we
 *   measure them through the public composite API and let the reader
 *   subtract.
 *
 *   To isolate a single phase from the data:
 *     tokenize-only  = phase-tokenize
 *     parse-only     = phase-parse
 *     typecheck-only ≈ phase-typecheck − phase-tokenize − phase-parse
 *     evaluate-only  ≈ phase-run-no-typecheck − phase-tokenize − phase-parse
 *
 * Naming policy — IMPORTANT:
 *
 *   Measurement names (the strings passed to `benchPerCall` /
 *   `benchPerOp`) are STABLE IDENTIFIERS. The JSON history keys on
 *   them, and the rendered .md table groups historical values by name.
 *   Renaming a measurement creates a new row and breaks the historical
 *   thread for that measurement (the old row goes to `—` going
 *   forward and falls off the recent window after 10 runs).
 *
 *   Names should describe WHAT is being measured at the user-visible
 *   level (predicate shape, program size, source-vs-target combination)
 *   — never the internal function being called. Internal function
 *   names get refactored; user-visible behaviour is stable.
 *
 *   Scenario descriptions follow the same rule: describe the user-
 *   visible behaviour being tested, not the implementation. If a
 *   description mentions an internal function, it'll go stale at the
 *   next refactor.
 *
 * Layout:
 *   - `benchmarks/pipeline-history.json` — source of truth. Every run
 *     appends an entry. Version-controlled. Each entry stores per-
 *     scenario per-measurement medians.
 *   - `benchmarks/pipeline-performance.md` — generated from the JSON
 *     each run. One markdown table per scenario; rows = measurements,
 *     columns = recent runs (newest first, last 10 kept in the rendered
 *     view; older runs only visible in JSON).
 *
 * Extension model: adding a new measurement is just adding a new
 * `benchPerCall` / `benchPerOp` line to a scenario block. The renderer
 * sees it appear in the latest run, adds a new row to that scenario's
 * table, and shows `—` for older runs that didn't measure it.
 *
 * Running:
 *   npm run benchmarks:run    — run benchmarks, update history + .md
 *   Playground → Settings → Developer → Benchmarks — interactive chart view of the history
 *
 * Compare runs by reading the rendered markdown left-to-right (latest
 * column first), or open the HTML view for a graphical trend. Sudden
 * 2x jumps in any cell are a regression signal — re-run the script
 * before and after the suspect commit to confirm.
 *
 * The script depends on the built dist; the npm script runs
 * `build-dvala` first.
 */

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { performance } from 'node:perf_hooks'

// Hybrid imports:
//   - `createDvala` from `dist/index.js` (the built bundle). Importing
//     `createDvala` from src/ would transitively pull in .dvala stdlib
//     files, which tsx can't parse without the vite plugin.
//   - Typechecker internals (`parseTypeAnnotation`, `solveRefinedSubtype`,
//     `simplify`, type constructors) from `src/typechecker/*.ts`. The
//     typechecker subtree doesn't import any .dvala files, so tsx
//     handles it directly. Required because the bundle doesn't expose
//     these internals.
//
// Calling `createDvala()` once at startup populates the builtin-type
// cache as a side effect; the typechecker internals depend on it
// being populated to classify type-guard calls (e.g. `isNumber`).
// eslint-disable-next-line ts/no-require-imports, ts/no-var-requires
const { createDvala, parseTokenStream, tokenizeSource } = require('../dist/index.js') as typeof import('../src/createDvala') & {
  parseTokenStream: typeof import('../src/tooling').parseTokenStream
  tokenizeSource: typeof import('../src/tooling').tokenizeSource
}
import { parseTypeAnnotation } from '../src/typechecker/parseType'
import { solveRefinedSubtype } from '../src/typechecker/refinementSolver'
import { simplify } from '../src/typechecker/simplify'
import { NumberType, StringType, atom, literal } from '../src/typechecker/types'

// Each measurement collects this many outer runs and reports the median.
// 5 is a tradeoff: enough samples for the median to filter out the
// occasional GC pause or scheduler hiccup, few enough that the whole
// bench finishes in well under a minute. Min/max are also recorded so
// a single outlier doesn't silently move the reported median.
const RUNS = 5

const HISTORY_FILE = 'benchmarks/pipeline-history.json'
const RENDERED_FILE = 'benchmarks/pipeline-performance.md'
const RAW_DIR = 'benchmarks/results'
const MAX_COLUMNS_IN_RENDERED = 10

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** One measurement value. `null` means "this run didn't measure this". */
type MeasurementValue = { median: number; min: number; max: number; unit: 'ms' | 'us' } | null

/**
 * Hardware/OS context captured per run. Comparing perf numbers across
 * different fingerprints is unsafe — a 2x jump may just mean a different
 * CPU, not a regression. The visualizer surfaces this so a reader can
 * group runs by fingerprint before drawing conclusions.
 */
interface MachineInfo {
  /** sha1[0..8] of (cpu model, core count, OS, node major). Same fingerprint = comparable runs. */
  fingerprint: string
  cpu: string
  cores: number
  memoryGB: number
  /** "<platform> <release>" — e.g. "darwin 25.4.0". */
  os: string
  /** Full Node version, e.g. "v22.11.0". */
  node: string
  /** macOS only via `pmset`; null on other platforms or on detection failure. */
  onBattery: boolean | null
  /** 1-minute load average at run start. High values indicate contention. */
  loadAvg1m: number
}

/** A run = (timestamp, commit, commitMessage) + per-scenario per-measurement values. */
interface RunEntry {
  timestamp: string
  /** Short SHA. Empty / `unknown` if git lookup fails. */
  commit: string
  /** Subject line of the commit message, for human-readable context. */
  commitMessage: string
  /**
   * Hardware/OS context. Optional for backwards compat with older runs
   * that pre-date this field; new runs always populate it.
   */
  machine?: MachineInfo
  /** scenario-id → measurement-name → value. */
  scenarios: Record<string, Record<string, MeasurementValue>>
}

interface ScenarioMeta {
  id: string
  title: string
  description: string
}

interface History {
  scenarios: ScenarioMeta[] // ordered, stable across runs
  runs: RunEntry[] // newest first
}

// ---------------------------------------------------------------------------
// Bench infrastructure
// ---------------------------------------------------------------------------

const currentRun: RunEntry = {
  timestamp: new Date().toISOString(),
  commit: getGitRev(),
  commitMessage: getGitMessage(),
  machine: captureMachineInfo(),
  scenarios: {},
}

const scenarioMetas: ScenarioMeta[] = []
let activeScenario: ScenarioMeta | null = null

function getGitRev(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

function getGitMessage(): string {
  try {
    return execSync('git log -1 --format=%s HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

function captureMachineInfo(): MachineInfo {
  const cpus = os.cpus()
  const cpu = cpus[0]?.model ?? 'unknown'
  const cores = cpus.length
  const memoryGB = Math.round(os.totalmem() / 1024 ** 3)
  const platform = `${os.platform()} ${os.release()}`
  const nodeVersion = process.version

  // Fingerprint = stable identifiers only. Excludes load avg / battery
  // (transient) and exact node patch version (we group by major because
  // patch releases rarely change V8 perf meaningfully).
  const nodeMajor = nodeVersion.split('.')[0]
  const fingerprint = createHash('sha1')
    .update(`${cpu}|${cores}|${platform}|${nodeMajor}`)
    .digest('hex')
    .slice(0, 8)

  // Battery state: macOS only via `pmset`. Best-effort — failure is
  // expected on Linux/Windows and on detection issues.
  let onBattery: boolean | null = null
  if (os.platform() === 'darwin') {
    try {
      const out = execSync('pmset -g batt', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      onBattery = out.includes('Battery Power')
    } catch {
      // leave null
    }
  }

  return {
    fingerprint,
    cpu,
    cores,
    memoryGB,
    os: platform,
    node: nodeVersion,
    onBattery,
    loadAvg1m: Number(os.loadavg()[0]!.toFixed(2)),
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function startScenario(id: string, title: string, description: string): void {
  activeScenario = { id, title, description }
  scenarioMetas.push(activeScenario)
  currentRun.scenarios[id] = {}
  console.log(`\n${title}`)
  console.log(`  ${description}`)
}

function record(name: string, value: { median: number; min: number; max: number; unit: 'ms' | 'us' }): void {
  if (!activeScenario) throw new Error('record() called before startScenario()')
  currentRun.scenarios[activeScenario.id]![name] = value
  const valueStr = value.median.toFixed(value.unit === 'us' ? 2 : 3)
  const unitLabel = value.unit === 'us' ? 'μs' : 'ms'
  console.log(`  ${name.padEnd(60)} ${valueStr.padStart(8)} ${unitLabel}  (min ${value.min.toFixed(2)}, max ${value.max.toFixed(2)})`)
}

/**
 * Microsecond-per-call hot-path bench. Used for sub-microsecond inner
 * loops (solver calls, simplify, etc.) where we want each measurement
 * to span tens of milliseconds for stable timing.
 *
 * Warm-up: up to 1000 calls. V8 needs ~10² invocations to fully tier
 * up tight numeric/array hot paths, so 1000 ensures the optimizer has
 * stabilized before the timed run begins.
 */
function benchPerCall(name: string, iterations: number, fn: () => void): void {
  for (let i = 0; i < Math.min(1000, iterations); i++) fn() // warm-up

  const times: number[] = []
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now()
    for (let i = 0; i < iterations; i++) fn()
    times.push(((performance.now() - t0) * 1000) / iterations)
  }
  record(name, { median: median(times), min: Math.min(...times), max: Math.max(...times), unit: 'us' })
}

/**
 * Millisecond-per-op coarser bench. Used for end-to-end pipeline
 * operations where each call already takes 0.1–10ms.
 *
 * Warm-up: only 10 calls. Each individual op is large enough (parse +
 * typecheck a non-trivial program) that a few iterations is enough for
 * V8 to JIT the hot inner functions; cranking warm-up higher would
 * just add seconds to every bench run for no measurement benefit.
 */
function benchPerOp(name: string, iterations: number, fn: () => void): void {
  for (let i = 0; i < Math.min(10, iterations); i++) fn() // warm-up

  const times: number[] = []
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now()
    for (let i = 0; i < iterations; i++) fn()
    times.push((performance.now() - t0) / iterations)
  }
  record(name, { median: median(times), min: Math.min(...times), max: Math.max(...times), unit: 'ms' })
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const dvala = createDvala()
const dvalaNoTypecheck = createDvala({ typecheck: false })

// ---------------------------------------------------------------------------
// Corpus — representative programs covering different stress points.
//
// Each program is run through every pipeline phase (tokenize, parse,
// typecheck, run-no-typecheck, run) so a regression in any phase shows
// up as a worsening across the affected programs.
//
// Programs are picked to span:
//   - tiny: pure expression (parser/typechecker baseline overhead)
//   - medium: untyped functional shape (lambdas, lists, reduce)
//   - typed: explicit annotations everywhere (basic typechecker exercise)
//   - refinement-heavy: 50+ refinement annotations (refinement machinery)
//   - effect-heavy: handler + perform (effect-system pipeline)
//   - eval-heavy: deep recursion (evaluator stress)
//
// Programs are validated to actually parse and run via `dvala run` —
// see the bench validation step for details.
const corpus: Array<{ name: string; source: string; iters: { tokParse: number; tc: number; run: number } }> = []

corpus.push({
  name: 'tiny (1 + 2 * 3)',
  source: '1 + 2 * 3',
  iters: { tokParse: 5000, tc: 1000, run: 1000 },
})

corpus.push({
  name: 'medium (untyped fold)',
  source: 'let xs = [1,2,3,4,5,6,7,8,9,10]; reduce(xs, (a, b) -> a + b, 0)',
  iters: { tokParse: 2000, tc: 500, run: 500 },
})

corpus.push({
  name: 'typed (annotated arithmetic)',
  source: 'let add = (a: Number, b: Number): Number -> a + b; let total: Number = add(add(1, 2), add(3, 4)); total',
  iters: { tokParse: 2000, tc: 500, run: 500 },
})

// 50-refinement program — kept identical to the previous "end-to-end-large"
// scenario so its measurements line up across the schema migration.
{
  const aliases: string[] = []
  const fns: string[] = []
  const calls: string[] = []
  for (let i = 0; i < 25; i++) {
    aliases.push(`type N${i} = Number & {n | n > ${i}};`)
    fns.push(`let f${i} = (x: N${i}): Number -> x;`)
    calls.push(`f${i}(${i + 10})`)
  }
  for (let i = 0; i < 25; i++) {
    aliases.push(`type S${i} = String & {s | count(s) > ${i}};`)
    fns.push(`let g${i} = (x: S${i}): String -> x;`)
    calls.push(`g${i}("${'x'.repeat(i + 1)}")`)
  }
  corpus.push({
    name: 'refinement-heavy (50 annotations)',
    source: `${aliases.join('\n')}\n${fns.join('\n')}\n[${calls.join(', ')}]`,
    iters: { tokParse: 200, tc: 50, run: 50 },
  })
}

corpus.push({
  name: 'effect-heavy (handler + perform)',
  source: 'do with handler @test.eff(x) -> resume(x * 10) end; perform(@test.eff, 5) end',
  iters: { tokParse: 2000, tc: 500, run: 500 },
})

// Recursive fib is a known-slow runtime workload (exponential calls);
// `n=15` keeps each run a few ms so the iter count stays sane.
corpus.push({
  name: 'eval-heavy (fib(15) recursion)',
  source: 'let fib = (n) -> if n < 2 then n else fib(n - 1) + fib(n - 2) end; fib(15)',
  iters: { tokParse: 2000, tc: 500, run: 100 },
})

// Pre-tokenize once for the parse scenario so we measure parser cost
// without re-tokenizing each call. (Tokenize is a separate scenario.)
const preTokenized = corpus.map(p => ({ ...p, tokens: tokenizeSource(p.source) }))

// 1. Phase: tokenize — pure tokenize, no downstream work
startScenario('phase-tokenize', '1. Pipeline: tokenize', 'pure tokenize cost — `tokenize(source)` for each corpus program')
{
  for (const p of corpus) {
    benchPerOp(p.name, p.iters.tokParse, () => { tokenizeSource(p.source) })
  }
}

// 2. Phase: parse — `parseTokenStream(pre-tokenized)`. Excludes the
// tokenize cost so the column directly reflects parser work.
startScenario('phase-parse', '2. Pipeline: parse (pre-tokenized)', 'parser cost only — `parseTokenStream(pre-tokenized)` for each corpus program')
{
  for (const p of preTokenized) {
    benchPerOp(p.name, p.iters.tokParse, () => { parseTokenStream(p.tokens) })
  }
}

// 3. Phase: typecheck — cumulative through typecheck via public API.
// Includes tokenize + parse + typecheck. To isolate typecheck-only,
// subtract BOTH phase-tokenize and phase-parse (phase-parse is itself
// already isolated from tokenize, so don't double-count).
startScenario('phase-typecheck', '3. Pipeline: typecheck (cumulative — incl. tokenize + parse)', '`dvala.typecheck(source)` per program — full pipeline through the typechecker. Typecheck-only cost ≈ this − phase-tokenize − phase-parse.')
{
  for (const p of corpus) {
    benchPerOp(p.name, p.iters.tc, () => { dvala.typecheck(p.source) })
  }
}

// 4. Phase: run with typecheck DISABLED — tokenize + parse + evaluate.
// Subtracting phase-parse leaves the evaluator cost in isolation.
startScenario('phase-run-no-typecheck', '4. Pipeline: run (typecheck disabled)', '`dvala.run(source)` with typecheck disabled — captures tokenize + parse + evaluate. Evaluator-only cost ≈ this − phase-tokenize − phase-parse.')
{
  for (const p of corpus) {
    benchPerOp(p.name, p.iters.run, () => { dvalaNoTypecheck.run(p.source) })
  }
}

// 5. Phase: end-to-end — full pipeline including typecheck.
// This is what the user actually pays per `dvala run`.
startScenario('phase-end-to-end', '5. Pipeline: end-to-end (full)', '`dvala.run(source)` — tokenize + parse + typecheck + evaluate. The number a user actually observes.')
{
  for (const p of corpus) {
    benchPerOp(p.name, p.iters.run, () => { dvala.run(p.source) })
  }
}

// 6. Solver direct cost per shape
startScenario('solver-direct', '6. Refinement subtype-check cost (per predicate shape)', 'isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead')
{
  type Refined = Extract<ReturnType<typeof parseTypeAnnotation>, { tag: 'Refined' }>
  const intervalT = parseTypeAnnotation('Number & {n | n > 0 && n < 100}') as Refined
  const setT = parseTypeAnnotation('Atom & {x | x == :ok || x == :error}') as Refined
  const countT = parseTypeAnnotation('String & {s | count(s) > 0}') as Refined
  const excludedT = parseTypeAnnotation('Number & {n | n != 0 && n != 1 && n != -1}') as Refined

  benchPerCall('interval target — Number → {n | n > 0 && n < 100}', 100_000, () => { solveRefinedSubtype(NumberType, intervalT) })
  benchPerCall('set target — :ok → {x | :ok | :error}', 100_000, () => { solveRefinedSubtype(atom('ok'), setT) })
  benchPerCall('count target — String → {s | count(s) > 0}', 100_000, () => { solveRefinedSubtype(StringType, countT) })
  benchPerCall('excludedSet — Number → {n | !=0 && !=1 && !=-1}', 100_000, () => { solveRefinedSubtype(NumberType, excludedT) })
  benchPerCall('literal source — 50 → {n | n > 0 && n < 100}', 100_000, () => { solveRefinedSubtype(literal(50), intervalT) })
}

// 7. Stacked refinement simplify scaling
startScenario('simplify-scaling', '7. Stacked refinement simplify scaling', 'simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent')
{
  for (const N of [2, 4, 8, 16, 32]) {
    const conjuncts: string[] = []
    for (let i = 0; i < N; i++) conjuncts.push(`{n | n != ${i}}`)
    const annotation = `Number & ${conjuncts.join(' & ')}`
    const parsed = parseTypeAnnotation(annotation)
    benchPerCall(`N=${N.toString().padStart(2)} stacked refinements`, 5000, () => { simplify(parsed) })
  }
}

// 8. Many-inequality refinement worst case
startScenario('excluded-quadratic', '8. Many-inequality refinement worst case', '`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)')
{
  for (const { N, iters } of [{ N: 10, iters: 5000 }, { N: 50, iters: 1000 }, { N: 100, iters: 200 }]) {
    const conjuncts: string[] = []
    for (let i = 1; i <= N; i++) conjuncts.push(`n != ${i}`)
    const annotation = `Number & {n | ${conjuncts.join(' && ')}}`
    benchPerCall(`N=${N.toString().padStart(3)} (parse + simplify)`, iters, () => { simplify(parseTypeAnnotation(annotation)) })
  }
}

// (end-to-end refinement scenarios removed — subsumed by phase scenarios
// with the "refinement-heavy (50 annotations)" corpus program above.)

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

mkdirSync(RAW_DIR, { recursive: true })
const ts = currentRun.timestamp.replace(/[:.]/g, '-')
writeFileSync(`${RAW_DIR}/pipeline-${ts}.json`, JSON.stringify(currentRun, null, 2))

// Load history (or start fresh) and prepend the new run
let history: History
if (existsSync(HISTORY_FILE)) {
  history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) as History
} else {
  history = { scenarios: [], runs: [] }
}

// Update scenario meta — preserve order, but if a scenario id is new
// in this run and not in history, append it. (Removing scenarios is a
// manual / breaking change.)
const knownIds = new Set(history.scenarios.map(s => s.id))
for (const meta of scenarioMetas) {
  if (!knownIds.has(meta.id)) {
    history.scenarios.push(meta)
    knownIds.add(meta.id)
  } else {
    // Keep the latest title/description fresh in case it was updated.
    const existing = history.scenarios.find(s => s.id === meta.id)!
    existing.title = meta.title
    existing.description = meta.description
  }
}

history.runs.unshift(currentRun) // newest first
writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2))

// Render the markdown view: per-scenario tables, rows = measurement
// names (union across all runs), columns = most recent runs (capped).
function renderMarkdown(h: History): string {
  const lines: string[] = []
  lines.push('# Dvala pipeline performance history')
  lines.push('')
  lines.push('Tracks performance of every pipeline phase (tokenize → parse → typecheck → run) plus refinement-typechecker scenarios.')
  lines.push('')
  lines.push(`Source of truth: \`${HISTORY_FILE}\` (full history).`)
  lines.push(`Re-render: \`npm run benchmarks:run\` (also runs the benchmarks first).`)
  lines.push(`Last ${MAX_COLUMNS_IN_RENDERED} runs shown below; older runs are in the JSON only.`)
  lines.push('')
  lines.push('A new measurement added in a future run shows up as a new row, with `—` in')
  lines.push('older columns that didn\'t measure it. New scenarios appear as new sections.')
  lines.push('')

  const recent = h.runs.slice(0, MAX_COLUMNS_IN_RENDERED)

  // Run-history table: maps each commit hash that appears as a column
  // in the per-scenario tables below to its full timestamp and commit
  // message, so a reader can see what was being shipped at each point
  // in the perf timeline.
  if (recent.length > 0) {
    lines.push('## Run history')
    lines.push('')
    lines.push('| Commit | Date | Message |')
    lines.push('| --- | --- | --- |')
    for (const run of recent) {
      const msg = run.commitMessage.replaceAll('|', '\\|') || '_(no message)_'
      lines.push(`| \`${run.commit}\` | ${run.timestamp.slice(0, 19).replace('T', ' ')} | ${msg} |`)
    }
    lines.push('')
  }

  for (const sc of h.scenarios) {
    lines.push(`## ${sc.title}`)
    lines.push('')
    lines.push(`*${sc.description}*`)
    lines.push('')

    // Union of measurement names across recent runs, in first-seen order.
    const names: string[] = []
    const seenNames = new Set<string>()
    for (const run of recent) {
      const buckets = run.scenarios[sc.id] ?? {}
      for (const name of Object.keys(buckets)) {
        if (!seenNames.has(name)) { seenNames.add(name); names.push(name) }
      }
    }

    if (names.length === 0) {
      lines.push('_(no measurements yet)_')
      lines.push('')
      continue
    }

    // Pipe characters appearing inside cell text would break the
    // markdown column structure (`|` is the column separator). Escape
    // them everywhere we emit cell content. Refinement annotations
    // contain `|` as the binder/predicate separator, so this matters.
    const esc = (s: string): string => s.replaceAll('|', '\\|')

    // Header: Measurement | <commit> (date) | <commit> (date) | …
    const header = ['Measurement', ...recent.map(r => `\`${esc(r.commit)}\` (${r.timestamp.slice(0, 10)})`)]
    const align = ['---', ...recent.map(() => '---:')]
    lines.push(`| ${header.join(' | ')} |`)
    lines.push(`| ${align.join(' | ')} |`)
    for (const name of names) {
      const row: string[] = [esc(name)]
      for (const run of recent) {
        const v = run.scenarios[sc.id]?.[name]
        if (v === undefined || v === null) row.push('—')
        else row.push(`${v.median.toFixed(v.unit === 'us' ? 2 : 3)} ${v.unit === 'us' ? 'μs' : 'ms'}`)
      }
      lines.push(`| ${row.join(' | ')} |`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

writeFileSync(RENDERED_FILE, renderMarkdown(history))
console.log(`\nHistory: ${HISTORY_FILE}`)
console.log(`Rendered: ${RENDERED_FILE}`)
console.log(`Raw run: ${RAW_DIR}/pipeline-${ts}.json`)
