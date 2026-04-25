/**
 * Refinement-types performance benchmark.
 *
 * Tracks the cost of the refinement-types machinery (Phase 2.1+) so
 * regressions are visible across commits.
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
 *   - `benchmarks/refinement-history.json` — source of truth. Every run
 *     appends an entry. Version-controlled. Each entry stores per-
 *     scenario per-measurement medians.
 *   - `benchmarks/refinement-performance.md` — generated from the JSON
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
 *   npm run benchmark:refinement   — run benchmarks, update history + .md
 *   npm run show:benchmarks        — open an HTML chart view of the history
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const RUNS = 5
const HISTORY_FILE = 'benchmarks/refinement-history.json'
const RENDERED_FILE = 'benchmarks/refinement-performance.md'
const RAW_DIR = 'benchmarks/results'
const MAX_COLUMNS_IN_RENDERED = 10

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** One measurement value. `null` means "this run didn't measure this". */
type MeasurementValue = { median: number; min: number; max: number; unit: 'ms' | 'us' } | null

/** A run = (timestamp, commit, commitMessage) + per-scenario per-measurement values. */
interface RunEntry {
  timestamp: string
  /** Short SHA. Empty / `unknown` if git lookup fails. */
  commit: string
  /** Subject line of the commit message, for human-readable context. */
  commitMessage: string
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

/** Microsecond-per-call hot-path bench. */
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

/** Millisecond-per-op coarser bench. */
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

// 1. Parse + typecheck overhead — split parse from typecheck
//
// Three programs of identical shape, varying only the annotation:
//   - plain (no annotation): catches walker overhead unrelated to
//     refinements; should hold steady regardless of refinement work
//   - typed Number annotation: pre-Phase-2.1 baseline shape
//   - refined `{n | n > 0}` annotation: full machinery exercised
//
// Each program is benched in two stages:
//   - parse-only: `parseTokenStream(tokenizeSource(p))`
//   - typecheck: `dvala.typecheck(p)` (which also parses internally)
//
// The delta between parse and typecheck rows isolates the typecheck
// step. The delta between rows in the same column isolates the
// refinement-specific cost.
startScenario('parse-overhead', '1. Parse + typecheck overhead', 'plain (no annotation) vs. typed Number vs. refined Number & {n | n > 0} — same program shape, parse and typecheck split out')
{
  const plainProgram = 'let x = 5; x'
  const typedProgram = 'let x: Number = 5; x'
  const refinedProgram = 'let x: Number & {n | n > 0} = 5; x'

  // Parse-only timings — strip out the typecheck step. Useful to see
  // whether the parser cost itself shifted between commits.
  benchPerOp('parse: plain (no annotation)', 1000, () => { parseTokenStream(tokenizeSource(plainProgram)) })
  benchPerOp('parse: typed Number annotation', 1000, () => { parseTokenStream(tokenizeSource(typedProgram)) })
  benchPerOp('parse: refined Number & {n | n > 0}', 1000, () => { parseTokenStream(tokenizeSource(refinedProgram)) })

  // Full pipeline (parse + typecheck via the public API).
  benchPerOp('typecheck: plain (no annotation)', 1000, () => { dvala.typecheck(plainProgram) })
  benchPerOp('typecheck: typed Number annotation', 1000, () => { dvala.typecheck(typedProgram) })
  benchPerOp('typecheck: refined Number & {n | n > 0}', 1000, () => { dvala.typecheck(refinedProgram) })
}

// 2. Solver direct cost per shape
startScenario('solver-direct', '2. Refinement subtype-check cost (per predicate shape)', 'isolated subtype-check calls between source type and refinement target — no parse or typecheck overhead')
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

// 3. Stacked refinement simplify scaling
startScenario('simplify-scaling', '3. Stacked refinement simplify scaling', 'simplifying N stacked refinements (`Base & {p1} & {p2} & ... & {pN}`) — empirically O(N²); regressions show as a worse exponent')
{
  for (const N of [2, 4, 8, 16, 32]) {
    const conjuncts: string[] = []
    for (let i = 0; i < N; i++) conjuncts.push(`{n | n != ${i}}`)
    const annotation = `Number & ${conjuncts.join(' & ')}`
    const parsed = parseTypeAnnotation(annotation)
    benchPerCall(`N=${N.toString().padStart(2)} stacked refinements`, 5000, () => { simplify(parsed) })
  }
}

// 4. Many-inequality refinement worst case
startScenario('excluded-quadratic', '4. Many-inequality refinement worst case', '`Number & {n | n != 1 && n != 2 && ... && n != N}` — documented quadratic worst case (each conjunction step merges against the growing exclusion list)')
{
  for (const { N, iters } of [{ N: 10, iters: 5000 }, { N: 50, iters: 1000 }, { N: 100, iters: 200 }]) {
    const conjuncts: string[] = []
    for (let i = 1; i <= N; i++) conjuncts.push(`n != ${i}`)
    const annotation = `Number & {n | ${conjuncts.join(' && ')}}`
    benchPerCall(`N=${N.toString().padStart(3)} (parse + simplify)`, iters, () => { simplify(parseTypeAnnotation(annotation)) })
  }
}

// 5. End-to-end realistic program (small)
startScenario('end-to-end', '5. End-to-end refinement-heavy program (small)', 'representative shape — 3 type aliases, 4 calls, multiple solver paths')
{
  const program = `
    type Positive = Number & {n | n > 0};
    type NonEmpty = String & {s | count(s) > 0};
    type Status = Atom & {x | x == :ok || x == :error};

    let validate = (n: Positive): Number -> n;
    let label = (s: NonEmpty): String -> s;
    let route = (x: Status): String -> "routed";

    let total: Number = validate(5) + validate(10);
    let msg: String = label("hello");
    let r1: String = route(:ok);
    let r2: String = route(:error);

    [total, msg, r1, r2]
  `
  benchPerOp('parse + typecheck full program', 500, () => { dvala.typecheck(program) })
}

// 6. End-to-end realistic program (large)
//
// Generated source: 50 distinct refinement annotations spread across
// type aliases, function parameters, and let-bindings. Catches scaling
// regressions a 10-line program would miss — especially anything
// proportional to "number of refinements in the program" rather than
// "size of one refinement". Realistic shape: a library of validation
// functions where every numeric parameter has an interval refinement
// and every string has an emptiness refinement.
startScenario('end-to-end-large', '6. End-to-end refinement-heavy program (large)', '50+ refinement annotations across type aliases, function params, and let-bindings — catches scaling regressions proportional to refinement count')
{
  const aliases: string[] = []
  const fns: string[] = []
  const calls: string[] = []
  // 25 numeric refinement aliases, each used by one function and called twice.
  for (let i = 0; i < 25; i++) {
    aliases.push(`type N${i} = Number & {n | n > ${i}};`)
    fns.push(`let f${i} = (x: N${i}): Number -> x;`)
    calls.push(`f${i}(${i + 10})`)
  }
  // 25 string-emptiness refinement aliases, each used once.
  for (let i = 0; i < 25; i++) {
    aliases.push(`type S${i} = String & {s | count(s) > ${i}};`)
    fns.push(`let g${i} = (x: S${i}): String -> x;`)
    calls.push(`g${i}("${'x'.repeat(i + 1)}")`)
  }
  const program = `${aliases.join('\n')}\n${fns.join('\n')}\n[${calls.join(', ')}]`
  benchPerOp('parse + typecheck (50 refinements)', 100, () => { dvala.typecheck(program) })
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

mkdirSync(RAW_DIR, { recursive: true })
const ts = currentRun.timestamp.replace(/[:.]/g, '-')
writeFileSync(`${RAW_DIR}/refinement-${ts}.json`, JSON.stringify(currentRun, null, 2))

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
  lines.push('# Refinement-types performance history')
  lines.push('')
  lines.push('Tracks performance of the refinement-types machinery (Phase 2.1+) over time.')
  lines.push('')
  lines.push(`Source of truth: \`${HISTORY_FILE}\` (full history).`)
  lines.push(`Re-render: \`npm run benchmark:refinement\` (also runs the benchmarks first).`)
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
console.log(`Raw run: ${RAW_DIR}/refinement-${ts}.json`)
