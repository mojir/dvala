# Generic Upper Bounds (`T: U`) — Implementation Plan

**Status:** **Phase 0a shipped 2026-04-24. Phase 0b shipped 2026-04-24.** (Type-alias bounds + annotation-scoped function-type bounds + let-binding-scoped `<T: U>` all implemented; type-system plan decision #25 reflects the shipped state.)
**Created:** 2026-04-24
**Last updated:** 2026-04-24 (Phase 0a then 0b implementation landed back-to-back)
**Scope discipline:** Minimum viable upper bounds only. Hard-capped feature list; explicit out-of-scope list below. **If scope creeps beyond what's in this doc, stop and reassess before shipping.**
**References:** `2026-04-12_type-system.md` (set-theoretic foundation, decision #22 on type-variable syntax), `2026-04-23_refinement-types.md` (primary motivation)

---

## Decision

Add generic upper-bound syntax `<T: U>` to Dvala's type annotations. Semantic: `T` is a subtype of `U` — an upper-bound constraint that the inference engine already handles internally (Simple-sub's `Var.upperBounds` array). The new work is surface syntax + propagation through the existing machinery.

**Syntax choice:** `T: U` (colon), matching Kotlin and Rust conventions. Not `T extends U` (misaligned with set-theoretic semantics — Dvala has no inheritance). Not `T <: U` (premature optimization for lower bounds that likely never ship — Dvala's variance inference + set-theoretic types remove most of the motivating cases).

**Two sub-phases:**

- **Phase 0a — Type-alias bounds + annotation-scoped function bounds.**
  - `type NonEmpty<T: Sequence> = T & {xs | count(xs) > 0}` (type-alias bounds — primary refinement-types unblock).
  - `let f: <T: Number>(T) -> T = (x) -> x` (annotation-scoped function bounds — extends the existing forall-quantified annotation path from PR #87 with explicit bounds).
  - Both live inside the type-annotation parser. Minimal let-parser changes.
  - **Must ship before refinements Phase 1 starts.**
- **Phase 0b — Let-binding-scoped `<T>` syntax.** `let sum<T: Number> = (xs: T[]) -> reduce(xs, +, 0)`. Adds `<TypeParams>` between the let binding name and the `=` sign, so type vars are scoped to the entire RHS body (not just the annotation). **New syntactic feature** — `let f<T>` is rejected by the current parser. **Independent of refinements — ships when it ships.** Useful polish; not a blocker for anything downstream.

Splitting into 0a/0b separates "what can be added as a small annotation-parser extension" (0a — covers both motivations and enables refinements) from "new syntactic surface on let-bindings" (0b — larger project, polish).

Scope is deliberately tight: single upper bound per parameter, no F-bounds, no variance interaction rework. Multi-bound via existing intersection syntax (`T: A & B`); union and negation bounds also work for free via the same mechanism.

---

## Motivation

Two independent reasons, both concrete:

**1. Refinement types declaration-time checking.** `type NonEmpty<T: Sequence> = T & {xs | count(xs) > 0}` lets the fragment-checker verify `count(xs)` is valid at declaration time (every instantiation of `T` is guaranteed to be a Sequence). Without bounds, the same refinement needs hybrid declaration/use-site checking (Q3 Option C in the refinement-types interview) — works but worse error locality.

**2. Generally-useful type-system polish.** Dvala has generic type aliases and type variables but no way to constrain them. Writing a polymorphic function that needs operations on `T` — arithmetic, sequence access, field projection — today means either inlining the constraint at every use site or using overly-broad base types. Bounds give the precise tool.

Neither reason alone would justify the work. Together, they produce enough value to ship a small focused feature before refinements begin.

---

## Design — what ships

### Surface syntax

Optional `: UpperBound` after a generic parameter name.

**Phase 0a — type-alias bounds AND annotation-scoped function bounds:**

```dvala
// Type-alias bounds
type NonEmpty<T: Sequence> = T & {xs | count(xs) > 0}
type Positive<T: Number> = T & {n | n > 0}
type KeyedBy<R: {name: String, ...}> = R & {...}

// Annotation-scoped function bounds — `<T: U>` prefix inside a function type
let sum: <T: Number>(T[]) -> T = (xs) -> reduce(xs, +, 0)
let getName: <R: {name: String, ...}>(R) -> String = (r) -> r.name
let reduce: <T, U: T>(T[], (U, T) -> U, U) -> U = ...

// Unbounded remains unchanged
type Box<T> = {value: T}                      // ok, T unbounded
let identity: (A) -> A = (x) -> x             // existing forall-quantified path, still works
```

The two 0a forms are unified by living **inside the type-annotation parser**. `<T: U>` works anywhere a `<TypeParams>` list appears — on type aliases today (existing), or as a new prefix on function types (annotation-scoped universal quantifier). No new let-parser work.

**Phase 0b — let-binding-scoped `<T>` syntax (independent, later):**

```dvala
let sum<T: Number> = (xs: T[]) -> reduce(xs, +, 0)
let project<R: {id: String, ...}, K: String> = (r: R, k: K) -> get(r, k)
```

Phase 0b adds a genuinely new syntactic feature: `let f<TypeParams> = ...` does not exist today (the parser rejects `<T>` between a let name and `=`). 0b includes the parser extension + the inference plumbing to scope type vars across the entire let body (not just the annotation). Structurally separate from 0a.

**Difference in scoping:**

- **0a annotation-scoped** (`let f: <T: U>(T) -> T = …`) — `T` is visible only inside the annotation. The lambda body doesn't name `T` (and doesn't need to, since the body's types flow from the annotation).
- **0b binding-scoped** (`let f<T: U> = …`) — `T` is visible in parameter annotations, return annotation, intermediate `let` bindings inside the body, everywhere inside the RHS. Needed when users want `T` in destructure-pattern annotations, nested let types, or explicit type assertions inside the body.

Most real-world use cases (bounded polymorphic functions with typed parameters and returns) are satisfied by 0a's annotation-scoped form. 0b is reach-for-when-you-need-it polish.

In all forms, the bound can be **any existing type expression** — primitives, unions, intersections, records (open/closed), functions, aliases, tuples, arrays, negations. See "Multi-bound intersection" below.

### What `<T: U>` adds over today's `A & Bound` pattern

Dvala today supports a limited form of constrained polymorphism via forall-quantified annotations:

```dvala
let asNumber: (A & Number) -> A = (x) -> x         // works today
```

The intersection in the parameter type effectively constrains `A` to be compatible with `Number`. Why add `<T: U>` syntax on top?

- **Type-alias bounds can't be expressed via the annotation-intersection trick.** `type NonEmpty<T> = T & {xs | count(xs) > 0}` has nowhere to put a constraint on `T` via annotation. Phase 0a is the only way to get declaration-time checking here. **This is the primary refinement-types unblock.**
- **Function-level bounds become first-class and visible.** `let sum<T: Number>(xs: T[]) -> T` shows the constraint at the signature level (where users look); `let sum: (A & Number)[] -> (A & Number) = ...` hides it inside parameter types. Phase 0b is polish on an existing capability.
- **Error messages gain structure.** Bound violations name the parameter and the bound; intersection-based failures just say "this isn't a subtype of that."

### Multi-bound, union, negation — all free via existing set-theoretic machinery

The bound is any type expression. Because Dvala's type system already composes union, intersection, and negation, **every combinator works as a bound with zero additional feature work.**

```dvala
// Intersection — "T must satisfy multiple constraints"
type IndexedCollection<T: Sequence & {id: String, ...}> = T
let clamp: <T: Number & Orderable>(T, T, T) -> T = ...

// Union — "T can be any of these"
let process: <T: Number | Integer>(T) -> T = (x) -> x * 2

// Negation — "T must NOT be X"
let safeOperation: <T: !Null>(T) -> T = (x) -> useValue(x)

// Arbitrarily composed
let complex: <T: (Number | String) & !0 & !"">(T) -> T = ...
```

Mechanism: the parser accepts any type expression as the bound (no special case for bound-shape). The subtype-check at instantiation does `constrain(arg, boundType)` — which the existing subtype machinery already decomposes over `&`, `|`, `!`, records, tuples, etc. No new feature per combinator; just the substrate doing its job.

This is one of the concrete advantages of Dvala's set-theoretic foundation: extending the bound language is a consequence of the type algebra, not a separate implementation effort.

### Semantics

`<T: U>` at declaration time creates a type variable with `U` in its `upperBounds` array:

```typescript
// When parsing `<T: U>`, the binder creates:
const T: TypeVar = { tag: 'Var', id, level, lowerBounds: [], upperBounds: [U] }
```

At instantiation (type-alias expansion or function call), the bound is preserved on the fresh variable. At use sites, the existing `constrain` function's `Var` branch propagates the bound — if an actual argument isn't a subtype of `U`, the existing subtype-check produces an error.

**The inference machinery does not change.** Verified by the 2026-04-24 reviewer pass: `TypeVar` already has `upperBounds: Type[]` (line 84 of `infer.ts`); `freshenInner` at lines 2031-2035 copies bounds recursively; `generalizeInner` at lines 2175-2181 generalizes bounds recursively; `constrain`'s `Var` branch at line 549 propagates every existing upper bound against incoming lower-bound constraints. The only new work is the parser + storage.

**Freshening path — what actually matters for Phase 0a.**

For user-written annotations (`let f: <T: Number>(T) -> T = ...`), the flow is:

1. **Parse time.** `parseTypeAnnotation` creates the `Var` node for `T` via `makeTypeRef`. **The Phase 0a parser must populate `upperBounds: [parsedBound]` at this step** — this is where the bound must be present.
2. **Definition time.** `generalizeTypeVars(declaredType, -1)` (at `infer.ts:1119` in the let-binding path) runs. `generalizeInner` copies the `Var` at GENERALIZED_LEVEL **and recursively generalizes both `lowerBounds` and `upperBounds`** (lines 2175-2181). The bound carries forward to the generalized template.
3. **Use time.** Each reference to `f` calls `freshen` → `freshenInner` (line 2013). `freshenInner` copies the generalized var to a fresh one **and recursively freshens bounds** (lines 2034-2035). The bound lands on the fresh var.
4. **Call site.** Argument types are constrained against parameter types via `constrain(arg, paramVar)`. The `constrain` `Var` branch (line 549) iterates `paramVar.upperBounds` and constrains `arg <: bound` for each. Bound-check fires automatically.

**What this means for the implementer:** the only new work is step 1 — populating `upperBounds` from the parsed `<T: U>` prefix. Every downstream stage already handles `upperBounds` correctly.

**Aside (not Phase 0a scope):** Builtins use a different freshening path via `freshenAnnotationVars` → `freshenAllVars`. Builtin signatures don't use `<T: U>` today and Phase 0a doesn't add them. If bounds on builtin signatures are ever added, `freshenAllVars`'s `Var` case (line 1927) would need to start copying bounds — it doesn't today. Flag for whoever extends bounds to builtins later; not a Phase 0a concern.

### Error messages

Bound violations surface as subtype errors with bound-specific phrasing:

```
Error at line 42: type argument does not satisfy bound
  Parameter: T  (bound: Sequence)
  Argument:  Integer
  Integer is not a subtype of Sequence (Array | String).
```

And for display / hover — when a `TypeVar` has an upper bound sourced from an explicit annotation, `typeToString` renders `T: Sequence` (or `T: U` for whatever the bound is), not bare `T`. Users see their declared bounds in error messages and IDE hover, not just stripped-to-name type variables.

Implementation: the existing subtype-error code path handles the violation case. The display-time change is a small branch in `typeToString`: check whether the var has an explicit-bound marker in its upper bounds; if yes, render `name: bound` form.

---

## Out of scope (hard line)

None of these ship in Phase 0. Each is a separate project that can be taken up later if demand emerges.

- **Lower bounds.** `T: super U` / `T :> U`. Scala-style. Useful for certain variance patterns; not needed for refinements or the general case.
- **F-bounds.** `T: Container<T>`. Self-referential constraints. Requires careful design around circularity and fixed-point semantics.
- **Variance-bound interaction.** Decision #19 says variance is inferred from use. Bounds add an explicit-contract axis on the same parameters. For Phase 0, these are treated as orthogonal — bounds constrain what `T` *can be*; variance remains inferred from how `T` *is used*. Any rework of variance to interact with bounds is out of scope.
- **Bound inference.** Compiler-derived bounds from use sites. Users always write bounds explicitly; the compiler doesn't guess.
- **Bound modification at use site.** `<T: Sequence & {xs | count(xs) > 0}>` where the bound itself is refined — falls out naturally once refinements ship, but Phase 0 doesn't design for it. If the bound expression includes a refinement, it's handled by the refinement-types plan's own subtype machinery — no new Phase 0 feature.
- **Type-class-style bounds.** `T: Show` where `Show` is a structural interface of functions `T` must support. Requires a whole trait/interface system Dvala doesn't have.
- **Anything else users ask for "while you're at it."** If a feature isn't in the "what ships" section, it doesn't ship in Phase 0. Defer, design separately, reconsider.

The purpose of this list is to resist scope creep. When someone asks "can we also add X?" during Phase 0 work, the answer is "not in Phase 0."

---

## Implementation roadmap

Two phases, **Phase 0a before Phase 0b**. Only 0a blocks refinements.

### Phase 0a — Type-alias bounds + annotation-scoped function bounds

**Status: shipped 2026-04-24.**

**Target:** 2.5–3.5 weeks, ~250-350 LOC (implementation only; 0a.7 documentation work is in addition).
**Actual:** ~180 LOC of production changes + ~130 LOC of tests. Completed in a single session.

**Deferred items from the original Phase 0a scope:**

- **0a.6 (Display polish — render `T: Bound` in `typeToString`).** Not required for Ship-gate since bound-violation errors already name the parameter, bound, and supplied argument clearly. The `TypeVar` wire format would need a `declaredBound?: Type` marker field to distinguish explicit annotation bounds from inference-added upper bounds — added in a follow-up if the IDE-hover UX proves weak in practice. Tests confirm the error messages are actionable without it.

Both forms live inside the type-annotation parser. They share the bound-parsing, storage, and enforcement logic. Let-parser is untouched.

**Type-variable naming rules (inherited from existing forall-quantified annotations):**

- **Single uppercase letters only** (`A`, `B`, `T`, `K`, `R`, etc.). `<Key: String>` or `<Elem: Number>` are rejected — multi-char uppercase names remain reserved for aliases and primitives per Decision #22. The unbounded annotation path today has this same restriction; 0a keeps it. If multi-char type-var names become desired, that's a separate feature expansion.
- **Unbounded prefix form is supported** — `<T>(T) -> T` (no bound) is accepted and behaves identically to the existing `(A) -> A` forall-quantified form. It's the explicit-quantifier variant of the same semantics. Useful for readability and for symmetry with the bounded form.

#### 0a.1 — Parser extension for type-alias generic params

- Extend `parseTypeDeclaration` to accept optional `: Type` after each parameter name in the `<T, U, V>` list.
- Existing parser logic (`src/parser/subParsers/parseTypeDeclaration.ts` generic-param-list loop, around lines 47-61) is the single change site.
- Parser fixture suite: accept `<T: U>`, `<T: U, K: V>`; reject malformed bounds (`<T:>`, `<T U>`).

#### 0a.2 — Parser extension for annotation-scoped function-type quantifiers

- Extend the type-annotation parser to accept an optional `<TypeParam*>` prefix before a function-type `(...) -> ...`.
- Entry point: `parseFunctionOrType` / equivalent in `parseType.ts`. Before the opening `(`, peek for `<`. If present, consume the `<TypeParam*>` list (same grammar as 0a.1 — parameter names with optional `: Bound`).
- Register these type params in the annotation-local `typeVarMap` (already used for single-letter vars like `A`) with their bounds in `upperBounds`.
- After parsing the `<...>`, fall through to the normal function-type parse. Type vars introduced by the prefix are in scope for parameter types and the return type.
- Test: `<T: Number>(T) -> T` parses as a function type with a bounded forall-quantified T; inference treats it equivalently to the existing `(A) -> A` pattern plus the bound on T.

#### 0a.3 — Type-alias registry schema update

**Core semantic change.** Today `typeAliasRegistry` stores each alias as `{params: string[], body: string}` (parameter names only, no bound info). Needs to become:

```typescript
type AliasParam = { name: string; bound?: string }   // bound stored as source text, parsed on expansion
type AliasEntry = { params: AliasParam[]; body: string }
```

Ripple effects — **all call sites that read or write the `params` array need updating**:

- `src/parser/types.ts:300` — `TypeAliasInfo` interface (`params: string[]` → `params: AliasParam[]`). This is the shape flowing from parser into AST.
- `src/parser/ParserContext.ts:29` — `typeAliases` map type.
- `src/parser/subParsers/parseTypeDeclaration.ts:83` — constructor site (`ctx.typeAliases.set(name, { params, body: typeExpr })`). Must build `AliasParam[]` with optional bounds.
- `src/typechecker/parseType.ts` — `TypeAliasRegistrySnapshot` type (around line 43) and `snapshotTypeAliases` / `restoreTypeAliases` (lines 57-69) — carry bound info through serialization for cross-file typechecking.
- `src/typechecker/parseType.ts` — `makeTypeRef` (around line 815) reads `alias.params.map(...)`. After the schema change, `param` is `AliasParam`, not `string`. This is also where the bound-check at expansion (0a.4) lands.
- `src/typechecker/parseType.ts:808-822` — `registerTypeAlias` signature change (`params: AliasParam[]`).
- `src/typechecker/typecheck.ts:155-156, 205-206` — callers that read `{ params, body }` from the parsed AST and call `registerTypeAlias`. `params` is now `AliasParam[]`.

The bound is stored as source-text and parsed on expansion; this avoids a circular-parse dependency where a bound references a type defined later in the same file. Matches how `body` is already stored.

#### 0a.4 — Bound enforcement at alias expansion

- In `makeTypeRef` within `TypeParser` (around lines 808-822), when expanding `Alias<ArgType1, ArgType2, ...>`:
  - Parse each bound (if present) in the current type environment.
  - For each positional argument, check `constrain(argType, boundType)` — if violation, produce a bound-specific error.
  - Expand the body as today, substituting parameters.
- Test: `NonEmpty<Integer[]>` accepted; `NonEmpty<Integer>` rejected with a bound error that names the parameter `T`, the bound `Sequence`, and the supplied `Integer`.

#### 0a.5 — Bound enforcement for annotation-scoped function-type quantifiers

- When an annotation-quantified function is instantiated at a call site, the type vars are freshened (existing let-polymorphism freshening via `freshenInner`). Their `upperBounds` copies forward (already handled — verified by the reviewer pass).
- At the call, the argument types are `constrain`-ed against the (freshened) parameter types, which carry the bound via their type-var `upperBounds`. The existing `constrain(arg, Var)` branch at `infer.ts:549` iterates existing upper bounds and enforces each — the bound check fires automatically.
- Test: `let f: <T: Number>(T) -> T = (x) -> x; f(5)` accepted; `f("hi")` rejected with a bound error.

#### 0a.6 — Display & error-message polish

- `typeToString`: when rendering a `TypeVar` whose only upper bound was sourced from an explicit declaration, render `Name: Bound` (e.g. `T: Sequence`) rather than bare `T`. Needs a small flag on the TypeVar (or a distinguished upper-bound entry) marking the source.
- Bound-violation errors name the parameter and the expected bound, not just "X is not a subtype of Y."

#### 0a.7 — Documentation

- Update `2026-04-12_type-system.md` with the new decision — the decisions table currently has a numbering gap (#21 appears out of order after #24); the implementer picks the next clean slot (likely #25 unless the table is tidied first).
- Update `2026-04-23_refinement-types.md`:
  - Header "Requires (Phase 0)" note → "shipped YYYY-MM-DD, PR #XXX."
  - Q3 resolution promotes to Option A (strict declaration-time sequence check) throughout.
  - Fragment-checker's `count(var)` validation becomes: at declaration, the checker sees the generic parameter's bound in the type environment; a parameter with bound `Sequence` is valid for `count(var)`; a parameter with bound `Integer` is rejected. This is the mechanism that makes Q3 → Option A work.
- Register a `Sequence` type alias (or confirm the existing one) so `type Foo<T: Sequence>` resolves cleanly. If not registered, `<T: Array<Unknown> | String>` works as an explicit equivalent.
- Short section in user-facing docs — explain both type-alias and annotation-scoped forms, note that let-binding-scoped `<T>` is 0b (deferred).

**0a Ship gate:** `type NonEmpty<T: Sequence> = T & {xs | count(xs) > 0}` parses AND `let f: <T: Number>(T) -> T = (x) -> x` parses. Both use-site violation paths produce clear errors. Refinement-types Phase 1 can rely on declaration-time bound checks.

---

### Phase 0b — Let-binding-scoped `<T>` syntax

**Status: shipped 2026-04-24.** Independent of refinements; landed alongside 0a.

**Actual:** ~150 LOC of production changes + ~140 LOC of tests. Completed in a single session.

**Deferred items (same rationale as 0a.6):**

- Display polish — `typeToString` rendering of `T: Bound` for binding-scoped type vars. Errors already name parameter + bound clearly; postponed until IDE-hover UX shows demand.

**What 0b adds that 0a doesn't cover:** 0a's annotation-scoped `<T: U>` scopes `T` to the annotation only. 0b's `let f<T: U> = ...` scopes `T` to the entire let RHS — intermediate `let` bindings, destructure-pattern annotations, and explicit type assertions inside the body can all reference `T`.

```dvala
// 0a handles this (annotation-scoped)
let f: <T: Number>(T[]) -> T = (xs) -> xs[0]

// 0b handles this (binding-scoped — T visible inside the body)
let processBatch<T: Number> = (xs: T[]) -> do
  let first: T = xs[0]          // T used in intermediate annotation — 0b only
  let doubled: T[] = map(xs, (x) -> x * 2)
  [first, ...doubled]
end
```

Most users won't need 0b's extra scoping flexibility. Ships when explicit demand appears.

#### 0b.1 — New parser surface for `let f<T> = ...`

- `let f<T> = ...` does not parse today — `parseLet.ts` advances directly to `parseBindingTarget` with no awareness of `<TypeParams>`. **This is a new syntactic feature, not an extension.**
- Extend the let-parser to recognize an optional `<TypeParam*>` block between the binding name and the `=` sign. Parse bounds using the same logic as 0a.1 / 0a.2.
- Plumb the scoped type parameters into the inference context for the entire RHS (parameter annotations, return-type annotation, body annotations, intermediate `let`s).

#### 0b.2 — Binding-scoped type-variable context

- Currently, annotation-level type variables use a per-annotation `typeVarMap` inside `TypeParser`. 0b's `<T>` needs a wider scope — spans the entire let's RHS.
- Implementation: pre-process the `<T>` list before the binding target is parsed; register the type vars + bounds in a scoped context; consume in every annotation and type-level construct inside the RHS; tear down at the end of the let binding.

#### 0b.3 — Interaction with existing forall-quantified annotations

- Today, `let f: (A) -> A = (x) -> x` is forall-quantified via the annotation path (PR #87). `let f<A> = (x) -> x` would be the same thing via the new syntax. Confirm the two paths produce equivalent inference results (both give a polymorphic `f` at use sites). Tests: both forms accept the same calls and reject the same misuses.

#### 0b.4 — Display

- Hover and error messages show `<T: U>` when the user wrote it. If users mix the two polymorphism paths (e.g. `let f<T>: (T) -> T = ...`), the display should match what the user wrote where possible.

**0b Ship gate:** `let sum<T: Number> = (xs: T[]) -> reduce(xs, +, 0)` works. Bound violations at call sites produce clear errors. Refinement-types users can write generic functions with bounded parameters.

---

### Phase 0a → 0b sequencing

Phase 0a is a hard prerequisite for refinement-types Phase 1. Phase 0b is independent. Sensible orderings:

- **0a → refinements Phase 1 → 0b.** Ship refinements as soon as 0a lands; 0b becomes polish later.
- **0a → 0b → refinements Phase 1.** If 0b is ready before refinements Phase 1 starts, bundling is fine.
- **0a and 0b in parallel.** Possible if separate people are available; 0b only needs 0a's parser work as reference.

0b is **not a blocker for refinements** under any of these orderings.

---

## Non-goals

- **Formal soundness proof.** Bounds are a surface feature over existing Simple-sub; soundness follows from Simple-sub's existing proofs. No separate correctness argument needed.
- **Performance optimization.** The bound check is a single `isSubtype` call per instantiation — cheap. No need for caching or specialization in v1.
- **Interaction with type-level computation features.** Conditional types, mapped types, etc. (see `2026-04-23_type-level-computation.md`) have their own future design work. Phase 0 bounds don't try to anticipate.

---

## Open questions

- **Where does the bound-check fire for lazy-instantiated generics?** If a generic type alias is defined but never instantiated, the bound isn't checked. That's fine (unused code has no soundness implications), but the error UX should be clear when a previously-unused alias is first instantiated with a bad argument. Implementation detail; not a design question.
- **Should bounds be expressible on type aliases' right-hand side type parameters?** `type Wrapper<T: Sequence> = {inner: T, size: Integer}` — clearly yes. `type Apply<F<T: Number>> = F<Integer>` (higher-kinded bounds)? Out of scope — Dvala doesn't have higher-kinded types at all. Not a question that fires in Phase 0.
- **Error message format.** The sketch above is tentative. Final wording can iterate with user feedback during implementation.

---

## Relation to refinement-types Phase 1

**Phase 0a ships first. It is the hard prerequisite for refinement-types Phase 1.** Phase 0b is independent — refinements do not need it.

Once 0a is in, the refinements plan's Q3 collapses to Option A (strict declaration-time sequence check). The mechanism:

1. User writes `type NonEmpty<T: Sequence> = T & {xs | count(xs) > 0}`.
2. At declaration parse-time, the type parameter `T` is registered with bound `Sequence`.
3. The fragment-checker walks the predicate AST. When it encounters `count(xs)` where `xs : T`, it looks up `T`'s bound — `Sequence`. Since `Sequence ≤ Sequence` (trivially), `count` is fragment-valid.
4. At instantiation `NonEmpty<Integer>`, the alias expander checks `Integer ≤ Sequence` — fails — error with the parameter/bound/argument triad.
5. At instantiation `NonEmpty<Integer[]>`, the expander checks `Integer[] ≤ Sequence` — passes — expansion proceeds.

The fragment-checker needs the bound visible in its type environment at declaration time. 0a.2's registry-schema change carries bound info through to this environment. 0a.3's alias expander enforces the bound at instantiation. Together they make Option A work.

Changes to `2026-04-23_refinement-types.md` applied by 0a.5:

- Header "Requires (Phase 0)" line → "Shipped dependency: upper bounds 0a (PR #XXX)."
- Q3 resolution promoted to Option A throughout the doc; hybrid-check prose removed.
- Reviewer item S6 (fragment-checker sequence check implementation) becomes the straightforward `isSubtype(boundType, union(Array<Unknown>, StringType))` check via the type environment.

Nothing else in the refinements plan changes.
