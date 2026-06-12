import { describe, expect, it } from 'vitest'
import { createDvala } from '@mojir/dvala-core-tooling'
import { computeCoverageSummary, generateCoverageHtmlFiles, generateLcov } from '@mojir/dvala-test-framework'

const PREDICATES = 'packages/dvala-engine/src/builtin/core/predicates.dvala'

describe('.dvala builtin coverage', () => {
  it('records line + expression hits for builtins exercised via sync run', () => {
    const dvala = createDvala({ coverage: true, typecheck: false })
    dvala.run('isEven(2)') // predicates.dvala line 30
    dvala.run('isEmpty([])') // predicates.dvala line 32

    const cov = dvala.getCoverage()
    expect(cov).toBeDefined()
    expect(cov!.sourceMap).toBeDefined()

    // LCOV should contain predicates.dvala with the two exercised lines hit.
    const lcov = generateLcov(cov!.coverageMap, cov!.sourceMap!)
    expect(lcov).toContain(`SF:${PREDICATES}`)
    expect(lcov).toContain('DA:30,') // isEven
    expect(lcov).toContain('DA:32,') // isEmpty

    // Expression coverage: at least the two predicates' body nodes are hit.
    const summary = computeCoverageSummary(
      [{ filePath: 'x', results: [], coverageMap: cov!.coverageMap, sourceMap: cov!.sourceMap }],
      {
        include: ['packages/dvala-engine/src/builtin/**/*.dvala'],
        exclude: [],
      },
    )
    const pred = summary.find(s => s.path === PREDICATES)
    expect(pred).toBeDefined()
    expect(pred!.exprsFound).toBeGreaterThan(pred!.exprsHit) // not everything is exercised
    expect(pred!.exprsHit).toBeGreaterThan(0)

    // Uncovered expressions are pinpointed precisely: one entry per unhit node,
    // each carrying a span + snippet — the actionable signal on covered lines.
    expect(pred!.uncoveredExprs).toHaveLength(pred!.exprsFound - pred!.exprsHit)
    for (const e of pred!.uncoveredExprs) {
      expect(e.start[0]).toBeGreaterThanOrEqual(0)
      expect(e.start[1]).toBeGreaterThanOrEqual(0)
      expect(typeof e.text).toBe('string')
    }
    // Sorted top-to-bottom, left-to-right.
    const keys = pred!.uncoveredExprs.map(e => e.start[0] * 10000 + e.start[1])
    expect(keys).toEqual([...keys].sort((a, b) => a - b))
  })

  it('highlights uncovered expression spans in the HTML file page', () => {
    const dvala = createDvala({ coverage: true, typecheck: false })
    dvala.run('isEven(2)') // exercises one predicate; many others stay uncovered

    const cov = dvala.getCoverage()!
    const summaries = computeCoverageSummary(
      [{ filePath: 'x', results: [], coverageMap: cov.coverageMap, sourceMap: cov.sourceMap }],
      { include: ['packages/dvala-engine/src/builtin/**/*.dvala'], exclude: [] },
    )
    const files = generateCoverageHtmlFiles(summaries, process.cwd())
    const predHtml = [...files].find(([p]) => p.endsWith('predicates.dvala.html'))?.[1] ?? ''
    // The exact never-evaluated sub-expressions are wrapped + partial lines marked.
    expect(predHtml).toContain('uncovered-expr')
    expect(predHtml).toContain('class="partial"')
  })

  it('records core builtins init-time top-level structure with no run', () => {
    // The core builtins' top-level structure (root object, entries, lambda
    // definitions) executes once at construction, not during a run. Without
    // recording it there, getCoverage() would be empty until something runs and
    // core .dvala roots would show permanently uncovered (the union baseline had
    // this gap before initCoreDvalaSources gained recordBuiltinNode).
    const dvala = createDvala({ coverage: true, typecheck: false })
    const cov = dvala.getCoverage()!
    expect(cov.coverageMap.size).toBeGreaterThan(0) // populated at construction, pre-run
    const lcov = generateLcov(cov.coverageMap, cov.sourceMap!)
    expect(lcov).toContain(`SF:${PREDICATES}`) // a core builtin appears without any run
  })

  it('returns undefined coverage when not opted in', () => {
    const dvala = createDvala({ typecheck: false })
    dvala.run('isEven(2)')
    expect(dvala.getCoverage()).toBeUndefined()
  })

  // End-to-end branch-arm coverage: a bare-symbol arm carries no node the evaluator
  // would normally record (Sym is skipped), so it's force-recorded when its branch is
  // taken and is a coverable "found" node otherwise — making it green when taken and
  // red when never taken, instead of an un-measurable neutral line.
  it('records a bare-symbol else arm only when the else branch is taken', () => {
    const armCount = (cond: string): number => {
      const dvala = createDvala({ coverage: true, typecheck: false })
      dvala.run(`do let q = 7; if ${cond} then 1 else q end end`)
      const cov = dvala.getCoverage()!
      const sm = cov.sourceMap!
      const srcIdx = sm.sources.findIndex(s => s.content?.includes('else q'))
      const content = sm.sources[srcIdx]!.content!
      const col = content.indexOf('else q') + 'else '.length // single line → col == index
      for (const [id, pos] of sm.positions) {
        if (pos.source === srcIdx && pos.start[0] === 0 && pos.start[1] === col) {
          return cov.coverageMap.get(id) ?? 0
        }
      }
      throw new Error('else-arm node not found')
    }
    expect(armCount('false')).toBeGreaterThan(0) // else taken → arm recorded (green)
    expect(armCount('true')).toBe(0) // else not taken → arm found but unhit (red)
  })

  // Guards the load-bearing invariant in initCoreDvalaSources: a coverage instance
  // created AFTER a non-debug instance (which won the idempotent dvalaImpl assignment
  // from a non-debug parse) must still attribute builtin hits to the right source +
  // line. Relies on the deterministic, unconditional re-parse of the core sources.
  it('attributes correctly in a later coverage instance after a non-debug first instance', () => {
    // First instance: non-debug. Wins dvalaImpl assignment with a non-debug parse.
    const first = createDvala({ typecheck: false })
    first.run('isEven(4)')

    // Later instance: coverage. Exercises a DIFFERENT predicate (isOdd, line 31).
    const later = createDvala({ coverage: true, typecheck: false })
    later.run('isOdd(3)')

    const cov = later.getCoverage()!
    let predicatesHits = 0
    let isOddBodyHit = false
    for (const [nodeId, count] of cov.coverageMap) {
      if (count === 0) continue
      const pos = cov.sourceMap!.positions.get(nodeId)
      // Every hit node must resolve to a position (no orphaned/colliding IDs).
      expect(pos).toBeDefined()
      const src = cov.sourceMap!.sources[pos!.source]
      if (src?.path.endsWith('predicates.dvala')) {
        predicatesHits++
        // isOdd's body lives on line 31 (0-based 30) — the run-time hit must attribute
        // there. Other predicates hits come from the init-time top-level structure.
        if (pos!.start[0] === 30) isOddBodyHit = true
      }
    }
    expect(predicatesHits).toBeGreaterThan(0)
    expect(isOddBodyHit).toBe(true)
  })
})
