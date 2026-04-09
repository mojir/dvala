# Type System Design

**Status:** Draft
**Created:** 2026-03-30

## Goal

Define the architecture and phased implementation plan for Dvala's type system: inferred value types (Hindley-Milner), effect row inference (Row Polymorphism), and full handler typing.

---

## Background

Dvala is currently untyped. The runtime is a trampoline-style evaluator that dispatches effects by name, handles algebraic handlers with deep semantics, and supports serializable continuations. A type system must fit within Dvala's specific constraints:

- **Pipeline**: `tokenizer → parser → typechecker → AST bundle → KMP evaluator`
- **Runtime is evaluator-only**: the KMP runtime has no parser and no typechecker. Everything the runtime needs must be embedded in the AST bundle at compile time.
- **No host info at compile time**: the host registers handlers at `run(program, handlers)` time, not at compile time.
- **Serializable continuations**: the handler stack can be serialized and reconstructed. This rules out static evidence passing (handler indices baked into the AST).
- **Deep handler semantics**: `resume` reinstalls the handler. The handler is always active during the continuation.
- **One-shot `resume`**: enforced at runtime (`resumeConsumed` flag). Not enforced statically.
- **Effectful macros**: expand at runtime in the evaluator. The typechecker never sees the expanded code.
- **Lazy evaluation**: pure expressions are lazy. `Lazy<T>` = `T` in the type system (transparent).

---

## Proposal

### Architecture

**Value types: side-table only (erased)**

The typechecker builds a `Map<NodeId, Type>` during checking. After checking passes, the map is discarded. No type annotations are injected into AST nodes. The runtime never sees value types.

**Effect types: not injected into AST**

Evidence passing (injecting handler indices into `perform` nodes for O(1) dispatch) is skipped. The current `clauseMap.get(effectName)` dispatch is already O(1) per handler level, and handler depth in practice is small (2–5 levels). Evidence passing can be revisited if profiling shows dispatch is a bottleneck.

**Inference-first, annotations later**

No type annotations in the initial implementation. Everything is inferred. Annotation syntax is a later addition and does not change the inference engine — annotations become constraints fed into the same unifier.

---

### Phase A: HM Value Types

Hindley-Milner inference with structural typing and row polymorphism for records.

- Infers types for all expressions without annotations
- Row polymorphism for records: `{name: String, ...r}` — a function needing a `name` field works with any record that has one
- Catches value-level type errors: `1 + true`, wrong arity, field access on non-objects
- Side-table only — erased after checking
- `perform` return type and `resume` are `Any` in this phase — effect typing is Phase B

**Lazy types:** `Lazy<T>` = `T`. The type system does not distinguish forced from unforced values. Laziness is transparent.

---

### Phase B: Effect Row Inference

Every function gets an inferred effect row tracking which effects it performs.

**Row structure:**

```
(String) -> <log, fetch | r> String
```

- `<log, fetch>` — named effects this function performs
- `| r` — open row variable: effects from the ambient context (callbacks, etc.)

**Inference rules:**

- `perform(@log, x)` — adds `log` to the current function's effect row
- `do with h; body end` — removes the effects `h`'s clauses handle from the row of `body`
- Calling a function with row `<log | r>` — adds `log` to the caller's row
- At the top level, unhandled effects become the leaked row `r`

**In Phase B:**
- `perform(@eff, arg)` returns `Any`
- `resume` has type `Any -> Any`
- The typechecker tracks *which* effects are performed, not *what flows through them*

**Effectful macros:**

Effectful macros expand at runtime in the KMP evaluator, which has no typechecker. Unexpanded macro call sites in the AST are permanently untyped holes: type `Any`, effect row `<| r>` (open — may perform anything). Pure macros are expanded before typechecking and present no issue.

**Bundle manifest:**

The leaked effect row `r` at the top level is exported in the AST bundle as a manifest — the set of effect names the program expects the host to handle:

```json
{
  "leakedEffects": ["llm.complete", "db.query"]
}
```

The host can validate upfront at `run()` time that all listed effects have registered handlers, rather than discovering missing handlers mid-execution.

**Host dispatch:**

- Exact names: `{ effect: 'llm.complete', handler: ... }`
- Catch-all: `{ effect: '*', handler: ... }` — explicit opt-in fallback (used by playground and telemetry)
- Namespace wildcards (`llm.*`) are removed — they prevent manifest validation and make the host contract implicit

---

### Phase C: Handler Typing (deferred)

Full typing of what flows through `perform` and `resume`.

**Effect return type:**

`perform(@eff, arg)` has type `α` (fresh type variable). `α` is constrained by the handler: the argument passed to `resume` in the matching clause must have type `α`.

For host effects (open row — no handler in Dvala code): `α = Any`.

**Optional effect declarations:**

```
effect @llm.complete(String) -> String
```

When declared:
- Compile time: `perform(@llm.complete, prompt)` gets type `String` without needing to see a handler
- Runtime: when the host calls `resume(value)`, the evaluator checks `value` against the declared return type. The declaration compiles to a simple descriptor embedded in the bundle: `{ returnType: 'string' }`. No type system needed in the KMP runtime — just a tag check.

This serves as the contract between Dvala programs and foreign-language hosts.

**`resume` return type:**

`resume : α -> answer_type`

Where `answer_type` is the type of the whole `do with` block. Constraints:
- All clause bodies have type `answer_type` (whether they call `resume` or abort)
- `transform` clause maps `body_return_type -> answer_type`
- Without `transform`: `body_return_type = answer_type`

The unifier solves `answer_type` across all clauses simultaneously.

**One-shot `resume`:**

Not enforced statically. The runtime `resumeConsumed` guard remains the enforcement mechanism. Linear type enforcement is deferred indefinitely.

---

## Implementation Plan

### Phase A

1. Define the `Type` representation (type variables, primitives, function types, record rows)
2. Implement `unify(t1, t2, constraints)` — standard HM unification with row support
3. Implement `infer(node, env)` — walks AST, generates type constraints, returns `Type`
4. Wire into the compile pipeline after parsing: `parse → typecheck → bundle`
5. Emit structured type errors with source locations

### Phase B

1. Extend `Type` with effect rows: `EffectRow = { effects: Set<string>, rest: RowVar | 'closed' }`
2. Extend `infer` to thread effect rows through all expression types
3. Implement `perform` rule: adds effect to current row
4. Implement `do with` rule: removes handled effects from body row
5. At top level: collect leaked effects → write manifest into bundle
6. Update bundle format to include `leakedEffects: string[]`
7. Update `run()` to validate registered handlers against manifest

### Phase C

1. Extend effect rows with return types: `EffectRow` entries carry `α`
2. Implement fresh type variable generation for `perform` sites
3. Implement handler clause unification: `resume` arg type → `α`, clause body → `answer_type`
4. Add optional effect declaration syntax: `effect @name(ArgType) -> ReturnType`
5. Compile effect declarations to runtime descriptors in bundle
6. Add `resume` value validation in KMP evaluator against bundle descriptors

## Type Annotation Syntax

**Inference-first, annotations optional.** The typechecker infers everything it can. Annotations are voluntary constraints fed into the same unifier.

### Three constructs

```dvala
type Nullable<T> = T | Null                    // type definition
let x: Nullable<String> = getName()            // type annotation on let
effect @llm.complete(String) -> String         // effect signature declaration
```

### Design decisions

| Question | Decision | Rationale |
|---|---|---|
| Annotation syntax | `:` (colon) | Universal, no collision (Dvala uses `as` for object destructuring aliases) |
| Where to annotate | `let` bindings only | Single parser change point. Unifier propagates constraints downward — function parameter types are inferred from the let-binding's function type |
| Parameter annotations in lambdas | No | Propagated from `let` type. Keeps lambdas clean |
| Type system | Structural | Matches Dvala's existing structural semantics. No runtime tagging cost. Nominal types (ADTs) deferred |
| Value types ↔ effects | One-way: value types appear *inside* effect signatures, never the reverse | Effects are not value types — they live in the effect row dimension of function types |
| Type-level extraction (`Return<@effect>`) | No | Inference already propagates effect return types. Avoids type-level computation complexity |

### Type grammar

```dvala
// Primitives
Number, String, Boolean, Null

// Unions
String | Null
Number | String | Null

// Objects (structural)
{ name: String, age: Number }

// Arrays
[String]

// Functions (with optional effect row — syntax TBD, see open questions)
(Number, Number) -> Number
(String) -> <http.get> String

// Generics
Nullable<String>
Result<Number, String>

// Type definitions
type Name = String
type Pair<A, B> = [A, B]
type Result<T, E> = { ok: true, value: T } | { ok: false, error: E }
```

### Hierarchy

```
Function type = Value types + Effect row
                    ↑              ↑
               type grammar    effect declarations
               (never mixed with each other)
```

---

## Open Questions

### Effect row syntax in type annotations

The notation `<log, fetch | r>` inside function types is a rough sketch only. The following remain unresolved:

- **Open vs closed rows**: `<log | r>` (open, polymorphic) vs `<log>` (closed, exact). What is the default? Must the user write `| r` explicitly?
- **Row variables**: Is `r` an implicit ambient variable or an explicit generic parameter? E.g., `type Logger<R> = (String) -> <log | R> Null`?
- **Row type aliases**: Can you define `type IOEffects = <log, fetch>` and use it inside function types?
- **Row polymorphism in `type` definitions**: `type Fetcher<R> = (String) -> <http.get | R> String` — is this a type-level generic over rows?
- **Delimiter / bracket choice**: `< >` may collide with comparison operators in ambiguous parse contexts. Alternatives: `{ }` (conflicts with objects), `[ ]` (conflicts with arrays), or a keyword-based syntax.
