import { beforeAll, describe, expect, it } from 'vitest'
import { builtin } from '../builtin'
import { NodeTypes } from '../constants/constants'
import { createDvala } from '../createDvala'
import type { AstNode } from '../parser/types'
import { initBuiltinTypes } from './builtinTypes'
import { expandTypeForDisplay } from './infer'
import { parseTypeAnnotation, RefinementError, TypeParseError } from './parseType'
import { solveRefinedSubtype } from './refinementSolver'
import { simplify } from './simplify'
import { isSubtype } from './subtype'
import { NumberType, StringType, typeEquals, typeToString, type Type } from './types'

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
      // Atom equality — explicit ship-gate example from the design doc.
      'Atom & {x | x == :ok}',
      'Number & {x | isNumber(x)}',
      'String & {s | isString(s)}',
      'Number & {x | isNumber(x) && isInteger(x)}',
      'Number & {x | isNumber(x) || isString(x)}',
      'Number & {x | !isNumber(x)}',
      // Double negation — exercises the recursive Call(!) → Call(!) path.
      'Number & {x | !!isNumber(x)}',
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
      // Arithmetic — fragment kind, with the operator named. The
      // LHS-arithmetic message explicitly points at Phase 3 (linear
      // arithmetic solver) rather than telling the user to "rewrite as
      // n > 0" (which is wrong guidance when the LHS is `n + 1`).
      { input: 'Number & {n | n * n > 0}', kind: 'fragment', match: /arithmetic.*left-hand side|Phase 3/i },
      { input: 'Number & {n | n + 1 > 0}', kind: 'fragment', match: /arithmetic.*left-hand side|Phase 3/i },
      // Unknown / non-guard builtin function call — fragment kind.
      { input: 'Number & {n | someUserFn(n)}', kind: 'fragment', match: /builtin/i },
      // Control flow — fragment kind, named.
      { input: 'Number & {n | if isNumber(n) then true else false end}', kind: 'fragment', match: /control-flow|If/i },
      // Deferred-by-design: field access.
      { input: 'Number & {r | isNumber(r.field)}', kind: 'fragment', match: /binder|field access/i },
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
    it('record-literal intersection parses unchanged', () => {
      expect(() => parseTypeAnnotation('{a: Number} & {b: String}')).not.toThrow()
    })

    it('open record still works', () => {
      expect(() => parseTypeAnnotation('{a: Number, ...} & {b: String}')).not.toThrow()
    })

    it('non-refinement `&` with bracketed operand parses', () => {
      expect(() => parseTypeAnnotation('String & [Number]')).not.toThrow()
    })

    it('refinement brace does not suspend angle tracking outside itself', () => {
      // Regression guard: the refinement-specific angle suspension
      // only applies inside refinement braces. Multiple refinements with
      // `<` operators inside their predicates must all parse correctly
      // — the angle-tracking state from one brace must NOT leak to the
      // next. Both predicates here use `<` (which originally tripped
      // the angle-tracker pre-fix); the regression target is "parse
      // doesn't blow up mid-way."
      expect(() => parseTypeAnnotation('Number & {n | n < 5} & {n | n < 10}')).not.toThrow()
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
    it('unterminated refinement (missing `}`) produces TypeParseError', () => {
      expect(() => parseTypeAnnotation('Number & {n | n > 0'))
        .toThrow(TypeParseError)
    })

    it('missing binder produces TypeParseError', () => {
      expect(() => parseTypeAnnotation('Number & {| n > 0}'))
        .toThrow(TypeParseError)
    })

    it('empty predicate body produces TypeParseError', () => {
      expect(() => parseTypeAnnotation('Number & {n | }'))
        .toThrow(TypeParseError)
    })

    it('reserved-word binder (`null`/`true`/`false`) produces TypeParseError', () => {
      // Reserved symbols tokenize as ReservedSymbol, not Sym — the
      // annotation collector's `isSymbolToken || isReservedSymbolToken`
      // check accepts them for brace classification (refinement vs.
      // record). The inner predicate parser then can't bind to `null`,
      // so the user would get a confusing "binder on LHS" error later.
      // Reject early with a targeted syntax error instead.
      expect(() => parseTypeAnnotation('Number & {null | null > 0}'))
        .toThrow(TypeParseError)
      expect(() => parseTypeAnnotation('Number & {true | true == true}'))
        .toThrow(TypeParseError)
    })
  })
})

// ---------------------------------------------------------------------------
// Refinement types — Phase 2.1 (`Refined` AST node + walker updates)
// ---------------------------------------------------------------------------
//
// Design: `design/active/2026-04-23_refinement-types.md` (Phase 2.1 scope).
//
// Phase 2.1 introduces a new `{ tag: 'Refined', base, binder, predicate,
// source }` variant in the `Type` union and teaches every structural walker
// to pass it through unchanged (the `Refined` node is inert until the
// Phase 2.4 solver lands). Key invariants to pin:
//
//   - The parser emits `Refined` nodes (Phase 1 dropped them).
//   - `typeToString(Refined)` renders `base & { source }`.
//   - `typeEquals` compares `(base, binder, source)` tuples.
//   - `simplify(Refined)` simplifies the base only.
//   - `isSubtype` folds a refinement predicate when the source is a
//     concrete literal, otherwise it still passes through to the base.
//   - End-to-end: `let x: Positive = 5` typechecks; `= -5` now fails via
//     fold-discharge; `= "hi"` still fails at the base-level mismatch.
// ---------------------------------------------------------------------------

describe('refinement types — Phase 2.1 Refined node', () => {
  describe('parser emits Refined nodes', () => {
    it('`Number & {n | n > 0}` parses to Refined(Number, n, "n | n > 0")', () => {
      const t = parseTypeAnnotation('Number & {n | n > 0}')
      expect(t.tag).toBe('Refined')
      if (t.tag !== 'Refined') return
      expect(typeEquals(t.base, NumberType)).toBe(true)
      expect(t.binder).toBe('n')
      expect(t.source).toContain('n > 0')
    })

    it('stacked refinements nest in the order written', () => {
      // `Number & {n | n > 0} & {n | n < 100}` — the second refinement
      // wraps the first. Phase 2.2 merges these into one; Phase 2.1
      // keeps them nested.
      const t = parseTypeAnnotation('Number & {n | n > 0} & {n | n < 100}')
      expect(t.tag).toBe('Refined')
      if (t.tag !== 'Refined') return
      expect(t.base.tag).toBe('Refined') // inner refinement = `Number & {n | n > 0}`
    })

    it('refinement on a base other than a primitive still works', () => {
      const t = parseTypeAnnotation('String & {s | count(s) > 0}')
      expect(t.tag).toBe('Refined')
      if (t.tag !== 'Refined') return
      expect(typeEquals(t.base, StringType)).toBe(true)
    })
  })

  describe('typeToString renders the `source` text', () => {
    it('single refinement', () => {
      const t = parseTypeAnnotation('Number & {n | n > 0}')
      const rendered = typeToString(t)
      expect(rendered).toContain('Number')
      expect(rendered).toContain('n | n > 0')
    })

    it('stacked refinements render both predicates', () => {
      const t = parseTypeAnnotation('Number & {n | n > 0} & {n | n < 100}')
      const rendered = typeToString(t)
      expect(rendered).toContain('n | n > 0')
      expect(rendered).toContain('n | n < 100')
    })
  })

  describe('typeEquals on Refined', () => {
    it('equal refinements are equal', () => {
      const a = parseTypeAnnotation('Number & {n | n > 0}')
      const b = parseTypeAnnotation('Number & {n | n > 0}')
      expect(typeEquals(a, b)).toBe(true)
    })

    it('different predicates are not equal', () => {
      const a = parseTypeAnnotation('Number & {n | n > 0}')
      const b = parseTypeAnnotation('Number & {n | n >= 0}')
      expect(typeEquals(a, b)).toBe(false)
    })

    it('alpha-renamed refinements are not equal in Phase 2.1', () => {
      // Phase 2.1 uses source-text equality. `{n | n > 0}` and
      // `{m | m > 0}` are semantically identical but textually
      // distinct. Phase 2.2's multi-refinement merging brings in
      // alpha-aware equality — this test will flip to `true` then.
      const a = parseTypeAnnotation('Number & {n | n > 0}')
      const b = parseTypeAnnotation('Number & {m | m > 0}')
      expect(typeEquals(a, b)).toBe(false)
    })

    it('different bases are not equal even with identical predicate', () => {
      const a = parseTypeAnnotation('Number & {n | n > 0}')
      const b = parseTypeAnnotation('Integer & {n | n > 0}')
      expect(typeEquals(a, b)).toBe(false)
    })
  })

  describe('simplify passes through Refined', () => {
    it('preserves the Refined node', () => {
      const t = parseTypeAnnotation('Number & {n | n > 0}')
      const s = simplify(t)
      expect(s.tag).toBe('Refined')
    })

    it('simplifies the base inside the Refined', () => {
      // `Number & {n | n > 0}` — the base `Number` is already a
      // primitive, so simplify is a no-op. The point of this test is
      // to assert the simplified output's structure still reflects the
      // refinement.
      const t = parseTypeAnnotation('Number & {n | n > 0}')
      const s = simplify(t)
      if (s.tag !== 'Refined') throw new Error('expected Refined')
      expect(typeEquals(s.base, NumberType)).toBe(true)
    })
  })

  describe('isSubtype fold-discharge (Phase 2.3 policy)', () => {
    it('discharges a positive literal against `Positive`', () => {
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      const five = parseTypeAnnotation('5')
      expect(isSubtype(five, pos)).toBe(true)
    })

    it('rejects a negative literal against `Positive`', () => {
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      const negFive = parseTypeAnnotation('-5')
      expect(isSubtype(negFive, pos)).toBe(false)
    })

    it('discharges a non-empty string via `count(s) > 0`', () => {
      const nonEmpty = parseTypeAnnotation('String & {s | count(s) > 0}')
      const value = parseTypeAnnotation('"hello"')
      expect(isSubtype(value, nonEmpty)).toBe(true)
    })

    it('rejects an empty string via `count(s) > 0`', () => {
      const nonEmpty = parseTypeAnnotation('String & {s | count(s) > 0}')
      const value = parseTypeAnnotation('""')
      expect(isSubtype(value, nonEmpty)).toBe(false)
    })

    it('substitutes every operand in conjunctions before folding', () => {
      const bounded = parseTypeAnnotation('Number & {n | n < 0 && n < 10}')
      const value = parseTypeAnnotation('5')
      expect(isSubtype(value, bounded)).toBe(false)
    })

    it('substitutes every operand in disjunctions before folding', () => {
      const impossible = parseTypeAnnotation('Number & {n | n < 0 || n > 10}')
      const value = parseTypeAnnotation('5')
      expect(isSubtype(value, impossible)).toBe(false)
    })

    it('handles deeply nested predicates without recursive substitution overflow', () => {
      const falseLeaf = relation('>', binderRef('n'), numLiteral(10))
      let predicate = falseLeaf
      for (let index = 0; index < 12_000; index++) {
        predicate = [NodeTypes.And, [falseLeaf, predicate], 0] as unknown as AstNode
      }
      const target: Type = {
        tag: 'Refined',
        base: NumberType,
        binder: 'n',
        predicate,
        source: 'n | deeply nested false conjunction',
      }
      const value = parseTypeAnnotation('5')
      expect(() => isSubtype(value, target)).not.toThrow()
      expect(isSubtype(value, target)).toBe(false)
    })

    it('refinement on the left is equivalent to its base: `Positive <: Number`', () => {
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      expect(isSubtype(pos, NumberType)).toBe(true)
    })

    it('disproves a broader refined source against a narrower refined target', () => {
      const positive = parseTypeAnnotation('Number & {n | n > 0}')
      const smallPositive = parseTypeAnnotation('Number & {n | n > 0 && n < 10}')
      expect(isSubtype(positive, smallPositive)).toBe(false)
    })

    it('non-literal sources still pass through to the base', () => {
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      expect(isSubtype(NumberType, pos)).toBe(true)
    })

    it('pass-through does not change base-level mismatches: `"hi"` not subtype of `Positive`', () => {
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      const str = parseTypeAnnotation('"hi"')
      expect(isSubtype(str, pos)).toBe(false)
    })
  })

  describe('end-to-end: `let x: Refinement = value`', () => {
    const dvala = createDvala()

    it('accepts a literal value that satisfies the predicate', () => {
      const result = dvala.typecheck('let x: Number & {n | n > 0} = 5; x')
      expect(result.diagnostics).toHaveLength(0)
    })

    it('rejects a literal value that violates the predicate', () => {
      const result = dvala.typecheck('let x: Number & {n | n > 0} = -5; x')
      expect(result.diagnostics.length).toBeGreaterThan(0)
      expect(result.diagnostics[0]!.message).toContain('n | n > 0')
    })

    it('rejects a literal value that violates the base', () => {
      const result = dvala.typecheck('let x: Number & {n | n > 0} = "hi"; x')
      expect(result.diagnostics.length).toBeGreaterThan(0)
      // Base mismatches still fail before any predicate-fold attempt.
      expect(result.diagnostics[0]!.message).toMatch(/not a subtype of Number/)
    })

    it('refined type in a function parameter composes with `+`', () => {
      // `f(5)` with `f: (Number & {n | n > 0}) -> Number` should pass
      // — the refinement is transparent to the Number-level arithmetic.
      const result = dvala.typecheck(
        'let f = (x: Number & {n | n > 0}): Number -> x + 1; f(5)',
      )
      expect(result.diagnostics).toHaveLength(0)
    })

    // Regression: `freshenAllVars` must recurse into `Refined.base` so a
    // generic refined type alias instantiated at two different call
    // sites doesn't share a stale un-freshened TypeVar. Without the
    // `Refined` case in `freshenAllVars`, both calls would unify their
    // args against the same Var in the alias's base, so the second
    // call's concrete type would clobber the first's — manifesting as
    // a false "type mismatch" on the later call.
    it('generic refined alias freshens independently at each call site', () => {
      const result = dvala.typecheck(`
        type Positive<T> = T & {n | n > 0};
        let f = (x: Positive<Number>): Number -> x;
        let g = (x: Positive<Integer>): Integer -> x;
        [f(5), g(10)]
      `)
      expect(result.diagnostics).toHaveLength(0)
    })

    it('generic refined alias call-sites don\'t share stale base vars', () => {
      // Companion to the previous test — two direct calls to the same
      // generic-refined `f` where the second would inherit the first's
      // unification if freshenAllVars missed the Refined case.
      const result = dvala.typecheck(`
        type NonEmpty<T> = T & {s | count(s) > 0};
        let len = (xs: NonEmpty<String>): Integer -> count(xs);
        [len("hi"), len("world")]
      `)
      expect(result.diagnostics).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Phase 2.2 — multi-refinement merging
  // ---------------------------------------------------------------------------
  //
  // `simplify` collapses `Refined(Refined(B, s1, P), s2, Q)` into
  // `Refined(B, s1, P && Q[s2 := s1])`. Properties to pin:
  //   - Shape collapses to a single Refined (one level deep).
  //   - Inner binder wins; outer predicate's binder is alpha-renamed.
  //   - Alpha-renaming doesn't touch string literals with the same text.
  //   - Chains flatten to a single `And` node (no right-skewed nesting).
  //   - Already-matching binders skip the rename fast-path.
  describe('Phase 2.2 — multi-refinement merging', () => {
    it('merges two nested refinements with the same binder', () => {
      const t = parseTypeAnnotation('Number & {n | n > 0} & {n | n < 100}')
      const s = simplify(t)
      expect(s.tag).toBe('Refined')
      if (s.tag !== 'Refined') return
      // Merged: the base should be Number directly, not another Refined.
      expect(typeEquals(s.base, NumberType)).toBe(true)
      expect(s.binder).toBe('n')
      // Source reflects both predicates.
      expect(s.source).toContain('n > 0')
      expect(s.source).toContain('n < 100')
    })

    it('merges with alpha-rename when binders differ', () => {
      // Inner binder `n` wins. Outer predicate `x < 100` becomes `n < 100`.
      const t = parseTypeAnnotation('Number & {n | n > 0} & {x | x < 100}')
      const s = simplify(t)
      expect(s.tag).toBe('Refined')
      if (s.tag !== 'Refined') return
      expect(s.binder).toBe('n')
      // The merged body should contain BOTH the original predicate (with `n`)
      // AND the renamed predicate (with `n`, not `x`).
      expect(s.source).toContain('n > 0')
      expect(s.source).toContain('n < 100')
      expect(s.source).not.toContain('x')
    })

    it('flattens chains of three refinements into a single Refined', () => {
      const t = parseTypeAnnotation('Number & {n | n > 0} & {n | n < 100} & {n | n != 50}')
      const s = simplify(t)
      expect(s.tag).toBe('Refined')
      if (s.tag !== 'Refined') return
      // After the chain collapses, the base is the primitive; no nested Refined.
      expect(typeEquals(s.base, NumberType)).toBe(true)
      // All three predicate bodies appear in the merged source.
      expect(s.source).toContain('n > 0')
      expect(s.source).toContain('n < 100')
      expect(s.source).toContain('n != 50')
    })

    it('preserves the base when the single-refinement case hits simplify', () => {
      // Regression: simplify on a single Refined (no nested Refined inside)
      // must pass through without mangling the base.
      const t = parseTypeAnnotation('Number & {n | n > 0}')
      const s = simplify(t)
      expect(s.tag).toBe('Refined')
      if (s.tag !== 'Refined') return
      expect(typeEquals(s.base, NumberType)).toBe(true)
      expect(s.source).toBe('n | n > 0')
    })

    it('merged refinement typechecks the same as the unmerged form', () => {
      // End-to-end sanity: a program using `Number & {n|n>0} & {n|n<100}`
      // should accept 50 and reject (base-mismatch) "hi", same as the
      // unmerged form would have. Phase 2.1 pass-through holds post-merge.
      const dvala = createDvala()
      expect(dvala.typecheck('let x: Number & {n | n > 0} & {n | n < 100} = 50; x').diagnostics)
        .toHaveLength(0)
      expect(dvala.typecheck('let x: Number & {n | n > 0} & {n | n < 100} = "hi"; x').diagnostics.length)
        .toBeGreaterThan(0)
    })

    it('string-literal content that happens to match the binder name is not renamed', () => {
      // The merger uses AST-based rename (not textual regex) so a string
      // literal like `"x"` inside one predicate stays intact when the
      // binder is `x`. Regression guard for the pathological case the
      // design doc flagged for Phase 2.2.
      const t = parseTypeAnnotation('String & {s | s == "n"} & {n | n != "other"}')
      const result = simplify(t)
      expect(result.tag).toBe('Refined')
      if (result.tag !== 'Refined') return
      // The literal `"n"` from the first predicate must survive the
      // rename of binder `n` in the second predicate.
      expect(result.source).toContain('"n"')
    })

    it('count-predicate round-trips through prettyPrint during merge', () => {
      // The merged source is reconstructed via prettyPrint on the new
      // AST. `count(binder)` is a Call whose callee is a Builtin — cover
      // its specific shape to pin that prettyPrint round-trips it
      // correctly rather than stripping or mangling the builtin name.
      const t = parseTypeAnnotation('String & {s | count(s) > 0} & {s | count(s) < 100}')
      const result = simplify(t)
      expect(result.tag).toBe('Refined')
      if (result.tag !== 'Refined') return
      expect(result.source).toContain('count(s) > 0')
      expect(result.source).toContain('count(s) < 100')
    })

    it('preserves `Or` nodes inside a merged And', () => {
      // Only `And` gets flattened by the merger; `Or` stays as a single
      // operand of the outer conjunction. Regression guard: the
      // `||` must appear unchanged in the merged source.
      const t = parseTypeAnnotation('Number & {n | n > 0 || n == -1} & {n | n < 100}')
      const result = simplify(t)
      expect(result.tag).toBe('Refined')
      if (result.tag !== 'Refined') return
      expect(result.source).toContain('||')
      expect(result.source).toContain('n < 100')
    })

    it('merges through a Union base', () => {
      // The base of the inner Refined can be anything, not just a
      // primitive. Verify merging still works (the base is extracted
      // correctly and the predicates conjoin) when the base is a Union.
      const t = parseTypeAnnotation('(Number | String) & {x | isNumber(x)} & {x | !isString(x)}')
      const result = simplify(t)
      expect(result.tag).toBe('Refined')
      if (result.tag !== 'Refined') return
      // Both predicates appear in the merged source.
      expect(result.source).toContain('isNumber(x)')
      expect(result.source).toContain('isString(x)')
      // The base is the union (simplified — exact tag isn't the point;
      // what matters is it's NOT a Refined, so merging completed).
      expect(result.base.tag).not.toBe('Refined')
    })

    it('merge-order affects `typeEquals` (known limitation for Phase 2.1/2.2)', () => {
      // typeEquals uses source-text equality (line-level comment in
      // types.ts). After merging, two semantically equivalent but
      // differently-ordered inputs produce source strings with
      // swapped `&&` operands. They compare as distinct. This is a
      // documented limitation — alpha-aware and commutative-aware
      // equality is Phase 2.3+'s job (the solver ships with
      // normalisation that will resolve this). The test pins the
      // current behaviour so the flip to `true` is visible when it
      // happens.
      const a = simplify(parseTypeAnnotation('Number & {n | n > 0} & {n | n < 100}'))
      const b = simplify(parseTypeAnnotation('Number & {n | n < 100} & {n | n > 0}'))
      expect(typeEquals(a, b)).toBe(false)
    })
  })

  describe('walker direct-call sanity', () => {
    it('expandTypeForDisplay passes through Refined', () => {
      // Direct unit test for the `expandTypeForDisplay(Refined)` case.
      // Uses a concrete base so the output is deterministic; the point
      // is to confirm the walker recurses into the base and preserves
      // the predicate + source metadata.
      const t = parseTypeAnnotation('Number & {n | n > 0}')
      const expanded = expandTypeForDisplay(t)
      expect(expanded.tag).toBe('Refined')
      if (expanded.tag !== 'Refined') throw new Error('expected Refined')
      expect(expanded.source).toContain('n > 0')
      expect(typeEquals(expanded.base, NumberType)).toBe(true)
    })
  })

  describe('Phase 2.4 — interval and finite-domain solver', () => {
    it('proves refined interval containment', () => {
      const positive = parseTypeAnnotation('Integer & {n | n > 0}')
      const nonNegative = parseTypeAnnotation('Integer & {n | n >= 0}')
      expect(isSubtype(positive, nonNegative)).toBe(true)
    })

    it('proves interval containment when the binder appears on the right-hand side', () => {
      const score = parseTypeAnnotation('Integer & {n | 0 <= n && n <= 100}')
      const nonNegative = parseTypeAnnotation('Integer & {n | n >= 0}')
      expect(isSubtype(score, nonNegative)).toBe(true)
    })

    it('disproves refined interval containment when the source is wider', () => {
      const score = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 100}')
      const small = parseTypeAnnotation('Integer & {n | n >= 0 && n < 10}')
      expect(isSubtype(score, small)).toBe(false)
    })

    it('proves interval targets conjoined with an excluded numeric literal', () => {
      const zero = parseTypeAnnotation('Integer & {n | n == 0}')
      const nonNegativeNotOne = parseTypeAnnotation('Integer & {n | n >= 0 && n != 1}')
      expect(isSubtype(zero, nonNegativeNotOne)).toBe(true)
    })

    it('proves positive number intervals against excluded-zero targets', () => {
      const positive = parseTypeAnnotation('Number & {n | n > 0}')
      const nonZero = parseTypeAnnotation('Number & {n | n != 0}')
      expect(isSubtype(positive, nonZero)).toBe(true)
    })

    it('disproves non-negative number intervals against excluded-zero targets', () => {
      const nonNegative = parseTypeAnnotation('Number & {n | n >= 0}')
      const nonZero = parseTypeAnnotation('Number & {n | n != 0}')
      expect(isSubtype(nonNegative, nonZero)).toBe(false)
    })

    it('produces excluded-zero witnesses for non-negative number intervals', () => {
      const source = parseTypeAnnotation('Number & {n | n >= 0}')
      const target = parseTypeAnnotation('Number & {n | n != 0}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('0')
    })

    it('proves number interval-exclusion sources against matching excluded-value targets', () => {
      const nonNegativeExceptOne = parseTypeAnnotation('Number & {n | n >= 0 && n <= 2 && n != 1}')
      const notOne = parseTypeAnnotation('Number & {n | n != 1}')
      expect(isSubtype(nonNegativeExceptOne, notOne)).toBe(true)
    })

    it('disproves number interval-exclusion sources against excluded-value targets', () => {
      const nonNegativeExceptOne = parseTypeAnnotation('Number & {n | n >= 0 && n <= 2 && n != 1}')
      const notTwo = parseTypeAnnotation('Number & {n | n != 2}')
      expect(isSubtype(nonNegativeExceptOne, notTwo)).toBe(false)
    })

    it('produces excluded-value witnesses for number interval-exclusion sources', () => {
      const source = parseTypeAnnotation('Number & {n | n >= 0 && n <= 2 && n != 1}')
      const target = parseTypeAnnotation('Number & {n | n != 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('2')
    })

    it('treats integer open intervals as discrete integer domains', () => {
      const singletonOne = parseTypeAnnotation('Integer & {n | n > 0 && n < 2}')
      const exactlyOne = parseTypeAnnotation('Integer & {n | n == 1}')
      expect(isSubtype(singletonOne, exactlyOne)).toBe(true)
    })

    it('disproves interval targets conjoined with an excluded numeric literal', () => {
      const zeroOrOne = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 1}')
      const nonNegativeNotOne = parseTypeAnnotation('Integer & {n | n >= 0 && n != 1}')
      expect(isSubtype(zeroOrOne, nonNegativeNotOne)).toBe(false)
    })

    it('produces integer witnesses for disproved integer intervals', () => {
      const source = parseTypeAnnotation('Integer & {n | n > 0 && n < 3}')
      const target = parseTypeAnnotation('Integer & {n | n == 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('1')
    })

    it('disproves integer interval sources against excluded-value targets', () => {
      const zeroToTwo = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 2}')
      const notOne = parseTypeAnnotation('Integer & {n | n != 1}')
      expect(isSubtype(zeroToTwo, notOne)).toBe(false)
    })

    it('produces excluded-value witnesses for integer interval sources', () => {
      const source = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 2}')
      const target = parseTypeAnnotation('Integer & {n | n != 1}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('1')
    })

    it('proves tiny integer interval-exclusion sources against finite set targets', () => {
      const zeroOrTwo = parseTypeAnnotation('Integer & {n | n == 0 || n == 2}')
      const nonNegativeExceptOne = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 2 && n != 1}')
      expect(isSubtype(nonNegativeExceptOne, zeroOrTwo)).toBe(true)
    })

    it('proves integer interval-exclusion sources against matching excluded-value targets', () => {
      const nonNegativeExceptOne = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 2 && n != 1}')
      const notOne = parseTypeAnnotation('Integer & {n | n != 1}')
      expect(isSubtype(nonNegativeExceptOne, notOne)).toBe(true)
    })

    it('disproves tiny integer interval-exclusion sources against narrower finite set targets', () => {
      const onlyZero = parseTypeAnnotation('Integer & {n | n == 0}')
      const nonNegativeExceptOne = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 2 && n != 1}')
      expect(isSubtype(nonNegativeExceptOne, onlyZero)).toBe(false)
    })

    it('disproves integer interval-exclusion sources against excluded-value targets', () => {
      const nonNegativeExceptOne = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 2 && n != 1}')
      const notTwo = parseTypeAnnotation('Integer & {n | n != 2}')
      expect(isSubtype(nonNegativeExceptOne, notTwo)).toBe(false)
    })

    it('produces excluded-value witnesses for integer interval-exclusion sources', () => {
      const source = parseTypeAnnotation('Integer & {n | n >= 0 && n <= 2 && n != 1}')
      const target = parseTypeAnnotation('Integer & {n | n != 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('2')
    })

    it('proves finite-domain containment for atom refinements', () => {
      const ok = parseTypeAnnotation('Atom & {x | x == :ok}')
      const okOrError = parseTypeAnnotation('Atom & {x | x == :ok || x == :error}')
      expect(isSubtype(ok, okOrError)).toBe(true)
    })

    it('proves finite literal string domains against a != target', () => {
      const okOrWarn = parseTypeAnnotation('String & {s | s == "ok" || s == "warn"}')
      const notError = parseTypeAnnotation('String & {s | s != "error"}')
      expect(isSubtype(okOrWarn, notError)).toBe(true)
    })

    it('disproves finite-domain containment for atom refinements', () => {
      const okOrError = parseTypeAnnotation('Atom & {x | x == :ok || x == :error}')
      const ok = parseTypeAnnotation('Atom & {x | x == :ok}')
      expect(isSubtype(okOrError, ok)).toBe(false)
    })

    it('disproves finite literal string domains against a != target', () => {
      const okOrError = parseTypeAnnotation('String & {s | s == "ok" || s == "error"}')
      const notError = parseTypeAnnotation('String & {s | s != "error"}')
      expect(isSubtype(okOrError, notError)).toBe(false)
    })

    it('disproves excluded string sources against finite literal string targets', () => {
      const notError = parseTypeAnnotation('String & {s | s != "error"}')
      const okOrWarn = parseTypeAnnotation('String & {s | s == "ok" || s == "warn"}')
      expect(isSubtype(notError, okOrWarn)).toBe(false)
    })

    it('produces readable string witnesses for excluded string sources', () => {
      const source = parseTypeAnnotation('String & {s | s != "error"}')
      const target = parseTypeAnnotation('String & {s | s == "ok" || s == "warn"}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('"a"')
    })

    it('produces target-exclusion witnesses for excluded string sources', () => {
      const source = parseTypeAnnotation('String & {s | s != "error"}')
      const target = parseTypeAnnotation('String & {s | s != "warn"}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('"warn"')
    })

    it('disproves excluded boolean sources against finite boolean targets', () => {
      const notFalse = parseTypeAnnotation('Boolean & {b | b != false}')
      const falseOnly = parseTypeAnnotation('Boolean & {b | b == false}')
      expect(isSubtype(notFalse, falseOnly)).toBe(false)
    })

    it('produces boolean witnesses for excluded boolean sources', () => {
      const source = parseTypeAnnotation('Boolean & {b | b != false}')
      const target = parseTypeAnnotation('Boolean & {b | b == false}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('true')
    })

    it('produces target-exclusion witnesses for excluded boolean sources', () => {
      const source = parseTypeAnnotation('Boolean & {b | b != false}')
      const target = parseTypeAnnotation('Boolean & {b | b != true}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('true')
    })

    it('disproves excluded atom sources against finite atom targets', () => {
      const notError = parseTypeAnnotation('Atom & {x | x != :error}')
      const okOrWarn = parseTypeAnnotation('Atom & {x | x == :ok || x == :warn}')
      expect(isSubtype(notError, okOrWarn)).toBe(false)
    })

    it('produces atom witnesses for excluded atom sources', () => {
      const source = parseTypeAnnotation('Atom & {x | x != :error}')
      const target = parseTypeAnnotation('Atom & {x | x == :ok || x == :warn}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe(':other')
    })

    it('produces target-exclusion witnesses for excluded atom sources', () => {
      const source = parseTypeAnnotation('Atom & {x | x != :error}')
      const target = parseTypeAnnotation('Atom & {x | x != :warn}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe(':warn')
    })

    it('disproves excluded numeric sources against finite numeric targets', () => {
      const notOne = parseTypeAnnotation('Number & {n | n != 1}')
      const zeroOrTwo = parseTypeAnnotation('Number & {n | n == 0 || n == 2}')
      expect(isSubtype(notOne, zeroOrTwo)).toBe(false)
    })

    it('produces numeric witnesses for excluded numeric sources', () => {
      const source = parseTypeAnnotation('Number & {n | n != 1}')
      const target = parseTypeAnnotation('Number & {n | n == 0 || n == 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('-1')
    })

    it('disproves count interval-exclusion sources against excluded-count targets', () => {
      const boundedExceptOne = parseTypeAnnotation('String & {s | count(s) >= 0 && count(s) <= 2 && count(s) != 1}')
      const notTwo = parseTypeAnnotation('String & {s | count(s) != 2}')
      expect(isSubtype(boundedExceptOne, notTwo)).toBe(false)
    })

    it('produces excluded-count witnesses for count interval-exclusion sources', () => {
      const source = parseTypeAnnotation('String & {s | count(s) >= 0 && count(s) <= 2 && count(s) != 1}')
      const target = parseTypeAnnotation('String & {s | count(s) != 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('2')
    })

    it('disproves count interval sources against excluded-count targets', () => {
      const zeroToTwo = parseTypeAnnotation('String & {s | count(s) >= 0 && count(s) <= 2}')
      const notOne = parseTypeAnnotation('String & {s | count(s) != 1}')
      expect(isSubtype(zeroToTwo, notOne)).toBe(false)
    })

    it('produces excluded-count witnesses for count interval sources', () => {
      const source = parseTypeAnnotation('String & {s | count(s) >= 0 && count(s) <= 2}')
      const target = parseTypeAnnotation('String & {s | count(s) != 1}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('1')
    })

    it('produces target-exclusion witnesses for excluded numeric sources', () => {
      const source = parseTypeAnnotation('Number & {n | n != 1}')
      const target = parseTypeAnnotation('Number & {n | n != 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('2')
    })

    it('disproves excluded numeric sources against interval-exclusion targets', () => {
      const notOne = parseTypeAnnotation('Number & {n | n != 1}')
      const positiveNotTwo = parseTypeAnnotation('Number & {n | n > 0 && n != 2}')
      expect(isSubtype(notOne, positiveNotTwo)).toBe(false)
    })

    it('produces witnesses for excluded numeric sources against interval-exclusion targets', () => {
      const source = parseTypeAnnotation('Number & {n | n != 1}')
      const target = parseTypeAnnotation('Number & {n | n > 0 && n != 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('0')
    })

    it('disproves excluded count sources against finite count targets', () => {
      const notOne = parseTypeAnnotation('String & {s | count(s) != 1}')
      const zeroOrTwo = parseTypeAnnotation('String & {s | count(s) == 0 || count(s) == 2}')
      expect(isSubtype(notOne, zeroOrTwo)).toBe(false)
    })

    it('produces non-negative count witnesses for excluded count sources', () => {
      const source = parseTypeAnnotation('String & {s | count(s) != 1}')
      const target = parseTypeAnnotation('String & {s | count(s) == 0 || count(s) == 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('3')
    })

    it('produces target-exclusion witnesses for excluded count sources', () => {
      const source = parseTypeAnnotation('String & {s | count(s) != 1}')
      const target = parseTypeAnnotation('String & {s | count(s) != 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('2')
    })

    it('disproves excluded count sources against interval-exclusion targets', () => {
      const notOne = parseTypeAnnotation('String & {s | count(s) != 1}')
      const positiveNotTwo = parseTypeAnnotation('String & {s | count(s) > 0 && count(s) != 2}')
      expect(isSubtype(notOne, positiveNotTwo)).toBe(false)
    })

    it('produces count witnesses against interval-exclusion targets', () => {
      const source = parseTypeAnnotation('String & {s | count(s) != 1}')
      const target = parseTypeAnnotation('String & {s | count(s) > 0 && count(s) != 2}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('0')
    })

    it('proves count-interval containment for refined strings', () => {
      const atLeastThree = parseTypeAnnotation('String & {s | count(s) >= 3}')
      const nonEmpty = parseTypeAnnotation('String & {s | count(s) > 0}')
      expect(isSubtype(atLeastThree, nonEmpty)).toBe(true)
    })

    it('proves positive count intervals against excluded-zero count targets', () => {
      const nonEmpty = parseTypeAnnotation('String & {s | count(s) > 0}')
      const notEmpty = parseTypeAnnotation('String & {s | count(s) != 0}')
      expect(isSubtype(nonEmpty, notEmpty)).toBe(true)
    })

    it('disproves non-negative count intervals against excluded-zero count targets', () => {
      const nonNegative = parseTypeAnnotation('String & {s | count(s) >= 0}')
      const notEmpty = parseTypeAnnotation('String & {s | count(s) != 0}')
      expect(isSubtype(nonNegative, notEmpty)).toBe(false)
    })

    it('produces excluded-zero count witnesses for non-negative count intervals', () => {
      const source = parseTypeAnnotation('String & {s | count(s) >= 0}')
      const target = parseTypeAnnotation('String & {s | count(s) != 0}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('0')
    })

    it('proves tiny finite count domains against set-valued count targets', () => {
      const zeroOrTwo = parseTypeAnnotation('String & {s | count(s) == 0 || count(s) == 2}')
      const boundedExceptOne = parseTypeAnnotation('String & {s | count(s) >= 0 && count(s) <= 2 && count(s) != 1}')
      expect(isSubtype(boundedExceptOne, zeroOrTwo)).toBe(true)
    })

    it('proves count interval-exclusion sources against matching excluded-count targets', () => {
      const boundedExceptOne = parseTypeAnnotation('String & {s | count(s) >= 0 && count(s) <= 2 && count(s) != 1}')
      const notOne = parseTypeAnnotation('String & {s | count(s) != 1}')
      expect(isSubtype(boundedExceptOne, notOne)).toBe(true)
    })

    it('disproves tiny finite count domains against narrower count targets', () => {
      const zeroOnly = parseTypeAnnotation('String & {s | count(s) == 0}')
      const boundedExceptOne = parseTypeAnnotation('String & {s | count(s) >= 0 && count(s) <= 2 && count(s) != 1}')
      expect(isSubtype(boundedExceptOne, zeroOnly)).toBe(false)
    })

    it('produces count witnesses for disproved tiny count domains', () => {
      const source = parseTypeAnnotation('String & {s | count(s) >= 0 && count(s) <= 2 && count(s) != 1}')
      const target = parseTypeAnnotation('String & {s | count(s) == 0}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(source, target)
      expect(verdict.tag).toBe('Disproved')
      if (verdict.tag !== 'Disproved') return
      expect(typeToString(verdict.witness)).toBe('2')
    })

    it('proves count-interval containment when count(binder) appears on the right-hand side', () => {
      const nonEmpty = parseTypeAnnotation('String & {s | 0 < count(s)}')
      const hasRoom = parseTypeAnnotation('String & {s | count(s) >= 1}')
      expect(isSubtype(nonEmpty, hasRoom)).toBe(true)
    })

  })

  // ---------------------------------------------------------------------------
  // Phase 2.4 — `OutOfFragment` boundary
  // ---------------------------------------------------------------------------
  //
  // The solver returns one of `Proved | Disproved | OutOfFragment`. Tests
  // above pin the first two; this block pins the third. The boundary
  // matters because a "fix" that flips one of these cases to Proved or
  // Disproved without consciously extending the solver scope would silently
  // change semantics — these tests fail the moment that happens, prompting
  // an explicit decision.
  //
  // When the solver returns `OutOfFragment`, the subtype check falls through
  // to inert pass-through (returns `true`). So at the `isSubtype` level the
  // user-visible effect is "accepted-without-actually-checking" — soundness
  // depends on the base check that ran earlier.
  describe('Phase 2.4 — OutOfFragment cases', () => {
    it('interval || interval bails — `n > 10 || n < -5`', () => {
      // Disjunction of two intervals can't be expressed as a single
      // interval domain, so unionDomains returns null and the solver
      // bails. Subtype passes through to `true` (the base check already
      // ran). Testing via direct solver call so we assert on the verdict.
      const target = parseTypeAnnotation('Number & {n | n > 10 || n < -5}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(NumberType, target)
      expect(verdict.tag).toBe('OutOfFragment')
    })

    it('mixed-subject conjunction bails — `n > 0 && count(n) < 5`', () => {
      // Inner conjunction mixes `self` (binder) and `count(binder)` —
      // domain abstraction tracks one subject per domain, so the
      // intersection can't combine them. Bails to OutOfFragment.
      // Note: this only matters if the predicate parses; today it's
      // accepted by the fragment-checker because each conjunct is
      // independently valid.
      const target = parseTypeAnnotation('String & {s | count(s) > 0 && s == "x"}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(StringType, target)
      expect(verdict.tag).toBe('OutOfFragment')
    })

    it('non-Refined source against Refined target without analyzable domain bails', () => {
      // `Number <: Refined(Number, n, n > 0)` — source is the bare
      // primitive `Number`, no domain to extract from. Solver bails.
      // The subtype check falls through to inert pass-through (returns
      // `true`); we assert on the solver's verdict directly so the
      // bail path itself is pinned.
      const target = parseTypeAnnotation('Number & {n | n > 0}')
      if (target.tag !== 'Refined') throw new Error('expected Refined')
      const verdict = solveRefinedSubtype(NumberType, target)
      expect(verdict.tag).toBe('OutOfFragment')
    })

    it('isSubtype falls through to true when the solver bails', () => {
      // End-to-end pin: when the solver bails, the user-visible behavior
      // is the inert pass-through accept (because base subtyping already
      // succeeded). This is a deliberate Phase 2.3 choice — Phase 2.4+
      // can flip these to false as the solver scope expands.
      const target = parseTypeAnnotation('Number & {n | n > 0 || n < -5}')
      // Number itself, when checked against an OutOfFragment target,
      // passes via inert pass-through (base check `Number <: Number`
      // succeeds, then solver bail → return true).
      expect(isSubtype(NumberType, target)).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Refinement types — Phase 2.5a (block-level `assert(P)` narrowing)
// ---------------------------------------------------------------------------
//
// Design: design/active/2026-04-23_refinement-types.md, Phase 2.5
// (line 689). When a `do` block walker sees `assert(P)`, treat the
// predicate `P` as an assumed fact for subsequent statements in the
// block by wrapping the referenced variable's type in a `Refined`
// node. Subsequent subtype checks against refined targets get the
// solver's machinery for free (no API change to the solver itself).
//
// Scope of these tests:
//   - the narrowing applies after a successful `assert(P)`
//   - it persists for the rest of the same block
//   - it's gated on Phase 1 fragment eligibility (out-of-fragment
//     predicates fall back to runtime-only behaviour without erroring)
//   - it requires exactly one free variable in `P` (multi-variable
//     reasoning is Phase 3)
//   - it composes with itself (multiple asserts narrow incrementally)
// ---------------------------------------------------------------------------

describe('refinement types — Phase 2.5a (assert narrowing)', () => {
  const dvala = createDvala()

  // The Phase 2.3 solver bails to inert "accept" when it can't extract
  // a domain from a bare-primitive source (e.g. checking `Number` against
  // `Number & P`). That makes downstream subtype checks an unreliable
  // observable for narrowing — both narrowed and un-narrowed sources
  // pass inertly, so the diagnostic stream looks the same.
  //
  // Phase 2.5a's contract is structural: AFTER an `assert(P)` statement,
  // the env's binding for the asserted variable is a `Refined` type
  // wrapping the variable's pre-assert type. We pin this directly via
  // `typeMap` inspection: a post-assert reference to the variable
  // resolves through env to the Refined type, and the typechecker
  // records that resolved type at the reference's node id.
  //
  // Test helper: parse + typecheck, then return the type recorded for
  // the last expression in the body. Tests place a bare reference (`x`
  // / `y`) as the trailing expression so its inferred type — pulled
  // from the env at lookup time — is the observable.

  /**
   * Return any `Refined` type recorded in the typeMap for this source.
   * Phase 2.5a only places Refined types via the assert-narrow path
   * (Phase 1 erases predicates from non-narrowed annotations until
   * the parser writes them as Refined too — but no other code in the
   * test fixtures triggers that), so finding *any* Refined in the
   * typeMap is a reliable proxy for "narrowing happened".
   */
  function findRefinedInTypeMap(source: string): Extract<Type, { tag: 'Refined' }> | undefined {
    const result = dvala.typecheck(source)
    for (const t of result.typeMap.values()) {
      if (t.tag === 'Refined') return t
    }
    return undefined
  }

  function countRefinedInTypeMap(source: string): number {
    const result = dvala.typecheck(source)
    let n = 0
    for (const t of result.typeMap.values()) {
      if (t.tag === 'Refined') n++
    }
    return n
  }

  describe('basic narrowing', () => {
    it('after `assert(x > 0)`, a subsequent reference to x has Refined type', () => {
      const t = findRefinedInTypeMap(`
        let test = (x: Number): Number -> do
          assert(x > 0);
          x
        end
      `)
      expect(t).toBeDefined()
      if (!t) return
      expect(t.binder).toBe('x')
      expect(t.source).toContain('x > 0')
    })

    it('without an assert, no Refined type appears in the typeMap', () => {
      expect(countRefinedInTypeMap(`
        let test = (x: Number): Number -> do
          x
        end
      `)).toBe(0)
    })
  })

  describe('compound predicates', () => {
    it('top-level `&&` lands in the Refined source string', () => {
      const t = findRefinedInTypeMap(`
        let test = (x: Number): Number -> do
          assert(x > 0 && x < 100);
          x
        end
      `)
      expect(t).toBeDefined()
      if (!t) return
      // prettyPrint of `x > 0 && x < 100` yields a body that contains
      // both relations; binder prefix added.
      expect(t.source).toContain('x > 0')
      expect(t.source).toContain('x < 100')
    })

    it('multi-variable predicate (`x > y`) does NOT narrow', () => {
      // Two free symbols → outside Phase 2.5a's single-symbol scope.
      expect(countRefinedInTypeMap(`
        let test = (x: Number, y: Number): Number -> do
          assert(x > y);
          x
        end
      `)).toBe(0)
    })
  })

  describe('fragment gating', () => {
    it('arithmetic in the predicate (`x + 1 > 1`) does NOT narrow', () => {
      // Out of the Phase 1 accept list — fragment-checker rejects
      // arithmetic on the binder. Runtime `assert` still works; no
      // static narrowing applies.
      expect(countRefinedInTypeMap(`
        let test = (x: Number): Number -> do
          assert(x + 1 > 1);
          x
        end
      `)).toBe(0)
    })

    it('a literal predicate (`assert(true)`) is a no-op for narrowing', () => {
      expect(countRefinedInTypeMap(`
        let test = (x: Number): Number -> do
          assert(true);
          x
        end
      `)).toBe(0)
    })
  })

  describe('composition', () => {
    it('two asserts on the same variable both contribute to the narrowing', () => {
      // Multiple Refined types end up in the typeMap (one per
      // post-assert reference). We want the OUTER one — the
      // doubly-wrapped result, with the second assert's predicate at
      // the top and the first nested one level down.
      const result = dvala.typecheck(`
        let test = (x: Number): Number -> do
          assert(x > 0);
          assert(x < 100);
          x
        end
      `)
      // Pick the Refined whose .base is itself Refined — that's the
      // composed result we're after.
      let outer: Extract<Type, { tag: 'Refined' }> | undefined
      for (const t of result.typeMap.values()) {
        if (t.tag === 'Refined' && t.base.tag === 'Refined') {
          outer = t
          break
        }
      }
      expect(outer).toBeDefined()
      if (!outer) return
      expect(outer.source).toContain('x < 100')
      if (outer.base.tag !== 'Refined') return
      expect(outer.base.source).toContain('x > 0')
    })
  })

  describe('shadowing', () => {
    it('user-shadowed `assert` does NOT trigger narrowing', () => {
      // A locally-bound `assert` may not throw on falsy. Conservative:
      // skip narrowing entirely.
      expect(countRefinedInTypeMap(`
        let test = (x: Number): Number -> do
          let assert = (b: Boolean): Boolean -> b;
          assert(x > 0);
          x
        end
      `)).toBe(0)
    })
  })
})

function binderRef(name: string): AstNode {
  return [NodeTypes.Sym, name, 0] as unknown as AstNode
}

function builtinRef(name: string): AstNode {
  return [NodeTypes.Builtin, name, 0] as unknown as AstNode
}

function numLiteral(value: number): AstNode {
  return [NodeTypes.Num, value, 0] as unknown as AstNode
}

function relation(name: string, left: AstNode, right: AstNode): AstNode {
  return [NodeTypes.Call, [builtinRef(name), [left, right], null], 0] as unknown as AstNode
}
