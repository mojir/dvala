import { beforeAll, describe, expect, it } from 'vitest'
import { builtin } from '../builtin'
import { createDvala } from '../createDvala'
import { initBuiltinTypes } from './builtinTypes'
import { expandTypeForDisplay } from './infer'
import { parseTypeAnnotation, RefinementError, TypeParseError } from './parseType'
import { simplify } from './simplify'
import { isSubtype } from './subtype'
import { NumberType, StringType, typeEquals, typeToString } from './types'

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
//   - `isSubtype` treats `Refined(B, _, _)` as equivalent to `B` in both
//     directions (Phase 2.1 pass-through; Phase 2.4 tightens this).
//   - End-to-end: `let x: Positive = 5` typechecks; `= "hi"` fails with
//     a "not a subtype of Number" message (refinement is transparent to
//     the base-level mismatch; the solver-level mismatch is Phase 2.4).
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

  describe('isSubtype pass-through (Phase 2.1 policy)', () => {
    it('refinement on the right is equivalent to its base: `5 <: Positive`', () => {
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      const five = parseTypeAnnotation('5')
      expect(isSubtype(five, pos)).toBe(true)
    })

    it('refinement on the left is equivalent to its base: `Positive <: Number`', () => {
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      expect(isSubtype(pos, NumberType)).toBe(true)
    })

    it('pass-through does not change base-level mismatches: `"hi"` not subtype of `Positive`', () => {
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      const str = parseTypeAnnotation('"hi"')
      expect(isSubtype(str, pos)).toBe(false)
    })

    it('does not yet catch predicate-level violations — `-5 <: Positive` returns `true` in Phase 2.1', () => {
      // Baseline behavior to lock in: the predicate is ignored until
      // the Phase 2.4 solver ships. This test will flip to `false` when
      // the solver lands; the flip IS the Phase 2.4 acceptance criterion.
      const pos = parseTypeAnnotation('Number & {n | n > 0}')
      const negFive = parseTypeAnnotation('-5')
      expect(isSubtype(negFive, pos)).toBe(true)
    })
  })

  describe('end-to-end: `let x: Refinement = value`', () => {
    const dvala = createDvala()

    it('accepts a literal value that matches the base', () => {
      const result = dvala.typecheck('let x: Number & {n | n > 0} = 5; x')
      expect(result.diagnostics).toHaveLength(0)
    })

    it('rejects a literal value that violates the base', () => {
      const result = dvala.typecheck('let x: Number & {n | n > 0} = "hi"; x')
      expect(result.diagnostics.length).toBeGreaterThan(0)
      // The error originates from the base-level `"hi" is not a subtype
      // of Number` check — the Refined wrapper on the RHS is passed
      // through per Phase 2.1 policy, so the message mentions Number.
      // (A later phase's predicate-aware message would name the full
      // refinement; this matcher will need to widen then.)
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
})
