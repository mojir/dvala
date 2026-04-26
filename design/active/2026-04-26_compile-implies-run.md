# "If it compiles it runs" — type-system soundness inventory

**Status:** Open — tracks gaps; individual decisions land in their own PRs
**Created:** 2026-04-26

## Goal

"If it compiles it runs" is a foundational soundness goal: the language shouldn't introduce runtime failures the user didn't explicitly ask for. User-controlled escape hatches (`assert(...)`, `error(...)`, explicit `perform`s) are by-design exceptions; everything else should be caught at compile time.

This document inventories where the typechecker currently falls short of that goal — what's done, what's open, and what's needed to fully achieve it. Established 2026-04-26 after the bare-primitive-source lenience surfaced as a real-world counter-example.

## A. Refinement-type soundness

Tracked in detail in `2026-04-23_refinement-types.md` (and the `design/shipped/2026-04-25_refinement-phase-2-{5c,6}-...md` docs); cross-referenced here for completeness.

| Gap | Status | Phase |
|---|---|---|
| **Bare-primitive source vs refined target lenience** | **Open — must-decide before Phase 2 closes** | 2 |
| Forward propagation through symbolic arithmetic (`let y = x + 1`) | Planned | 3 |
| Multi-variable / relational predicates (`a > b`) | Planned | 3 |
| Cross-field record refinements (`{r \| r.min <= r.max}`) | Planned | 3 |
| Tuple-indexed predicates (`{t \| t[0] < t[1]}`) | Planned | 3 |
| Caller-side handler-soundness gap (caller wraps assertion call in handler that catches the throw) | Open, not on critical path; same gap exists for builtin `assert` | 2.5c+ |
| Pattern-binding alias for non-Sym patterns (destructuring/literal/wildcard) in asserts-body verifier | Documented v1 boundary | 2.5c polish |

### The bare-primitive must-decide (the immediate one)

Currently `let a: Number & {n | n > 2} = b` where `b: Number` silently typechecks. `Number` is set-theoretically NOT a subset of `{n | n > 2}` (witness: `0`), so this should reject under "if it compiles it runs". The solver returns `OutOfFragment` because `extractSourceDomain` doesn't model bare primitives as their full domains; the inert lenience layer accepts.

Three paths to resolve, listed in `project_refinement_types.md` (memory):

1. **Opt-in strict mode** — `--strict-refinements` flag. Default lenient. Compromises "if it compiles it runs" by default.
2. **Default-strict via primitive domain modeling** — teach `extractSourceDomain` that `Number` = `(-∞, ∞)`, `Integer` = `ℤ`, etc. Aligns with "if it compiles it runs" globally; real migration cost on existing patterns that rely on lenience.
3. **Warn → error opt-in** — emit warnings on `OutOfFragment` by default; per-project flag to upgrade to errors. Migration-friendly path between (1) and (2); tilts toward (2) in next major.

User undecided as of 2026-04-26; this is the last item gating Phase 2 closure.

Phase 3 (linear arithmetic solver) covers most of the remaining refinement-types items.

## B. Pattern-matching soundness

| Gap | Status |
|---|---|
| **Non-exhaustive match throws `MatchError` at runtime** instead of being a compile error | **Open — biggest non-refinement gap** |
| Match redundancy (`case 1 then ...; case 1 then ...`) | Warning, not error — probably correct (dead code, not runtime failure) |

The non-exhaustive-match item is the single largest non-refinement-related "if it compiles it runs" violation. The runtime throws `MatchError` when no case matches; the typechecker emits warnings on detected non-exhaustiveness for some shapes but doesn't *reject*.

To close: require exhaustive match, or require an explicit catchall (`case _ then ...`). Users who want current behavior could opt out via `case _ then perform(@dvala.error, "no match") end` — making the runtime throw explicit rather than implicit.

Deserves its own design doc and decision, separate from refinement types.

## C. Indexing / sequence-access soundness

| Gap | Status | Phase |
|---|---|---|
| `arr[i]` — out-of-range index throws at runtime | Open — needs Phase 3 to be expressible | 3 |
| `s[i]` for strings — same | Open, same | 3 |
| `nth(arr, i)` etc. | Same | 3 |
| Tuple-position access on `Sequence` types with min/max length bounds | Partially checked — worth audit | 2 audit |

Refinement types Phase 3 (relational predicates) is the prerequisite — bounds proofs require `i: NonNegative & {n | n < count(arr)}`-style refinements. Without Phase 3, this can't be expressed cleanly.

Phase 3's ship gate language already mentions "array indexing with `i` bounded by `count(xs)`" as a target.

## D. Effect / handler soundness

| Gap | Status |
|---|---|
| Performing effect with no handler in scope | Mostly handled (Phase B + Phase 4-A row vars). Audit corners |
| Handler-wrapper introduced effects under nesting | Phase 4-B applied; audit composition across multiple wrappers |
| Resume from handler with wrong type | Static side handled by handler typing (Phase D); audit |
| Effect-row-var generalization escape (level tracking) | Phase 4-A worked through this; audit corners |
| Dynamic handler dispatch (`do with computedHandler; ...`) | Edge case worth pinning with tests |

Most effect-soundness work has shipped; the remaining items are audit-and-pin-with-tests, not new design.

## E. Coercion failures

| Gap | Status |
|---|---|
| `number("hello")` returns NaN or throws at runtime | By-design "trust the input" — could be addressed with `number: (String) -> Number?` but breaks ergonomics |
| `string(x)` for objects/arrays loses information silently | Doesn't fail; just lossy. Probably fine |

Coercions are a design choice. The current "trust the input" stance is defensible; the alternative requires every coercion site to handle `null`. Worth a separate decision if soundness-purity is desired.

## F. Property access on records

| Gap | Status |
|---|---|
| Closed-record `r.foo` on record without `foo` | Should reject — verify |
| Open-record `{a: Number, ...}` with `r.foo` access — typechecker behavior? | Audit needed |

Probably handled correctly; worth a focused audit to confirm.

## G. Runtime-strictness items already shipped (Step 0)

For reference:

- ✅ Empty block — parse-rejects
- ✅ `if` without `else` — handled
- ✅ Strict `.` requires non-null source — handled
- ✅ Empty function body — parse-rejects (PR #61)
- ⚠️ Non-exhaustive match — runtime-throws (see B above; not fully closed)

## H. Type-system corners worth auditing

Less likely to be gaps, but worth a focused audit before declaring soundness:

- **Recursive types (μα.F(α))** — equi-recursive vs iso-recursive semantics
- **`AnyFunction` widening** — calling a value typed as `AnyFunction` with specific args
- **Generic instantiation under bounds** — recursive bounds
- **Wildcard patterns + literal patterns + guards** — exhaustiveness analysis corners
- **Module imports** — type-info lost or stale across re-imports

## Roadmap to "if it compiles it runs"

In rough priority order:

1. **Resolve Phase 2 must-decide** (bare-primitive lenience) — unblocks the sound-by-default story for refinement types.
2. **Non-exhaustive match → compile error** — the biggest non-refinement gap. Independent decision; needs its own design (when to require exhaustiveness vs allow catchall opt-out).
3. **Phase 3** — multi-variable linear arithmetic. Unlocks array bounds, cross-field, tuple-indexed predicates.
4. **Phase 4** — runtime boundary validation. Closes the trust gap at host-language interfaces.
5. **Effect-soundness audit** — audit pass on the corners, pin with tests.
6. **Coercion-soundness decision** — separate decision: keep "trust" or move to `Number?` returns.
7. **Type-system corner audit** — recursive types, AnyFunction, generics, wildcards.

Phase 3 + Phase 4 are the big ones. Without them, "if it compiles it runs" is partially aspirational. With them (plus the must-decide and non-exhaustive match), the language gets very close.

## Living document

This inventory is meant to evolve as gaps are closed and new ones surface. When an item ships, mark it ✅ here and in any cross-referenced docs. New gaps discovered through real-world counter-examples (like the bare-primitive case that motivated this doc) should be added as they're identified — pre-adoption is far cheaper than post-adoption.
