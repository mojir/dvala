import { describe, expect, it } from 'vitest'
import { initCoreDvalaSources } from '@mojir/dvala-engine'
import type { ParseSource } from '@mojir/dvala-engine'
import { minifyTokenStream, parseToAst, tokenize } from '@mojir/dvala-core-tooling'

// Mirror the host's ParseSource (createDvala.ts) so initCoreDvalaSources gets real
// ASTs + source maps to evaluate.
const parseSource: ParseSource = (source, opts = {}) =>
  parseToAst(
    minifyTokenStream(tokenize(source, opts.debug ?? false, opts.filePath), { removeWhiteSpace: true }),
    opts.allocateNodeId,
  )

describe('core builtin init-time coverage', () => {
  // The core builtins' top-level structure (root object, entries, lambda definitions)
  // executes once at instance construction — never during a `run` — so without a
  // recorder here it shows permanently uncovered, unlike module builtins (which are
  // import-evaluated during a run). Regression: the union report's red `:1:1` root
  // objects on every core .dvala. See initCoreDvalaSources `recordSpan`.
  it('records the root-object / top-level spans of core builtins via recordSpan', () => {
    const recorded: string[] = []
    let nextId = 0
    initCoreDvalaSources(parseSource, {
      debug: true,
      allocateNodeId: () => nextId++,
      recordSpan: (path, start) => recorded.push(`${path}:${start[0]}`),
    })

    // The root object of each core file opens at line 0 — it must be recorded.
    expect(recorded).toContain('packages/dvala-engine/src/builtin/core/collection.dvala:0')
    expect(recorded).toContain('packages/dvala-engine/src/builtin/core/functional.dvala:0')
    // And it records more than just the roots (entries / definitions executed at init).
    expect(recorded.length).toBeGreaterThan(10)
  })

  it('does not call recordSpan when none is provided (default off)', () => {
    let nextId = 0
    // Just must not throw without a recorder.
    expect(() => initCoreDvalaSources(parseSource, { debug: true, allocateNodeId: () => nextId++ })).not.toThrow()
  })
})
