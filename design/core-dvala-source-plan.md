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
- ✅ `mapcat`, `moving-fn`, `running-fn` → `array.dvala`
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

### 5.1 Core — `functional`

| Function | File | Notes |
|----------|------|-------|
| `apply` | `functional.ts` | Spreads last arg into call. Could become `(fn, ...args) -> fn(...(++ (butlast(args)) (last(args))))` |

### 5.2 Module: `collection` ✅ (13 functions)

All 13 functions migrated to `collection.dvala`:
- `update`, `update-in`, `filteri`, `mapi`, `reducei`
- `reduce-right`, `reducei-right`, `reductions`, `reductionsi`
- `every?`, `any?`, `not-any?`, `not-every?`

### 5.3 Module: `sequence` ✅ (6 functions)

All 6 functions migrated to `sequence.dvala`:
- `position`, `sort-by`, `remove`, `split-with`, `group-by`, `partition-by`

### 5.4 Module: `grid` ✅ (11 functions)

All 11 functions migrated to `grid.dvala`:
- `cell-every?`, `some?`, `every-row?`, `some-row?`, `every-col?`, `some-col?`
- `generate`, `cell-map`, `cell-mapi`, `cell-reduce`, `cell-reducei`

### 5.5 Module: `assertion` (3 functions)

| Function | Notes |
|----------|-------|
| `assert-throws` | Call fn, expect error. Use `try...with case effect(dvala.error)` |
| `assert-throws-error` | Call fn, expect specific error message |
| `assert-not-throws` | Call fn, expect no error |

### 5.6 Module: `number-theory` (31 `*-take-while` functions)

All follow the same "generate values while predicate holds" pattern.

**Direct implementations (4):**

| Function | Notes |
|----------|-------|
| `arithmetic-take-while` | `(start, step, fn)` — arithmetic progression while fn holds |
| `geometric-take-while` | `(start, ratio, fn)` — geometric progression while fn holds |
| `polygonal-take-while` | `(sides, fn)` — polygonal numbers while fn holds |
| `bernoulli-take-while` | `(fn)` — Bernoulli numbers while fn holds |

**Factory-generated via `createTakeWhileNormalExpression` (27):**

| Function | Source |
|----------|--------|
| `abundant-take-while` | `addSequence(abundantSequence)` |
| `bell-take-while` | `getFiniteNumberSequence('bell', ...)` |
| `catalan-take-while` | `getFiniteNumberSequence('catalan', ...)` |
| `collatz-take-while` | `addSequence(collatzSequence)` |
| `composite-take-while` | `addSequence(compositeSequence)` |
| `deficient-take-while` | `addSequence(deficientSequence)` |
| `factorial-take-while` | `getFiniteNumberSequence('factorial', ...)` |
| `fibonacci-take-while` | `getFiniteNumberSequence('fibonacci', ...)` |
| `golomb-take-while` | `addSequence(golombSequence)` |
| `happy-take-while` | `addSequence(happySequence)` |
| `juggler-take-while` | `addSequence(jugglerSequence)` |
| `look-and-say-take-while` | `addSequence(lookAndSaySequence)` |
| `lucas-take-while` | `getFiniteNumberSequence('lucas', ...)` |
| `lucky-take-while` | `addSequence(luckySequence)` |
| `mersenne-take-while` | `getFiniteNumberSequence('mersenne', ...)` |
| `padovan-take-while` | `addSequence(padovanSequence)` |
| `partition-take-while` | `getFiniteNumberSequence('partition', ...)` |
| `pell-take-while` | `getFiniteNumberSequence('pell', ...)` |
| `perfect-take-while` | `getFiniteNumberSequence('perfect', ...)` |
| `perfect-cube-take-while` | `addSequence(perfectCubeSequence)` |
| `perfect-power-take-while` | `addSequence(perfectPowerSequence)` |
| `perfect-square-take-while` | `addSequence(perfectSquareSequence)` |
| `prime-take-while` | `addSequence(primeSequence)` |
| `recaman-take-while` | `addSequence(recamanSequence)` |
| `sylvester-take-while` | `getFiniteNumberSequence('sylvester', ...)` |
| `thue-morse-take-while` | `addSequence(thueMorseSequence)` |
| `tribonacci-take-while` | `getFiniteNumberSequence('tribonacci', ...)` |

### Summary

| Category | Functions | Count | Status |
|----------|-----------|-------|--------|
| Core `functional` | `apply` | 1 | ⏳ |
| Module `collection` | 13 HOF functions | 13 | ✅ |
| Module `sequence` | 6 HOF functions | 6 | ✅ |
| Module `grid` | 11 HOF functions | 11 | ✅ |
| Module `assertion` | `assert-throws`, `assert-throws-error`, `assert-not-throws` | 3 | ⏳ |
| Module `number-theory` | 4 direct + 27 factory `*-take-while` | 31 | ⏳ |
| **Total** | | **65** | **30 done, 35 remaining** |

### Phase 6: Final Cleanup — Remove `executeFunction`

Once all 65 functions are migrated:

1. Remove `executeFunction` parameter from `NormalExpressionEvaluator` type in `interface.ts`
2. Remove `ExecuteFunction` type from `evaluator/interface.ts`
3. Stop passing `{ executeFunction: executeFunctionRecursive }` in trampoline dispatch
4. Clean up all stub `evaluate` implementations that reference `executeFunction`
5. Remove `executeFunction` from all module evaluate signatures
6. Verify all tests pass

## DX Checklist

- [x] Functions written in `.dvala` files
- [x] Docs and arity stay in TypeScript
- [x] `doc(map)` works transparently
- [x] Reference tests pass without changes
- [x] Gradual migration — one function at a time
- [x] Shared helpers within a category `.dvala` file
- [x] Build pipeline: existing `dvalaSourcePlugin` handles `.dvala` → string
- [x] No ContextStack changes needed
