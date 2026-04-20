import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'

const dvala = createDvala()

// Runtime strictness step 0a: reject empty function bodies at parse
// time rather than letting them through as a runtime TypeError for
// "Reserved symbol <x> cannot be evaluated."
describe('parser: empty function body rejection', () => {
  it('rejects `() -> end` as a parse error', () => {
    expect(() => dvala.run('(() -> end)()')).toThrow('Empty function body')
    expect(() => dvala.run('(() -> end)()')).toThrow(/end/)
  })

  it('rejects `() -> else` / `then` / `case` / `in` / `as` / `_`', () => {
    for (const kw of ['else', 'then', 'case', 'in', 'as', '_']) {
      expect(() => dvala.run(`(() -> ${kw})()`)).toThrow('Empty function body')
    }
  })

  it('rejects the shorthand lambda form `-> end`', () => {
    expect(() => dvala.run('(-> end)()')).toThrow('Empty function body')
  })

  it('accepts valid reserved-symbol bodies (true / false / null)', () => {
    expect(dvala.run('(() -> true)()')).toBe(true)
    expect(dvala.run('(() -> false)()')).toBe(false)
    expect(dvala.run('(() -> null)()')).toBe(null)
  })

  it('accepts block-starting reserved symbols as bodies (do / quote / with)', () => {
    expect(dvala.run('(() -> do 42 end)()')).toBe(42)
    // quote/with used in macros and handler applications — not exercised
    // here directly, but the reserved-symbol list intentionally excludes
    // them so existing macro and handler expressions continue to parse.
  })

  it('accepts normal expression bodies', () => {
    expect(dvala.run('(() -> 42)()')).toBe(42)
    expect(dvala.run('((x) -> x + 1)(10)')).toBe(11)
  })
})
