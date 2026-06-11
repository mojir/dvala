import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { minifyTokenStream, parseToAst, tokenize } from '@mojir/dvala-core-tooling'

/**
 * Guards against a class of false-negative `.dvala` coverage: an "orphaned"
 * source-map position — a node the parser allocated a position for but then
 * discarded from the AST (so it can never be evaluated, and shows permanently
 * uncovered in the union report).
 *
 * Known offenders, all fixed: `do…end` bodies unwrapped into lambda/macro/handler
 * statement lists, re-wrapped quoted object keys, and discarded import-path strings.
 * Each discarded node must be flagged `structuralLeaf` (or simply not re-allocated),
 * which both the evaluator's coverage hook and the report denominator already skip.
 *
 * This asserts the invariant across every builtin `.dvala`: no position is both
 * unreachable from the AST and not a structural leaf. A new parser that discards a
 * positioned node will fail here at PR time, rather than silently surfacing as a
 * red expression in the (weekly/manual) coverage report.
 */

/** Collect every node id reachable from the AST — recurse arrays AND object values. */
function collectReachableIds(value: unknown, ids: Set<number>): void {
  if (Array.isArray(value)) {
    if (value.length === 3 && typeof value[0] === 'string' && typeof value[2] === 'number') ids.add(value[2])
    for (const item of value) collectReachableIds(item, ids)
    return
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectReachableIds(v, ids)
  }
}

describe('builtin .dvala source-map integrity', () => {
  it('has no orphaned (unreachable, non-structural-leaf) positions', () => {
    const files = fs
      .globSync('packages/dvala-engine/src/builtin/**/*.dvala', { cwd: process.cwd() })
      .filter(f => !f.endsWith('.test.dvala'))
      .sort()
    expect(files.length).toBeGreaterThan(0) // guard against a broken glob silently passing

    const orphans: string[] = []
    for (const file of files) {
      let nextId = 0
      const source = fs.readFileSync(file, 'utf-8')
      const ast = parseToAst(
        minifyTokenStream(tokenize(source, true, file), { removeWhiteSpace: true }),
        () => nextId++,
      )
      if (!ast.sourceMap) continue
      const reachable = new Set<number>()
      collectReachableIds(ast.body, reachable)
      const lines = source.split('\n')
      for (const [id, pos] of ast.sourceMap.positions) {
        if (reachable.has(id) || pos.structuralLeaf) continue
        const snippet = (lines[pos.start[0]] ?? '').slice(pos.start[1], pos.start[1] + 30).trim()
        orphans.push(`${file}:${pos.start[0] + 1}:${pos.start[1] + 1}  «${snippet}»`)
      }
    }

    expect(
      orphans,
      `orphaned source-map positions (discarded nodes — flag structuralLeaf):\n${orphans.join('\n')}`,
    ).toEqual([])
  })
})
