import { beforeAll, describe, expect, it } from 'vitest'
import { builtin } from '../builtin'
import { initBuiltinTypes } from './builtinTypes'
import { parseTypeAnnotation, RefinementError, TypeParseError } from './parseType'

// Populate the builtin-type cache so `isTypeGuard('isNumber')` returns
// true — the fragment-checker calls it while classifying relation
// operands. Mirrors the pattern in `infer.test.ts`.
beforeAll(() => {
  initBuiltinTypes(builtin.normalExpressions)
})

// ---------------------------------------------------------------------------
// Refinement types — Phase 1 (parse + fragment-check)
// ---------------------------------------------------------------------------
//
// Design: design/active/2026-04-23_refinement-types.md (Phase 1 ship gate).
//
// Phase 1 accepts the `Base & { binder | predicate }` syntax, parses the
// predicate body as a Dvala expression, and runs the fragment-checker.
// Accepted predicates are silently dropped (the `Refined` Type-union
// member arrives in Phase 2); rejected predicates throw a tagged
// RefinementError with `kind: 'fragment' | 'predicate-type'`.
//
// Test layout:
//   - "accepted shapes" — everything in the Phase 1 accept list parses
//     without throwing. The returned type reflects the base (refinement
//     erased); behaviour beyond that is Phase 2's problem.
//   - "rejected shapes" — each with an expected `kind` and a substring
//     the error message must include.
//   - "disambiguation" — record literals, generic types with `<`, etc.
//     continue to parse.
//   - "syntactic errors" — malformed input routes through TypeParseError
//     (not RefinementError), so existing error-category consumers stay
//     reliable.
// ---------------------------------------------------------------------------

describe('refinement types — Phase 1', () => {
  describe('accepted shapes', () => {
    const cases = [
      'Number & {n | n > 0}',
      'Number & {n | n >= 0}',
      'Number & {n | n < 100}',
      'Number & {n | n <= 100}',
      'Number & {n | n != 0}',
      'Number & {n | n == 42}',
      'String & {s | s == "ok"}',
      'Number & {x | isNumber(x)}',
      'String & {s | isString(s)}',
      'Number & {x | isNumber(x) && isInteger(x)}',
      'Number & {x | isNumber(x) || isString(x)}',
      'Number & {x | !isNumber(x)}',
      'String & {s | count(s) > 0}',
      'String & {s | count(s) == 0}',
      'String & {s | count(s) >= 3 && count(s) <= 10}',
    ]
    for (const input of cases) {
      it(`accepts: ${input}`, () => {
        expect(() => parseTypeAnnotation(input)).not.toThrow()
      })
    }
  })

  describe('rejected shapes', () => {
    const cases: { input: string; kind: 'fragment' | 'predicate-type'; match: RegExp }[] = [
      // Non-Boolean body — predicate-type kind.
      { input: 'Number & {x | x}', kind: 'predicate-type', match: /bare identifier/i },
      { input: 'Number & {x | 42}', kind: 'predicate-type', match: /literal/i },
      // Arithmetic — fragment kind, with the operator named.
      { input: 'Number & {n | n * n > 0}', kind: 'fragment', match: /left-hand side|arithmetic/i },
      { input: 'Number & {n | n + 1 > 0}', kind: 'fragment', match: /left-hand side|arithmetic/i },
      // Unknown / non-guard builtin function call — fragment kind.
      { input: 'Number & {n | someUserFn(n)}', kind: 'fragment', match: /builtin/i },
      // Control flow — fragment kind, named.
      { input: 'Number & {n | if isNumber(n) then true else false end}', kind: 'fragment', match: /control-flow|If/i },
      // Deferred-by-design: field access.
      { input: 'Number & {r | isNumber(r.field)}', kind: 'fragment', match: /binder|field access/i },
      // Deferred-by-design: `lit REL var` swapped operands.
      { input: 'Number & {n | 0 < n}', kind: 'fragment', match: /left-hand side|literal-on-left/i },
    ]
    for (const { input, kind, match } of cases) {
      it(`rejects: ${input} (kind: ${kind})`, () => {
        try {
          parseTypeAnnotation(input)
          throw new Error('expected RefinementError but parseTypeAnnotation returned successfully')
        } catch (err) {
          expect(err, `input: ${input}`).toBeInstanceOf(RefinementError)
          expect((err as RefinementError).kind).toBe(kind)
          expect((err as RefinementError).cleanMessage).toMatch(match)
        }
      })
    }
  })

  describe('disambiguation', () => {
    it('Record-literal intersection parses unchanged', () => {
      expect(() => parseTypeAnnotation('{a: Number} & {b: String}')).not.toThrow()
    })

    it('Open record still works', () => {
      expect(() => parseTypeAnnotation('{a: Number, ...} & {b: String}')).not.toThrow()
    })

    it('Non-refinement `&` with bracketed operand parses', () => {
      expect(() => parseTypeAnnotation('String & [Number]')).not.toThrow()
    })

    it('Refinement brace does not suspend angle tracking outside itself', () => {
      // Regression guard: the refinement-specific angle suspension
      // only applies inside refinement braces. A subsequent refinement
      // in the same annotation must still have normal relational-op
      // behaviour. Both halves of `{n | n < 5} & {n | n < 10}` reject
      // with the `lit REL var` error — which is what we want; the
      // regression target is "parse doesn't blow up mid-way."
      try {
        parseTypeAnnotation('Number & {n | n < 5} & {n | n < 10}')
      } catch (err) {
        expect(err).toBeInstanceOf(RefinementError)
      }
    })
  })

  describe('RefinementError subclassing', () => {
    it('extends TypeParseError so existing error filters still match', () => {
      try {
        parseTypeAnnotation('Number & {n | n * n > 0}')
      } catch (err) {
        expect(err).toBeInstanceOf(TypeParseError)
        expect(err).toBeInstanceOf(RefinementError)
      }
    })
  })

  describe('syntactic errors route through TypeParseError', () => {
    it('Unterminated refinement (missing `}`) produces TypeParseError', () => {
      expect(() => parseTypeAnnotation('Number & {n | n > 0'))
        .toThrow(TypeParseError)
    })

    it('Missing binder produces TypeParseError', () => {
      expect(() => parseTypeAnnotation('Number & {| n > 0}'))
        .toThrow(TypeParseError)
    })

    it('Empty predicate body produces TypeParseError', () => {
      expect(() => parseTypeAnnotation('Number & {n | }'))
        .toThrow(TypeParseError)
    })
  })
})
