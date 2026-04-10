# Host Boundary Value Validation

**Status:** Implemented
**Created:** 2026-04-10

## Goal

Validate values at every boundary where host (TypeScript) values enter the Dvala runtime, so that:
1. Invalid values (functions, Symbols, `undefined`, circular references, class instances) are caught immediately with clear errors
2. Snapshot serialization never encounters non-serializable values that silently corrupt state
3. Host developers get actionable feedback when they pass bad values

---

## Background

Dvala's runtime value type is:
```typescript
type Any = string | number | boolean | null | Arr | Obj | DvalaFunction | RegularExpression | EffectRef
```

The `fromJS()` function in `src/utils/interop.ts` converts plain JS values to Dvala values at host boundaries. It currently accepts `unknown` with **zero validation**:

- `undefined` → cast as `Any` (not a valid Dvala value)
- JS functions → fall through to object branch → empty `PersistentMap` (silent data loss)
- Symbols → cast as `Any` (not a valid Dvala value)
- Class instances → flattened to `PersistentMap` of enumerable properties (loses prototype/methods)
- Circular references → infinite recursion → stack overflow
- `BigInt`, `Date`, `Map`, `Set`, `WeakRef` → flattened or cast incorrectly

### The four host boundaries

All four use `fromJS()` with no pre-validation:

| # | Boundary | Location | Risk |
|---|----------|----------|------|
| 1 | `scope` bindings on `run()`/`resume()` | `createDvala.ts:172`, `resume.ts:69` | Bad values enter global scope |
| 2 | Effect handler `resume(value)` | `trampoline-evaluator.ts:3046-3048` | Bad values enter mid-execution |
| 3 | Effect handler `resumeFrom(snapshot, value)` | `trampoline-evaluator.ts:3111` | Bad values enter after time-travel |
| 4 | `suspend(meta)` / `checkpoint(msg, meta)` | `trampoline-evaluator.ts:3056-3069`, `:3076-3093` | Non-serializable meta stored in snapshots |

Boundary 2 is the highest risk — it's the most common path and values go straight into the continuation.

## Proposal

### Add `validateFromJS()` in `src/utils/interop.ts`

A validation wrapper around `fromJS()` that rejects invalid values with clear error messages. Used at all four host boundaries.

```typescript
/**
 * Convert a plain JS value to a Dvala runtime value, with validation.
 * Throws a TypeError for values that cannot be represented in Dvala.
 *
 * Valid inputs: null, string, number, boolean, plain arrays, plain objects,
 * and values that are already Dvala types (PV, PM, EffectRef, DvalaFunction, RegExp).
 */
export function validateFromJS(value: unknown, context: string): Any {
  assertValidHostValue(value, context, new Set())
  return fromJS(value)
}
```

### Rejected value types

| Type | Current behavior | Proposed behavior |
|------|-----------------|-------------------|
| `undefined` | Silent cast | `TypeError: ${context}: undefined is not a valid Dvala value. Use null instead.` |
| `function` | Empty PersistentMap | `TypeError: ${context}: JS functions cannot enter the Dvala runtime.` |
| `symbol` | Silent cast | `TypeError: ${context}: Symbols are not valid Dvala values.` |
| `bigint` | Silent cast | `TypeError: ${context}: BigInt is not supported. Convert to number first.` |
| Circular ref | Stack overflow | `TypeError: ${context}: Circular references are not supported.` |
| `Date` | Flattened to empty map | `TypeError: ${context}: Date objects are not valid Dvala values. Use date.toISOString() or date.getTime().` |
| `Map`/`Set` | Flattened incorrectly | `TypeError: ${context}: Map/Set are not valid Dvala values. Convert to array/object first.` |
| Class instance | Loses prototype | `TypeError: ${context}: Class instance (ClassName) is not a valid Dvala value. Spread to a plain object first: { ...instance }` |

### Where to call it

1. **`scopeToGlobalContext()`** in `createDvala.ts:172`:
   ```typescript
   ctx[k] = { value: validateFromJS(v, `scope binding "${k}"`) }
   ```

2. **`resume()`** in `trampoline-evaluator.ts:3025`:
   ```typescript
   resume: (value: unknown) => {
     assertNotSettled('resume')
     const dvalaValue = validateFromJS(value, `resume() in handler for '${effectName}'`)
     // ... use dvalaValue instead of fromJS(value)
   ```

3. **`resumeFrom()`** in `trampoline-evaluator.ts:3111`:
   ```typescript
   validateFromJS(value, `resumeFrom() in handler for '${effectName}'`)
   ```

4. **`suspend(meta)` and `checkpoint(msg, meta)`** — validate meta is serializable:
   ```typescript
   suspend: (meta?: unknown) => {
     if (meta !== undefined) {
       validateFromJS(meta, `suspend() meta in handler for '${effectName}'`)
     }
     // ...
   ```

### Keep `fromJS()` unchanged

`fromJS()` stays as-is for internal use (module functions, JSON.parse, macro expansion) where inputs are known-good. Only host-facing boundaries get the validation wrapper.

## Resolved Questions

- **Class instances**: **Reject.** Host code must spread to plain object explicitly: `resume({...instance})`.
- **Async resume validation**: **Yes.** The `.then()` callback validates the resolved value via `validateFromJS()`.
- **Performance**: **Two passes.** Validation and conversion are kept separate. `fromJS()` stays lean for internal paths. Optimize only if profiling shows it matters.
- **suspend/checkpoint meta**: **Validate serializability only** (`assertValidHostValue()` directly, no `fromJS()` conversion) — meta is opaque host data, not a Dvala value.
- **Error type**: **`TypeError`** — host-side programming mistakes, not Dvala runtime errors.
- **Non-finite numbers**: **Reject.** `NaN`, `Infinity`, and `-Infinity` are not valid Dvala values.

## Implementation Plan

1. **Add `assertValidHostValue()`** in `src/utils/interop.ts` — recursive validator with cycle detection
2. **Add `validateFromJS()`** wrapper in `src/utils/interop.ts`
3. **Wire into scope bindings** (`createDvala.ts`, `resume.ts`)
4. **Wire into `resume()`** (`trampoline-evaluator.ts`)
5. **Wire into `resumeFrom()`** (`trampoline-evaluator.ts`)
6. **Wire into `suspend(meta)` / `checkpoint(meta)`** (`trampoline-evaluator.ts`)
7. **Wire into async resume path** (validate resolved value in `.then()`)
8. **Tests** — unit tests for each rejected type, integration tests for each boundary
