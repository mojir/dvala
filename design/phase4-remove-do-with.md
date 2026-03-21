# Phase 4: Remove `do...with case @effect` syntax

## Goal
Remove the old `do...with case @effect then handler end` syntax, leaving `handle...with` as the only effect handling mechanism.

## Changes

### 1. Parser: Remove `with case` branch from `parseDo.ts`
- `parseDo` currently parses `do body with case @eff then handler ... end`
- Remove the `with case` parsing — `do...end` remains as a simple block
- Remove `WithHandler` type from `block.ts`, simplify `DoNode`
- Remove `parseDo` imports related to `with` handling in `parseFunction.ts`

### 2. Evaluator: Remove `TryWithFrame` and related code
- Remove `TryWithFrame`, `EvaluatedWithHandler` from `frames.ts`
- Remove from `Frame` union type
- Remove `case 'TryWith'` from `applyFrame` switch in trampoline-evaluator.ts
- Remove `applyTryWith()` function
- Remove TryWith branches from `dispatchPerform`, `tryDispatchDvalaError`
- Remove `handlerMatchesEffect`, `invokeMatchedHandler` (only used by TryWith)

### 3. Tests
- Migrate 2 tests in `handle-with.test.ts` that use `do...with case`
- Remove TryWith tests from `frames.test.ts` (6 refs) and `trampoline.test.ts` (2 refs)
- Check `coverage-gaps.test.ts`, `auto-effect-tests.test.ts` for `do...with case` patterns

### 4. Docs
- Update `block.ts` docs to remove `do...with` variant
- Update `perform.ts` docs to reference only `handle...with`

## Order of operations
1. Update parser (remove `with case` from parseDo)
2. Remove TryWithFrame from frames.ts
3. Remove TryWith code from trampoline-evaluator.ts
4. Update/remove tests
5. Update docs
6. `npm run check`
