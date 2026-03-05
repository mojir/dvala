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

### Phase 3: Remaining HOF Migrations

Migrate looping HOFs one at a time:
- `filter`, `reduce` (collection.ts)
- `sort` (merge-sort in sequence.dvala)
- `some`, `every`, `none` (sequence.ts)
- `take-while`, `drop-while` (sequence.ts)
- `flat-map`, `mapcat` (array.ts)
- etc.

### Phase 4: Cleanup

- Remove unused TS `evaluate` implementations for fully-migrated functions
- Or keep them as documentation / fallback

## DX Checklist

- [x] Functions written in `.dvala` files
- [x] Docs and arity stay in TypeScript
- [x] `doc(map)` works transparently
- [x] Reference tests pass without changes
- [x] Gradual migration — one function at a time
- [x] Shared helpers within a category `.dvala` file
- [x] Build pipeline: existing `dvalaSourcePlugin` handles `.dvala` → string
- [x] No ContextStack changes needed
