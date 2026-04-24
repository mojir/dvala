# Boolean Surface Cleanup — Implementation Plan

**Status:** Shipped — branch `feat/boolean-surface-cleanup`. All seven steps landed.
**Created:** 2026-04-24
**Shipped:** 2026-04-24
**Last updated:** 2026-04-24 (implementation landed — tokenizer, parser, narrowing recognizer, strict `&&`/`||`/`!`/`assert`, in-repo migration, `not`/`boolean` builtins removed)
**Scope discipline:** Four coordinated changes bundled in one landing. Hard out-of-scope list below.
**References:** `2026-04-12_type-system.md` (type-system decisions, especially #6 / #14 / #17), `2026-04-23_refinement-types.md` (Q7 — Boolean-typed refinement predicates, the precedent this initiative extends language-wide)

---

## Decision

Tighten Dvala's Boolean surface from truthy-coercion to **strict Boolean**. Four coordinated changes, shipped together as one breaking migration:

1. **Strict Boolean at syntactic conditional positions.** `if`, `match`-guards (`when GUARD`), `&&`, `||` require operands of type `Boolean`. Non-Boolean operands produce a type error with a suggested-fix message.
2. **`!` as unary Boolean operator + passable function value.** Replaces the `not` function entirely. Accepts `Boolean`, returns `Boolean`. Available as a first-class function value (`map(xs, !)`) via Dvala's existing operator-as-function mechanism.
3. **`not` function removed.** Users who want the keyword form write `let not = !` — one-line user-level alias. No stdlib alias provided.
4. **`boolean(x)` function removed.** Truthy coercion was the only thing it did. With strict Boolean at the conditional positions and no language-wide truthy semantics, `boolean(x)` has no remaining use. Users write explicit checks (`!= null`, `count(x) > 0`, `!= ""`, `!= 0`) in its place.

**After this change: Dvala has no truthy coercion in any type-checked Boolean position.** Every type-checked condition accepts only `Boolean`. The one remaining position where truthy coercion survives is `for` comprehension `when`/`while` guards — because the `For` node isn't type-checked today; when typed For inference lands as a separate project, those guards tighten too. See Out of Scope.

---

## Motivation

### Dvala's existing decisions all point toward strict Boolean

- **Decision #6 — No `Any`, no unsound escape.** Every value's type is knowable.
- **Decision #14 — Strict null.** Null must be opt-in; `.` crashes rather than returning null silently.
- **Decision #17 — Unknown-recovery only on inference failure.** No casual `Any`-style wildcarding.
- **Q7 (refinement types) — Boolean-typed predicates.** `{s | s}` is a type error; must write `{s | count(s) > 0}`.

Every major Boolean-adjacent decision has picked "be explicit over guess user intent." Truthy coercion at `if`, `&&`, `||` is the one remaining place Dvala still guesses. It's the odd one out in an otherwise strict type system.

### The language landscape confirms the direction

**Older dynamic languages go truthy:** JavaScript, Python, Ruby, Lua, Clojure, C.

**Newer typed languages go strict:** Rust, Go, Kotlin, Swift, Elm, OCaml, Haskell, F#. Every one of these requires `Boolean` in conditional positions. None have a generic truthy-coercion function.

This isn't fashion. The strict languages learned from the JS/Python bug class — `if (x)` silently wrong when `x` is `0`, `""`, `false`, `null`; chained `&&`/`||` hiding non-Boolean operands; surprising empty-collection semantics (`if []` is truthy in JS, falsy in Python, truthy in Dvala today, so which is it for the user?).

**Dvala is in the newer-typed-language camp architecturally** (set-theoretic types, refinements, effects, inference-first). Staying truthy puts Dvala in the dynamic-language lineage where it doesn't otherwise belong.

### Concrete payoffs

- **Type system catches real bugs.** `if name then ...` where `name: String` becomes a type error — user forced to write the check they actually mean. Intent explicit; reader doesn't have to know Dvala-specific truthy rules.
- **No empty-collection surprise.** `if []` being truthy is a language-specific gotcha every user hits once. Strict eliminates the category.
- **Refinement predicates compose naturally.** Q7's Boolean-strict predicate rule stops being a carve-out — it's the language's rule.
- **Auditable.** `if x` in strict Dvala means `x : Boolean`. No need to look up `x`'s type and apply Dvala-specific coercion rules. LLM-generated code benefits from the reduced ambiguity.
- **Pre-1.0 cost is small.** User base is small; codebase is small; every future Dvala program starts strict. Deferring past 1.0 makes the migration dramatically harder or impossible.

### Why bundle all four changes

The four changes touch the same surface (Boolean-context semantics + the operators/functions that test truthy values). Sequencing them creates migration pain:

- Tighten `if`/`&&`/`||` first → users migrate truthy-to-explicit, then migrate `not(x)` → `!x` separately, then migrate `boolean(x)` → explicit separately. Three migrations for the same conceptual change.
- Bundled → users migrate once. One release note, one set of migration patterns, one codemod.

**Bundling costs bigger review scope; separating costs larger user-facing migration count.** For a pre-1.0 cleanup landing in a small codebase, bundling is the right trade.

---

## Design — what ships

### Strict Boolean at conditional positions

Positions that tighten to require `Boolean`:

- `if COND then ... else ... end` — `COND : Boolean`.
- `match ... | pattern when GUARD -> body` — `GUARD : Boolean`.
- `A && B` — both operands `: Boolean`. Result: `Boolean`.
- `A || B` — both operands `: Boolean`. Result: `Boolean`.
- `!X` — `X : Boolean`. Result: `Boolean`.
- `assert(P)` / `assert(P, msg)` — `P : Boolean`. (Tightens from current `assert(Unknown)`.)
- Refinement predicates — already Boolean-typed per Q7. No change.

### `!` as unary operator

```dvala
!true                        // false
!isReady                     // negation of a Boolean-typed value
!(a > b)                     // parenthesized Boolean
!!x                          // double negation: if x : Boolean, result is x
!condition && otherCondition // parses as (!condition) && otherCondition

map([true, false, true], !)  // ! passable as function value → [false, true, false]
filter(bs, !)                // retains false-valued elements
```

Precedence: unary prefix, same tier as unary `-`.

Signature: `(Boolean) -> Boolean`. Strict. `!"hello"` is a type error.

### `not` and `boolean` — removed

```dvala
not(true)                    // ERROR: undefined function `not` (unless user wrote `let not = !`)
boolean(x)                   // ERROR: undefined function `boolean`
```

Users migrate (see below).

### && / || semantic change — result is always Boolean

Today's behavior:
```dvala
"foo" && "bar"   // → "bar" (returns the last truthy value)
null || "default" // → "default" (returns the first truthy value)
```

Strict-Boolean behavior:
```dvala
"foo" && "bar"   // ERROR: "foo" is not a subtype of Boolean
true && false    // → false (Boolean)
```

**This breaks the JS-style `x || default` default-value idiom.** Migration below.

---

## Migration patterns

The common before/after cases. Most can be codemod-assisted; a few need human judgment.

### Emptiness / non-emptiness

```dvala
// Sequence (Array or String)
if xs then ...                → if count(xs) > 0 then ...
if !xs then ...               → if count(xs) == 0 then ...

// String specifically
if s then ...                 → if s != "" then ...  (or count-based)
```

### Null checks

```dvala
// Optional values (T | Null)
if obj then ...               → if obj != null then ...
if !obj then ...              → if obj == null then ...

// Field access guard (former short-circuit pattern)
obj && obj.field              → obj?.field           // Dvala already has ?. for safe access
obj && obj.field              → if obj != null then obj.field else null  // explicit
```

### Number zero-check

```dvala
if n then ...                 → if n != 0 then ...
if !n then ...                → if n == 0 then ...
```

### Default-value idiom (`x || default`)

JS-style `x || default` returned `default` for any falsy `x`. Under strict Boolean, `||` only takes Boolean operands; the idiom must be rewritten.

**Dvala's `??` (nullish coalescing) operator already exists** and is the idiomatic replacement for the null-fallback case:

```dvala
// Old truthy idiom (BROKEN under strict Boolean):
let name = user.name || "anonymous"

// Preferred migration — use `??` for the null-fallback case:
let name = user.name ?? "anonymous"

// If the original intent was "default on empty string too" (not just null):
let name = if user.name != null && user.name != "" then user.name else "anonymous"
// Or via helper: let firstNonEmpty = (a, b) -> if a != null && a != "" then a else b

// If the original was "default on zero" (numeric):
let n = if count != 0 then count else defaultCount
```

The key distinction from the old truthy idiom: `??` fires only on `null`, not on `0`/`""`/`false`. **Users must audit each `x || default` site** to determine which fallback semantics they actually wanted:

- **Null-fallback** (most common case by far): `x ?? default`.
- **Null-or-empty-string fallback**: explicit `if-then-else`.
- **Null-or-zero fallback**: explicit `if-then-else`.
- **"Any falsy" fallback**: rare; write the explicit disjunction.

The audit is the migration discipline: code that used `x || default` with implicit "any falsy" semantics was likely subtly buggy before this change (firing on `0` or `""` when the user wanted just null-check). Strict Boolean surfaces the ambiguity.

### `not(x)` → `!x`

```dvala
not(true)                     → !true
not(cond)                     → !cond
filter(xs, not)               → filter(xs, !)
```

Mechanical rename for most uses. Migration note: `!cond` requires `cond : Boolean` — any `not(nonBoolean)` that relied on truthy coercion becomes a type error until rewritten.

### `boolean(x)` → explicit check

```dvala
// Old:
if boolean(reMatch(s, pattern)) then ...

// New (clearer!):
if reMatch(s, pattern) != null then ...
```

Every `boolean(x)` site migrates to a specific check based on `x`'s type. The migration typically makes the code *more* readable (the explicit check says what it's actually testing).

### Patterns that stay valid

All of these are already Boolean-typed and unchanged:

```dvala
if isReady then ...                    // isReady : Boolean
if count(xs) > 0 then ...              // comparison result is Boolean
if x == :ok then ...                   // comparison is Boolean
if status == :ok && value != null then ...
match result
  | {tag: :ok, value} when value > 0 -> value
  | {tag: :err, ...} -> 0
end
```

---

## Out of scope (hard line)

- **For-comprehension `when`/`while` guards.** `for (x in xs when GUARD while GUARD2)` currently passes `GUARD` / `GUARD2` through truthy evaluation (`evalWhen` / `evalWhile` in the trampoline evaluator). The `For` comprehension is not type-checked today — the typechecker returns `array(Unknown)` without walking the body. **Tightening For guards requires adding typed inference to the For comprehension** — a larger orthogonal project. When typed For inference lands, guards will be tightened to `Boolean` at that point. Until then, For guards remain truthy-coerced as an exception. **Weakens the "no truthy coercion anywhere" claim slightly**, but scoped honestly: the For comprehension is the one remaining position because its typing story is separately deferred, not because truthy is preserved on purpose.
- **New `??` feature.** `??` already exists in Dvala (see migration patterns for how it replaces the `x || default` idiom). No new nullish-coalescing work bundled.
- **Optional chaining expansion.** Dvala's `?.` exists; it stays. No new chaining operators bundled here.
- **`Boolean` type reshape.** Dvala's `Boolean` type is unchanged. This initiative changes *where* `Boolean` is required, not what `Boolean` means.
- **Stringification semantics for `str(null)`.** Currently `str(null) -> ""`. That's an arbitrary choice, orthogonal to Boolean-strictness, not bundled.
- **Other unary operators (`++`, `--`, prefix `+`, etc.).** Only `!` is added. No other operator additions.
- **A stdlib `not` alias.** Explicitly rejected. Users who want the keyword form write `let not = !`. No stdlib-level bundle.
- **An `assertTruthy(x)` or similar "relaxed assert" helper at the top level.** Explicitly rejected. `assert(P)` is strict-Boolean. Users who want the old truthy-assert behavior write their own helper or the explicit disjunction.
- **`assertion.assertTruthy` and `assertion.assertFalsy` stdlib module functions** — the module-level `assertion.assertTruthy(x)` and `assertion.assertFalsy(x)` already exist in `src/builtin/modules/assertion/` with explicit "test this value's truthiness" semantics. They remain as-is. Rationale: they're namespaced module functions used primarily in test code to assert against external-produced values; renaming or removing them would be its own module-API project. Small inconsistency with "no truthy coercion anywhere" is acknowledged — but they're clearly opt-in (must be explicitly imported) and serve a genuine testing need.
- **A deprecation period.** Pre-1.0 Dvala; clean break. `not` and `boolean` are removed, not deprecated.

---

## Implementation roadmap

Single bundled PR. Sequence within the PR:

### Step 1 — Tokenizer

- **Register `!` as an operator in `src/tokenizer/operators.ts`.** The current `binaryOperators` array contains `+`, `-`, `==`, `!=`, `&&`, `||`, `??`, etc. `!` isn't there. Add it to a `unaryPrefixOperators` array (new) — or register in a shared `allOperators` set that `isSymbolicOperator` checks. Pick the cleaner factoring at implementation time.
- **No tokenizer-function changes needed.** `tokenizeOperator` already greedily matches longest-symbolic-operator (3 chars → 2 → 1), so `!=` vs `!` disambiguates correctly once `!` is in the operator registry.
- Verify no regression on existing inequality tests: `a != b`, `!=`-in-match-patterns, etc.

### Step 2 — Parser

Two distinct parser paths for `!`, both in `src/parser/subParsers/parseOperand.ts`:

**Path A — `!X` as unary prefix.** Pattern mirrors existing unary-minus at lines 120-143. When `!` is followed by an operand token, consume `!`, parse the operand, and produce a `NodeTypes.Call` AST node with the `!` builtin as callee and the parsed operand as the single argument. Downstream (constant folding, type checking, evaluator dispatch) handles it the same as any other Call.

**Path B — `!` in bare-value position.** This is a new parser path, NOT automatic via the existing `isBinaryOperator` branch at line 145 — `!` is unary, not binary, so it's not in the `binaryOperators` array. A bare `!` before `,`, `)`, `]`, or end-of-expression must produce a `NodeTypes.Builtin` node for `!` (same shape as the binary-operator path at line 155, but reached via a new dispatch).

Concrete disambiguation: after consuming `!`, lookahead at the next token:
- If the next token can start an expression (operand, `(`, unary `-`, another `!`, etc.) → Path A (unary prefix).
- If the next token is `,`, `)`, `]`, `;`, or end-of-expression → Path B (value reference).

The lookahead predicate mirrors "is this token a valid expression starter?" — same predicate the parser already uses for other prefix operators.

Test cases:
- `!x` → Path A → `Call(!, x)`.
- `!(a && b)` → Path A → `Call(!, And(a, b))`.
- `!!x` → Path A twice → `Call(!, Call(!, x))`.
- `filter(xs, !)` → Path B for the `!` before `)` → `Call(filter, [xs, Builtin(!)])`.
- `map([true, false], !)` → Path B → `map` gets `!` as a function value.
- `!` alone as a statement → Path B → `Builtin(!)` (trivially useless but not a parse error).

### Step 3 — Typechecker: strict Boolean at conditional positions

- Walk the inference for `if`, `match`-guard (`when`), `&&`, `||`, `!`, `assert`.
- For each position, emit a type error if the operand type is not a subtype of `Boolean`.
- Error messages include a **suggested fix** based on the operand's type:
  - `String` → "did you mean `x != ""` or `count(x) > 0`?"
  - `T | Null` → "did you mean `x != null`?" (and for the `||` default-value idiom specifically, suggest `x ?? default`)
  - `Integer` / `Number` → "did you mean `x != 0`?"
  - `Array<T>` / `Sequence` → "did you mean `count(x) > 0`?"
  - `Unknown` → "use an explicit comparison or `is*` predicate; `boolean(x)` is not available."
- Error messages link to the migration guide (optional — later doc polish).

**`&&`/`||` constant-fold cleanup.** The existing fold logic at `infer.ts` lines 1504-1528 uses `literalTruthiness` to do JS-style fold (`false && x` → `false`, `0 && x` → `0`, `"" || x` → `x`, etc.). After strict Boolean, `&&`/`||` only accept `Boolean` operands, so only `true`/`false` literals appear. `literalTruthiness` happens to produce correct results for `true`/`false` (returns the boolean itself), so the fold logic stays correct for the new Boolean-only domain.

The non-Boolean branches in `literalTruthiness` (`number !== 0`, `string !== ''`, etc.) become **dead code** after this change. Options: (a) delete the dead branches to keep the function tight; (b) leave them as-is in case they're needed elsewhere. Implementer's call at cleanup time; not a blocker.

**`&&`/`||` result-type change.** Today both return the last-truthy-or-first-falsy value (value-returning). After strict Boolean, they return `Boolean` (Boolean-returning). The typechecker's existing narrowing for `&&`/`||` operates on AST shape, not result type, so existing narrowing composition (PR #78/#79) is unaffected. Type-level inference downstream that assumed `a && b : typeof(b)` must be updated to `a && b : Boolean`.

### Step 4 — Builtin registry swap

- In `src/builtin/core/misc.ts`:
  - Remove the `not` builtin entry.
  - Remove the `boolean` builtin entry.
  - Clean up `seeAlso` references to `not` elsewhere (there's at least one in the `boolean` entry's `seeAlso` array — dangling after removal; audit other entries via grep).
  - Register `!` as a builtin — `docs` with name `!`, category `logic` (or similar), signature `(Boolean) -> Boolean`, examples migrated from the old `not` entry.
- **Tighten `assert` signature in `src/builtin/core/assertion.ts`:**
  - Old: `((Unknown) -> Unknown) & ((Unknown, String) -> Unknown)`.
  - New: `((Boolean) -> Boolean) & ((Boolean, String) -> Boolean)`.
  - Return type changes from `Unknown` to `Boolean` — consistent with input now being `Boolean`, and keeping the pass-through semantic (assert returns the value it tested, now always `true` when it didn't throw).
- Evaluator changes: none for `!` (same code path as `not` today, typechecker now blocks non-Boolean before eval). `assert` evaluator stays the same at runtime — still throws on falsy — but the typechecker's stricter signature prevents callers from passing non-Boolean in the first place.

**Behavioral change for assert-as-guard pattern.** Today users write:

```dvala
// Current: assert returns its value, can be chained as a guard
let validUser = assert(user, "user is null")     // user: User | Null → ignored truthy check
```

After tightening:

```dvala
// Migration: explicit check, then use the value
assert(user != null, "user is null")
let validUser = user   // narrowed to User in the remainder of the scope via assert narrowing
```

The migration guide should call this out as a common pattern.

### Step 5 — Flow-narrowing recognizer update

- PR #78 / #79 machinery currently recognizes `not(cond)` as a negation signal. Update to recognize `!cond` (the new AST shape — `Call` with `!` callee).
- Negation composes with existing `&&` / `||` narrowing composition — no new machinery beyond the callee-name change.
- Test: `if !isNumber(x) then ... else ...` narrows `x` to `!Number` in the then-branch and `Number` in the else-branch (inverse of current `isNumber(x)` narrowing).

### Step 6 — In-repo migration

- Codemod script (standalone, not a Dvala feature) that mechanically rewrites:
  - `not(X)` → `!X` (parenthesize when needed).
  - `not` as function value → `!`.
  - Common `if x` patterns based on observed type of `x`.
- Manual review for:
  - `x || default` idiom — audit each site to pick `x ?? default` vs explicit `if-then-else` (depends on intended null/empty/zero semantics).
  - Ambiguous `if someUnknown` — manual review of intent.
  - **`assert(nonBoolean)` calls** — typically assert-as-null-guard; rewrite to `assert(x != null)` etc.
- Touch:
  - `src/**/*.test.ts` and `__tests__/**/*.test.ts` — test migration.
  - `e2e/**/*` — end-to-end test migration.
  - `playground-www/src/**/*` — including feature cards (e.g. `hygienic-macros.md` references `unless`).
  - `design/active/**/*.md` — examples referencing truthy patterns.
  - `CLAUDE.md` — project-level instructions.
  - **Stdlib `.dvala` files** — `collection.dvala`, `object.dvala`, `assertion.dvala`, `sequence.dvala`, `grid.dvala`, `macros.dvala`, `number-theory.dvala`. Audit for `not(` usage (~20 occurrences per grep).
  - **`unless` stdlib macro** (`src/builtin/modules/macros/macros.dvala` line 28) uses `if not($^{cond})` — rewrite to `if !($^{cond})`. User-visible stdlib API; cross-reference with playground feature card.

### Step 7 — Documentation

- Update `src/builtin/core/misc.ts` docs (auto-regenerates reference docs).
- Update `CLAUDE.md` sections mentioning `not` / `boolean`.
- Update playground feature cards, tutorial pages, examples.
- Add a migration guide doc (probably `design/reference/YYYY-MM-DD_boolean-strict-migration.md`) — this guide is for external user consumption, separate from the design doc, with the before/after patterns formatted for a user audience.
- Release note: "Dvala now has strict Boolean. `not` and `boolean` removed; use `!` and explicit checks. See migration guide for the common patterns."

### Ship gate

- All three of `if`, `&&`, `||`, `!`, `match when`, `assert` reject non-Boolean operands with a clear suggested-fix error message.
- `!x` works as operator; `map(xs, !)` works as first-class function value.
- `let not = !` works as user-level alias.
- Entire in-repo test suite migrated and passing.
- Playground and reference docs updated.
- Migration guide doc published.

---

## Risk and backout

**This is the biggest breaking change Dvala has taken.** Honest assessment:

### Risks

- **Migration volume higher than estimate.** Grep count of `not(`, `boolean(`, and truthy-style `if`/`&&`/`||` usage across the repo may be larger than expected. If it's a multi-day migration, budget accordingly.
- **Subtle behavior change in `&&`/`||`.** The shift from value-returning (last truthy / first truthy) to Boolean-returning is a real semantic change. Every `x || default` use must be reviewed. A codemod can't safely rewrite these without understanding intent.
- **External user code breaks.** Every existing Dvala program touching `if`/`&&`/`||`/`not`/`boolean` non-Boolean-ly breaks. Pre-1.0 means fewer users, but "fewer" isn't "zero."
- **Test suite churn may mask real bugs.** Large mechanical migration may accidentally change semantics in unnoticed ways. Code review and a clean test-pass are the safety net.

### Mitigations

- **Land as a single atomic PR.** All changes together. No half-migrated state.
- **Full test pass in the PR.** Every test migrated and passing before merge. No follow-up fixes expected.
- **Migration guide for users.** External users get before/after patterns, codemod snippet, and a one-line fallback (`let not = !`, explicit-check examples).
- **Clear release note.** Communicate the change at the top of the next release. Pre-1.0 users expect breaking changes; this one just needs to be well-documented.

### Backout

If the change introduces unforeseen issues during the PR review or shortly after merge:

- Revert the single PR → full restoration of pre-change behavior.
- Post-mortem the specific issue.
- Re-land with the fix.

No gradual rollback — strict Boolean is either on or off. Atomic landing, atomic revert if needed.

---

## Non-goals

- **Migrating user code for users.** The codemod is for the in-repo work. External users run their own migrations.
- **Formal soundness proof.** Boolean-strictness is a surface change over existing typing; no new soundness argument is needed beyond "the type checker accepts fewer programs."
- **Interoperability layer for "truthy-legacy mode."** No opt-in flag to retain old semantics. Clean break.
- **Feature-flagging individual sub-changes.** The four changes ship together; flagging them separately reintroduces the sequencing problem.

---

## Open questions

- **Should `?? ` (nullish coalescing) ship alongside?** Default-value idiom migration is the roughest part of the change. `x ?? default` would be a clean replacement for the old `x || default`. **Decision for v1: no** — `??` is a separate language feature with its own design. Explicit `if-then-else` is the v1 migration path. If `x ?? default` becomes painful in practice, revisit as a follow-up.
- **Should `str(null) -> "null"` instead of `""`?** Stringification semantics are orthogonal to Boolean-strictness. Not in scope. If revisited, separate design doc.
- **Should `assert(P)` / `assert(P, msg)` produce a different error message in strict mode when the user wrote `assert(someNullable)` clearly intending a null-check?** The type checker can detect this pattern and suggest `assert(someNullable != null)`. Nice-to-have polish; not a blocker.
- **Migration-guide doc location.** Under `design/reference/` or `reference/` (user-facing)? Probably user-facing — the migration guide is for users, not design-history readers. Verify convention before writing.

---

## Sequencing

**Standalone.** Not blocked by and doesn't block:

- Refinement types (their Q7 predicate rule is already Boolean-strict; the language catching up is a bonus, not a requirement).
- Upper bounds (unrelated machinery).
- KMP port (parser/typechecker changes carry forward to any host).

**Recommended ordering:** ship this as the **first pre-1.0 initiative** after the refinement-types + upper-bounds design docs land. The reasoning:

- Foundational: every Dvala program written after this lands is strict-Boolean. Every program written before needs migration. Shipping earlier = smaller migration set.
- Clears the last major truthy inconsistency before refinement types Phase 1 begins. Refinements land into a consistent language.
- Breaking change discipline: pre-1.0 users expect breakage; this is the right window. Post-1.0 is much harder.

**Alternative:** ship after upper-bounds Phase 0a but before refinements Phase 1. Either ordering works; the key is "before refinements Phase 1 starts."
