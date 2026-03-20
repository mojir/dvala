# Implementation Plan: `handle...with...end` Effect System

## Overview

Replace `do...with...end` (case-clause handlers) with `handle...with...end` (handler function lists). Unify `perform` and `next` to single-payload signatures. Make handlers first-class functions.

**Design doc:** `design/discuss-monads-and-effect-handlers.md`

## Key Changes Summary

| Aspect | Current | New |
|---|---|---|
| Effect handling syntax | `do...with case @eff then...end` | `handle...with [handlers] end` |
| Handler format | Case clauses (syntax) | Functions `(eff, arg, next) -> value` |
| `perform` signature | `perform(@eff, arg1, arg2, ...)` variadic | `perform(@eff, payload)` single payload |
| `next` in handlers | Not available | `next(eff, arg)` — same signature as `perform` |
| `do...end` | Block + optional effect handling | Pure sequencing block only |
| Handlers are values | No | Yes |

## Phase 1: Single-Payload `perform` (non-breaking transition)

Migrate `perform` from variadic to single payload. This can be done incrementally.

### 1.1 Update `perform` parsing and evaluation

**Files:**
- `src/builtin/specialExpressions/perform.ts` — change arity to `{ min: 1, max: 2 }`
- `src/parser/subParsers/parseFunctionCall.ts` (lines 103-106) — parse exactly 2 params (effect + payload)
- `src/evaluator/frames.ts` — `PerformArgsFrame` (line 377): evaluate effect expr + single payload expr
- `src/evaluator/step.ts` — `PerformStep` (line 88): change `args: Arr` to `arg: Any`
- `src/evaluator/trampoline-evaluator.ts` — `dispatchPerform()` (line 2224): pass single arg instead of array

### 1.2 Update host handler interface

**Files:**
- `src/evaluator/effectTypes.ts` — `EffectContext.args: Any[]` → `EffectContext.arg: Any`
- `src/evaluator/trampoline-evaluator.ts` — `dispatchHostHandler()`: pass single arg
- `src/evaluator/standardEffects.ts` — all standard handlers: receive single arg instead of array

### 1.3 Update existing `do...with` handler invocation

Currently handlers receive args as an array: `case @eff then ([a, b]) -> ...`
Change to pass single payload value: `case @eff then (payload) -> ...`

**Files:**
- `src/evaluator/trampoline-evaluator.ts` — handler invocation logic (HandlerInvokeFrame)
- `src/evaluator/frames.ts` — `HandlerInvokeFrame` (line 771)

### 1.4 Migrate all `.dvala` files

Most use 1-2 args. Migration pattern:
- `perform(@eff, arg)` — no change (arg IS the payload)
- `perform(@eff, a, b)` → `perform(@eff, [a, b])` or `perform(@eff, { key: a, value: b })`
- `perform(@eff)` → `perform(@eff, null)`
- Handler: `([msg]) -> ...` → `(msg) -> ...`

**Files:**
- `src/builtin/core/array.dvala`
- `src/builtin/core/collection.dvala`
- `src/builtin/core/object.dvala`
- `email-workflow.dvala`
- `escape-room.dvala`
- `playground-www/src/startPageExample.dvala`
- `vscode-dvala/test.dvala`

### 1.5 Migrate all test files

**Files:**
- `__tests__/effects.test.ts`
- `__tests__/auto-effect-tests.test.ts`
- `__tests__/sync-effects.test.ts`
- `__tests__/auto-core-stress-tests.test.ts`
- `src/evaluator/effectRef.test.ts`
- `src/evaluator/standardEffects.test.ts`
- `src/evaluator/frames.test.ts`

### 1.6 Migrate host handler consumers

**Files:**
- `playground-www/src/playgroundEffects.ts` — all playground handlers
- `src/createDvala.ts` — handler registration
- Any MCP server, CLI, or VSCode extension handler code

**Checkpoint:** `npm run check` passes. All existing behavior preserved with new signature.

---

## Phase 2: `handle...with...end` Syntax

Add the new syntax alongside existing `do...with...end` (both work during transition).

### 2.1 Add `handle` keyword

**Files:**
- `src/tokenizer/reservedNames.ts` — add `handle: null` to `nonNumberReservedSymbolRecord`

### 2.2 Create `handle` parser

**New file:** `src/parser/subParsers/parseHandle.ts`

Parses:
```
handle
  <body expressions>
with <expression evaluating to handler function or list>
end
```

The `with` clause expects a single expression (a function, a variable holding a list, a list literal, etc.).

**Files:**
- `src/parser/subParsers/parseHandle.ts` (new)
- `src/parser/subParsers/parseOperand.ts` — register `handle` keyword to call new parser
- `src/builtin/specialExpressions/` — define new `HandleNode` type and special expression

### 2.3 Define `HandleWithFrame` and evaluation

New frame type for `handle...with` that:
1. Evaluates body expressions
2. When `perform` is encountered, calls handlers in list order
3. Each handler is `(eff, arg, next) -> value`
4. `next(eff, arg)` calls the next handler in the list, returns its result
5. If all handlers call `next`, propagates to outer handler scope
6. Handler's return value is the resume value for `perform`

**Key difference from TryWithFrame:** handlers are evaluated functions (closures), not AST nodes. The frame stores a list of Dvala function values, not case-clause ASTs.

**Files:**
- `src/evaluator/frames.ts` — define `HandleWithFrame`
- `src/evaluator/trampoline-evaluator.ts` — handle the new frame type in `dispatchPerform()`
- `src/evaluator/step.ts` — if new step type needed

### 2.4 Implement `next(eff, arg)` as a special callable

Within a `handle...with` handler execution, `next` must be a callable that:
- Invokes the next handler in the list with `(eff, arg, next')`
- Returns the downstream handler's return value (outbound transformation)
- If no more handlers in list, propagates to outer scope

This is the most complex part. Options:
- **`next` as a Dvala closure** created at handler invocation time, closing over the handler list and current index
- **`next` as a special built-in** that interacts with the continuation stack

The closure approach is simpler and keeps everything in Dvala-land (serializable for snapshots).

### 2.5 Add tests for `handle...with...end`

Test cases:
- Basic: single handler, single effect
- Multiple handlers in list
- Handler calling `next(eff, arg)` (passthrough)
- `next` returning downstream value (outbound transformation)
- Nested `handle` blocks
- Dynamic handler list (computed at runtime)
- Handler performing effects itself (caught by outer handler)
- Error propagation through handlers
- Interaction with `parallel` and `race`

**Checkpoint:** `npm run check` passes. Both `do...with` and `handle...with` work.

---

## Phase 3: Migrate from `do...with` to `handle...with`

### 3.1 Migrate all `.dvala` files

Replace `do...with case...end` with `handle...with [handlers] end`.

### 3.2 Migrate all test files

Update test strings from `do...with` syntax to `handle...with` syntax.

### 3.3 Remove `do...with` effect handling

- `src/parser/subParsers/parseDo.ts` — remove `with` clause parsing, `do...end` becomes pure block
- `src/evaluator/frames.ts` — remove `TryWithFrame`, `EffectRefFrame`, `HandlerInvokeFrame`, `EffectResumeFrame`
- `src/evaluator/trampoline-evaluator.ts` — remove old handler matching/invocation code

**Checkpoint:** `npm run check` passes. Only `handle...with` exists.

---

## Phase 4: Deferred Enhancements

These are designed but not implemented in this plan:

- **Effect pipe `||>`** — syntactic sugar for `handle...with`
- **Handler shorthand `@effect(arg) -> body`** — syntactic sugar for handler functions
- **Passthrough shorthand `@effect(arg) => body`** — observe-and-propagate sugar
- **Host handler inbound transformation** — `next({ args })` in host handlers

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Breaking change to `perform` signature | Phase 1 migrates incrementally, all tests updated before moving on |
| `next` implementation complexity | Closure-based approach keeps it in Dvala-land, avoids new frame types |
| Snapshot/suspension interaction | Handler functions live on Dvala continuation stack — serializable by design |
| Large test migration | Can be automated with search-replace for common patterns |
| Parallel/race interaction | Existing parallel/race use `dispatchPerform` — new frame type integrates at the same dispatch point |

## File Impact Summary

| File | Phase | Change |
|---|---|---|
| `src/tokenizer/reservedNames.ts` | 2.1 | Add `handle` keyword |
| `src/parser/subParsers/parseFunctionCall.ts` | 1.1 | Single payload parsing |
| `src/parser/subParsers/parseDo.ts` | 3.3 | Remove `with` clause |
| `src/parser/subParsers/parseHandle.ts` | 2.2 | **New file** |
| `src/parser/subParsers/parseOperand.ts` | 2.2 | Register `handle` |
| `src/builtin/specialExpressions/perform.ts` | 1.1 | Arity change |
| `src/evaluator/effectTypes.ts` | 1.2 | `args` → `arg` |
| `src/evaluator/frames.ts` | 1.3, 2.3, 3.3 | Update/add/remove frame types |
| `src/evaluator/step.ts` | 1.1 | `PerformStep.args` → `PerformStep.arg` |
| `src/evaluator/trampoline-evaluator.ts` | 1.1, 2.3, 3.3 | Core dispatch changes |
| `src/evaluator/standardEffects.ts` | 1.2 | Single arg handlers |
| `src/createDvala.ts` | 1.6 | Handler interface update |
| `playground-www/src/playgroundEffects.ts` | 1.6 | Handler interface update |
| All `.dvala` files | 1.4, 3.1 | Syntax migration |
| All effect test files | 1.5, 2.5, 3.2 | Syntax migration + new tests |
