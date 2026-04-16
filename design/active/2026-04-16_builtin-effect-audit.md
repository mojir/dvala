# Builtin Effect Declaration Audit

**Status:** In progress
**Created:** 2026-04-16
**Depends on:** [2026-04-16_constant-folding-in-types.md](2026-04-16_constant-folding-in-types.md) (Phase A prerequisite)

## Goal

Audit every builtin against two invariants:

1. **Declared effect set is accurate.** If the builtin's type signature says pure (`(A) -> B`), the TS implementation must be genuinely pure — no clock reads, no RNG, no host-state reads, no mutation of shared state.
2. **Effect-performing builtins are declared as such.** Any builtin that legitimately performs an effect must carry an effect declaration (`(A) -> @{clock} B`, `(A) -> @{random} B`, etc.), not a pure signature.

This is the prerequisite for the constant-folding work's decision #13 — **drop the builtin whitelist, gate folding on the callee's inferred effect set alone**. The single gate only works if the declarations can be trusted.

## Initial Findings (pre-audit sweep)

A grep over `src/builtin` for `@{` (the effect-set syntax) and common I/O-adjacent JS APIs produced these high-level observations:

- **No builtin currently declares a non-empty effect set.** Every `type` field in `docs` is a pure function type. This means either (a) every builtin is genuinely pure, or (b) impure builtins are mis-declared — the audit needs to find which.
- **No `Math.random()` anywhere in `src/builtin`.** Dvala currently has no RNG builtin. An eventual `random` primitive will need a declared `@random` (or similar) effect type.
- **No `Date.now()` / `performance.now()` anywhere in `src/builtin`.** No wall-clock reads. The only `new Date(...)` usage is in `time/index.ts` and is fully deterministic given its input (ms ↔ ISO).
- **No `console.*`, `process.*`, filesystem, or network calls in builtin impls.** The effect system correctly treats I/O as a host concern — handlers register at `run(program, handlers)` time, not inside builtins.
- **Several module files don't declare `type` at all** (e.g. `time/index.ts`). The audit should note which modules lack type coverage — those cannot participate in folding until annotated.

**Provisional conclusion:** the audit surface is smaller than expected. Most of the work is verifying determinism rather than finding hidden effects.

## Methodology

For each builtin, classify against these categories:

| Category | Meaning | Folding eligibility |
|---|---|---|
| **Pure-deterministic** | Same inputs → same outputs, no hidden state. Safe for sandbox. | ✅ Eligible when effect set empty. |
| **Pure-partial** | Deterministic but can throw `DvalaError` (div-by-zero, out-of-bounds). | ✅ Eligible — sandbox catches `DvalaError` and reports as `@dvala.error` (decision #2). |
| **Nondeterministic** | Same inputs → different outputs (RNG, clock). Requires effect declaration. | ❌ Not eligible after correct declaration. |
| **I/O / host** | Calls out to the host (filesystem, network, console). Requires effect declaration. | ❌ Not eligible after correct declaration. |
| **State-reading** | Reads shared mutable state (module-level caches, singletons). | ❌ Not eligible; needs effect declaration or refactor. |
| **Effect-performing** | Calls `perform()` internally. Inherits the performed effect in the declared set. | ❌ Not eligible after correct declaration. |

For each module we also note:

- **Has `type` annotation**: is every builtin in the module declaring its type as a string in the `docs`?
- **Notes**: anything that surprised us during review (test skips, hidden assumptions, etc.).

## Review Procedure (per builtin)

1. Locate the TS `evaluate` function.
2. Inspect it for: any JS builtin that reads state (`Date`, `Math.random`, `performance`, `process`, `global`, `console`, `fetch`, `require` at call-time), any module-level mutable reference being read, any call to `perform()`.
3. Classify per the table above.
4. If misclassified relative to its declared `type`, flag as **Declaration bug** (fix as a follow-up commit).
5. If the `type` field is missing entirely, flag as **Missing annotation** (needs a type signature before folding can consider it).
6. Record notes.

## Tracking Tables

### Core (`src/builtin/core/`)

13 files. All of these are "normal" (non-special-expression) builtins, in-scope for folding once effect declarations are trusted.

| File | Builtins | Status | Notes |
|---|---|---|---|
| `array.ts` | — | ⏳ Not started | |
| `assertion.ts` | — | ⏳ Not started | `assert*` functions — throw on falsy; pure-partial. |
| `bitwise.ts` | — | ⏳ Not started | Bit ops on numbers — pure-deterministic. |
| `collection.ts` | — | ⏳ Not started | |
| `functional.ts` | — | ⏳ Not started | Higher-order — effect set depends on callback. Needs polymorphic effect handling in the signature. |
| `math.ts` | — | ⏳ Not started | `inc`, `dec`, `+`, `-`, `*`, `/`, `%`, etc. — pure-deterministic or pure-partial (`/` by zero). |
| `meta.ts` | — | ⏳ Not started | `arity`, `doc`, `withDoc` — inspect function values; likely pure-deterministic. |
| `misc.ts` | — | ⏳ Not started | |
| `object.ts` | — | ⏳ Not started | Record operations — pure-deterministic. |
| `predicates.ts` | — | ⏳ Not started | `isNumber`, `isString`, etc. — pure-deterministic. |
| `regexp.ts` | — | ⏳ Not started | Match/replace on strings — pure-deterministic (no global flag state). Verify. |
| `sequence.ts` | — | ⏳ Not started | |
| `string.ts` | — | ⏳ Not started | String ops — pure-deterministic. |

### Modules (`src/builtin/modules/`)

20 modules. Some (like `effectHandler`) are effect-infrastructure and likely out of scope for folding; others (math, string extensions, convert) should be cleanly pure.

| Module | Status | Type annotations? | Notes |
|---|---|---|---|
| `assertion` | ⏳ Not started | — | |
| `ast` | ⏳ Not started | — | AST constructors/predicates — pure-deterministic over AST values. |
| `bitwise` | ⏳ Not started | — | Bit ops — pure. |
| `collection` | ⏳ Not started | — | |
| `convert` | ⏳ Not started | — | Unit conversions using math constants — pure-deterministic. |
| `effectHandler` | ⏳ Not started | — | Effect infrastructure; likely not fold-eligible. |
| `functional` | ⏳ Not started | — | Higher-order; polymorphic effects. |
| `grid` | ⏳ Not started | — | |
| `json` | ⏳ Not started | — | `parse`/`stringify` — pure-deterministic. |
| `linear-algebra` | ⏳ Not started | — | Matrix math — pure-deterministic. |
| `math` | ⏳ Not started | — | `sin`, `cos`, `sqrt`, etc. — pure-deterministic. |
| `matrix` | ⏳ Not started | — | |
| `number-theory` | ⏳ Not started | — | |
| `sequence` | ⏳ Not started | — | |
| `string` | ⏳ Not started | — | String utilities — pure-deterministic. Verify `randomString` etc. if present. |
| `test` | ⏳ Not started | — | Test helpers — may perform `@test.report` effect. |
| `time` | ⚠ Missing type annotations | No | `epochToIsoDate(ms)` and `isoDateToEpoch(iso)` are deterministic by input — no wall-clock read. Add type annotations. |
| `vector` | ⏳ Not started | — | Vector math — pure-deterministic. |

### Special Expressions (`src/builtin/specialExpressions/`)

Not in scope for the Phase A audit. Special expressions (`if`, `let`, `match`, `perform`, `try`, `parallel`, etc.) are handled directly in `inferExpr` and `trampoline-evaluator` — they're not called through the `Call` node and therefore never hit the fold path. The exception is special expressions that *do* get folded (`&&`, `||`, `if`) which are wired directly per decision #9 and #8 of the folding design.

## Deliverables

Phase A is complete when:

1. Every row in the tracking tables above is ✅ or ❌ (no ⏳ remaining).
2. Every declaration bug found has a fix PR landed (independent of the folding work).
3. Every missing type annotation has either been added or flagged with a rationale (e.g. "module-level wiring, not individually callable").
4. A summary entry is added to the constant-folding design doc confirming Phase A complete.

After Phase A, Phase B (differential test matrix) can start.

## Open Questions

1. **Higher-order builtins and polymorphic effects.** `map(xs, f)` inherits the effect set of `f`. Current signatures (`(A[], (A) -> B) -> B[]`) don't express this. We need `(A[], (A) -> @{e...} B) -> @{e...} B[]` once effect polymorphism is implemented — but that's a type-system feature, not strictly an audit finding. Flag and defer.
2. **Module source files written in Dvala (`*.dvala`).** Several modules have a `.dvala` source (e.g. `collection.dvala`, `functional.dvala`). Their effects should be inferable from the typechecker; they don't need manual annotation. Confirm this works end-to-end during the audit.
3. **`test` module effects.** Assertions report results somewhere — is it a `@test.report` effect, or does it accumulate to a host-visible state?
