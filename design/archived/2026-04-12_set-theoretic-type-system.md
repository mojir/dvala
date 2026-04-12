# Set-Theoretic Type System for Dvala

**Status:** Proposal (parallel alternative to HM + Rows)
**Created:** 2026-04-12
**References:** [MLsub (Dolan 2017)](https://dl.acm.org/doi/10.1145/3093333.3009882), [Simple-sub (Parreaux 2020)](https://dl.acm.org/doi/10.1145/3409006), [Elixir type system (Castagna et al. 2023)](https://arxiv.org/abs/2306.06391), [Ballerina semantic subtyping](https://ballerina.io/why-ballerina/flexibly-typed/), [CDuce (Castagna & Frisch)](https://www.cduce.org/)

---

## Motivation

The existing proposal ([type-system-survey.md](2026-03-28_type-system-survey.md)) recommends Hindley-Milner with row polymorphism for values and effect rows for effects. That's a proven approach (Koka demonstrates it works). This document explores a **strictly more expressive** alternative: **set-theoretic types with algebraic subtyping**.

The key question is: can we get *more* expressiveness *without* more complexity, by choosing a different foundation?

### Why explore this?

1. **Dvala values are already set-theoretic.** The runtime `Any` type is literally a union: `Coll | string | number | boolean | null | DvalaFunction | RegularExpression | EffectRef | Atom`. A type system where types are sets mirrors the runtime directly.

2. **HM struggles with subtyping.** Dvala needs `Number` to be a subtype of `Number | String` — a natural set containment. In HM, union types are bolted on awkwardly. In a set-theoretic system, they're primitive.

3. **Match exhaustiveness is free.** Dvala's `match` is a core construct. In set-theoretic types, each match clause *narrows* the type by set difference. If the remainder is `Never` (empty set), you're exhaustive. No separate analysis needed.

4. **Effects can be modeled as capability sets.** Instead of row polymorphism for effects (a separate mechanism from value types), we can use the *same* set operations: union adds effects, difference removes them. One theory, two uses.

5. **Multiplatform constraint.** The evaluator must stay AST-only, no type data in the tree. Both proposals share this constraint — types live in a side-table, erased after checking. But a simpler *conceptual* model (sets) may be easier to re-implement across platforms than a more mechanically complex one (row unification + effect row unification).

---

## Core Theory: Types as Sets

### The basic idea

Every type denotes a **set of values**. Type operations are set operations:

| Type operation | Set operation | Example |
|---|---|---|
| Union `A \| B` | Set union A ∪ B | `Number \| String` = all numbers and all strings |
| Intersection `A & B` | Set intersection A ∩ B | `{name: String} & {age: Number}` = records with both |
| Negation `!A` | Set complement ¬A | `!String` = everything that is not a string |
| Subtyping `A <: B` | Set containment A ⊆ B | `Number <: Number \| String` |
| `Never` | Empty set ∅ | No values inhabit this type |
| `Any` | Universal set U | All values |

Subtyping is **semantic**: `S <: T` if and only if the set of values denoted by `S` is a subset of the set denoted by `T`. No syntactic subtyping rules — just set containment.

### Why this is more powerful than HM

In Hindley-Milner, types form an algebra with unification. There is no subtyping relation — `Number` and `String` are incomparable. To express "a function that accepts numbers or strings," you need either:
- A union type extension (bolted on, breaks principal types)
- Parametric polymorphism with constraints (verbose)

In a set-theoretic system, `Number | String` is a first-class type. The function `(x: Number | String) -> ...` just works. And critically, **inference still works** — Dolan's MLsub and Parreaux's Simple-sub proved this.

### Literal types and singleton sets

Literal types are singleton sets:

```
42       : {42}         -- the set containing only the value 42
"hello"  : {"hello"}    -- the set containing only the string "hello"
true     : {true}
:ok      : {:ok}        -- atom literal type
```

This makes Dvala's atoms particularly well-typed. The type `:ok | :error` is the set `{:ok, :error}` — a precise two-element type. Pattern matching on atoms becomes set membership testing.

---

## Inference: Algebraic Subtyping (Simple-sub)

### The challenge

Traditional HM uses **unification**: when you see `f(x)` where `f: α -> β` and `x: γ`, you unify `α = γ`. This produces a single substitution. Simple, but no room for subtyping — `α` must *equal* `γ`, not just be compatible.

### Biunification (Dolan's approach)

Dolan's insight: type variables appear in two **polarities**:
- **Positive** (output/covariant position): the type of a value being *produced*
- **Negative** (input/contravariant position): the type of a value being *consumed*

Instead of `α = γ`, biunification constrains: `γ <: α` (the argument type must be a *subtype* of the parameter type). Type variables accumulate **bounds**:
- Lower bound (from positive positions): what the variable must *contain*
- Upper bound (from negative positions): what the variable must *fit within*

A type variable `α` with lower bound `L` and upper bound `U` is satisfiable when `L <: U`.

### Simple-sub (Parreaux's simplification)

Parreaux showed that Dolan's system can be implemented without the full abstract algebra machinery. The Simple-sub algorithm:

1. **Type variables have mutable bounds.** Each variable tracks its lower and upper bounds as sets.
2. **Constraint propagation replaces unification.** Instead of substitution, we propagate constraints through the type graph.
3. **Simplification collapses equivalent variables.** After inference, co-occurring variables in the same polarity are merged.

The result: **complete principal type inference with subtyping**, implemented in ~500 lines. This is the algorithm we'd adapt for Dvala.

### The constrain function

The core of the algorithm. Propagates `lhs <: rhs` until everything reduces to bounds on variables:

```typescript
function constrain(lhs: SimpleType, rhs: SimpleType): void {
  if (cache.has([lhs, rhs])) return;  // cycle guard
  cache.add([lhs, rhs]);

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

**Why propagation matters:** When a variable gets a new upper bound, we must check all existing lower bounds against it. Without propagation, constraints `Number <: α` and `α <: String` would silently coexist — the contradiction `Number <: String` would never be caught.

### Polarity: why unions appear in outputs and intersections in inputs

Every position in a type has a **polarity** — positive (produces values) or negative (consumes values). Entering a function parameter **flips** polarity:

```
(τ₀ → τ₁) → τ₂
 -     +     +      ← polarity

Nested: (callback) → callback(42)
         -                          callback is parameter → negative
         callback: (?) → ?
                    +    -          flipped again inside negative
```

Polarity determines which set operation applies when multiple types meet:

| Polarity | Multiple types combine as | Why |
|---|---|---|
| **Positive (+)** | **Union** (`\|`) | Producer can give A *or* B — all possibilities collected |
| **Negative (-)** | **Intersection** (`&`) | Consumer must handle A *and* B — all requirements apply |

This explains the bounds mechanism from the inside:
- **Lower bounds** accumulate in positive positions → union (all possible outputs)
- **Upper bounds** accumulate in negative positions → intersection (all requirements)

**Dvala effects follow the same pattern:**

| | Values | Effects |
|---|---|---|
| **Produce (positive)** | Return → union of types | `perform` → union of effects |
| **Consume (negative)** | Parameter → intersection of requirements | `handler` → subtraction of effects |

### Let-polymorphism via levels

Without generalization, a polymorphic function like `let id = (x) -> x` breaks on the second use — `id(42)` constrains `α <: Number`, then `id("hello")` adds `α <: String`, giving `Number & String = Never`.

Simple-sub solves this with **levels** instead of explicit `forall`. Each type variable has a level (an integer). Let-bindings raise the level:

```typescript
case Let(name, rhs, body) =>
  val rhs_ty = typeTerm(rhs, ctx, lvl + 1)   // raised level!
  typeTerm(body, ctx + (name -> PolymorphicType(lvl, rhs_ty)), lvl)
```

Variables created at level `lvl + 1` inside `rhs` are local. When `id` is used in `body`, all variables above `lvl` are copied fresh:

```
Level 0: outer scope
Level 1: inside let id = ...
          α created at level 1

id(42):      α is level 1 > level 0 → copy to α₁, constrain α₁ <: Number ✓
id("hello"): α is level 1 > level 0 → copy to α₂, constrain α₂ <: String ✓
```

No free-variable analysis needed. The level is O(1) per variable.

When a variable at a higher level escapes through constraints into a lower scope, the **extrude** function creates a proxy at the correct level, linked back to the original via bounds. This is the most complex part of the algorithm, but conceptually: "if a variable tries to escape its scope, create a proxy at the right level."

### Inference example

```dvala
let f = (x) ->
  match x
  | n when isNumber(n) -> n + 1
  | s when isString(s) -> length(s)
  end
```

Inference proceeds:
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
  | { tag: "Any" }                             // Top (universal set)
  | { tag: "Never" }                           // Bottom (empty set)

  // Inference
  | { tag: "Var"; id: number; lowerBounds: Type[]; upperBounds: Type[] }

  // Named
  | { tag: "Alias"; name: string; args: Type[]; expanded: Type }
  | { tag: "Recursive"; id: number; body: Type }  // μα.F(α)
```

### Subtyping decision procedure

Subtyping `S <: T` is decided by checking set emptiness: `S & !T = Never`. This is the **semantic subtyping** approach from CDuce.

For base types, this is straightforward. For function types, it uses the standard contravariant/covariant rule: `(A -> B) <: (C -> D)` iff `C <: A` and `B <: D`.

For recursive types, Ballerina and CDuce use **Binary Decision Diagrams (BDDs)** to efficiently represent and compare type sets. Elixir adopted [lazily-evaluated BDDs](http://elixir-lang.org/blog/2025/12/02/lazier-bdds-for-set-theoretic-types/) for performance at scale.

---

## Effect Typing: Effects as Capability Sets

### The idea

Instead of effect *rows* (Koka's approach), model effects as **sets of capabilities**. This uses the same set-theoretic machinery as value types — no separate row theory needed.

```
EffectType =
  | { tag: "EffectSet"; effects: Set<string>; open: boolean }
  // open=true means "these effects plus possibly more" (polymorphic)
  // open=false means "exactly these effects" (closed)
```

### How it works

Every function type includes an effect set:

```dvala
// Inferred: (String) -> {log, fetch} String
let fetchAndLog = (url) ->
  let data = perform(@fetch, url)    // adds 'fetch' to effect set
  perform(@log, data)                 // adds 'log' to effect set
  data
```

Handlers **subtract** from the effect set:

```dvala
// do-with removes handled effects via set difference
do with logHandler
  fetchAndLog("http://example.com")   // effects: {log, fetch}
end
// remaining effects: {fetch}  (log was handled)
```

### Effect subtyping

Effect subtyping is **covariant for function bodies** (a function with fewer effects is more general) and follows natural set containment:

```
{log} <: {log, fetch}     -- fewer effects is a subtype (more restricted)
{}    <: {anything}        -- pure is subtype of effectful
```

A pure function (`{}` effects) can be used anywhere an effectful function is expected. This is the natural behavior.

### Effect polymorphism

Open effect sets handle polymorphism:

```dvala
// map: (Array<A>, (A) -> {e...} B) -> {e...} Array<B>
// The effect variable e... means "whatever effects the callback has"
let result = map([1, 2, 3], (x) -> perform(@log, x); x * 2)
// result effects: {log}  (propagated from the callback)
```

The `{e...}` notation indicates an open effect set — a set variable that unifies with the actual effects of the callback. This is analogous to row variables but uses set-theoretic language.

### Comparison with effect rows

| Aspect | Effect rows (Koka) | Effect sets (this proposal) |
|---|---|---|
| Foundation | Row polymorphism (separate from value types) | Set operations (same as value types) |
| Handling | Row subtraction via unification | Set difference |
| Polymorphism | Row variables | Open sets (set variables) |
| Theory | Well-studied, 20+ years | Less studied for effects specifically |
| Expressiveness | Equivalent for most cases | Negation enables "all effects except X" |
| Implementation | Row unification algorithm | Same subtyping algorithm as values |

The key advantage: **one mechanism for both values and effects.** The same inference engine, the same subtyping checker, the same simplification pass. Less code, fewer concepts.

---

## Design Decision: Match Exhaustiveness (SETTLED)

**Decision:** Non-exhaustive match is an error. Always.

| Layer | Behavior |
|---|---|
| **With type checker** | Compile-time error: "non-exhaustive match, unhandled: `:triangle`" |
| **Without type checker (runtime)** | `MatchError` crash — never silent `null` |

**Rationale:** Silent `null`-default on non-matching cases undermines the entire type system. Every match would infer `T | Null`, null propagates through the program, and exhaustiveness checking — the biggest win of set-theoretic match typing — becomes meaningless. This is the same conclusion Rust, OCaml, Haskell, and Elixir reached.

**If you want null, say so explicitly:**

```dvala
match x
| :circle -> "circle"
| _ -> null               // explicit catch-all — type is String | Null, intentionally
end
```

**Breaking change:** Current Dvala returns `null` for non-matching cases. This must change before or alongside the type system. The runtime evaluator should throw `MatchError` regardless of whether the type checker is active.

---

## Design Decision: Strict vs Safe Access — `.` and `?.` (SETTLED)

**Decision:** Dvala gets two access operators with different semantics:

| Syntax | Desugars to | Missing key / null input | Inferred type |
|---|---|---|---|
| `a.b` | `a("b")` | **Crash: KeyError** | `T` |
| `a?.b` | `get(a, "b")` | Returns `null` | `T \| Null` |

**Chaining:**

```dvala
a.b.c          // a("b")("c")       — strict all the way, type T
a?.b?.c        // get(get(a, "b"), "c") — safe all the way, type T | Null
a.b?.c         // get(a("b"), "c")  — strict on b, safe on c, type T | Null
a?.b.c         // (get(a, "b"))("c") — safe on b, strict on c — crash if b is null
```

**This aligns with every other modern language:**

| Language | `.` | `?.` |
|---|---|---|
| TypeScript | Strict (crash) | Safe (undefined) |
| Kotlin | Strict (crash) | Safe (null) |
| Swift | Strict (crash) | Safe (nil) |
| C# | Strict (crash) | Safe (null) |
| **Dvala (current)** | Safe (null) — maps to `get` | Does not exist |
| **Dvala (proposed)** | Strict (crash) — maps to `()` | Safe (null) — maps to `get` |

**Rationale:** Every other strictness decision we've made (match, if, empty bodies) follows the principle: *null should be opt-in, not the default*. Current `.` violating this principle is inconsistent. Default access should be strict (`T`), safe access should be explicit (`T | Null`).

**`get` behavior is unchanged:** `get(null, key)` → `null` and `get(obj, "missing")` → `null`. This is correct — `get` is the explicit "I know it might not exist" path, and `?.` desugars to it.

**Also strict (same as `.` desugaring):**

| Access | Missing key / out of bounds | Type |
|---|---|---|
| `obj("missing_key")` | **Crash: KeyError** | `T` |
| `arr(99)` on 3-element array | **Crash: IndexError** | `T` |
| `"hello"(99)` | **Crash: IndexError** | `T` |

**Breaking change:** Current `.` maps to `get` (safe). New `.` maps to `()` (strict). All existing `.`-access changes semantics. This is the largest breaking change in this proposal.

---

## Design Decision: `if` Requires `else` (SETTLED)

**Decision:** `if` expressions must have an `else` branch.

| Current | New |
|---|---|
| `if cond then expr end` → `null` when falsy | **Syntax error: missing `else` branch** |
| `if cond then a else b end` → works | Unchanged |

**Rationale:** Without `else`, every `if` expression infers `T | Null`. This is the same null-propagation problem as non-exhaustive match. If `if` is an expression (which it is in Dvala), both branches must produce a value.

**If you want conditional-only side effects:**
```dvala
when cond do expr end           // statement form — doesn't return a value
if cond then expr else null end // explicit null — type is T | Null, intentionally
```

**Breaking change:** `if` without `else` is currently valid and returns `null`.

---

## Design Decision: Empty Function Body is Syntax Error (SETTLED)

**Decision:** A function with no body is a syntax error.

```dvala
let f = () -> end       // Syntax error: empty function body
let f = () -> null      // Ok: explicitly returns null, type is () -> Null
```

**Rationale:** An empty function body is almost certainly a bug. If you want a function that returns null, say so. This prevents accidental `Null` in inferred return types.

---

## Design Decision: Empty Block is Syntax Error (SETTLED)

**Decision:** An empty block `begin end` is a syntax error.

```dvala
begin end              // Syntax error: empty block
begin null end         // Ok: explicitly evaluates to null
```

**Rationale:** Same principle as empty function body and `if` without `else`. A silent `null` from an empty block is inconsistent with the other strictness decisions. If you mean null, write `null`.

Note: ML's `()` (unit) is not a precedent here — unit means "operation succeeded, no meaningful value." Dvala's `null` means "absence." They are different concepts.

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

After the `Number` branch, the remaining type is `T \ Number` (set difference). After the `String` branch, it's `T \ Number \ String`. The wildcard `_` catches whatever remains.

### Exhaustiveness checking

**Exhaustiveness = remainder is `Never`.**

```dvala
type Shape = :circle | :square | :triangle

let name = (s: Shape) ->
  match s
  | :circle -> "circle"      // remaining: {:square, :triangle}
  | :square -> "square"      // remaining: {:triangle}
  | :triangle -> "triangle"  // remaining: Never (empty set) -> exhaustive!
  end
```

If the programmer forgets `:triangle`:

```dvala
let name = (s: Shape) ->
  match s
  | :circle -> "circle"
  | :square -> "square"
  // Error: non-exhaustive match. Unhandled: :triangle
  end
```

No special exhaustiveness algorithm needed. The type system's set difference does all the work.

### Redundancy checking

Similarly, a redundant branch is one where the narrowed type is already `Never`:

```dvala
let f = (x: Number) ->
  match x
  | n when isNumber(n) -> n + 1
  | s when isString(s) -> length(s)   // Error: unreachable — Number & String = Never
  end
```

### Guard narrowing

Dvala's type predicates (`isNumber`, `isString`, `isArray`, etc.) are **type narrowing functions**. The type checker understands that after `isNumber(x)` succeeds, `x` has type `x_type & Number`.

This extends to user-defined guards via pattern slots. Each slot kind maps to a type operation:

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

Dvala objects are structural (PersistentMap at runtime). The type system models them as sets of records:

```dvala
// Type: {name: String, age: Number}
let person = {name: "Alice", age: 30}

// This function accepts any record with a 'name' field
// Type: ({name: String, ...}) -> String
let greet = (p) -> "Hello, " ++ p.name
```

### Open vs. closed records

- **Closed record** `{name: String, age: Number}`: exactly these fields
- **Open record** `{name: String, ...}`: at least `name: String`, possibly more

In set-theoretic terms:
- `{name: String, age: Number}` is a subset of `{name: String, ...}`
- A closed record type is a subset of any open record type that matches its fields

### Record subtyping

Width and depth subtyping are natural:

```
{name: String, age: Number}  <:  {name: String}        // width: more fields is subtype
{name: "Alice"}              <:  {name: String}          // depth: literal is subtype of base
```

In HM + rows, this requires row polymorphism with row variables. In set-theoretic types, it's just set containment.

### Intersection for extension

Record intersection = record merge (when field types are compatible):

```dvala
type Named = {name: String}
type Aged = {age: Number}
type Person = Named & Aged    // = {name: String, age: Number}
```

---

## Atoms and Tagged Unions

Dvala atoms (`:ok`, `:error`, `:none`) are ideal for set-theoretic types.

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

The discriminant field (`:ok` vs `:error`) is a literal/atom type. Match narrows on it automatically. This is how Elixir's type system handles tagged tuples — same principle.

### Comparison with nominal tagged unions

Languages like Rust and Haskell use nominal tagged unions (`enum`). Dvala's structural approach with atom tags is more flexible:

```dvala
// These are compatible — same shape, no declaration needed
let a = {tag: :ok, value: 42}
let b = {tag: :ok, value: "hello"}
// Both match {tag: :ok, value: T} for different T
```

No `type` declaration required for ad-hoc tagged data. Declarations are optional, for documentation and reuse.

---

## Negation Types

Negation is the unique power that set-theoretic types add over HM.

### What negation enables

```dvala
!String          // Everything that is NOT a string
!Null            // Everything that is NOT null (= non-nullable)
Number & !0      // Numbers except zero (positive or negative non-zero)
```

### Practical uses

**Non-nullable types:**
```dvala
// A function that guarantees non-null return
let unwrap: (T | Null) -> T & !Null
```

**Exhaustive match remainder:**
After matching `Number`, the remaining type is literally `T & !Number`. No special encoding needed.

**Effect negation:**
```dvala
// "All effects except log" — useful for expressing "everything but what I handled"
{e... & !log}
```

### Trade-off

Negation types can produce complex inferred types that are hard to read. Mitigation strategies:
1. **Simplification pass**: Collapse `Number & !String` to `Number` (they're already disjoint)
2. **Display heuristics**: Show `T & !Null` as `NonNull<T>` when displaying to users
3. **Bounded negation**: Only allow negation of base types and atoms in surface syntax (internally, the system can produce arbitrary negations)

---

## Type Simplification Pipeline

Inference produces correct but often **unreadable** types. Simplification is the hardest part of the implementation — not algorithmically, but as a UX problem. A type checker that shows `(α ∧ Number | β) → μγ.(γ | α)` instead of `(Number) → Number` is useless in practice.

### Step 1: Expand bounds into type expressions

Walk the bounds graph, producing a type tree. Detect cycles via a visited set — when revisiting a variable, introduce a recursive type `μα`:

```
Variable(α) with lowerBounds [Number, String]
  → expand positively → Number | String

Variable(α) with lowerBounds [{value: Number, next: α}]
  → expand positively → μα. {value: Number, next: α}   (cycle detected)
```

### Step 2: Remove single-polarity variables

A type variable appearing only in one polarity carries no information:

```
(α & Number) → Number     α only negative, no lower bounds → remove
simplifies to: (Number) → Number
```

**Rule:** If a variable appears only positively, replace with its lower bounds (union). If only negatively, replace with its upper bounds (intersection). If it has no bounds in that polarity, replace with `Any` (negative) or `Never` (positive).

### Step 3: Merge indistinguishable variables (co-occurrence)

Variables with identical co-occurrence patterns can be unified:

```
(Boolean) → (α) → α | (β) → β
α and β always co-occur in the same positions → merge
simplifies to: (Boolean) → (α) → α
```

### Step 4: Variable sandwich elimination

If a variable's lower bound equals its upper bound, it's pinned:

```
Number <: α <: Number   →   α = Number

(α & Number) → (α | Number)
simplifies to: (Number) → Number
```

### Step 5: Hash consing for recursive types

Redundant outer layers of recursive types are collapsed:

```
(α) → {left: α, right: {left: α, right: μβ.{left: α, right: β}}}
outer layers repeat the recursive pattern → collapse
simplifies to: (α) → μβ. {left: α, right: β}
```

### Full pipeline

```
Raw inference (bounds graph)
    │
    ▼
Expand bounds → type expression (may be ugly)
    │
    ▼
Remove single-polarity variables
    │
    ▼
Merge indistinguishable variables (co-occurrence)
    │
    ▼
Eliminate sandwiched variables
    │
    ▼
Hash consing of recursive structures
    │
    ▼
Readable type for the user
```

**Key insight:** Simplification is a UX problem, not a correctness problem. Skipping it produces correct but unreadable types. The inference algorithm works regardless — simplification only affects what the user sees.

---

## Mapping Dvala Constructs to Typing Operations

| Dvala construct | Typing operation |
|---|---|
| `let x = expr` | Generalize `expr` at `lvl + 1`, bind in body |
| `let rec f = expr` | Bind `f` to fresh variable, constrain against `expr` after |
| `(x) -> body` | `x` → fresh variable (negative), body → return type (positive) |
| `f(arg)` | Fresh result variable `β`, constrain `f <: (arg) → β` |
| `match x \| p -> e` | Each branch: narrow `x` with pattern (intersection), collect return types (union). Remainder = `Never` → exhaustive, else `MatchError` |
| `42`, `"hi"`, `:ok` | Literal / singleton type |
| `{a: 1, b: 2}` | Closed record `{a: Number, b: Number}` |
| `x.name` | Constrain `x <: {name: β}` (open record), return `β` |
| `perform(@eff, x)` | Add `eff` to effect set (positive → union). Return = `Any` (Phase A) / typed (Phase C) |
| `do with h; body end` | Effect set: `body_effects \ h_handled_effects` (set difference) |
| `if c then a else b` | Constrain `c <: Boolean`, return = union of `a` and `b` |
| `isNumber(x)` (guard) | Type narrowing: `x` becomes `x_type & Number` in true branch |

---

## Phased Implementation

Same phasing philosophy as the HM + rows proposal, but with a unified underlying mechanism.

### Phase A: Set-Theoretic Value Types

**Goal:** Full type inference for values with subtyping, unions, intersections, and negation.

**What's included:**
- Primitive types, literal types, atom types
- Union (`|`), intersection (`&`), negation (`!`)
- Function types (contravariant params, covariant return)
- Structural record types (open and closed)
- Array and tuple types
- Type aliases and recursive types
- Pattern match narrowing and exhaustiveness checking
- Generic type aliases: `type Result<T, E> = {tag: :ok, value: T} | {tag: :error, error: E}`

**Inference algorithm:** Adapted Simple-sub (Parreaux 2020)
- ~500-1000 lines of core inference code (TypeScript)
- Type variables with mutable lower/upper bounds
- Constraint propagation through the AST
- Post-inference simplification

**Output:** `Map<NodeId, Type>` — side-table only, erased after checking.

**What `perform` returns in Phase A:** `Any` (same as HM proposal — effect typing comes in Phase B).

### Phase B: Effect Sets

**Goal:** Track which effects each function may perform, as a set.

**What's added:**
- Every function type gains an effect component: `(A) -> {eff1, eff2} B`
- `perform(@name, x)` adds `name` to the current effect set
- `do with handler; body end` subtracts handled effects via set difference
- Pure functions have empty effect set `{}`
- Effect polymorphism via open effect sets `{e...}`
- Leaked effects at top level → bundle manifest (same as HM proposal)

**How it integrates:** Effect sets use the same subtyping engine as value types. `{log} <: {log, fetch}` is checked the same way `Number <: Number | String` is. No new algorithm needed.

### Phase C: Handler Typing

**Goal:** Type the full handler contract — what flows through `perform` and `resume`.

**What's added:**
- Effect declarations: `effect @log(String) -> Null`
- `perform(@log, x)` checks `x: String`, returns `Null`
- Handler clause typing: `resume` gets the declared return type
- Transform clause typing: return value transformation
- All clause bodies must produce consistent answer type
- Shallow vs deep handler semantics reflected in type

**Negation bonus:** A handler that handles `{log, fetch}` applied to a body with effects `{log, fetch, db}` produces remainder `{db}`. In row systems, this requires row unification. Here: set difference `{log, fetch, db} \ {log, fetch} = {db}`.

### Phase D (future): Refinement layer

Optional. Predicates on types for constraint domains:
```dvala
type Positive = Number & {n | n > 0}
```
Built on top of the set-theoretic foundation. Not needed for language viability.

---

## Architecture: Side-Table Only

Both this proposal and the HM + rows proposal share the same critical constraint:

### No types in the AST

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
              Map<NodeId, Type>    ← side-table, erased after checking
                       │
                       v
                  ┌──────────┐
                  │Evaluator │──────> does NOT see types
                  └──────────┘
```

The evaluator is the only component that needs to be ported to other platforms (KMP, etc.). The type checker is a TypeScript-only pre-pass that produces diagnostics. It reads the AST, builds the type side-table, reports errors, and throws the table away.

### What this means for implementation

- **Zero runtime cost.** Type checking is a separate phase. The evaluator never touches type data.
- **No evidence passing.** Unlike some effect type systems that thread evidence through the runtime (à la Koka's optimized compilation), Dvala's handler dispatch is already O(1) via `clauseMap`. No runtime changes needed.
- **Serializable continuations remain unaffected.** Continuation frames contain no type information. Serialization/deserialization works exactly as before.

---

## Comparison: Set-Theoretic vs HM + Rows

| Dimension | HM + Row Polymorphism | Set-Theoretic (this proposal) |
|---|---|---|
| **Foundation** | Unification-based | Subtyping-based (set containment) |
| **Union types** | Bolted on (breaks principal types) | Primitive (first-class) |
| **Intersection types** | Limited (constraints) | Primitive (first-class) |
| **Negation types** | Not available | Available (`!T`) |
| **Subtyping** | Not native (emulated via constraints) | Native and complete |
| **Record types** | Row polymorphism (row variables) | Structural subtyping (width + depth) |
| **Effect types** | Effect rows (separate mechanism) | Effect sets (same mechanism as values) |
| **Match exhaustiveness** | Separate analysis pass | Falls out of set difference |
| **Inference** | Algorithm W (well-understood) | Simple-sub / biunification (newer) |
| **Principal types** | Yes | Yes (Dolan proved this) |
| **Complexity for users** | Familiar (ML tradition) | Intuitive (sets are familiar) |
| **Implementation maturity** | Decades of implementations | Fewer implementations (MLsub, CDuce, Elixir, Ballerina) |
| **Ecosystem** | OCaml, Haskell, Koka, Elm | CDuce, Elixir (1.17+), Ballerina |
| **Risk** | Low — well-trodden path | Medium — less battle-tested |
| **Concepts to implement** | HM inference + row unification + effect row unification | One inference engine with subtyping |

### Where HM + Rows wins

1. **Maturity.** More reference implementations, more literature, more developers who understand it.
2. **Error messages.** HM error messages are well-studied. Subtyping error messages are harder — "type `X` is not a subtype of `Y`" can be less helpful than "expected `X`, got `Y`".
3. **Predictability.** Developers familiar with OCaml/Haskell/Elm know what to expect.

### Where Set-Theoretic wins

1. **Expressiveness.** Proper unions, intersections, negation. Strictly more types can be expressed.
2. **Conceptual simplicity.** "Types are sets" is an explanation that non-PLT people understand immediately.
3. **Unified theory.** One mechanism for values AND effects. Less total code, fewer concepts.
4. **Match typing.** Dvala's `match` is a core construct. Set-theoretic narrowing makes it first-class.
5. **Atom types.** Dvala's atoms map perfectly to singleton set types.
6. **Dvala's runtime mirrors it.** The runtime `Any` type is already a union. The type system would speak the same language as the runtime.

---

## Open Questions

### 1. Recursive types and BDDs

Recursive types (like linked lists, trees) interact with set-theoretic subtyping. CDuce and Elixir use Binary Decision Diagrams to efficiently represent and compare type sets that include recursion. We'd need to implement BDDs or a similar decision procedure.

**Mitigation:** Start with a simpler representation (normalized union-of-atoms) for Phase A, add BDDs when recursive type complexity demands it.

### 2. Function type subtyping and circularity

As Ballerina's spec notes, semantic subtyping for function types is potentially circular: we define subtyping via set containment, but the set a function type denotes depends on subtyping of parameter/return types.

**Solution:** CDuce's coinductive interpretation. Function subtyping is defined coinductively, checked via greatest fixed point. This is well-understood and implemented in CDuce, Ballerina, and Elixir.

### 3. Effect set variables and principal types

Effect polymorphism via open effect sets `{e...}` needs to produce principal types. Is it guaranteed that `{log, e...}` where `e...` is a set variable always has a most general solution?

**Likely yes.** Effect sets form a lattice (ordered by subset), and lattice-based inference preserves principality. But this needs formal verification — it's the least well-studied part of this proposal.

### 4. Gradual typing integration

Can we support *gradual* adoption — some code typed, some not? Elixir's approach: a `dynamic()` type that is compatible with everything (both supertype and subtype of all types). This breaks set-theoretic purity but enables incremental migration.

**Recommendation:** Defer gradual typing. Start with full inference (no annotations needed). Add `dynamic` escape hatch only if user demand requires it.

### 5. Error message quality

Subtyping errors can be confusing. "Type `{name: String, age: Number}` is not a subtype of `{name: String, email: String}`" is less helpful than "missing field `email`".

**Mitigation:** Structured error reporting that decomposes subtyping failures into specific mismatches (missing fields, type mismatches on specific fields, etc.). Elixir does this well.

---

## Implementation Roadmap

### Step 0: Runtime strictness (prerequisite, no type system dependency)

All breaking changes needed to make the type system meaningful. These are independent of each other and of all type system steps.

- **Match:** Non-matching `match` throws `MatchError` instead of returning `null`
- **`.` becomes strict:** `a.b` desugars to `a("b")` (strict) instead of `get(a, "b")` (safe)
- **`?.` introduced:** `a?.b` desugars to `get(a, "b")` — null-safe access, opt-in
- **Object access:** Missing key `obj("missing")` throws `KeyError` instead of returning `null`
- **Array access:** Out-of-bounds `arr(99)` throws `IndexError` instead of returning `null`
- **String access:** Out-of-bounds `"hello"(99)` throws `IndexError` instead of returning `null`
- **`if` without `else`:** Syntax error (or at minimum, runtime error if condition is falsy)
- **Empty function body:** Syntax error (`() -> end` is rejected by the parser)
- **Empty block:** Syntax error (`begin end` is rejected by the parser)

### Step 1: Core type algebra

- Type representation (the `Type` union above)
- Subtyping checker: `isSubtype(S, T): boolean`
- Simplification: normalize unions/intersections, collapse trivial negations
- Unit tests for all subtyping rules

### Step 2: Simple-sub inference engine (2-3 weeks)

- Port/adapt [Parreaux's Simple-sub](https://github.com/LPTK/simple-sub) to TypeScript
- Type variables with mutable bounds
- Constraint generation from AST walk
- Constraint solving (propagation + simplification)
- Test on Dvala expressions: let, function, application, match

### Step 3: Record and collection types (1-2 weeks)

- Open/closed record subtyping
- Array type inference
- Tuple type inference
- Spread/rest patterns

### Step 4: Match narrowing and exhaustiveness (1 week)

- Type narrowing per match clause (set intersection with pattern type)
- Remainder computation (set difference)
- Exhaustiveness warning when remainder != Never
- Redundancy warning when narrowed type == Never

### Step 5: Atom and tagged union typing (1 week)

- Singleton atom types
- Tagged union inference from match patterns
- Named type aliases for common patterns

### Step 6: Effect sets (Phase B, 2-3 weeks)

- Effect set type representation
- Effect inference from `perform` calls
- Effect subtraction from `do with handler` blocks
- Effect polymorphism (open sets)
- Leaked effect manifest

### Step 7: Handler typing (Phase C, 2-3 weeks)

- Effect declarations (optional)
- Handler clause typing
- Resume/abort typing
- Transform clause typing

---

## Research Basis

| System | What we learn from it |
|---|---|
| **[MLsub](https://dl.acm.org/doi/10.1145/3093333.3009882)** (Dolan 2017) | Proof that principal type inference + subtyping is possible. Biunification algorithm. |
| **[Simple-sub](https://github.com/LPTK/simple-sub)** (Parreaux 2020) | Simplified implementation of algebraic subtyping. ~500 lines. Our primary reference implementation. |
| **[CDuce](https://www.cduce.org/)** (Castagna & Frisch) | Mature set-theoretic type system. Coinductive function subtyping. BDD representation. |
| **[Elixir 1.17+](https://hexdocs.pm/elixir/gradual-set-theoretic-types.html)** (Castagna, Duboc, Valim 2023) | Production-grade set-theoretic types for a dynamic language. Gradual typing integration. Pattern match typing. |
| **[Ballerina](https://ballerina.io/why-ballerina/flexibly-typed/)** (James Clark) | Semantic subtyping for network-oriented language. JSON/record typing. |

---

## Verdict

This proposal is **strictly more expressive** than HM + rows, with a **simpler conceptual model** (sets vs. rows + unification), at the cost of **less implementation maturity** and **harder error messages**.

For Dvala specifically, the fit is strong:
- Dvala's `match` becomes a first-class type operation
- Dvala's atoms get precise singleton types
- Dvala's structural objects get natural subtyping
- Dvala's effects use the same set machinery as values
- The "types are sets" mental model matches Dvala's "values are data" philosophy

The primary risk is implementation quality — we'd be building on newer research with fewer reference implementations. Simple-sub mitigates this significantly (it's a concrete, tested, ~500-line algorithm), and Elixir's production deployment proves the approach works at scale.

**Recommendation:** Build a prototype of Phase A (value types only) using Simple-sub, and compare the experience against an equivalent HM prototype. The prototype will reveal whether the theoretical advantages translate to practical benefits for Dvala's specific needs.

---

## New Applications Unlocked by the Type System

The type system's value isn't just catching bugs — it's the **combination** of typed effects with Dvala's existing features (serializable continuations, algebraic effects, sandboxed execution) that opens entirely new application domains.

### Capability-safe execution

With effect types, the host can inspect a program's effect signature *before* running it:

```dvala
// Type checker proves: this function can ONLY do http.get and db.write. Nothing else.
let processOrder: (Order) -> {http.get, db.write} Confirmation
```

The host provides only the declared capabilities. Dvala becomes a **capability-safe scripting language** — user-submitted code with static proof of what it can and cannot do. No other mainstream language offers this combination: serializable continuations + typed effects + sandboxable execution.

### New domains

| Domain | Why the type system enables it |
|---|---|
| **Plugin/extension systems** | Host can require plugins to have effect signature `{ui.render}` — no filesystem, no network, statically proven |
| **Rule engines / policy engines** | Exhaustive match + types = provably total functions. All cases handled, guaranteed. |
| **Multi-tenant automation** | Tenant A's code can prove it only touches `{tenant_a.db}`, never `{tenant_b.db}` |
| **Low-code / visual flow builders** | Typed effects give typed "blocks" — a visual editor can show which blocks are composable |
| **Auditable systems** | Effect signatures serve as a static audit trail — "this code *can* do X, Y, Z and nothing else" |
| **Verified workflows** | Serializable continuations + typed effects = long-running workflows with proven side effects. Approval flows: "this code wants `{email.send, payment.charge}` — approve?" |

### What doesn't change

The type system opens no new doors for:
- Performance (types are erased, zero runtime impact)
- Small scripts / playground use (dynamic typing already works well there)
