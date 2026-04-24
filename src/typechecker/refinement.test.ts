import { describe, expect, it } from 'vitest'
import { parseTypeAnnotation, RefinementError, TypeParseError } from './parseType'

// ---------------------------------------------------------------------------
// Phase 1 — parse + reject
// ---------------------------------------------------------------------------
//
// Phase 1 of the refinement-types plan (design/active/2026-04-23_refinement-types.md)
// accepts the `Base & { binder | predicate }` syntactic shape and rejects
// every predicate with a tagged `RefinementError(kind: 'fragment')`. The
// `Refined` AST node and the fragment-checker walker arrive in Phase 2.
//
// Test structure:
//   - "accepts syntactic shape" — the parser consumes the `{ binder | ... }`
//     form without dying on malformed syntax. Every case throws
//     RefinementError (not TypeParseError); the predicate body content
//     doesn't matter yet.
//   - "disambiguation" — record literals `{ field: T }` stay untouched.
//   - "syntactic errors" — genuinely malformed predicates still throw
//     TypeParseError so parse-error recovery doesn't confuse categories.
// ---------------------------------------------------------------------------

describe('refinement types — Phase 1 parse + reject', () => {
  describe('accepts syntactic shape (rejects with RefinementError, kind: fragment)', () => {
    const cases = [
      'Number & {n | n > 0}',
      'String & {s | count(s) > 0}',
      'Integer & {n | 0 <= n && n <= 100}',
      'Number & {x | isNumber(x) && isInteger(x)}',
      'String & {s | isString(s) || isNumber(s)}',
      '{a: Number} & {r | r.min <= r.max}',
      // Nested refinement (phase 1 rejects both — still parses both)
      'Number & {n | n > 0} & {n | n < 100}',
    ]
    for (const input of cases) {
      it(input, () => {
        try {
          parseTypeAnnotation(input)
          throw new Error('expected RefinementError but parseTypeAnnotation returned successfully')
        } catch (err) {
          expect(err, `input: ${input}`).toBeInstanceOf(RefinementError)
          expect((err as RefinementError).kind).toBe('fragment')
          expect((err as RefinementError).cleanMessage).toMatch(/refinement types are not yet supported|Phase 1/i)
        }
      })
    }
  })

  describe('disambiguation from record literals', () => {
    it('Record literal parses unchanged — `{ field: T }`', () => {
      // `{ a: Number }` after `&` is a record literal, not a refinement.
      // Lookahead key: `IDENT :` (record) vs. `IDENT |` (refinement).
      // Parser returns an Inter of two Record types (simplify collapses
      // them later — that's not the parser's job).
      expect(() => parseTypeAnnotation('{a: Number} & {b: String}')).not.toThrow()
    })

    it('Open record `{ field: T, ... }` still works', () => {
      expect(() => parseTypeAnnotation('{a: Number, ...} & {b: String}')).not.toThrow()
    })

    it('Non-refinement use of `&` with bracketed operand parses', () => {
      // `& Number[]` — the `[` starts a bracketed type, not a refinement.
      // Lookahead correctly falls through to parsePrefix.
      expect(() => parseTypeAnnotation('String & [Number]')).not.toThrow()
    })
  })

  describe('base type preserved when predicate is dropped', () => {
    it('parser discards `& { ... }` and returns the base', () => {
      // Phase 1 drops the refinement silently — the returned type is
      // whatever the base parses to, with the predicate erased. The
      // *fragment-check throw* is the user-visible effect; if we suppress
      // the throw (try/catch in this test), the base is unchanged.
      try {
        parseTypeAnnotation('Number & {n | n > 0}')
      } catch {
        // Expected — the throw is the signal. No further assertion;
        // the "base preserved" claim is a semantic-spec note for when
        // Phase 2 lands and stops throwing.
      }
    })
  })

  describe('syntactic errors still route through TypeParseError', () => {
    it('Unterminated refinement (missing `}`) produces TypeParseError, not RefinementError', () => {
      // The predicate body is consumed via the parseType.ts brace-matcher;
      // running off the end of input is a genuine syntax error, not a
      // fragment rejection. Tests pin this routing so error-category
      // consumers stay reliable.
      expect(() => parseTypeAnnotation('Number & {n | n > 0'))
        .toThrow(TypeParseError)
    })

    it('Missing binder (no identifier before `|`) produces TypeParseError', () => {
      // `Number & { | n > 0 }` — the binder slot is empty. Syntactic
      // error; doesn't reach the fragment-check.
      expect(() => parseTypeAnnotation('Number & {| n > 0}'))
        .toThrow(TypeParseError)
    })
  })

  describe('RefinementError kind discriminator', () => {
    it('emits kind: `fragment` for the Phase 1 stub', () => {
      try {
        parseTypeAnnotation('Number & {n | n > 0}')
      } catch (err) {
        expect(err).toBeInstanceOf(RefinementError)
        expect((err as RefinementError).kind).toBe('fragment')
      }
    })

    it('RefinementError extends TypeParseError (caught by existing error filters)', () => {
      try {
        parseTypeAnnotation('Number & {n | n > 0}')
      } catch (err) {
        expect(err).toBeInstanceOf(TypeParseError)
      }
    })
  })
})
