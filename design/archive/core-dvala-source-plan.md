# Core Dvala Source Mechanism — Implementation Plan

## Goal

Allow core builtin functions (e.g., `map`, `filter`, `reduce`) to be **implemented in `.dvala` files** while keeping **docs and arity in TypeScript**. This is a prerequisite for making HOF callbacks support effects/suspension (since Dvala-implemented functions go through the trampoline naturally).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Override storage | **Global, lazy init** on expression objects | Core builtins are universal singletons. No per-instance variation needed. Simpler hot path — no ContextStack changes. |
| File granularity | **One `.dvala` file per category** | Matches existing TS layout (`collection.ts` → `collection.dvala`). Allows shared helper functions within a category. |
| `doc()` behavior | **Unchanged** | Symbol still resolves as `functionType: 'Builtin'`, reference lookup works as before. |
| Reference tests | **Unchanged** | TS expression objects still carry `docs` and `arity`. |
| Migration | **Gradual, per-function** | Each function can independently move to Dvala. TS `evaluate` remains as fallback. |

## Architecture

### File Layout

```
src/builtin/core/
  collection.ts       ← docs, arity, TS evaluate (fallback)
  collection.dvala     ← Dvala implementations: { "map": ..., "filter": ..., "reduce": ... }
  sequence.ts
  sequence.dvala       ← { "sort": ... }
  ...
```

### Data Flow

```
Build time:
  collection.dvala  →  dvalaSourcePlugin  →  string constant

First Dvala construction (lazy init):
  string  →  parse  →  evaluate (trampoline)  →  object { map: UserDefinedFn, ... }
  → stored on allNormalExpressions[index].dvalaImpl

Runtime (function call):
  trampoline checks normalExpression.dvalaImpl
  → if present: setupUserDefinedCall (trampoline path, supports effects)
  → if absent: normalExpression.evaluate (legacy TS path)
```

### Type Changes

```typescript
// src/builtin/interface.ts
export interface BuiltinNormalExpression<T> {
  evaluate: NormalExpressionEvaluator<T>
  pure?: boolean
  name?: string
  arity: Arity
  docs?: FunctionDocs
  dvalaImpl?: UserDefinedFunction   // ← NEW: Dvala override
}
```

### Source Registration

```typescript
// src/builtin/normalExpressions/index.ts

// Each category exports its .dvala source (if any)
import collectionSource from '../core/collection.dvala'
import sequenceSource from '../core/sequence.dvala'

export const coreDvalaSources: Record<string, string> = {
  collection: collectionSource,
  sequence: sequenceSource,
  // add more as functions are migrated
}
```

### Lazy Initialization

```typescript
// src/builtin/normalExpressions/initCoreDvala.ts

let initialized = false

export function initCoreDvalaSources(): void {
  if (initialized) return
  initialized = true

  for (const [_category, source] of Object.entries(coreDvalaSources)) {
    // Parse and evaluate the .dvala source
    const nodes = parse(tokenize(source))
    const result = evaluate(nodes, contextStack)  // minimal context, no modules needed
    
    // result is an object: { "map": UserDefinedFunction, "filter": UserDefinedFunction, ... }
    for (const [name, fn] of Object.entries(result)) {
      const expression = normalExpressions[name]
      if (expression && isDvalaFunction(fn) && fn.functionType === 'UserDefined') {
        expression.dvalaImpl = fn
      }
    }
  }
}
```

Called from `Dvala` constructor:
```typescript
constructor(config: DvalaConfig = {}) {
  initCoreDvalaSources()  // no-op after first call
  // ... existing code
}
```

### Trampoline Injection Points

**Point A — Direct call** (`dispatchCall` in trampoline.ts):

```typescript
// Current:
if (isNormalBuiltinSymbolNode(nameSymbol)) {
  const normalExpression = builtin.allNormalExpressions[builtinType]!
  const result = normalExpression.evaluate(params, sourceCodeInfo, env, { executeFunction: executeFunctionRecursive })
  return wrapMaybePromiseAsStep(result, k)
}

// New:
if (isNormalBuiltinSymbolNode(nameSymbol)) {
  const normalExpression = builtin.allNormalExpressions[builtinType]!
  if (normalExpression.dvalaImpl) {
    return setupUserDefinedCall(normalExpression.dvalaImpl, params, env, sourceCodeInfo, k)
  }
  const result = normalExpression.evaluate(params, sourceCodeInfo, env, { executeFunction: executeFunctionRecursive })
  return wrapMaybePromiseAsStep(result, k)
}
```

**Point B — Value-as-function** (`dispatchDvalaFunction` in trampoline.ts):

```typescript
// Current:
case 'Builtin': {
  const result = executeDvalaFunctionRecursive(fn, params, env, sourceCodeInfo)
  return wrapMaybePromiseAsStep(result, k)
}

// New:
case 'Builtin': {
  const normalExpression = builtin.allNormalExpressions[fn.normalBuiltinSymbolType]!
  if (normalExpression.dvalaImpl) {
    return setupUserDefinedCall(normalExpression.dvalaImpl, params, env, sourceCodeInfo, k)
  }
  const result = executeDvalaFunctionRecursive(fn, params, env, sourceCodeInfo)
  return wrapMaybePromiseAsStep(result, k)
}
```

## Implementation Steps

### Phase 1: Infrastructure

1. Add `dvalaImpl?: UserDefinedFunction` to `BuiltinNormalExpression` interface
2. Create `initCoreDvalaSources()` function
3. Call it from `Dvala` constructor
4. Add the two trampoline injection points (A and B)
5. Create an empty `collection.dvala` file (`{}`) to validate the pipeline
6. Verify all existing tests still pass

### Phase 2: First Function Migration (proof of concept)

1. Implement `map` in `collection.dvala` (single-collection case first)
2. Update the `it.fails()` tests to `it()` — they should now pass
3. Verify `doc(map)` still works
4. Verify reference tests still pass

### Phase 3: Core HOF Migrations ✅

Migrated core looping HOFs:
- ✅ `map`, `filter`, `reduce` → `collection.dvala`
- ✅ `sort`, `some`, `take-while`, `drop-while` → `sequence.dvala`
- ✅ `mapcat`, `movingFn`, `runningFn` → `array.dvala`
- ✅ `merge-with` → `object.dvala`
- ✅ `|>` → `functional.dvala`
- ⏭️ `apply` — left in TS (primitive, requires spread semantics)

### Phase 4: Core Cleanup ✅

- ✅ Replaced all 13 TS `evaluate` bodies with stubs
- ✅ Removed dead helper code (`mapObjects`, unused imports)
- ✅ Added 5th injection point (`executeBuiltinRecursive`)
- ✅ Fixed debugger (`createDebugger` now calls `initCoreDvalaSources()`)
- ✅ All 5349 tests passing, coverage 97.04%

---

## Phase 5: Module Function Migrations

**End goal: Remove `executeFunction` from the `evaluate` signature entirely.**

Every module function that currently receives `{ executeFunction }` must be reimplemented in Dvala. Once all are migrated, `executeFunction` can be removed from `BuiltinNormalExpression.evaluate` and from the evaluator's call-dispatch logic.

### 5.1 Core — `functional` ✅

| Function | File | Notes |
|----------|------|-------|
| `apply` | `functional.dvala` | `(fn, ...args) -> fn(...leading, ...last(args))` |
| `\|>` | `functional.dvala` | `(a, b) -> b(a)` |

### 5.2 Module: `collection` ✅ (13 functions)

All 13 functions migrated to `collection.dvala`:
- `update`, `updateIn`, `filteri`, `mapi`, `reducei`
- `reduceRight`, `reduceiRight`, `reductions`, `reductionsi`
- `isEvery`, `isAny`, `notAny`, `notEvery`

### 5.3 Module: `sequence` ✅ (6 functions)

All 6 functions migrated to `sequence.dvala`:
- `position`, `sortBy`, `remove`, `splitWith`, `groupBy`, `partitionBy`

### 5.4 Module: `grid` ✅ (11 functions)

All 11 functions migrated to `grid.dvala`:
- `isCellEvery`, `isSome`, `isEveryRow`, `isSomeRow`, `isEveryCol`, `isSomeCol`
- `generate`, `cellMap`, `cellMapi`, `cellReduce`, `cellReducei`

### 5.5 Module: `assertion` ✅ (3 functions)

All 3 assertion HOF functions migrated to `assertion.dvala`:
- `assertFails` — Call fn, expect error. Uses `try...with case effect(dvala.error)`
- `assertFailsWith` — Call fn, expect specific error message
- `assertSucceeds` — Call fn, expect no error

### 5.6 Module: `number-theory` (31 `*-take-while` functions)

All follow the same "generate values while predicate holds" pattern.

**Implemented in `number-theory.dvala` (29):** ✅

| Function | Notes |
|----------|-------|
| `arithmetic-take-while` | `(start, step, fn)` — arithmetic progression |
| `geometric-take-while` | `(start, ratio, fn)` — geometric progression |
| `polygonal-take-while` | `(sides, fn)` — polygonal numbers |
| `fibonacci-take-while` | Inline recurrence: a=0, b=1 |
| `tribonacci-take-while` | Inline recurrence: a=0, b=1, c=1 |
| `lucas-take-while` | Inline recurrence: a=2, b=1 |
| `pell-take-while` | Inline recurrence: a=1, b=2 |
| `padovan-take-while` | Inline recurrence: a=1, b=1, c=1 |
| `factorial-take-while` | Inline: fact *= (i+1) |
| `prime-take-while` | Uses `is-prime` helper |
| `composite-take-while` | Uses `is-composite` helper |
| `abundant-take-while` | Uses `is-abundant` helper |
| `deficient-take-while` | Uses `is-deficient` helper |
| `perfect-square-take-while` | Direct: `i * i` |
| `perfect-cube-take-while` | Direct: `i * i * i` |
| `happy-take-while` | Uses `is-happy` helper |
| `look-and-say-take-while` | Full Dvala implementation with `next-term` helper |
| `bell-take-while` | Precomputed `bell-numbers` constant (50 values) |
| `catalan-take-while` | Precomputed `catalan-numbers` constant (50 values) |
| `mersenne-take-while` | Precomputed `mersenne-numbers` constant |
| `partition-take-while` | Precomputed `partition-numbers` constant (100 values) |
| `perfect-take-while` | Precomputed `perfect-numbers` constant |
| `sylvester-take-while` | Precomputed `sylvester-numbers` constant |
| `lucky-take-while` | Precomputed `lucky-numbers` constant (3100 values); limit ~31,429 |
| `bernoulli-take-while` | Inline rational recurrence using `binom` helper |
| `golomb-take-while` | Self-referential, fully in Dvala |
| `perfect-power-take-while` | Uses `is-perfect-power` helper (loop-based, no `log2`) |
| `recaman-take-while` | Self-referential, fully in Dvala |
| `thue-morse-take-while` | Uses `count-bits` helper |

**Kept in TypeScript (2):**

| Function | Reason |
|----------|--------|
| `collatz-take-while` | Single-value sequence (parameterised start n) |
| `juggler-take-while` | Single-value sequence (parameterised start n) |

### Summary

| Category | Functions | Count | Status |
|----------|-----------|-------|--------|
| Core `functional` | `apply`, `\|>` | 2 | ✅ |
| Module `collection` | 13 HOF functions | 13 | ✅ |
| Module `sequence` | 6 HOF functions | 6 | ✅ |
| Module `grid` | 11 HOF functions | 11 | ✅ |
| Module `assertion` | `assertFails`, `assertFailsWith`, `assertSucceeds` | 3 | ✅ |
| Module `number-theory` | 29 in Dvala + 2 kept in TS | 31 | ✅ (29 migrated) |
| **Total** | | **66** | **64 migrated to Dvala** |

### Phase 6: Final Cleanup — Remove `executeFunction` ✅

All HOF functions that required `executeFunction` have been migrated to Dvala.

**Completed:**

1. ✅ Removed `executeFunction` parameter from `NormalExpressionEvaluator` type in `src/builtin/interface.ts`
2. ✅ Removed `ExecuteFunction` type from `src/evaluator/interface.ts`
3. ✅ Removed `{ executeFunction: executeFunctionRecursive }` from 5 trampoline call sites
4. ✅ Stubbed take-while `evaluate` bodies in arithmetic, geometric, bernoulli, polygonal TS files
5. ✅ Stubbed `createTakeWhileNormalExpression` factory evaluate body
6. ✅ Updated coverage-gaps test and meta test to match new 3-arg signature
7. ✅ All tests pass

## DX Checklist

- [x] Functions written in `.dvala` files
- [x] Docs and arity stay in TypeScript
- [x] `doc(map)` works transparently
- [x] Reference tests pass without changes
- [x] Gradual migration — one function at a time
- [x] Shared helpers within a category `.dvala` file
- [x] Build pipeline: existing `dvalaSourcePlugin` handles `.dvala` → string
- [x] No ContextStack changes needed
