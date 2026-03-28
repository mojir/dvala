# Type System Strategies for Dvala

**Purpose:** Educational survey of type system approaches and how they fit Dvala's specific needs.
**Created:** 2026-03-28

---

## What Dvala Needs to Type

Before comparing strategies, it's worth noting that Dvala has unusual requirements. A type system must handle:

1. **Values** — the basics: numbers, strings, booleans, arrays, objects, functions
2. **Effects** — which effects can a function perform? Can the type system track this?
3. **Handlers** — does a handler cover all effects its body might perform?
4. **Resume/abort** — what type does `resume` return? What type does abort produce?
5. **Lazy values** — is a thunk of type `T` the same as `T`? Does the type system distinguish forced from unforced?
6. **Multi-shot continuations** — can the type system track whether a continuation is used once or many times?
7. **Serializable continuations** — does serialization preserve type safety?

Most type systems handle (1) well. Few handle (2-3). Almost none address (4-7). This is the design space.

---

## Strategy 1: Hindley-Milner (ML family)

### How it works

Types are inferred automatically from usage. The programmer rarely writes type annotations — the compiler figures it out:

```
let add = (a, b) -> a + b
// inferred: (number, number) -> number
```

Based on unification: the compiler generates type equations from the code and solves them. If the equations are contradictory, it's a type error. Parametric polymorphism (generics) is inferred too:

```
let first = (pair) -> pair.0
// inferred: forall a b. (a, b) -> a
```

### Languages that use it

ML, OCaml, Haskell, F#, Elm, Rust (partially)

### Fit for Dvala

**Strengths:**
- Minimal annotation burden — important for a new language trying to attract users
- Well-understood theory, decades of research
- Koka proves it works with algebraic effects (effect rows are inferred)

**Challenges:**
- Error messages can be cryptic when inference fails — the error appears far from the cause
- Subtyping (Dvala objects/records) interacts poorly with HM inference — most HM languages use structural typing with row polymorphism instead
- Adding effect inference on top of value inference increases complexity significantly

**Verdict:** The gold standard for functional languages. Dvala's natural fit. The question is whether to extend it with effect rows (like Koka) or keep effects untyped initially.

---

## Strategy 2: Effect Rows (Koka's approach)

### How it works

An extension of Hindley-Milner where every function type includes an **effect row** — a set of effects the function might perform:

```
// Koka-style syntax
let fetchUser: (id: string) -> <fetch, log> User
```

The `<fetch, log>` part says: this function may perform `fetch` and `log` effects. Handlers eliminate effects from the row:

```
handle fetchUser("123") with fetchHandler
// result type: <log> User  (fetch is handled, log remains)
```

Effect rows are inferred, polymorphic, and composable. A function that doesn't perform effects has an empty row `<>` — it's pure.

### How effect inference works

```
let greet = (name) ->
  let msg = "Hello, " ++ name
  perform(@log, msg)    // introduces <log> into the effect row
  msg

// inferred: (string) -> <log> string
```

The compiler sees `perform(@log, ...)` and adds `log` to the row. If `greet` calls another function with effects, those effects bubble up into `greet`'s row. Handlers remove effects from the row — a fully handled expression has row `<>`.

### Languages that use it

Koka, Eff (partially), Frank, Links

### Fit for Dvala

**Strengths:**
- Directly models Dvala's effect system — perform adds to the row, handle removes from it
- Catches unhandled effects at compile time
- Makes the effect contract explicit: you know exactly what a function might do
- Koka demonstrates this works in practice

**Challenges:**
- Effect polymorphism is complex — a higher-order function that takes an effectful callback needs polymorphic effect rows
- Handler typing is intricate: the handler's return type, resume type, and abort type must all be consistent
- Lazy effects add a dimension — does `lazy` change the effect row, or is it a property of the handler?
- Row typing for Dvala's objects (open records with effect-producing methods) is uncharted territory

**Verdict:** The most principled approach for Dvala. This is what Koka chose for similar reasons. The implementation cost is high, but the payoff is that the type system actually understands effects — the core feature of the language.

---

## Strategy 3: Gradual Typing (TypeScript-style)

### How it works

Types are optional. Code without annotations is dynamically typed. Add annotations incrementally for safety:

```
// Untyped — works fine
let add = (a, b) -> a + b

// Typed — compiler checks
let add = (a: number, b: number): number -> a + b
```

A special `any` type opts out of checking. The boundary between typed and untyped code is managed by runtime checks (or trust).

### Languages that use it

TypeScript, Python (mypy), Dart, PHP (recent versions)

### Fit for Dvala

**Strengths:**
- Low barrier to entry — start without types, add them when you want safety
- Familiar to the largest developer audience (TypeScript developers)
- Easier to implement incrementally — ship the language now, add types later
- The playground works without types; types are a production concern

**Challenges:**
- "Optional" types often means "nobody writes them" — the safety guarantee is only as good as coverage
- Doesn't track effects — you'd need a separate system for that, or effects stay untyped
- The typed/untyped boundary is a source of runtime errors (the "any" escape hatch)
- Doesn't help with the unique things Dvala needs typed (effects, handlers, continuations)

**Verdict:** Pragmatic for adoption, but misses the opportunity to make effects type-safe. If the type system doesn't understand effects, it's just catching value-level bugs — any language can do that. Dvala's differentiator is effects; the type system should reflect that.

---

## Strategy 4: Structural Typing with Row Polymorphism

### How it works

Types are determined by structure, not by name. Two values with the same shape have the same type, regardless of what they're called:

```
// These are the same type — both have {name: string, age: number}
let user = {name: "Alice", age: 30}
let employee = {name: "Bob", age: 25}
```

Row polymorphism extends this to open records — a function that needs a `name` field works with any record that has one:

```
let greet = (person: {name: string, ...rest}) -> "Hello, " ++ person.name
// works with {name: "Alice"}, {name: "Bob", age: 25}, etc.
```

The `...rest` is a row variable — it stands for "whatever other fields exist."

### Languages that use it

OCaml (objects), Elm (records), PureScript, Koka (for both records and effects)

### Fit for Dvala

**Strengths:**
- Dvala already uses structural typing for objects — no nominal class system
- Row polymorphism for records and effect rows use the same theory — implement once, use for both values and effects
- No need to declare types/interfaces before using them — fits Dvala's lightweight feel
- Works naturally with Hindley-Milner inference

**Challenges:**
- Row unification is more complex than simple type unification
- Error messages for row type mismatches can be confusing ("expected {name: string, age: number | r} but got {name: string | s}")
- Less familiar to developers coming from nominal type systems (Java, C#, TypeScript interfaces)

**Verdict:** The natural choice for Dvala's value types, and it unifies with effect row typing. This isn't an alternative to Strategies 1-2 — it's the record typing approach that complements them.

---

## Strategy 5: Refinement Types

### How it works

Types can include predicates — constraints that values must satisfy:

```
type Positive = {n: number | n > 0}
type NonEmpty = {arr: Array<a> | length(arr) > 0}

let head = (arr: NonEmpty<a>): a -> arr[0]   // can't fail — arr is guaranteed non-empty
```

The compiler verifies (or the runtime checks) that values satisfy their predicates.

### Languages that use it

Liquid Haskell, F*, Refinement Types for TypeScript

### Fit for Dvala

**Strengths:**
- Could type constraint solver domains: `type Domain = {values: Array<int> | length(values) > 0}`
- Could express handler contracts: "this handler handles all effects in the body"
- Very expressive — catches bugs that other type systems miss

**Challenges:**
- Verification is hard — often requires an SMT solver at compile time
- Significantly more complex to implement than HM or gradual types
- Too academic for a language seeking adoption? Liquid Haskell is research, not production.
- Overkill for most of what Dvala needs

**Verdict:** Interesting for the future (especially constraint solver typing), but too ambitious for a first type system. Could be added as a layer on top of HM + effect rows later.

---

## Strategy 6: Dependent Types

### How it works

Types can depend on values. The type of a function's output can depend on the value of its input:

```
// The return type depends on the input value
let replicate: (n: number, x: a) -> Vector<a, n>
// replicate(3, "hi") : Vector<string, 3>
```

### Languages that use it

Idris, Agda, Coq, Lean

### Fit for Dvala

**Strengths:**
- Maximum expressiveness — can type everything, including effect protocols and handler contracts
- Edwin Brady's Idris 2 combines dependent types with algebraic effects — proves it's possible

**Challenges:**
- Requires a proof assistant mindset — users must prove their code is correct
- Type inference is undecidable in the general case — more annotations required
- Implementation complexity is an order of magnitude beyond HM
- Would make Dvala a research language, not a practical one

**Verdict:** Wrong trade-off for Dvala. The goal is adoption, not proof-carrying code.

---

## Comparison Matrix

| Strategy | Inference | Effect typing | Implementation effort | Adoption barrier | Dvala fit |
|---|---|---|---|---|---|
| Hindley-Milner | Full | No (needs extension) | Medium | Low | Strong base |
| HM + Effect rows | Full | Yes | High | Low-Medium | Best fit |
| Gradual | None (optional) | No | Low | Lowest | Misses the point |
| Row polymorphism | Full | Unifies with effects | Medium | Low | Complement to HM |
| Refinement | Partial | Partial | Very high | High | Future layer |
| Dependent | Limited | Yes | Very high | Very high | Wrong trade-off |

---

## Recommendation for Dvala

A phased approach:

### Phase A: Hindley-Milner + structural typing with row polymorphism

Start with inferred types for values. No annotations required for basic code. Row polymorphism for records (Dvala objects are already structural). This gives users type safety with minimal friction.

### Phase B: Effect rows

Extend the type system to track effects. Every function gets an effect row, inferred automatically. Handlers remove effects from the row. Unhandled effects at the top level are a compile error. This is where the type system starts understanding Dvala's core feature.

### Phase C: Handler typing

Type the handler contract fully: what effects it handles, what type `resume` expects, what abort produces, what the `return` clause transforms. This closes the loop — the type system guarantees that handlers and effects are consistent.

### Future: Refinement types for constraint domains

Optional, additive. Type constraint solver variables with domain predicates. Not needed for the language to be useful, but would make the solver story even stronger.

---

## Key Design Decision: Lazy Types

One Dvala-specific question that cuts across all strategies: **does the type system distinguish lazy from strict values?**

**Option 1: Transparent** — `lazy T` is just `T`. The type system doesn't care. Simpler, but can't catch forcing errors.

**Option 2: Distinct** — `Lazy<T>` is a different type from `T`. Forces must be explicit or inferred. More precise, but adds annotation burden.

Haskell chose transparent (everything is lazy, so there's no distinction). Scala chose distinct (`lazy val` is explicit). Given that Dvala is lazy-by-default for pure expressions but eager-by-default for effects, transparent is likely the right choice — laziness is the default, not an exception.
