/**
 * Continuation size baseline — pre-pruning measurements.
 *
 * Measures how much AST the current evaluator carries in suspended
 * continuations versus how much would survive pruning. This is the
 * baseline for comparing against after pruned continuations are
 * implemented.
 *
 * For each scenario, we report:
 *   - total-bytes     Total serialized blob size (JSON chars)
 *   - total-nodes     Sum of top-level AstNode entries across all frames
 *   - dead-nodes      Nodes that pruning could eliminate:
 *                       SequenceFrame/AndFrame/OrFrame/QqFrame/ArrayBuild/
 *                       TemplateStringBuild: nodes[0..index-1]
 *                       MatchFrame (phase=body/guard): cases except current
 *   - live-nodes      total-nodes − dead-nodes (what survives pruning)
 *   - dead-pct        dead-nodes / total-nodes as a percentage
 *
 * Run:
 *   npx tsx --require ./scripts/tsx-dvala-loader.cjs benchmarks/continuation-size-baseline.ts
 *
 * Produces: benchmarks/continuation-size-baseline.md
 * Re-run after implementing pruning to measure the improvement.
 */

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createDvala } from '@mojir/dvala-core-tooling'

const dvala = createDvala({ typecheck: false })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FrameStats {
  totalNodes: number
  deadNodes: number
}

interface ScenarioResult {
  name: string
  description: string
  totalBytes: number
  /** Dead nodes in the current continuation (k) only — not snapshots. */
  kStats: FrameStats
  /** Dead nodes summed across all snapshots. */
  snapshotStats: FrameStats
}

// ---------------------------------------------------------------------------
// Blob walker
//
// Recursively traverses the raw continuation JSON blob and accumulates
// dead vs total node counts from known frame types. Recognises frames by
// their `type` string field. Only counts top-level entries in `nodes`
// (not sub-expression children) — this undercounts the real byte savings
// but is deterministic and portable.
// ---------------------------------------------------------------------------

const SEQUENCE_LIKE_FRAMES = new Set(['Sequence', 'And', 'Or', 'Qq', 'ArrayBuild', 'TemplateStringBuild'])

// Resolve a value that may be a pool reference (v2 format dedup) to the actual value.
function resolvePool(value: unknown, pool: Record<number, unknown> | null): unknown {
  if (pool && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const ref = (value as Record<string, unknown>)['__poolRef']
    if (typeof ref === 'number') return pool[ref] ?? value
  }
  return value
}

function accumulateFrameStats(value: unknown, stats: FrameStats, pool: Record<number, unknown> | null): void {
  const resolved = resolvePool(value, pool)
  if (resolved === null || typeof resolved !== 'object') return

  if (Array.isArray(resolved)) {
    for (const item of resolved) accumulateFrameStats(item, stats, pool)
    return
  }

  const obj = resolved as Record<string, unknown>

  if (typeof obj['type'] === 'string') {
    const frameType = obj['type']

    if (SEQUENCE_LIKE_FRAMES.has(frameType)) {
      const rawNodes = obj['nodes']
      const nodes = resolvePool(rawNodes, pool)
      const index = obj['index']
      if (Array.isArray(nodes) && typeof index === 'number') {
        stats.totalNodes += nodes.length
        // nodes[0..index-1] have already been evaluated — dead
        stats.deadNodes += Math.min(index, nodes.length)
      }
    }

    if (frameType === 'Match') {
      const rawCases = obj['cases']
      const cases = resolvePool(rawCases, pool)
      const index = obj['index']
      const phase = obj['phase']
      if (Array.isArray(cases) && typeof index === 'number') {
        // Dead cases only once a case has been chosen (guard or body phase).
        // During matchValue phase all cases are still live candidates.
        if (phase === 'guard' || phase === 'body') {
          stats.totalNodes += cases.length
          stats.deadNodes += cases.length - 1 // all except current case
        }
      }
    }
  }

  for (const val of Object.values(obj)) accumulateFrameStats(val, stats, pool)
}

function analyzeBlob(blob: unknown): { kStats: FrameStats; snapshotStats: FrameStats } {
  const obj = blob as Record<string, unknown>
  const pool = (obj['pool'] ?? null) as Record<number, unknown> | null
  const kStats: FrameStats = { totalNodes: 0, deadNodes: 0 }
  const snapshotStats: FrameStats = { totalNodes: 0, deadNodes: 0 }

  // Walk only the current continuation stack (k), not snapshots
  accumulateFrameStats(obj['k'], kStats, pool)

  // Walk snapshots separately so the overhead is visible
  if (Array.isArray(obj['snapshots'])) {
    for (const snap of obj['snapshots']) {
      accumulateFrameStats(snap, snapshotStats, pool)
    }
  }

  return { kStats, snapshotStats }
}

// ---------------------------------------------------------------------------
// Effect handler that suspends
// ---------------------------------------------------------------------------

const suspendHandler = {
  pattern: 'baseline.suspend',
  handler: async ({ suspend }: { suspend: (meta?: unknown) => void }) => {
    suspend({ suspended: true })
  },
}

// ---------------------------------------------------------------------------
// Program generators
// ---------------------------------------------------------------------------

function makeSequenceProgram(letCount: number): string {
  const stmts: string[] = []
  for (let i = 0; i < letCount; i++) {
    stmts.push(`let f${i} = (x) -> x + ${i}`)
  }
  // Suspend after all definitions; use one after to create a live future node
  stmts.push(`let result = perform(@baseline.suspend, null)`)
  stmts.push(`f0(result)`)
  return stmts.join('; ')
}

function makeNestedSequenceProgram(outerLets: number, innerLets: number): string {
  const inner: string[] = []
  for (let i = 0; i < innerLets; i++) {
    inner.push(`let g${i} = (x) -> x * ${i + 1}`)
  }
  inner.push(`let result = perform(@baseline.suspend, null)`)
  inner.push(`g0(result)`)

  const outer: string[] = []
  for (let i = 0; i < outerLets; i++) {
    outer.push(`let f${i} = (x) -> x + ${i}`)
  }
  outer.push(`let inner = do ${inner.join('; ')} end`)
  outer.push(`f0(inner)`)
  return outer.join('; ')
}

function makeMatchProgram(caseCount: number): string {
  const cases: string[] = []
  // First case suspends; remaining are dead once first matches
  cases.push(`case 1 then perform(@baseline.suspend, null)`)
  for (let i = 2; i <= caseCount; i++) {
    cases.push(`case ${i} then "case-${i}"`)
  }
  return `match 1 ${cases.join(' ')} end`
}

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

async function measure(name: string, description: string, program: string): Promise<ScenarioResult> {
  const result = await dvala.runAsync(program, { effectHandlers: [suspendHandler] })

  if (result.type !== 'suspended') {
    throw new Error(`${name}: expected suspension, got ${result.type}`)
  }

  const blob = result.snapshot.continuation
  const totalBytes = JSON.stringify(blob).length
  const { kStats, snapshotStats } = analyzeBlob(blob)

  return { name, description, totalBytes, kStats, snapshotStats }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
console.log('Measuring continuation sizes (pre-pruning baseline)…\n')

const results: ScenarioResult[] = await Promise.all([
  measure(
    'sequence-10-lets',
    '10 top-level let bindings, then suspend, then use one',
    makeSequenceProgram(10),
  ),
  measure(
    'sequence-25-lets',
    '25 top-level let bindings, then suspend, then use one',
    makeSequenceProgram(25),
  ),
  measure(
    'sequence-50-lets',
    '50 top-level let bindings, then suspend, then use one',
    makeSequenceProgram(50),
  ),
  measure(
    'nested-sequence (10 outer + 10 inner)',
    'Outer sequence of 10 lets; inner do-block of 10 lets that suspends',
    makeNestedSequenceProgram(10, 10),
  ),
  measure(
    'match-5-cases (suspend in case 1)',
    '5-case match; first case suspends — other 4 are dead',
    makeMatchProgram(5),
  ),
  measure(
    'match-10-cases (suspend in case 1)',
    '10-case match; first case suspends — other 9 are dead',
    makeMatchProgram(10),
  ),
])

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function pct(dead: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((dead / total) * 100)}%`
}

function renderMarkdown(rows: ScenarioResult[]): string {
  const lines: string[] = []
  const commit = (() => { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() } catch { return 'unknown' } })()
  const date = new Date().toISOString().slice(0, 19).replace('T', ' ')

  lines.push('# Continuation size measurement')
  lines.push('')
  lines.push(`Captured at commit \`${commit}\` on ${date}.`)
  lines.push('')
  lines.push('**What "dead" means:** nodes already evaluated (in `SequenceFrame`, `AndFrame`, `OrFrame`,')
  lines.push('`QqFrame`, `ArrayBuildFrame`, `TemplateStringBuildFrame`), plus unmatched cases in')
  lines.push('`MatchFrame` once a case has been chosen. Only top-level node entries are counted,')
  lines.push('not sub-expression children — real byte savings are larger.')
  lines.push('')
  lines.push('### Current continuation (k)')
  lines.push('')
  lines.push('| Scenario | Total bytes | k total nodes | k dead | k live | k dead % |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |')

  for (const r of rows) {
    const { totalNodes, deadNodes } = r.kStats
    const liveNodes = totalNodes - deadNodes
    lines.push(
      `| ${r.name} | ${r.totalBytes.toLocaleString()} | ${totalNodes} | ${deadNodes} | ${liveNodes} | ${pct(deadNodes, totalNodes)} |`,
    )
  }

  lines.push('')
  lines.push('### Snapshots (accumulated past states)')
  lines.push('')
  lines.push('Snapshots carry copies of earlier continuation states. Each suspension appends one.')
  lines.push('')
  lines.push('| Scenario | Snapshot total nodes | Snapshot dead | Snapshot dead % |')
  lines.push('| --- | ---: | ---: | ---: |')

  for (const r of rows) {
    const { totalNodes, deadNodes } = r.snapshotStats
    lines.push(
      `| ${r.name} | ${totalNodes} | ${deadNodes} | ${pct(deadNodes, totalNodes)} |`,
    )
  }

  lines.push('')
  lines.push('## Scenario descriptions')
  lines.push('')
  for (const r of rows) {
    lines.push(`- **${r.name}**: ${r.description}`)
  }
  lines.push('')

  return lines.join('\n')
}

const md = renderMarkdown(results)
writeFileSync('benchmarks/continuation-size-baseline.md', md)

// Print summary to stdout
console.log('Scenario'.padEnd(45), 'Bytes'.padStart(8), 'k dead'.padStart(10), 'k dead%'.padStart(8), 'snap dead'.padStart(10))
console.log('-'.repeat(84))
for (const r of results) {
  console.log(
    r.name.padEnd(45),
    String(r.totalBytes).padStart(8),
    `${r.kStats.deadNodes}/${r.kStats.totalNodes}`.padStart(10),
    pct(r.kStats.deadNodes, r.kStats.totalNodes).padStart(8),
    `${r.snapshotStats.deadNodes}/${r.snapshotStats.totalNodes}`.padStart(10),
  )
}
console.log('\nWritten: benchmarks/continuation-size-baseline.md')
}

main().catch((err) => { console.error(err); process.exit(1) })
