# Dvala Type System — Set-Theoretic with Algebraic Subtyping

**Status:** Accepted
**Created:** 2026-04-12
**Supersedes:** `2026-03-30_type-system.md`, `2026-04-12_set-theoretic-type-system.md`
**References:** [MLsub (Dolan 2017)](https://dl.acm.org/doi/10.1145/3093333.3009882), [Simple-sub (Parreaux 2020)](https://dl.acm.org/doi/10.1145/3409006), [Elixir type system (Castagna et al. 2023)](https://arxiv.org/abs/2306.06391), [Ballerina semantic subtyping](https://ballerina.io/why-ballerina/flexibly-typed/), [CDuce (Castagna & Frisch)](https://www.cduce.org/)

---

## Goal

Define the architecture and phased implementation plan for Dvala's type system, using **set-theoretic types with algebraic subtyping** as the foundation for both value types and effect types.

---

## Settled Design Decisions

All decisions made during design review 2026-04-12.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Type architecture | Side-table only (erased) | Zero runtime cost. Evaluator portas utan typechecker. Evidence passing deferred. |
| 2 | Inference strategy | Inference-first, annotations later | Dvala is dynamic. Simple-sub infers principal types without annotations. |
| 3 | Union representation | Flat and deduplicated at construction | Simpler subtyping checks, prevents blowup. Same for intersections. |
| 4 | Literal types | Yes — singleton sets | Required for atoms, match exhaustiveness, tagged unions. |
| 5 | Record inference | Closed propagation: closed if all sources are closed, params always open | Literals → closed. Spread of closed → closed. Spread involving open → open. Params → always open. Function returns → inferred from body. Catches field-access bugs through call chains. |
| 6 | Top/bottom types | `Unknown` + `Never` (no `Any`) | Fully sound. `Unknown` = safe top (requires narrowing). `Never` = empty set. No unsound escape hatch. Host boundary values are runtime-validated against manifest types. |
| 7 | Recursive types | Equi-recursive (μ-types) | Natural fit for set-theoretic. No fold/unfold. Implemented via `Ref` nodes with cycle detection. |
| 8 | Non-exhaustive match | Compile-time error | Core win of set-theoretic match typing. Remainder != `Never` → error. |
| 9 | Negation scope | Bounded in surface, full internally | Users write `!Null`, `!0`. Inference uses full negation. Simplification collapses before display. |
| 10 | Lazy types | Transparent: `Lazy<T>` = `T` | Dvala's laziness is pure-only. No hidden side effects. |
| 11 | Annotation locations | `let`-bindings + lambda params + lambda return type | `let x: T`, `(a: T) -> ...`, and `(a: T): R -> ...`. Return type goes between `)` and `->` (no conflict). |
| 12 | Effect polymorphism | Open sets with set variable `@{e...}` | Same mechanism as open records. One engine for values and effects. |
| 13 | `if` without `else` | Syntax error | Prevents silent null. Consistent with match exhaustiveness. |
| 14 | `.` access | Strict (crash). `?.` for safe (null). | Null must be opt-in. Consistent with every modern language. |
| 15 | Turing-complete types | Future ambition (Phase D+), not a goal now | Set-theoretic covers 90%. Door open via extensible `Type` union. |
| 16 | Effectful macros | Remove | Host interception (`macro@name`) creates permanent `Any`/open-effect holes. Pure macros (`macro (ast) -> ...`) retain all AST transformation power. Host integration re-addable later with mandatory type signatures. |
| 17 | Error recovery | `Unknown` recovery per subexpression | Failed subexpressions get `Unknown`, inference continues. Sound because constraints are monotonic (bounds only accumulate) and `Unknown` is top (loosens bounds, never tightens). IDE gets types for everything that works. |
| 18 | Array vs tuple syntax | `T[]` for arrays, `[T, U]` for tuples | Postfix `[]` is visually distinct from tuple brackets. No ambiguity: `[String]` is a 1-tuple, `String[]` is an array. Nests naturally: `String[][]`, `[String, Number][]`. |
| 19 | Type parameter variance | Inferred from definition body | Compiler walks the body and records whether each parameter appears in positive (covariant), negative (contravariant), or both (invariant) positions. No annotations needed. Matches inference-first philosophy. |
| 20 | Type guard predicates | `(x: T) -> x is U` syntax | Functions that narrow their argument's type in the caller's true branch. Same syntax in builtin type signatures and user annotations. Required for `isNumber`, `isString`, etc. |
| 22 | Type variable syntax | Single uppercase letter only: `A`, `B`, `T`, `K`, `V` | Multi-character uppercase names (`Number`, `String`) are always primitives or aliases. No ambiguity. 26 variables is more than enough. Same convention as Haskell/Java/Go. |
| 23 | Nullable type syntax | `T?` = `T \| Null` | Postfix `?` on any type makes it nullable. Consistent with `?.` (safe access) — `?` means "might be null" throughout the language. Chains with `[]`: `Number?[]` = array of nullable, `Number[]?` = nullable array. NOT the same as optional params — those use default values (`b = null`). |
| 24 | Rest parameter types | `(Number, ...Number[]) -> Number` | Variadic function params. Shipped 2026-04-14 (commit `709b504d`): `FunctionType.restParam`, parser, `constrain`, `isSubtype`, and 27+ builtin signatures (`+`, `*`, `/`, `-`, `min`, `max`, `++`, `=`, `!=`, etc.) all carry rest types. |
| 21 | Builtin type signatures | `type` field in docs using Dvala annotation syntax | Each builtin declares its type as a string: `"(Number, Number) -> Number"`. Parsed once at startup. Overloads use intersection of function types: `((Number) -> Number) & ((Number[]) -> Number[])` — intersection means "handles both", which is the correct set-theoretic representation (union would mean "is one or the other, caller doesn't know which"). |

---

## Background

Dvala is currently untyped. The runtime is a trampoline-style evaluator that dispatches effects by name, handles algebraic handlers with deep semantics, and supports serializable continuations. A type system must fit within Dvala's specific constraints:

- **Pipeline**: `tokenizer → parser → typechecker → AST bundle → evaluator`
- **Runtime is evaluator-only**: the KMP runtime has no parser and no typechecker. Everything the runtime needs must be embedded in the AST bundle at compile time.
- **No host info at compile time**: the host registers handlers at `run(program, handlers)` time, not at compile time.
- **Serializable continuations**: the handler stack can be serialized and reconstructed. This rules out static evidence passing (handler indices baked into the AST).
- **Deep handler semantics**: `resume` reinstalls the handler. The handler is always active during the continuation.
- **One-shot `resume`**: enforced at runtime (`resumeConsumed` flag). Not enforced statically.
- **Effectful macros**: expand at runtime in the evaluator. The typechecker never sees the expanded code.
- **Lazy evaluation**: pure expressions are lazy. `Lazy<T>` = `T` in the type system (transparent).

---

## Why Set-Theoretic Types

### The core idea

Every type denotes a **set of values**. Type operations are set operations:

| Type operation | Set operation | Example |
|---|---|---|
| Union `A \| B` | Set union A ∪ B | `Number \| String` = all numbers and all strings |
| Intersection `A & B` | Set intersection A ∩ B | `{name: String} & {age: Number}` = records with both |
| Negation `!A` | Set complement ¬A | `!String` = everything that is not a string |
| Subtyping `A <: B` | Set containment A ⊆ B | `Number <: Number \| String` |
| `Never` | Empty set ∅ | No values inhabit this type |
| `Any` | Universal set U | All values |

Subtyping is **semantic**: `S <: T` if and only if the set of values denoted by `S` is a subset of the set denoted by `T`.

### Why this fits Dvala

1. **Dvala values are already set-theoretic.** The runtime `Any` type is a union: `Coll | string | number | boolean | null | DvalaFunction | RegularExpression | EffectRef | Atom`. The type system mirrors the runtime directly.

2. **Match exhaustiveness is free.** Dvala's `match` is a core construct. Each match clause *narrows* the type by set difference. If the remainder is `Never` (empty set), you're exhaustive. No separate analysis needed.

3. **Atoms get precise types.** `:ok` and `:error` become singleton sets — perfect for tagged unions.

4. **Effects use the same machinery as values.** Instead of a separate row polymorphism mechanism, effects are modeled as capability sets with the same union/difference operations. One theory, two uses.

5. **One engine for everything.** HM + rows requires three separate mechanisms (HM unification + row polymorphism + effect row unification). Set-theoretic uses one subtyping engine. Less code, fewer concepts, simpler KMP port.

### Decision rationale (HM + Rows was the alternative)

| Dimension | HM + Rows | Set-Theoretic (chosen) |
|---|---|---|
| Union types | Bolted on (breaks principal types) | Primitive (first-class) |
| Intersection/negation | Not available | Primitive |
| Subtyping | Not native | Native and complete |
| Record types | Row variables | Width + depth subtyping |
| Effect types | Separate mechanism (row unification) | Same mechanism as values |
| Match exhaustiveness | Separate analysis pass | Falls out of set difference |
| Principal types | Yes | Yes (Dolan proved this) |
| Maturity | Decades of implementations | Fewer but production-proven (Elixir, Ballerina, CDuce) |
| Risk | Low | Medium — mitigated by Simple-sub and Elixir precedent |

---

## Architecture

### Types are erased — side-table only

```
                  ┌──────────┐
    Source ──────>│  Parser   │──────> AST (unchanged)
                  └──────────┘           │
                                         │
                  ┌──────────┐           │
                  │   Type   │<──────────┘
                  │  Checker │
                  └──────────┘
                       │
                       v
                  Map<NodeId, Type>    ← compiler side-table
                       │
                       v
                  ┌──────────┐
                  │Evaluator │──────> does NOT see types
                  └──────────┘
```

The typechecker builds a `Map<NodeId, Type>` during checking. Types are not injected into AST nodes. The runtime does not execute a typed AST. However, selected type-derived artifacts may survive compilation as bundle metadata side tables. See `2026-04-13_bundle-type-metadata.md`.

- **Execution stays decoupled from typing.** Type checking is still a separate phase.
- **No evidence passing.** Dvala's handler dispatch is already O(1) via `clauseMap`. No runtime changes needed.
- **Serializable continuations remain unaffected.** Continuation frames contain no type information.
- **AST remains clean.** Any preserved type/evidence artifacts live beside the AST, not inside nodes.

### Inference-first, annotations later

No type annotations in the initial implementation. Everything is inferred. Annotation syntax is a later addition — annotations become constraints fed into the same subtyping engine.

---

## Inference Algorithm: Simple-sub

### Overview

Adapted from [Parreaux's Simple-sub](https://github.com/LPTK/simple-sub) — a simplified implementation of Dolan's algebraic subtyping. ~500-1000 lines of core inference code.

### Biunification

Type variables appear in two **polarities**:
- **Positive** (output/covariant): the type of a value being *produced*
- **Negative** (input/contravariant): the type of a value being *consumed*

Instead of HM's `α = γ`, biunification constrains `γ <: α` (argument type must be *subtype* of parameter type). Type variables accumulate **bounds**:
- Lower bounds (from positive positions): what the variable must *contain*
- Upper bounds (from negative positions): what the variable must *fit within*

| Polarity | Multiple types combine as | Why |
|---|---|---|
| **Positive (+)** | **Union** (`\|`) | Producer can give A *or* B |
| **Negative (-)** | **Intersection** (`&`) | Consumer must handle A *and* B |

### The constrain function

The core of the algorithm — propagates `lhs <: rhs` until everything reduces to bounds on variables:

```typescript
function constrain(lhs: SimpleType, rhs: SimpleType): void {
  if (cache.has([lhs, rhs])) return  // cycle guard
  cache.add([lhs, rhs])

  match [lhs, rhs] {
    // Same primitive — ok
    [Primitive(n0), Primitive(n1)] if n0 == n1 => {}

    // Functions — contravariant on params, covariant on return
    [Function(l0, r0), Function(l1, r1)] => {
      constrain(l1, l0)    // params: FLIP direction
      constrain(r0, r1)    // return: KEEP direction
    }

    // Records — check that all rhs fields exist in lhs
    [Record(fs0), Record(fs1)] => {
      for [name, t1] in fs1 {
        match fs0.get(name) {
          Some(t0) => constrain(t0, t1)
          None     => error("missing field: " + name)
        }
      }
    }

    // Variable on left — add upper bound + propagate
    [Variable(lhs), rhs] => {
      lhs.upperBounds.push(rhs)
      for lb in lhs.lowerBounds { constrain(lb, rhs) }
    }

    // Variable on right — add lower bound + propagate
    [lhs, Variable(rhs)] => {
      rhs.lowerBounds.push(lhs)
      for ub in rhs.upperBounds { constrain(lhs, ub) }
    }
  }
}
```

### Let-polymorphism via levels

Each type variable has a level (an integer). Let-bindings raise the level. Variables created at level `lvl + 1` are local. When used in the body, variables above `lvl` are copied fresh:

```
Level 0: outer scope
Level 1: inside let id = ...
          α created at level 1

id(42):      α is level 1 > level 0 → copy to α₁, constrain α₁ <: Number ✓
id("hello"): α is level 1 > level 0 → copy to α₂, constrain α₂ <: String ✓
```

No free-variable analysis needed. Level is O(1) per variable.

### Inference example

```dvala
let f = (x) ->
  match x
  | n when isNumber(n) -> n + 1
  | s when isString(s) -> length(s)
  end
```

1. `x` gets fresh variable `α`
2. First branch: guard narrows `α` to `α & Number`, body produces `Number`
3. Second branch: guard narrows `α` to `α & String`, body produces `Number`
4. Lower bound of return type: `Number` (from both branches)
5. Upper bound of `α`: `Number | String` (union of what the branches consume)

Inferred type: `(Number | String) -> Number`

In HM, this function would need explicit annotation or be rejected. Here, it's inferred automatically.

---

## Type Representation

### Type algebra

```typescript
type Type =
  // Base types (sets of runtime values)
  | { tag: "Primitive"; name: "Number" | "String" | "Boolean" | "Null" }
  | { tag: "Atom"; name: string }              // Singleton: {:ok}
  | { tag: "Literal"; value: string | number | boolean }  // Singleton: {42}
  | { tag: "Function"; params: Type[]; ret: Type; effects: EffectType }
  | { tag: "Tuple"; elements: Type[] }
  | { tag: "Record"; fields: Map<string, Type>; open: boolean }
  | { tag: "Array"; element: Type }
  | { tag: "Regex" }

  // Set operations
  | { tag: "Union"; members: Type[] }          // A | B | C
  | { tag: "Inter"; members: Type[] }          // A & B & C
  | { tag: "Neg"; inner: Type }                // !A (complement)

  // Bounds
  | { tag: "Unknown" }                         // Top type (supertype of all, requires narrowing)
  | { tag: "Never" }                           // Bottom type (empty set, subtype of all)

  // Inference
  | { tag: "Var"; id: number; lowerBounds: Type[]; upperBounds: Type[] }

  // Named
  | { tag: "Alias"; name: string; args: Type[]; expanded: Type }
  | { tag: "Recursive"; id: number; body: Type }  // μα.F(α)
```

### Subtyping decision procedure

Subtyping `S <: T` is decided by checking set emptiness: `S & !T = Never`. This is the **semantic subtyping** approach from CDuce.

For function types: `(A -> B) <: (C -> D)` iff `C <: A` and `B <: D` (contravariant/covariant).

For recursive types: coinductive interpretation (CDuce's approach), checked via greatest fixed point. For performance at scale, Binary Decision Diagrams (BDDs) can be added later — Elixir uses [lazily-evaluated BDDs](http://elixir-lang.org/blog/2025/12/02/lazier-bdds-for-set-theoretic-types/).

---

## Pattern Matching and Type Narrowing

This is where set-theoretic types shine brightest for Dvala.

### Match as set narrowing

Each `match` clause narrows the input type by set difference:

```dvala
let describe = (x) ->
  match x
  | n when isNumber(n) -> "number"     // x: T, narrow to T & Number
  | s when isString(s) -> "string"     // x: T \ Number, narrow to (T \ Number) & String
  | _ -> "other"                       // x: T \ Number \ String
  end
```

### Exhaustiveness checking

**Exhaustiveness = remainder is `Never`.**

```dvala
type Shape = :circle | :square | :triangle

let name = (s: Shape) ->
  match s
  | :circle -> "circle"      // remaining: {:square, :triangle}
  | :square -> "square"      // remaining: {:triangle}
  | :triangle -> "triangle"  // remaining: Never → exhaustive!
  end
```

If `:triangle` is missing → error: "non-exhaustive match. Unhandled: `:triangle`"

### Redundancy checking

A redundant branch is one where the narrowed type is already `Never`:

```dvala
let f = (x: Number) ->
  match x
  | n when isNumber(n) -> n + 1
  | s when isString(s) -> length(s)   // Error: unreachable — Number & String = Never
  end
```

### Guard narrowing

Type predicates (`isNumber`, `isString`, etc.) are **type narrowing functions**. After `isNumber(x)` succeeds, `x` has type `x_type & Number`.

| Slot kind | Type operation |
|---|---|
| `literal` | Intersection with singleton type |
| `typeCheck` | Intersection with type predicate |
| `bind` | No narrowing (captures as-is) |
| `wildcard` | No narrowing |
| `rest` | Structural remainder |

---

## Records: Open and Closed

### Structural records

Dvala objects are structural (PersistentMap at runtime). The type system models them with structural subtyping:

```dvala
// Type: {name: String, age: Number}
let person = {name: "Alice", age: 30}

// Accepts any record with a 'name' field
// Type: ({name: String, ...}) -> String
let greet = (p) -> "Hello, " ++ p.name
```

### Open vs. closed

- **Closed** `{name: String, age: Number}`: exactly these fields
- **Open** `{name: String, ...}`: at least `name: String`, possibly more

**Closedness propagation rule:** A record is closed if it was constructed entirely from known fields. Otherwise open.

| Source | Result |
|---|---|
| Record literal `{a: 1, b: 2}` | Closed |
| Spread of closed + literal fields `{...closed, c: 3}` | Closed |
| Spread involving any open source `{...open, c: 3}` | Open |
| Function parameter | Always open |
| Function return | Inferred from body (closed if body is closed construction) |

```dvala
let x = {name: "Alice"}               // closed {name: String}
let y = {...x, age: 30}               // closed {name: String, age: Number}
let mkPerson = (name) -> {name: name} // returns closed {name: String}

mkPerson("Alice").age                  // Error: 'age' not in closed {name}
```

Width and depth subtyping are natural set containment:

```
{name: String, age: Number}  <:  {name: String}        // width: more fields is subtype
{name: "Alice"}              <:  {name: String}          // depth: literal is subtype of base
```

### Intersection for extension

```dvala
type Named = {name: String}
type Aged = {age: Number}
type Person = Named & Aged    // = {name: String, age: Number}
```

---

## Atoms and Tagged Unions

### Atom types are singletons

```dvala
:ok      // type: :ok     (singleton set)
:error   // type: :error  (singleton set)
```

### Tagged unions via union of atom-tagged records

```dvala
type Result<T, E> = {tag: :ok, value: T} | {tag: :error, error: E}

let result: Result<Number, String> = {tag: :ok, value: 42}

match result
| {tag: :ok, value: v} -> v          // v: Number
| {tag: :error, error: e} -> 0       // e: String — exhaustive!
end
```

No `type` declaration required for ad-hoc tagged data. Declarations are optional, for documentation and reuse.

---

## Negation Types

Negation is a unique power that set-theoretic types add over HM.

### Practical uses

```dvala
!String          // Everything that is NOT a string
!Null            // Everything that is NOT null (= non-nullable)
Number & !0      // Numbers except zero

// A function that guarantees non-null return
let unwrap: (T | Null) -> T & !Null
```

### Trade-off

Negation types can produce complex inferred types. Mitigation:
1. **Simplification pass**: Collapse `Number & !String` to `Number` (already disjoint)
2. **Display heuristics**: Show `T & !Null` as `NonNull<T>` to users
3. **Bounded negation**: Only allow negation of base types and atoms in surface syntax

---

## Type Simplification Pipeline

Inference produces correct but often unreadable types. Simplification is a UX problem, not a correctness problem.

### Pipeline

```
Raw inference (bounds graph)
    │
    ▼
Step 1: Expand bounds → type expression
    │
    ▼
Step 2: Remove single-polarity variables
    │
    ▼
Step 3: Merge indistinguishable variables (co-occurrence)
    │
    ▼
Step 4: Eliminate sandwiched variables (lower = upper → pinned)
    │
    ▼
Step 5: Hash consing of recursive structures
    │
    ▼
Readable type for the user
```

**Step 1 — Expand bounds:** Walk the bounds graph producing a type tree. Detect cycles via visited set — revisiting a variable introduces `μα`.

**Step 2 — Remove single-polarity variables:** A variable appearing only positively → replace with its lower bounds (union). Only negatively → replace with upper bounds (intersection). No bounds → `Never` (positive) or `Any` (negative).

**Step 3 — Merge co-occurring variables:** Variables with identical co-occurrence patterns are unified.

**Step 4 — Variable sandwich:** If `Number <: α <: Number` → `α = Number`.

**Step 5 — Hash consing:** Redundant outer layers of recursive types are collapsed.

---

## Error Recovery

When inference fails at a subexpression, the typechecker assigns `Unknown` to the failing node and continues.

**Why this is sound:** Simple-sub's constraints are monotonic — bounds only accumulate, never retract. `Unknown` is the top type, so replacing a failed subexpression with `Unknown` only *loosens* bounds on connected variables. This can produce false positives (spurious errors that disappear after the real error is fixed) but never false negatives (missed errors). Exactly the right trade-off for IDE integration.

**Implementation:** try/catch around `constrain()`. On error, record the diagnostic, assign `Unknown` to the failing node, resume inference.

```
let x = {name: getUser().name, age: brokenExpr}
//       ↑ valid: constrained       ↑ fails: Unknown
// x: {name: String, age: Unknown} — name is precise, age requires narrowing
```

---

## Effect Typing: Effects as Capability Sets

### The idea

Instead of effect *rows* (Koka's approach), model effects as **sets of capabilities** using the same set-theoretic machinery as value types.

```
EffectType =
  | { tag: "EffectSet"; effects: Set<string>; open: boolean }
  // open=true: "these effects plus possibly more" (polymorphic)
  // open=false: "exactly these effects" (closed)
```

### How it works

Every function type includes an effect set:

```dvala
// Inferred: (String) -> @{log, fetch} String
let fetchAndLog = (url) ->
  let data = perform(@fetch, url)    // adds 'fetch' to effect set
  perform(@log, data)                 // adds 'log' to effect set
  data
```

Handlers **subtract** from the effect set:

```dvala
do with logHandler
  fetchAndLog("http://example.com")   // effects: @{log, fetch}
end
// remaining effects: {fetch}  (log was handled)
```

### Effect subtyping

Covariant for function bodies — fewer effects is more general:

```
@{log} <: @{log, fetch}     // fewer effects is subtype
@{}    <: @{anything}        // pure is subtype of effectful
```

### Effect polymorphism

Open effect sets handle polymorphism:

```dvala
// map: (Array<A>, (A) -> @{e...} B) -> @{e...} Array<B>
let result = map([1, 2, 3], (x) -> perform(@log, x); x * 2)
// result effects: @{log}  (propagated from the callback)
```

### Integration

Effect sets use the **same subtyping engine** as value types. `@{log} <: @{log, fetch}` is checked the same way `Number <: Number | String` is. No new algorithm needed.

### Bundle manifest

Leaked effects at the top level are exported as a manifest:

```json
{
  "leakedEffects": ["llm.complete", "db.query"]
}
```

The host validates at `run()` time that all listed effects have registered handlers.

---

## Handler Typing (Phase C)

Full typing of what flows through `perform` and `resume`.

### First-class handler type

Use an explicit first-class handler type:

`Handler<B, O, Σ>`

Where:

- `B` = the normal completion type of the handled body before `transform`
- `O` = the outward answer type after handling
- `Σ` = the set of effects handled by this handler

This is the smallest handler type that matches Dvala's current semantics.

- It is enough to type `resume`.
- It is enough to type aborting clauses.
- It is enough to type `transform`.
- It is enough to type effect subtraction when a handler is applied.

We do **not** need a separate type parameter for `finally` in the core design. See `2026-04-13_handler-finally.md` for the deferred cleanup design.

### Effect declarations

```dvala
effect @llm.complete(String) -> String
```

Effect declarations serve two purposes:

1. **Compile time:** `perform(@llm.complete, prompt)` gets type `String` without needing to see a handler. The typechecker trusts the declaration.
2. **Runtime (host boundary):** The bundle manifest includes type descriptors for all declared effects. When the host calls `resume(value)`, the runtime validates `value` against the declared return type. This is what makes `Any` unnecessary — every value crossing the host boundary is checked.

```json
// Bundle manifest (generated at compile time)
{
  "effects": {
    "llm.complete": { "arg": "String", "ret": "String" },
    "db.query": { "arg": "String", "ret": "[Record]" }
  }
}
```

The host validates at `run()` time that all declared effects have registered handlers. The runtime validates at `resume()` time that return values match declared types.

### Resume and answer types

`resume : α -> answer_type`

Where `answer_type` is the type of the whole `do with` block. Constraints:
- All clause bodies have type `answer_type` (whether they call `resume` or abort)
- `transform` clause maps `body_return_type -> answer_type`
- Without `transform`: `body_return_type = answer_type`

Using `Handler<B, O, Σ>`:

- each handled effect `@eff` in `Σ` has a declared signature `A -> R`
- inside the clause for `@eff`, the effect argument has type `A`
- inside the clause for `@eff`, `resume : R -> O`
- every clause body has type `O`
- `transform : B -> O`
- if `transform` is omitted, then `B = O`

### Handler application rule

Handler application is where effect subtraction happens.

If:

- `h : Handler<B, O, Σ>`
- `body : @{Σ | ε} B`

Then:

- `do with h; body end : ε O`

Equivalent thunk form:

- if `thunk : () -> @{Σ | ε} B`
- and `h : Handler<B, O, Σ>`
- then `h(thunk) : ε O`

Intuition:

- the body may perform the handled effects `Σ` plus some remainder `ε`
- applying the handler discharges `Σ`
- the result type changes from `B` to `O`
- the remaining effect set is `ε`

Example:

```dvala
effect @log(String) -> Null;
effect @fetch(String) -> String;

let h = handler
  @log(msg) -> resume(null)
  @fetch(url) -> "cached"
transform
  value -> { ok: true, value }
end;
```

This handler has shape:

- `h : Handler<String, { ok: true, value: String }, @{log, fetch}>`

So if a body has type:

- `@{log, fetch, db} String`

then:

- `do with h; body end : @{db} { ok: true, value: String }`

### Handler literal rule

Given a handler literal that handles effects `Σ = {eff1, ..., effN}`:

1. Look up each handled effect declaration.
2. For each clause `@effi(arg) -> body` where `effi : Ai -> Ri`:
   - bind `arg : Ai`
   - bind `resume : Ri -> O`
   - check `body : O`
3. Check the optional `transform` clause as `B -> O`.
4. If `transform` is omitted, unify `B` with `O`.
5. The whole handler literal gets type `Handler<B, O, Σ>`.

This rule is what makes first-class handlers typeable without relying on syntactic enclosure. A handler value carries its handled effect set `Σ` and its answer-type behavior explicitly in its type.

### Module-boundary principle

Locally declared handlers and imported handlers must provide the same type inference behavior.

This is a design constraint, not an optimization target.

Consequences:

1. A handler's public type must carry the handled effect signatures needed for `perform` and `resume` typing.
2. Importing a handler must be semantically equivalent to writing a local handler with the same inferred type.
3. The typechecker must not rely on syntactic enclosure to discover effect signatures.
4. Any effect signature inferred inside a module but needed by exported values must be frozen into the module interface.

In particular, if:

- `h : Handler<B, O, Σ>` is declared locally, or
- `h : Handler<B, O, Σ>` is imported from another module,

then:

- `do with h; body end`

must infer the same result type and effect subtraction in both cases.

This implies that `Σ` is not merely a set of effect names. It must contain enough signature information to type:

- `perform(@eff, arg)` inside the handled body
- `resume(value)` inside the corresponding clause
- the subtraction of handled effects from the body's effect row

Operationally, local inference may discover these signatures, but module boundaries must publish them.

### Inference limit: dynamic handler choice

Effect signatures are inferable only when the active handler context determines a unique compatible handled signature.

If handler choice depends on runtime control flow, inference must be conservative.

Example:

```dvala
let h =
  if useCache then cacheHandler
  else logOnlyHandler
  end;

do
  with h;
  perform(@log, "hello");
  perform(@cache.get, "user:1")
end
```

If:

- `cacheHandler : Handler<B, O, { @log : String -> Null, @cache.get : String -> User }>`
- `logOnlyHandler : Handler<B, O, { @log : String -> Null }>`

Then the conditional value `h` guarantees only the handled signatures common to both branches.

So:

- `@log` is guaranteed handled
- `@cache.get` is **not** guaranteed handled

Design rule:

1. Performed effects from alternative control-flow paths combine by union.
2. Guaranteed handled signatures from alternative handler values combine by intersection.
3. A `perform(@eff, arg)` may be inferred as handled only if all reachable active handlers provide a compatible signature for `@eff`.
4. If not, the effect remains in the residual effect type or requires annotation/narrowing.

This is a feature, not a weakness. The typechecker should reject "maybe handled" effects instead of guessing based on one possible runtime handler.

### One-shot resume

Not enforced statically. The runtime `resumeConsumed` guard remains the enforcement mechanism.

### Negation bonus

A handler that handles `@{log, fetch}` applied to a body with effects `@{log, fetch, db}` produces remainder `@{db}`. In row systems, this requires row unification. Here: set difference `@{log, fetch, db} \ @{log, fetch} = @{db}`.

---

## Macros

**Pure macros** (`macro (ast) -> ...`) expand before typechecking. The typechecker sees the expanded code. No issues.

**Effectful macros** (`macro@qualified.name (ast) -> ...`) have been **removed** (Decision #16). They expanded at runtime via `@dvala.macro.expand` effects, creating permanent `Any`/open-effect holes at every call site — incompatible with match exhaustiveness, effect tracking, and capability-safety guarantees. Pure macros retain all AST transformation power. Host-level macro interception can be re-introduced later with mandatory type signatures if needed.

---

## Type Annotation Syntax

**Inference-first, annotations optional.** The typechecker infers everything it can. Annotations are voluntary constraints fed into the same subtyping engine.

### Five constructs

```dvala
type Nullable<T> = T | Null                    // type definition
let x: Nullable<String> = getName()            // type annotation on let
let add = (a: Number, b: Number) -> a + b      // type annotation on lambda params
let fmt = (a: Number): String -> str(a)        // return type annotation on lambda
effect @llm.complete(String) -> String         // effect signature declaration
```

### Design decisions

| Question | Decision | Rationale |
|---|---|---|
| Annotation syntax | `:` (colon) | Universal, no collision (Dvala uses `as` for destructuring aliases) |
| Where to annotate | `let` bindings, lambda params, lambda return type | `let x: T`, `(a: T) -> ...`, `(a: T): R -> ...` |
| Lambda return type position | Between `)` and `->`: `(params): ReturnType ->` | No conflict — parser currently only expects `->` after `)`. Same position as TypeScript arrow functions. |
| Type system | Structural | Matches Dvala's existing structural semantics. No runtime tagging cost |
| Value types ↔ effects | One-way: value types appear *inside* effect signatures | Effects are not value types — they live in the effect dimension of function types |
| Effect set syntax | `@{...}` | `@` is Dvala's effect marker. Visually distinct from object literals. |

### Type grammar

```dvala
// Primitives
Number, String, Boolean, Null

// Unions and intersections
String | Null
{name: String} & {age: Number}

// Negation
!Null
Number & !0

// Objects (structural)
{ name: String, age: Number }

// Arrays and tuples
String[]                       // array of strings
String[][]                     // array of array of strings
[String]                       // 1-tuple
[String, Number]               // 2-tuple (positionally typed)
[String, Number][]             // array of 2-tuples

// Functions (with optional effect set)
(Number, Number) -> Number
(String) -> @{http.get} String

// Generics
Nullable<String>
Result<Number, String>

// Type definitions
type Name = String
type Pair<A, B> = [A, B]
type Result<T, E> = {tag: :ok, value: T} | {tag: :error, error: E}
```

---

## Mapping Dvala Constructs to Typing Operations

| Dvala construct | Typing operation |
|---|---|
| `let x = expr` | Generalize `expr` at `lvl + 1`, bind in body |
| `let rec f = expr` | Bind `f` to fresh variable `α`, infer body, constrain `α <: body_type`. Monomorphic recursion only — polymorphic recursion is undecidable without annotations (Henglein 1993). Enabled via explicit type annotation when annotations land. |
| `(x) -> body` | `x` → fresh variable (negative), body → return type (positive) |
| `f(arg)` | Fresh result variable `β`, constrain `f <: (arg) → β` |
| `match x \| p -> e` | Each branch: narrow `x` with pattern (intersection), collect return types (union). Remainder = `Never` → exhaustive |
| `42`, `"hi"`, `:ok` | Literal / singleton type |
| `{a: 1, b: 2}` | Closed record `{a: Number, b: Number}` |
| `x.name` | Constrain `x <: {name: β}` (open record), return `β` |
| `perform(@eff, x)` | Add `eff` to effect set (positive → union). Return = `Unknown` (Phase A) / typed (Phase C) |
| `do with h; body end` | Effect set: `body_effects \ h_handled_effects` (set difference) |
| `let f: (A) -> @{eff} B` | Effect annotation — constrains `f`'s effect set |
| `if c then a else b` | Constrain `c <: Boolean`, return = union of `a` and `b` |
| `isNumber(x)` (guard) | Type narrowing: `x` becomes `x_type & Number` in true branch |

---

## Phased Implementation

### Phase A: Set-Theoretic Value Types

Full type inference for values with subtyping, unions, intersections, and negation.

**What's included:**
- Primitive types, literal types, atom types
- Union (`|`), intersection (`&`), negation (`!`)
- Function types (contravariant params, covariant return)
- Structural record types (open and closed)
- Array and tuple types
- Type aliases and recursive types
- Pattern match narrowing and exhaustiveness checking
- Generic type aliases

**Inference algorithm:** Adapted Simple-sub (Parreaux 2020)

**Output:** `Map<NodeId, Type>` plus optional emitted metadata derived from it. The AST itself remains untyped.

**`perform` returns:** `Unknown` (forces narrowing — effect typing with precise return types comes in Phase B/C).

### Phase B: Effect Sets

Track which effects each function may perform, as a set.

**What's added:**
- Every function type gains an effect component: `(A) -> @{eff1, eff2} B`
- `perform(@name, x)` adds `name` to the current effect set
- `do with handler; body end` subtracts handled effects via set difference
- Pure functions have empty effect set `@{}`
- Effect polymorphism via open effect sets `@{e...}`
- Leaked effects at top level → bundle manifest

**Integration:** Effect sets use the same subtyping engine as value types. No new algorithm needed.

### Phase C: Handler Typing

Type the full handler contract — what flows through `perform` and `resume`.

**What's added:**
- Effect declarations: `effect @log(String) -> Null`
- `perform(@log, x)` checks `x: String`, returns `Null`
- First-class handler values: `Handler<B, O, Σ>`
- Handler clause typing: `resume` gets the declared return type
- Transform clause typing
- Handler application subtracts `Σ` from the body effect set
- All clause bodies must produce consistent answer type

### Phase D (future): Refinement Layer + Type-Level Computation

**Refinement types:** Optional predicates on types for constraint domains:
```dvala
type Positive = Number & {n | n > 0}
```
Requires SMT-solver integration. Built on top of the set-theoretic foundation.

**Type-level computation:** Conditional types, mapped types, recursive type functions — with recursion limit. Not a design goal now, but the `Type` union is extensible. Set-theoretic negation + union + intersection covers 90% of what Turing-complete type systems are used for.

Not needed for language viability.

---

## Future Extensions (No Architecture Impact)

Extensions that fit naturally into the set-theoretic foundation. None require changes to the core type algebra or inference algorithm — they're additive.

### Broadcasting types (scalar/vector/matrix mixing)

Historically, core math builtins such as `inc` broadcast over vectors and matrices at runtime, which created pressure for the type system to model "same shape in, same shape out" behavior via something like a `Broadcastable<T>` type constructor or other shape-polymorphic types.

Status: core math builtins are now scalar-only in both the runtime and the type system, with explicit lifting required through `map`, vector helpers, matrix helpers, or future explicit broadcasting utilities. The `min` and `max` vector forms remain as collection-aware aggregation exceptions. That means builtin broadcasting types are no longer needed for core math; if broadcasting support is added in the future, it should be modeled as an explicit library feature rather than implicit scalar math semantics.

### Object type variables

Collection functions like `filter`, `map`, `reduce` work on objects too: `filter({a: 1, b: 2}, isOdd)`. Currently typed with array-only generics `(A[], (A) -> Boolean) -> A[]`. Need object variants: `({...}, (Unknown) -> Boolean) -> {...}` with structural subtyping.

**Status (2026-04-20):** Record overloads are shipped on `filter`, `map`, `reduce` in `src/builtin/core/collection.ts`. Callbacks receive `Unknown` for the element type because the record's field-value union can't be expressed without a `ValueOf<R>` type constructor (pairs with `keyof` / indexed-access types — still pending). That tightening is a follow-up for when indexed-access lands.

### Meta-function typing

`arity(fn)`, `doc(fn)`, `withDoc(fn, str)` take function values as arguments. The typechecker needs to accept any function type as an argument to these builtins — requires a `Function` supertype or similar.

**Status (2026-04-20):** The `Function` supertype exists as `AnyFunction` and is exposed as the `Function` keyword in type annotations. `withDoc` uses it: `(Function, String) -> Function`, tight — rejects non-function first args. `doc` and `arity` deliberately stay `(Unknown) -> …` because they also accept effect references at runtime (`doc(@dvala.io.print)`); tightening would require a first-class effect-reference type that doesn't exist yet. Revisit when/if that type lands.

### Match pattern destructuring bindings

**Status (2026-04-20):** Shipped. `case [x, y]` binds by position from a tuple scrutinee; `case {name, age}` binds by key from a record scrutinee. Nested destructure, default values (`{age = 0}`), and guard-based narrowing on the destructured names all work. Rename syntax (`{name: n}`) is a non-feature in Dvala — only shorthand destructure is supported. See `describe('typecheck — match pattern destructuring binds typed variables')` in `src/typechecker/typecheck.test.ts` for the lock-in tests.

`case [x, y]` and `case {name, age}` in match expressions should bind `x`, `y`, `name`, `age` as typed variables in the body. Currently only `case n when isNumber(n)` (guard-based) narrowing works.

### Flow-sensitive narrowing in `if`/`else`

**Status (2026-04-20):** Shipped for the two most common shapes.

- Type-guard calls: `if isX(sym) then … else … end` — then branch narrows `sym` to `X`, else to `!X`.
- Equality tests: `if sym == literal/atom then … else … end` — then branch narrows to the literal/atom, else drops it. `!=` is the flipped form.

Non-supported shapes (fall through to no narrowing; branches still infer correctly): `&&`/`||` composition of guards, `not(...)` negation, narrowing on non-Sym arguments (e.g. `isX(obj.field)`). These can be added when they appear in practice without changing core algebra.

Implementation: `extractIfNarrowings` + `narrowEnv` in `src/typechecker/infer.ts`, reusing `intersectMatchTypes` from the match-guard path. See `describe('typecheck — flow-sensitive narrowing in if/else')` for the suite.

Today, type-guard narrowing (decision #20) only fires inside `match` guards. The typing rule for `if` is `return = union of a and b` (see the construct-to-operation table) with no refinement of the condition expression in either branch:

```dvala
let describe = (x) -> if isString(x) then count(x) else x + 1 end
describe("hi")
// Current: the else branch constrains x + 1, so x is inferred as Number.
//          The call site then errors: "hi" is not a subtype of Number.
// Desired: x: String | Number, narrowed per branch; both calls check.
```

Design sketch:

- Extend the inference walker for `if` so that when the condition is a call to a type-guard function `(x: T) -> x is U`, the then branch types `x` as `x_type & U` and the else branch as `x_type & !U`.
- Chain through `&&` / `||` the same way TS does (guards compose via intersection/union of refinements).
- Narrow on atom/literal equality too (`if x == :ok then ... else ... end` → atom refinement).

No change to the core algebra — purely an inference-time refinement, reusing the existing guard machinery. Biggest day-to-day win for users coming from TS; second only to match in practical importance.

### Optional record fields in type syntax

**Status (2026-04-20):** Shipped with Option 1 semantics (presence bit, not sugar over nullable).

- `{a: A, b?: B}` — field `b` may be absent from actual values; when present, is `B`. Distinct from `{a: A, b: B | Null}` (key present, value may be null).
- Record type stores a sidecar `optionalFields?: Set<string>` — existing code paths that read `fields` continue to work; optional-aware paths check the set.
- Subtyping: `{a: "x"} <: {a: String, b?: Number}` holds (optional field absent in S is OK). Closed records reject unknown fields as before.
- Strict access (`obj.b`) on an optional field is a type error; the message suggests `?.b` for safe access. Safe access (`obj?.b`) desugars to `get(obj, "b")` which returns `Unknown` today. The indexed-access primitives shipped in PR #80 make `T["b"] | Null` expressible type-level (see "Indexed-access types and `keyof`" below), but wiring the `get` builtin to return it requires bounded generics in annotation syntax (`<T, K: String>(T, K) -> T[K] | Null`) — still pending.
- Function-param `name?: T` keeps its existing Option-2 sugar (`T | Null`) — function params have runtime auto-fill so the sugar works there.

See `describe('typecheck — optional record fields')` in `src/typechecker/typecheck.test.ts` for the test suite.

Grammar only permits `?` on function params (`identifier ["?"] ":" Type`). Records have no surface syntax for optionality:

```dvala
type User = { name: String, age?: Number }
let u: User = {name: "Alice"}                // TypeParseError when the alias is used
```

Two semantic options:

1. **Sugar over union with missing field**: `age?: Number` ≡ the field may be absent, and when present is `Number`. Needs a notion of "field present/absent" distinct from `age: Number | Null`.
2. **Sugar over nullable**: `age?: Number` ≡ `age: Number | Null`. Simpler, but conflates "absent key" with "present and null" — at odds with closed-record precision.

Option 1 is the right long-term answer (matches TS and avoids widening access to `Number | Null` unnecessarily) but requires a new record-field presence bit in the type. Option 2 is a two-line parser change if we want the ergonomics quickly.

### Indexed-access types and `keyof`

**Status (2026-04-23):** Type-level primitives shipped (PR #80).

- `keyof T` — union of literal-string keys of a record. Closed records give the exact set (`keyof {a: Number, b: String}` = `"a" | "b"`); open records widen to `String` (extra runtime keys allowed).
- `T[K]` — indexed access. When `K` is a literal-string and `T` a concrete record, resolves to the field type. Union-typed `K` distributes. Missing key on closed record = `Never`; missing key on open = `Unknown`. Optional field widens to `T | Null`.
- Parser accepts both as annotation syntax: `keyof T` (prefix keyword, identifier-bounded) and `T[K]` (postfix, sibling to `T[]`).
- Two new `Type` tags (`Keyof`, `Index`) that simplify away once the inner record is concrete. Placeholder nodes stay unresolved for generic / type-variable inputs.

Still pending: wiring `get`'s builtin signature to return `T[K] | Null` so `obj?.b` tightens from `Unknown` to `T | Null`. That requires bounded generics on builtin type annotations (`<T, K: String>(T, K) -> T[K] | Null`), which the current annotation grammar doesn't express. Foundation is now in place.

### Template string types

Types describing string shape: `` `Hello ${String}` ``. A new type constructor:

```typescript
| { tag: "TemplateString"; parts: (string | Type)[] }
```

Subtyping: `` `Hello ${String}` <: String ``. Template strings are subsets of `String` — fits set-theoretic directly. Add whenever useful.

### Numeric subtypes

Today: single `Number` (float64). The type system can later distinguish subtypes:

```
Natural <: Integer <: Number
```

These are *type-level* distinctions on the same float64 runtime representation. `Integer` = `Number & {n | Number.isInteger(n)}`. Useful for array indexing, match patterns. Trivial to add — just new predicate types in the subtyping engine.

Full numeric tower (`Rational`, etc.) requires new runtime representations — deferred until the runtime supports them.

### Typed matrices / fixed-size arrays

**Status (2026-04-20):** The Phase A tuple-alias approach is shipped and lock-in tested — no new machinery required. See `describe('typecheck — typed matrices via tuple aliases')` in `src/typechecker/typecheck.test.ts`. The Phase D literal-length form (`Number[4]`) remains future work.

Phase A approach — tuple aliases, no new machinery:

```dvala
type Vec3 = [Number, Number, Number]
type Vec4 = [Number, Number, Number, Number]
type Mat4x3 = [Vec3, Vec3, Vec3, Vec3]

let dot: (Vec3, Vec3) -> Number = ...  // fully typed
```

Phase D extension — literal-typed lengths:

```dvala
Number[4]              // fixed-size: array of exactly 4 numbers
Number[4][3]           // 4x3 matrix
Number[4] <: Number[]  // fixed-size is subtype of unsized
```

Requires literal values in type parameter positions — builds on literal types (Phase A) and the refinement layer (Phase D). No architecture blocked.

---

## Implementation Roadmap

### Step 0: Runtime strictness (prerequisite)

Breaking changes needed before the type system is meaningful. Without these, the type system infers `T | Null` everywhere. These are **independent of each other** and can be landed incrementally.

**Principle:** Null should be opt-in, not the default.

| # | Change | Current → New | Breaking? |
|---|---|---|---|
| 0a | Empty function body | `() -> end` → `null` | `() -> end` → **syntax error** | Rare |
| 0b | Empty block | `begin end` → `null` | `begin end` → **syntax error** | Rare |
| 0c | `if` without `else` | `if c then x end` → `null` | → **syntax error** (use `when c do x end` or `if c then x else null end`) | Moderate |
| 0d | Non-exhaustive match | returns `null` | throws **MatchError** | Moderate |
| 0e | `.` strict + `?.` safe | `a.b` → `get(a, "b")` (null) | `a.b` → `a("b")` (**KeyError**). New: `a?.b` → `get(a, "b")` (null) | **Largest** |

**Recommended landing order:** 0a → 0b → 0c → 0d → 0e (smallest scope first). All shipped together in one release — user base is small, no staged migration needed. The typechecker then assumes `.` never returns null and `?.` returns `T | Null`.

### Implementation principle

**Favor readability and maintainability over "smart" solutions.** The type system will be ported to KMP and maintained long-term. Prefer straightforward, well-commented code over compact or clever alternatives. Choose the obvious data structure. If a simpler algorithm is O(n²) but readable and the smart one is O(n log n) but opaque — pick the simple one unless profiling says otherwise.

### Step 1: Core type algebra

- Type representation (the `Type` union above)
- Subtyping checker: `isSubtype(S, T): boolean`
- Simplification: normalize unions/intersections, collapse trivial negations
- Unit tests for all subtyping rules

### Step 2: Simple-sub inference engine

- Port/adapt Simple-sub to TypeScript
- Type variables with mutable bounds
- Constraint generation from AST walk
- Constraint solving (propagation + simplification)
- Test on Dvala expressions: let, function, application, match

### Step 3: Record and collection types

- Open/closed record subtyping
- Array type inference
- Tuple type inference
- Spread/rest patterns

### Step 4: Match narrowing and exhaustiveness

- Type narrowing per match clause (set intersection with pattern type)
- Remainder computation (set difference)
- Exhaustiveness error when remainder != Never
- Redundancy warning when narrowed type == Never

Current status:

- record-side product subtraction and finite open-record exhaustiveness are implemented
- homogeneous-array subtraction now runs through an internal `Sequence` representation
- sequence-aware subtype/simplify, array-pattern subtraction, rest-binding preservation, and defaulted-array diagnostics are implemented
- follow-up design record: [2026-04-15_sequence-shape-types.md](2026-04-15_sequence-shape-types.md)
- implementation record: [2026-04-15_sequence-shape-implementation-plan.md](2026-04-15_sequence-shape-implementation-plan.md)

### Step 5: Atom and tagged union typing

- Singleton atom types
- Tagged union inference from match patterns
- Named type aliases for common patterns

### Step 6: Effect sets (Phase B)

- Effect set type representation
- Effect inference from `perform` calls
- Effect subtraction from `do with handler` blocks
- Effect polymorphism (open sets)
- Leaked effect manifest

### Step 7: Handler typing (Phase C)

- Effect declarations (optional)
- First-class handler type: `Handler<B, O, Σ>`
- Handler clause typing
- Resume/abort typing
- Transform clause typing
- Handler application and effect subtraction

---

## Open Questions

### 1. Recursive types and BDDs

Recursive types interact with set-theoretic subtyping. CDuce and Elixir use Binary Decision Diagrams.

**Mitigation:** Start with simpler representation for Phase A, add BDDs when recursive type complexity demands it.

### 2. Function type subtyping and circularity

Semantic subtyping for function types is potentially circular. CDuce's coinductive interpretation (greatest fixed point) is the known solution.

### ~~3. Effect set variables and principal types~~ (SETTLED)

**Yes — principal types are preserved.** Proof sketch:

Effect sets form a **free distributive lattice** over effect names: union is join, empty set is bottom, subset is order. Dolan's algebraic subtyping (thesis §4.4) proves that biunification preserves principal types over any distributive lattice. Open effect set variables (`@{e...}`) are handled identically to type variables with bounds — lower bounds accumulate via union in positive positions, upper bounds via intersection in negative positions. This is exactly the mechanism Simple-sub already implements for value types, specialized to a flat lattice of effect names.

Concretely: constraining `@{log, e...} <: @{log, fetch, e...}` yields `@{fetch} <: e` as a lower bound on `e` — the most general solution. No new algorithm is needed beyond what the value-type inference already provides.

**Caveat:** If effect sets later gain structure beyond flat names (e.g., parameterized effects like `@db.query(Table)`), principality needs re-verification. For Phase B's flat effect names, this is settled.

### 4. Gradual typing

Defer. Start with full inference (no annotations needed). No `Any` type (Decision #6), so no gradual typing escape hatch.

### 5. Error message quality

Subtyping errors can be confusing. **Mitigation:** Structured error reporting that decomposes subtyping failures into specific mismatches (missing fields, type mismatches, etc.). Elixir does this well.

### ~~6. Effect set syntax in annotations~~ (SETTLED)

**Decision:** `@{...}` syntax. Effect sets are prefixed with `@`, consistent with `perform(@eff, x)`.

```dvala
(String) -> @{log, fetch} String     // function with effects
(Number) -> Number                    // pure function (no annotation needed)
(A, (A) -> @{e...} B) -> @{e...} [B] // polymorphic effects
```

**Rationale:** `@` is already Dvala's "this is an effect" marker. `@{log, fetch}` is visually distinct from object literals `{name: "Alice"}`. No parser ambiguity.

---

## New Applications Unlocked

The type system's value goes beyond catching bugs — it's the combination of typed effects with Dvala's existing features that opens new domains.

### Capability-safe execution

With effect types, the host can inspect a program's effect signature *before* running it:

```dvala
// Type checker proves: this function can ONLY do http.get and db.write
let processOrder: (Order) -> @{http.get, db.write} Confirmation
```

The host provides only the declared capabilities. Dvala becomes a **capability-safe scripting language**.

### New domains

| Domain | Why the type system enables it |
|---|---|
| **Plugin/extension systems** | Host requires effect signature `@{ui.render}` — no filesystem, no network, statically proven |
| **Rule engines** | Exhaustive match + types = provably total functions |
| **Multi-tenant automation** | Tenant A's code proves it only touches `@{tenant_a.db}` |
| **Auditable systems** | Effect signatures as static audit trail |
| **Verified workflows** | Serializable continuations + typed effects = long-running workflows with proven side effects |

---

## Research Basis

| System | What we learn from it |
|---|---|
| **[MLsub](https://dl.acm.org/doi/10.1145/3093333.3009882)** (Dolan 2017) | Proof that principal type inference + subtyping is possible. Biunification algorithm. |
| **[Simple-sub](https://github.com/LPTK/simple-sub)** (Parreaux 2020) | Simplified implementation of algebraic subtyping. ~500 lines. Primary reference implementation. |
| **[CDuce](https://www.cduce.org/)** (Castagna & Frisch) | Mature set-theoretic type system. Coinductive function subtyping. BDD representation. |
| **[Elixir 1.17+](https://hexdocs.pm/elixir/gradual-set-theoretic-types.html)** (Castagna, Duboc, Valim 2023) | Production-grade set-theoretic types for a dynamic language. Pattern match typing. |
| **[Ballerina](https://ballerina.io/why-ballerina/flexibly-typed/)** (James Clark) | Semantic subtyping for network-oriented language. JSON/record typing. |
