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
| `array.ts` | 3 | ✅ Audited | All pure. See [Per-file audit results](#array-ts). |
| `assertion.ts` | 1 | ✅ Audited | Single `assert`, pure-partial. See [Per-file audit results](#assertion-ts). |
| `bitwise.ts` | 6 | ✅ Audited | All pure. See [Per-file audit results](#bitwise-ts). |
| `collection.ts` | 8 | ✅ Audited | 5 TS-impl pure; 3 Dvala-impl higher-order (`filter`, `map`, `reduce`). See [Per-file audit results](#collection-ts). |
| `functional.ts` | 5 | ✅ Audited | 3 TS-impl pure; 2 Dvala-impl higher-order (`\|>`, `apply`). See [Per-file audit results](#functional-ts). |
| `math.ts` | 20 | ✅ Audited | All pure; no misdeclarations. See [Per-file audit results](#math-ts). |
| `meta.ts` | 3 | ✅ Audited | All pure. See [Per-file audit results](#meta-ts). |
| `misc.ts` | 15 | ✅ Audited | 13 TS-impl pure; `raise` (Dvala-impl) has a declaration issue. See [Per-file audit results](#misc-ts). |
| `object.ts` | 9 | ✅ Audited | 8 TS-impl pure; `mergeWith` (Dvala-impl) higher-order. See [Per-file audit results](#object-ts). |
| `predicates.ts` | 26 | ✅ Audited | All pure. See [Per-file audit results](#predicates-ts). |
| `regexp.ts` | 4 | ✅ Audited | All pure; fresh regex constructed per call (no `g`-flag state leak). See [Per-file audit results](#regexp-ts). |
| `sequence.ts` | 19 | ✅ Audited | 15 TS-impl pure; 4 Dvala-impl higher-order (`some`, `sort`, `takeWhile`, `dropWhile`). See [Per-file audit results](#sequence-ts). |
| `string.ts` | 8 | ✅ Audited | All pure. See [Per-file audit results](#string-ts). |

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

---

## Per-file Audit Results

### math.ts

**Builtins (20):** `inc`, `dec`, `+`, `-`, `*`, `/`, `quot`, `mod`, `%`, `sqrt`, `cbrt`, `^`, `round`, `trunc`, `floor`, `ceil`, `min`, `max`, `abs`, `sign`.

**Classification:** All **pure** — either *pure-deterministic* (always succeeds given well-typed inputs) or *pure-partial* (can throw a `DvalaError` subclass on edge cases like division-by-zero or non-finite results).

**Error surface:** Every thrown error in `math.ts` is either `ArithmeticError` (thrown by the `checkedFn` wrapper when the JS result is non-finite) or `RuntimeError` (thrown by `getNumberOperands` if any argument isn't a JS number). Both extend `DvalaError` via the chain `ArithmeticError → RuntimeError → DvalaError`, so the fold sandbox catches them uniformly and surfaces as a `@dvala.error` warning per decision #2.

**Key observations:**

- No hidden state, no `Math.random`, no clock reads, no host calls. Every operation is a closed-form function of its numeric inputs.
- `checkedFn` wraps `unaryMathOp` and `binaryMathOp`; it throws `ArithmeticError` on non-finite results (NaN / Infinity). Partial ops like `sqrt(-1)`, `^(0, -1)`, `1/0` route through here.
- `+` and `*` use `reduceMathOp` and do *not* wrap in `checkedFn`. They can silently return Infinity on overflow. This is a deliberate choice (empty-args identity + associative reduce) but means `+(Number.MAX_VALUE, Number.MAX_VALUE)` returns `Infinity` at runtime and folds would do the same. Not a correctness issue for folding — the fold is still observationally equivalent to normal evaluation.
- `min` and `max` accept either varargs of numbers OR a single vector. The vector variant is still pure (reads the vector's elements). No issue.
- Every builtin has a `type` annotation in its `docs`. No missing annotations.

**Declaration bugs:** None found.

**Missing annotations:** None.

**Fold eligibility:** All 20 builtins eligible. `/`, `%`, `mod`, `quot`, `sqrt`, `cbrt`, `^`, `round` (when the decimals arg is invalid), `min`, `max`, and the `checkedFn`-wrapped arithmetic ops can surface `@dvala.error` warnings when folded with bad inputs (decision #2).

**Recommendation:** No action. Ship as-is — math.ts is a model of what the rest of the audit should find.

### bitwise.ts

**Builtins (6):** `<<`, `>>`, `>>>`, `&`, `|`, `xor`.

**Classification:** All **pure-partial**. Each uses JS bitwise operators on integers after asserting integer inputs via `assertNumber(..., { integer: true })`.

**Error surface:** `RuntimeError` from `assertNumber` on non-integer or non-number inputs. `RuntimeError → DvalaError`, caught by the sandbox as `@dvala.error`.

**Key observations:**

- No state, no randomness, no I/O. Pure JS bit ops (`<<`, `>>`, `>>>`, `&`, `|`, `^`) on coerced 32-bit integers.
- All 6 builtins have type annotations.

**Declaration bugs:** None.

**Missing annotations:** None.

**Fold eligibility:** All 6 eligible.

### predicates.ts

**Builtins (26):** `isFunction`, `isMacro`, `isString`, `isNumber`, `isInteger`, `isBoolean`, `isAtom`, `isNull`, `isZero`, `isPos`, `isNeg`, `isEven`, `isOdd`, `isArray`, `isCollection`, `isSequence`, `isObject`, `isRegexp`, `isEffect`, `isTrue`, `isFalse`, `isEmpty`, `isNotEmpty`, `isVector`, `isMatrix`, `isGrid`.

**Classification:** All **pure**. The typeof / typeGuard predicates (`isString`, `isNumber`, `isArray`, etc.) are pure-deterministic. The numeric predicates (`isZero`, `isPos`, `isNeg`, `isEven`, `isOdd`) are pure-partial because they call `assertNumber(..., { finite: true })` first. Collection predicates (`isEmpty`, `isNotEmpty`) assert collection types on non-null inputs.

**Error surface:** `RuntimeError` from assertion helpers on wrong-type inputs. All descend from `DvalaError`.

**Key observations:**

- Every predicate uses the `(x: Unknown) -> x is T` type-guard syntax (decision #20 of the type-system design). Folding these is especially valuable because their results flow into `match` guards and `if` conditions where narrowing kicks in.
- No state, no `Math.random`, no clock reads. Pure structural / type-kind checks.
- All 26 builtins have type annotations.

**Declaration bugs:** None.

**Missing annotations:** None.

**Fold eligibility:** All 26 eligible. High value for folding because predicate results drive narrowing.

### string.ts

**Builtins (8):** `str`, `number`, `lowerCase`, `upperCase`, `trim`, `join`, `split`, `isBlank`.

**Classification:** All **pure**. `str`, `lowerCase`, `upperCase`, `trim` are pure-deterministic (or pure-partial on non-string inputs). `number` is pure-partial — throws `TypeError` on non-numeric strings. `join`, `split` are pure-partial (assertions on input shape). `isBlank` is pure-deterministic on `null` / `String` inputs.

**Error surface:** `TypeError` (extends `RuntimeError → DvalaError`) from `number` on unparsable strings. `RuntimeError` from assertion helpers on wrong-type inputs.

**Key observations:**

- Module-level `blankRegexp = /^\s*$/` used by `isBlank`. **No `g` flag** — `RegExp.test` is stateless without `g`, so this is safe.
- `split` constructs `new RegExp(s, f)` from the captured pattern/flags at each call — no shared mutable regex state.
- All 8 builtins have type annotations.

**Declaration bugs:** None.

**Missing annotations:** None.

**Fold eligibility:** All 8 eligible. `str`, `join`, `split`, `upperCase`, `lowerCase`, `trim` are common in real code and will fold often.

### assertion.ts

**Builtins (1):** `assert`.

**Classification:** **Pure-partial.** Throws `AssertionError` (extends `RuntimeError → DvalaError`) if the value is falsy.

**Fold eligibility:** Eligible. When folded with a literal falsy value, the sandbox catches the `AssertionError` and surfaces as `@dvala.error` — exactly the "statically-provable runtime error" case decision #2 targets.

**Declaration bugs / missing annotations:** None.

### array.ts

**Builtins (3):** `range`, `repeat`, `flatten`.

**Classification:** All **pure-partial** via `assertNumber` / `assertArray` checks.

**Key observations:**

- `range` and `repeat` can build large vectors — budget-bound at fold time. `repeat(value, 1_000_000)` would blow the 10k step budget and fall back silently.
- `flatten` uses a helper (`flattenDeep`) that handles both `PersistentVector` and plain JS arrays. Pure.
- All have type annotations.

**Fold eligibility:** All 3 eligible. Large-collection calls may blow budget and fall back — that's acceptable behavior.

**Declaration bugs / missing annotations:** None.

### object.ts

**Builtins (9):** `keys`, `vals`, `entries`, `find`, `dissoc`, `merge`, `mergeWith`, `zipmap`, `selectKeys`.

**Classification:** All TS-impl builtins are **pure** (pure-deterministic for `keys`/`vals`/`entries`, pure-partial for the rest via assertions). `mergeWith` is implemented in Dvala (TS stub throws).

**Key observations:**

- `mergeWith` takes a merge function as a callback — higher-order. Effect set depends on the callback; fold safety depends on the sandbox catching any effects the callback performs. See [Higher-order builtins](#higher-order-builtins-overall-note) below.
- All have type annotations.

**Fold eligibility:** 8 TS-impl builtins eligible. `mergeWith` foldable when the merge callback is pure.

**Declaration bugs / missing annotations:** None.

### regexp.ts

**Builtins (4):** `regexp`, `reMatch`, `replace`, `replaceAll`.

**Classification:** All **pure-partial**.

**Key observations:**

- Every call constructs a fresh `new RegExp(source, flags)` — **no shared mutable regex state**. The `g`/`y` flag's stateful `.lastIndex` is irrelevant because the regex is reconstructed per call.
- `reMatch` calls `regExp.exec(text)` exactly once per invocation, so `lastIndex` side effects don't leak.
- `replace`/`replaceAll` use `String.prototype.replace`/`replaceAll` which are stateless.
- All have type annotations.

**Fold eligibility:** All 4 eligible.

**Declaration bugs / missing annotations:** None.

### meta.ts

**Builtins (3):** `doc`, `withDoc`, `arity`.

**Classification:** All **pure-deterministic** (or pure-partial via assertions on wrong-type inputs).

**Key observations:**

- `getMetaNormalExpression` captures `normalExpressionReference` and `effectReference` as closure parameters. These are module-registration references — **populated once at startup and not mutated thereafter**. Functionally constant. The closure accesses them read-only, so the builtins are pure despite reading module-level data.
- `withDoc` returns a new function value with a modified `docString` — pure (value-level, no mutation).
- All have type annotations.

**Fold eligibility:** All 3 eligible. Typical use is to introspect builtin or user-function metadata — valid fold target.

**Declaration bugs / missing annotations:** None.

### functional.ts

**Builtins (5):** `|>`, `apply`, `identity`, `comp`, `constantly`.

**Classification:**

- `identity` — **pure-deterministic**.
- `comp` — **pure**: constructs a `CompFunction` value. No execution.
- `constantly` — **pure**: constructs a `ConstantlyFunction` value.
- `|>` and `apply` — TS stubs throw ("implemented in Dvala"). Real implementation is in a `.dvala` source file. They call their function argument, so **effect set depends on the callback** (higher-order).

**Key observations:**

- All have type annotations.
- `|>` and `apply` are the classic higher-order examples. See [Higher-order builtins](#higher-order-builtins-overall-note).

**Fold eligibility:** All 5 eligible *when their inputs are fold-compatible*. For `|>` and `apply`, that means the callback is pure; the sandbox catches effects that escape.

**Declaration bugs / missing annotations:** None.

### collection.ts

**Builtins (8):** `filter`, `map`, `reduce`, `get`, `count`, `contains`, `assoc`, `++`.

**Classification:**

- `get`, `count`, `contains`, `assoc`, `++` — TS-impl, **pure-partial** via assertions.
- `filter`, `map`, `reduce` — TS stubs throw ("implemented in Dvala"). Real impl in Dvala source. All three are higher-order — effect set depends on the callback.

**Key observations:**

- `++` handles strings, numbers, and persistent vectors in the same builtin — polymorphic dispatch on the first arg's type. Pure either way.
- All have type annotations.

**Fold eligibility:** All 8 eligible. `filter`/`map`/`reduce` foldable when the callback is pure.

**Declaration bugs / missing annotations:** None.

### sequence.ts

**Builtins (19):** `nth`, `first`, `last`, `pop`, `indexOf`, `push`, `rest`, `next`, `reverse`, `second`, `slice`, `some`, `sort`, `take`, `takeLast`, `drop`, `dropLast`, `takeWhile`, `dropWhile`.

**Classification:**

- 15 TS-impl builtins: **pure** (pure-deterministic for position accessors like `first`/`last`/`second`/`nth` with default value; pure-partial for assertions elsewhere).
- 4 Dvala-impl builtins: `some`, `sort`, `takeWhile`, `dropWhile`. `some`, `takeWhile`, `dropWhile` are higher-order (predicate callback). `sort` is higher-order when a comparator is supplied.

**Key observations:**

- `nth` is the canonical fold-eligible collection accessor — design doc step 7 explicitly calls it out. Out-of-bounds without a default returns `null` (decision #2's partial-with-default pattern).
- All have type annotations.

**Fold eligibility:** All 19 eligible. Higher-order ones depend on their callback.

**Declaration bugs / missing annotations:** None.

### misc.ts

**Builtins (15):** `==`, `!=`, `>`, `<`, `>=`, `<=`, `not`, `boolean`, `compare`, `effectName`, `macroexpand`, `qualifiedName`, `qualifiedMatcher`, `typeOf`, `raise`.

**Classification:**

- `==`, `!=`, `compare` — **pure-deterministic** via `deepEqual` / `compare`.
- `>`, `<`, `>=`, `<=` — pure-partial on non-number/string input.
- `not`, `boolean`, `typeOf` — pure-deterministic.
- `effectName`, `qualifiedName`, `qualifiedMatcher` — pure-partial (assertions on input type).
- `macroexpand` — TS stub throws ("handled by the evaluator"). Not called through this path during fold — fold would attempt it and silently fall back on the thrown non-DvalaError.
- `raise` — TS stub throws ("implemented in Dvala"). Actual Dvala implementation performs `@dvala.error`.

**Declaration issue — `raise`:**

The type signature is `((String) -> Never) & ((String, Unknown) -> Never)` with an **empty effect set**, but the runtime implementation performs `@dvala.error`. In the rigorous set-theoretic model (type-system design decision #12 and the folding design's decision #13) this is a misdeclaration — `raise` should carry an `@{dvala.error}` effect.

**Fold impact:** Low. The sandbox intercepts `@dvala.error` via the `DvalaError` catch branch and surfaces as a warning (decision #2) regardless of what the declared signature says. So fold behavior is correct in practice — the declaration just isn't as informative as it could be.

**Recommendation:** Once effect-set annotations are added (separate from this audit), retype `raise` as `(String) -> @{dvala.error} Never` (and similarly for the 2-arg variant). Track as a follow-up, not a blocker for Phase C.

**Key observations:**

- All have type annotations.
- `typeOf` is a natural match for match-narrowing workflows — fold-eligible and valuable.

**Fold eligibility:** 13 TS-impl eligible. `macroexpand` is not exercised through the fold path (TS stub is a no-op that throws; Dvala-side macroexpansion happens at a different evaluator phase). `raise` is eligible — fold correctly surfaces a warning via the `@dvala.error` path.

**Declaration bugs:** `raise`'s empty effect declaration is the one documented issue in core/. Non-blocking.

**Missing annotations:** None.

---

## Higher-order builtins — overall note

Across core/, the following builtins are **higher-order** (take a function argument whose effect set determines the outer call's effect set):

- `collection.ts`: `filter`, `map`, `reduce`
- `sequence.ts`: `some`, `sort` (when a comparator is supplied), `takeWhile`, `dropWhile`
- `functional.ts`: `|>`, `apply`, `comp`
- `object.ts`: `mergeWith`

Their declared type signatures currently use pure function types for the callback position (`(A) -> B`) instead of effect-polymorphic signatures (`(A) -> @{e...} B`). This is the **polymorphic-effect expressiveness gap** flagged in Open Question #1 — a type-system feature, not an audit finding per se.

**Why this doesn't block folding:** The fold sandbox inspects effects *at runtime*, not via the declared signature. If the caller passes a pure callback, fold succeeds. If the caller passes an effectful callback, the sandbox catches the effect and surfaces as a warning (decision #2). The declared type being imprecise means inference may attempt folds that fail — but those failures are observationally correct (the warning tells the user what's happening).

Once effect polymorphism lands, these signatures should be upgraded. Not part of Phase A.

---

## Phase A status — core/ complete

**Date:** 2026-04-16.

**Summary:** 13/13 core files audited. 127 builtins classified. Every TS-impl builtin is pure (pure-deterministic or pure-partial). Every thrown error descends from `DvalaError` and is caught by the fold sandbox.

**Declaration issues found:**
1. `raise` (misc.ts) — should declare `@{dvala.error}` effect but declares pure. Non-blocking for folding. Flag for follow-up once effect annotations are applied across builtins.

**Missing annotations in core/:** None.

**Ready for:** continuing to `src/builtin/modules/` (20 modules).
