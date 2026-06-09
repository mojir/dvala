import { describe, expect, it } from 'vitest'
import { createDvala } from '@mojir/dvala-core-tooling'
import { computeCoverageSummary, generateLcov } from '@mojir/dvala-test-framework'

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
  })

  it('returns undefined coverage when not opted in', () => {
    const dvala = createDvala({ typecheck: false })
    dvala.run('isEven(2)')
    expect(dvala.getCoverage()).toBeUndefined()
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
    for (const [nodeId, count] of cov.coverageMap) {
      if (count === 0) continue
      const pos = cov.sourceMap!.positions.get(nodeId)
      // Every hit node must resolve to a position (no orphaned/colliding IDs).
      expect(pos).toBeDefined()
      const src = cov.sourceMap!.sources[pos!.source]
      if (src?.path.endsWith('predicates.dvala')) {
        predicatesHits++
        // isOdd's body lives on line 31 (0-based 30).
        expect(pos!.start[0]).toBe(30)
      }
    }
    expect(predicatesHits).toBeGreaterThan(0)
  })
})
