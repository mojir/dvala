import { describe, expect, it } from 'vitest'
import { createDvala } from '../createDvala'
import { parse } from '../parser'
import type { AstNode } from '../parser/types'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { tokenize } from '../tokenizer/tokenize'
import { createContextStack } from './ContextStack'
import { evaluateNodeForFold } from './foldEvaluate'

// Parse a Dvala source snippet to a single AST node. Requires the source
// to be a single top-level expression (no let-bindings, no semicolons).
function parseExpression(source: string): AstNode {
  const tokens = tokenize(source, true, undefined)
  const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
  const ast = parse(minified)
  if (ast.length !== 1) {
    throw new Error(`parseExpression expected a single expression, got ${ast.length} top-level nodes: ${source}`)
  }
  return ast[0]!
}

// Run a source snippet through the normal evaluator. Returns the runtime value.
const dvala = createDvala()
function runNormal(source: string): unknown {
  return dvala.run(source)
}

// Run the same source through the fold sandbox. Returns the FoldResult.
function runFold(source: string): ReturnType<typeof evaluateNodeForFold> {
  const node = parseExpression(source)
  return evaluateNodeForFold(node, createContextStack())
}

describe('evaluateNodeForFold — differential equivalence with normal evaluator', () => {
  // Pure arithmetic — fold and normal eval must agree.
  describe('arithmetic', () => {
    const cases: { src: string; expected: number }[] = [
      { src: '1 + 2', expected: 3 },
      { src: '10 - 3', expected: 7 },
      { src: '4 * 5', expected: 20 },
      { src: '20 / 4', expected: 5 },
      { src: '17 % 5', expected: 2 },
      { src: 'inc(41)', expected: 42 },
      { src: 'dec(43)', expected: 42 },
      { src: 'abs(-5)', expected: 5 },
      { src: 'sqrt(9)', expected: 3 },
      { src: '2 ^ 10', expected: 1024 },
      { src: 'floor(3.9)', expected: 3 },
      { src: 'ceil(3.1)', expected: 4 },
      { src: 'min(3, 1, 2)', expected: 1 },
      { src: 'max(3, 1, 2)', expected: 3 },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        const normal = runNormal(src)
        const fold = runFold(src)

        expect(normal).toBe(expected)
        expect(fold).toEqual({ ok: true, value: expected })
      })
    }
  })

  // Comparison and logical predicates — same equivalence property.
  describe('comparison and predicates', () => {
    const cases: { src: string; expected: boolean }[] = [
      { src: '1 == 1', expected: true },
      { src: '1 == 2', expected: false },
      { src: '"a" == "a"', expected: true },
      { src: '1 < 2', expected: true },
      { src: '2 <= 2', expected: true },
      { src: 'isNumber(42)', expected: true },
      { src: 'isNumber("hi")', expected: false },
      { src: 'isString("hi")', expected: true },
      { src: 'isEven(4)', expected: true },
      { src: 'isOdd(5)', expected: true },
      { src: 'isZero(0)', expected: true },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        const normal = runNormal(src)
        const fold = runFold(src)

        expect(normal).toBe(expected)
        expect(fold).toEqual({ ok: true, value: expected })
      })
    }
  })

  // String operations.
  describe('strings', () => {
    const cases: { src: string; expected: unknown }[] = [
      { src: 'count("hello")', expected: 5 },
      { src: 'count("")', expected: 0 },
      { src: 'upperCase("abc")', expected: 'ABC' },
      { src: 'lowerCase("ABC")', expected: 'abc' },
      { src: 'trim("  hi  ")', expected: 'hi' },
      { src: 'isBlank("   ")', expected: true },
      { src: 'isBlank("x")', expected: false },
    ]

    for (const { src, expected } of cases) {
      it(src, () => {
        const normal = runNormal(src)
        const fold = runFold(src)

        expect(normal).toBe(expected)
        expect(fold).toEqual({ ok: true, value: expected })
      })
    }
  })

  // Failure cases — fold surfaces the effect name; normal eval throws.
  describe('partial ops — @dvala.error surface', () => {
    const cases: string[] = [
      '1 / 0',
      'sqrt(-1)',
      '1 % 0',
    ]

    for (const src of cases) {
      it(`${src} — fold surfaces @dvala.error, normal eval throws`, () => {
        expect(() => runNormal(src)).toThrow()

        const fold = runFold(src)
        expect(fold).toEqual({ ok: false, reason: 'effect', effectName: 'dvala.error' })
      })
    }
  })

  // Budget exhaustion — fold bails cleanly when given a budget too small
  // for the expression. This asserts the sandbox honours its cap; real
  // runaway expressions (infinite recursion) would blow the default budget
  // the same way.
  it('bails with reason=budget when step cap is exceeded', () => {
    const smallBudgetFold = evaluateNodeForFold(
      parseExpression('1 + 2 + 3 + 4 + 5'),
      createContextStack(),
      1, // budget of 1 step is too small to complete
    )
    expect(smallBudgetFold).toEqual({ ok: false, reason: 'budget' })

    // Sanity: with the default budget, it completes.
    const okFold = evaluateNodeForFold(
      parseExpression('1 + 2 + 3 + 4 + 5'),
      createContextStack(),
    )
    expect(okFold).toEqual({ ok: true, value: 15 })
  })
})
