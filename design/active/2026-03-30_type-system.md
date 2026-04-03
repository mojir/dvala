# Type System Design

**Status:** Draft (revised)
**Created:** 2026-03-30
**Revised:** 2026-04-03 — review findings: pipeline clarification, macro expansion, builtin type schemes, language service integration, risk assessment

## Goal

Define the architecture and phased implementation plan for Dvala's type system: inferred value types (Hindley-Milner), effect row inference (Row Polymorphism), and full handler typing.

---

## Background

Dvala is currently untyped. The runtime is a trampoline-style evaluator that dispatches effects by name, handles algebraic handlers with deep semantics, and supports serializable continuations. A type system must fit within Dvala's specific constraints:

- **Pipeline**: `tokenizer → parser → (expandMacros) → typechecker → evaluator` (normal flow in `createDvala.ts`). Bundling is a separate CLI operation for multi-file projects.
- **No host info at compile time**: the host registers handlers at `run(program, handlers)` time, not at compile time.
- **Serializable continuations**: the handler stack can be serialized and reconstructed. This rules out static evidence passing (handler indices baked into the AST).
- **Deep handler semantics**: `resume` reinstalls the handler. The handler is always active during the continuation.
- **One-shot `resume`**: enforced at runtime (`resumeConsumed` flag). Not enforced statically.
- **Effectful macros**: expand at runtime in the evaluator. The typechecker never sees the expanded code. See "Macro expansion" below.
- **Lazy evaluation**: pure expressions are lazy. `Lazy<T>` = `T` in the type system (transparent).

---

## Proposal

### Architecture

**Value types: side-table only (erased)**

The typechecker builds a `Map<NodeId, Type>` during checking. Every AST node carries a unique `nodeId` (3rd tuple element: `[type, payload, nodeId]`). The SourceMap and LanguageService already key data by `nodeId`. After checking passes, the map is discarded (or retained for IDE features). No type annotations are injected into AST nodes. The runtime never sees value types.

**Effect types: not injected into AST**

Evidence passing (injecting handler indices into `perform` nodes for O(1) dispatch) is skipped. The current `clauseMap.get(effectName)` dispatch is already O(1) per handler level, and handler depth in practice is small (2–5 levels). Evidence passing can be revisited if profiling shows dispatch is a bottleneck.

**Inference-first, annotations later**

No type annotations in the initial implementation. Everything is inferred. Annotation syntax is a later addition and does not change the inference engine — annotations become constraints fed into the same unifier.

**Macro expansion as mandatory pre-typecheck step**

`expandMacros()` (in `src/ast/expandMacros.ts`) is currently an optional build-time optimization only used by the CLI `build` subcommand. For type checking, it becomes a mandatory pipeline stage: `parse → expandMacros → typecheck → evaluate`. This expands all statically-resolvable macros so the typechecker sees their expanded code. Macros that fail to expand (effectful macros — those with a `qualifiedName` that perform `@dvala.macro.expand`) remain as `MacroCall` nodes and are treated as untyped holes: type `Any`, effect row `<| r>` (open).

**Error recovery**

When the typechecker encounters a type error, it records the error and replaces the node's type with `Any`, then continues. This is critical for IDE integration — users need to see ALL errors, not just the first one. The typechecker never halts on error.

---

### Phase A: HM Value Types

Hindley-Milner inference with structural typing. Split into two sub-phases:

**Phase A.1 — Core types (end-to-end typechecker)**

- Number, String, Boolean, Null literals
- Arithmetic, string concatenation, comparisons
- Let bindings (simple and destructured)
- Function definitions and calls (with arity checking)
- If/else type unification
- And/Or/Qq (short-circuit) — result type is union of branches
- `perform` return type and `resume` are `Any` — effect typing is Phase B
- Side-table only — erased after checking
- Error recovery: replace error sites with `Any`, continue

**Phase A.2 — Records and collections**

- Row polymorphism for records: `{name: String, ...r}` — a function needing a `name` field works with any record that has one
- Object literal typing from `Object` nodes (track field names and value types)
- Field access through `get` calls (the parser desugars `obj.field` to `get(obj, "field")`)
- Spread as row extension in object literals
- Array literal typing with element type inference
- Pattern matching type narrowing and exhaustiveness checking (follow-up)

**Polymorphic collection functions** (`map`, `filter`, `reduce`, `get`, `assoc`, `count`, etc.) work on arrays, objects, AND strings via runtime dispatch. This three-way polymorphism is an open question — see Open Questions.

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

Effectful macros (those with a `qualifiedName`) expand at runtime via `@dvala.macro.expand` effect. The typechecker never sees their expanded code. Unexpanded macro call sites in the AST are permanently untyped holes: type `Any`, effect row `<| r>` (open — may perform anything). Pure macros (anonymous or statically-resolvable) are expanded by the mandatory `expandMacros()` step before typechecking.

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

## Builtin Type Schemes

The existing `docs` type information on builtins (`DataType` = `'number' | 'string' | 'any' | ...`) is too coarse for HM inference. 169+ parameters are typed as `'any'`, there are no generic types, and collection functions lose specificity (`'collection'` instead of `Array<T>`).

The typechecker needs a separate, richer type representation for builtins — a `BuiltinTypeScheme` map:

```
'+':      forall a. (a, a) -> a              where a in {Number, String, Vector, Matrix}
'map':    forall a b. ((a) -> b, Array<a>) -> Array<b>
'get':    forall a r. ({key: a | r}, String) -> a
'filter': forall a. ((a) -> Boolean, Array<a>) -> Array<a>
'inc':    (Number) -> Number
'count':  (Collection) -> Number
'comp':   forall a b c. ((b) -> c, (a) -> b) -> (a) -> c
```

**Approach:** Start with ~30 core functions (math, predicates, basic array ops, string ops). Use `Any` for the rest — functions without a type scheme are treated as `(...Any) -> Any`. Expand coverage incrementally.

**Source of truth:** The type schemes are hand-written, separate from the `docs` field. They live in a dedicated file (e.g., `src/typechecker/builtinTypes.ts`) and are keyed by function name.

---

## Language Service Integration

The LanguageService (`src/languageService/`) already has infrastructure that the typechecker should leverage:

- **`SymbolTableBuilder`** — walks the entire AST with scope tracking (nested `Map<string, SymbolDef>[]` stack). Handles all 30+ node types with a comprehensive visitor pattern. This is essentially the skeleton of a typechecker.
- **`WorkspaceIndex`** — coordinates multi-file analysis with per-file caching (SHA-keyed), import graph tracking, and APIs for diagnostics, completions, go-to-definition, etc.
- **`ScopeRange`** — position-aware scope regions already tracked for each file.

### Options for integration

**Option A: Extend `SymbolTableBuilder`**

Add type state to the existing walker. The scope stack already tracks `SymbolDef` per binding — extend `SymbolDef` with a `type?: Type` field. Add a `nodeTypes: Map<number, Type>` to `BuilderState`. Insert type inference logic into each `case` in `walkNode`. The existing scope resolution (`lookupScope`) already does environment lookup — add type environment alongside.

- Pro: no duplication of AST walking or scope tracking
- Pro: symbol resolution and type inference happen in one pass
- Con: makes `SymbolTableBuilder` more complex
- Con: tight coupling between symbol analysis and type inference

**Option B: Separate typechecker walker**

Build an independent `typecheck(ast, builtinTypes): TypeCheckResult` function with its own AST walker. Have `WorkspaceIndex` coordinate both: first `SymbolTableBuilder` for symbols, then `typecheck` for types.

- Pro: clean separation of concerns
- Pro: typechecker can evolve independently
- Con: duplicates AST walking and scope tracking
- Con: two passes over the AST instead of one

**Decision: TBD** — to be resolved during Phase A.1 implementation.

### Diagnostics integration

Type errors are surfaced through `WorkspaceIndex.getDiagnostics()` alongside parse errors and unresolved references. The typechecker produces `TypeDiagnostic[]`:

```typescript
interface TypeDiagnostic {
  nodeId: number            // AST node where error occurred
  message: string           // human-readable error
  severity: 'error' | 'warning'
  expected?: Type           // for "expected X, got Y" messages
  actual?: Type
}
```

---

## Record Type Construction from AST

For row polymorphism (Phase A.2), the typechecker needs to construct record types from AST nodes:

- **Object literals** (`NodeTypes.Object`): entries are `[keyNode, valueNode]` pairs or `SpreadNode`s. The typechecker infers a record type `{key1: T1, key2: T2, ...}` from the entries, and handles spread as row extension: `{...other, x: 1}` → `{x: Number | r}` where `r` comes from the spread source's type.
- **Field access**: the parser desugars `obj.field` and `obj["field"]` to `get(obj, "field")` calls. The typechecker intercepts these `get` calls with a string literal key and generates a row constraint: the first argument must have a record type containing that field.
- **Destructuring bindings**: `let {x, y} = expr` generates constraints that `expr` has type `{x: T1, y: T2 | r}`, binding `x: T1` and `y: T2` in scope.

---

## Implementation Plan

### Phase A.1: Core Types (end-to-end typechecker)

1. **Define builtin type schemes**
   - Create `src/typechecker/builtinTypes.ts` with HM type signatures for ~30 core builtins
   - Start with: math ops (`+`, `-`, `*`, `/`, `%`, `inc`, `dec`, comparisons), string ops (`++`, `count`, `upper-case`, `lower-case`), predicates (`isNumber`, `isString`, etc.), basic array (`nth`, `first`, `last`, `cons`, `conj`)
   - All other builtins default to `(...Any) -> Any`

2. **Define the `Type` representation**
   - Type variables, primitives (Number, String, Boolean, Null), function types, Array<T>, Any
   - Record rows deferred to Phase A.2
   - File: `src/typechecker/types.ts`

3. **Implement `unify(t1, t2)`**
   - Standard HM unification with occurs check
   - Type variable substitution
   - File: `src/typechecker/unify.ts`

4. **Implement `infer(node, env)`**
   - Walk AST, generate type constraints, return `Type`
   - Handle: literals, let bindings, function defs, function calls, if/else, and/or/qq, builtin references
   - Error recovery: record error, assign `Any`, continue
   - File: `src/typechecker/infer.ts`

5. **Integrate macro expansion as mandatory pre-typecheck step**
   - Call `expandMacros(ast)` before typechecking in the pipeline
   - Unexpanded `MacroCall` nodes → type `Any`

6. **Wire into pipeline**
   - Add `typecheck(ast): TypeCheckResult` call in `createDvala.ts` between `buildAst()` and `evaluate()`
   - Type errors prevent evaluation (fail-fast)
   - Emit structured type errors with source locations (via SourceMap `nodeId` → position lookup)

### Phase A.2: Records and Collections

7. **Extend `Type` with record rows**
   - `RecordType = { fields: Map<string, Type>, rest: RowVar | 'closed' }`
   - Row unification: `{a: T1 | r1}` unified with `{a: T2, b: T3 | r2}` → `T1 ~ T2`, `r1 ~ {b: T3 | r2}`

8. **Record type inference from AST**
   - Object literal → closed record type (or open if spread)
   - Field access via `get` → row constraint
   - Destructuring bindings → row constraints
   - Spread → row extension

9. **Array type inference**
   - Array literals → `Array<T>` where T is union of element types
   - Typed array operations via builtin type schemes

10. **Pattern matching exhaustiveness checking** (follow-up)
    - `match` expressions: verify all cases are covered
    - Type narrowing in match branches

### Phase B: Effect Row Inference

11. Extend `Type` with effect rows: `EffectRow = { effects: Set<string>, rest: RowVar | 'closed' }`
12. Extend `infer` to thread effect rows through all expression types
13. Implement `perform` rule: adds effect to current row
14. Implement `do with` rule: removes handled effects from body row
15. At top level: collect leaked effects → write manifest into bundle
16. Update bundle format to include `leakedEffects: string[]`
17. Update `run()` to validate registered handlers against manifest

### Phase C: Handler Typing (deferred)

18. Extend effect rows with return types: `EffectRow` entries carry `α`
19. Implement fresh type variable generation for `perform` sites
20. Implement handler clause unification: `resume` arg type → `α`, clause body → `answer_type`
21. Add optional effect declaration syntax: `effect @name(ArgType) -> ReturnType`
22. Compile effect declarations to runtime descriptors in bundle
23. Add `resume` value validation in evaluator against bundle descriptors

---

## Open Questions

### Polymorphic collection functions

`map`, `filter`, `reduce`, `get`, `assoc`, `count`, etc. work on arrays, objects, AND strings via runtime dispatch (conditional branching in Dvala source). The type system needs a strategy for this three-way polymorphism.

**Option 1: Typeclass-style overloading**

Define a `Collection` typeclass with instances for `Array<T>`, `Object<T>`, and `String`. Functions like `map` have type `forall c a b. Collection c => ((a) -> b, c<a>) -> c<b>`.

- Pro: most precise typing
- Con: heavy machinery (typeclasses not present in the language)
- Con: `String` doesn't naturally parameterize over element type

**Option 2: Union types with narrowing**

Type these functions as accepting `Array<T> | Object<T> | String` and returning the same. Narrow based on input type when known.

- Pro: simpler than typeclasses
- Con: return type may be imprecise when input type is unknown

**Option 3: Use `Any` initially**

Type polymorphic collection functions as `(...Any) -> Any`. Defer precise typing to a later phase.

- Pro: simplest, unblocks Phase A
- Con: no type safety for the most commonly used functions

**Current leaning:** Option 3 for Phase A, revisit with Option 2 for a future phase.

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Builtin type schemes are tedious to write (~100+ functions eventually) | Medium | High | Start with ~30 core functions, use `Any` for the rest. Expand incrementally. |
| Record row polymorphism is complex to implement | High | Medium | Deferred to Phase A.2. Phase A.1 delivers value without it. |
| Macro holes reduce type coverage | Low | Low | Effectful macros are rare in practice. `expandMacros()` handles pure macros. |
| Collection polymorphism is hard to type precisely | Medium | High | Use `Any` initially (Option 3). Revisit after Phase A is stable. |
| Performance of type checking on large programs | Low | Low | Side-table approach is O(n) in AST size. HM inference is near-linear in practice. |
| Language service integration adds complexity | Medium | Medium | Defer integration decision (Option A vs B) to implementation time. Start with standalone typechecker, integrate later. |
| Type errors frustrate users unfamiliar with HM | Medium | Medium | Clear error messages with source locations. Show expected vs actual types. |
| `expandMacros()` as mandatory step may slow pipeline | Low | Low | `expandMacros` is already fast (AST walk + macro evaluation). Profile if needed. |
