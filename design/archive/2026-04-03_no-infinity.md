# Remove Infinity and NaN from Dvala

**Status:** Draft
**Created:** 2026-04-03

## Goal

Eliminate JavaScript's `Infinity` and `NaN` concepts from Dvala. Any operation that would produce a non-finite number should throw an `ArithmeticError` instead of silently returning a special value.

---

## Background

Dvala currently inherits JavaScript's IEEE 754 behavior where operations like `1/0` produce `Infinity` and `0/0` produce `NaN`. There is already a `NanCheckFrame` that catches NaN results from normal expressions, but Infinity passes through unchecked. The language also exposes `POSITIVE_INFINITY`, `NEGATIVE_INFINITY`, and `NaN` as reserved constants, plus predicate functions `isPositiveInfinity`, `isNegativeInfinity`, and `isFinite`.

Removing these makes the numeric model simpler and more predictable -- non-finite values are programming errors, not valid results.

## Proposal

Extend the existing NaN guard to reject all non-finite numbers, and remove all Infinity/NaN-related constants and functions.

### Key design decision

Guard at the **normal expression result boundary** (the existing `NanCheckFrame`), not at every individual operation. This is the single chokepoint where all normal expression results pass through. `Number.isFinite()` catches both NaN and Infinity in one check.

Internal TypeScript code (e.g., `Math.min()` seed value) can still use `Infinity` -- only values escaping into Dvala-land are guarded.

## Decisions

- **Single error message for both NaN and Infinity:** Use `"Number is not finite"` for all non-finite results. Simpler, and easier to port to KMP later (no need to distinguish cases in the Kotlin runtime).

## Implementation Plan

### 1. Rename and extend the NaN guard
- **File:** `src/evaluator/frames.ts` -- rename `NanCheckFrame` to `FiniteCheckFrame` (update the `type` discriminant)
- **File:** `src/evaluator/trampoline-evaluator.ts` -- in the frame handler, replace the `Number.isNaN()` check with `!Number.isFinite()`. Update the error message. Update all references to the old frame name.

### 2. Remove reserved constants
- **File:** `src/tokenizer/reservedNames.ts` -- remove `POSITIVE_INFINITY`, `NEGATIVE_INFINITY`, and `NaN` from `numberReservedSymbolRecord`

### 3. Remove predicate functions
- **File:** `src/builtin/core/predicates.ts` -- remove `isPositiveInfinity`, `isNegativeInfinity`, and `isFinite`

### 4. Remove Infinity formatting in standardEffects
- **File:** `src/evaluator/standardEffects.ts` -- remove the special-case formatting of `Infinity` as `"∞"` and `"-∞"`

### 5. Update internal uses of Infinity
- **File:** `src/builtin/core/math.ts` -- `min()` and `max()` use `Infinity`/`-Infinity` as reduce seeds. These are fine (internal TS), but if an empty array is passed they'd return Infinity. Either throw on empty input or guard the result.
- **File:** `src/builtin/core/array.ts` -- `flatten` depth parameter defaults to `Infinity`. Use a large integer (e.g., `Number.MAX_SAFE_INTEGER`) instead.

### 6. Update reference/api.ts
- **File:** `reference/api.ts` -- remove `isPositiveInfinity`, `isNegativeInfinity`, `isFinite` from the exported API list

### 7. Update tests
- **Files:** `__tests__/builtin/normalExpressions/math.test.ts` -- tests expecting `Infinity` results (e.g., `ln(0)`, `log2(0)`, `log10(0)`, `atanh(1)`) should expect throws instead
- **File:** `__tests__/builtin/normalExpressions/predicate.test.ts` -- remove `isPositiveInfinity`, `isNegativeInfinity`, `isFinite` test suites
- **File:** `__tests__/coverage-gaps.test.ts` -- update NaN/Infinity-related tests
- **File:** `src/evaluator/trampoline.test.ts` -- rename NaN check tests, add Infinity check tests
- **File:** `src/evaluator/standardEffects.test.ts` -- remove Infinity formatting tests
- **File:** `src/parser/Parser.test.ts` -- remove `NaN` constant test
- **File:** `__tests__/auto-stress-tests.test.ts`, `__tests__/auto-core-stress-tests.test.ts` -- update expectations
- **File:** `__tests__/jsFunctions-integration.test.ts` -- update NaN binding test
- **File:** `__tests__/coverage-gaps.test.ts` -- update the `Infinity` not-serializable test

### 8. Run /check to verify
