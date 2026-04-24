# Type-Level Computation

**Status:** Parked — speculative Phase D+ item. Not scheduled.
**Created:** 2026-04-23
**References:** `2026-04-12_type-system.md` (set-theoretic foundation, decision #15)

---

## Goal

Capture the direction for future type-level computation features (conditional types, mapped types, recursive type functions, literal-length arrays) so Phase D in the type-system plan can be closed without dropping the idea.

This doc intentionally stays a stub. It exists to hold the shape of the feature until there's concrete user demand.

---

## What's in scope

Extensions that compute over types, not just combine them. The current set-theoretic algebra (union, intersection, negation, literal, record, tuple, array, function, keyof, indexed-access) is **algebraic** — it combines existing types into new ones. Type-level computation adds the ability to:

- **Conditional types.** TypeScript's `A extends B ? X : Y` — pick a branch based on a subtype check. In set-theoretic terms: "if `A ⊆ B` then `X` else `Y`".
- **Mapped types.** Walk a record's fields and produce a new record. TypeScript's `{[K in keyof T]: Foo<T[K]>}`. Combined with `keyof` and indexed-access (both already shipped), this covers "transform every field" patterns — `Partial<T>`, `Required<T>`, `Readonly<T>` analogs.
- **Recursive type functions.** `type Flatten<T> = T extends Array<infer U> ? Flatten<U> : T`. Requires a recursion limit and fuel to terminate.
- **Literal-length arrays (`Number[4]`).** Fixed-size array types. Needs literal values in type parameter positions. Depends on literal types (already shipped) and potentially the refinement layer (`Number[] & {xs | count(xs) == 4}`). Can also stand on its own without refinement — tuple aliases already cover the use case (`type Vec3 = [Number, Number, Number]`).

## What's already shipped that this would build on

- Literal types (Phase A).
- `Keyof` / indexed-access (`T[K]`) — PR #80 + #86.
- Set-theoretic algebra as the substrate — type-level computation results live inside the same `Type` union.
- Generic type aliases (`type Pair<A, B> = [A, B]`).
- Extensible `Type` union (Phase A's "no architecture impact" property).

---

## Why deferred

Same general reasons as refinement types, with a lower severity:

- **Decidability.** Conditional types + recursive type functions + higher-kinded abstraction is enough to make the type system Turing-complete (TypeScript demonstrates both the power and the pain of this). Needs recursion fuel and clear "gave up" semantics.
- **Error-message UX.** Type-level programs produce type-level error traces — "`Foo<Bar<Baz<T>>>` expected `U`, got…". These are notoriously hard to read.
- **Incremental cost is moderate, not small.** Each primitive (conditional, mapped, infer) is a focused addition, but the compound interactions are where the implementation grows.
- **No clear demand yet.** Current Dvala code doesn't hit the ceiling of what the algebraic primitives can express. Adding type-level computation before there's pressure would be speculative.

Decision #15 in the type-system plan covers this: "Set-theoretic covers 90%. Door open via extensible `Type` union."

---

## Relation to refinement types

Type-level computation and refinement types share a slot in the old type-system plan's Phase D, but they're distinct:

| | Type-level computation | Refinement types |
|---|---|---|
| What it adds | Computed types (conditional, mapped, recursive) | Predicates on values |
| Decision procedure | Subtype check + type reducer | SMT solver or custom decision procedure |
| Runtime impact | None (types always erased) | Only at trust boundaries (predicate eval) |
| User-facing syntax | Type-level expressions | Predicate-level expressions |
| Error mode | "type-level recursion limit hit" | "solver couldn't prove / timed out" |

They can ship independently, and picking one doesn't commit to the other.

---

## Open questions (for when this is picked up)

- **Syntax.** TypeScript's `A extends B ? X : Y` doesn't fit Dvala's surface — `extends` is a keyword collision. Candidates: `match`-at-the-type-level, Haskell-style type families, or a small keyword (`if-type` / `when`). Needs design.
- **Recursion fuel.** Hard limit vs time limit vs depth limit. TypeScript uses a depth cap that users regularly hit.
- **Interaction with inference.** Conditional types can defer subtype checks across inference boundaries. Current Simple-sub flow assumes subtyping is a decision, not a computation. Needs a constraint-deferral mechanism similar to the one `Keyof`/`Index` use today.
- **Prioritization between features.** Mapped types with the existing `Keyof`/`Index` primitives give a lot of power on their own — they might be worth doing before conditional types. Literal-length arrays are smaller still and might ship as a stand-alone first step.
