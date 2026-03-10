# Remove Recursive Evaluator — Implementation Plan

## Goal

Eliminate `evaluateNodeRecursive` and all related recursive execution functions from `trampoline.ts`. This will make the trampoline the **sole** evaluation path, enabling full suspension/resumption support through all code paths including binding evaluation and pattern matching.

## Current State

The recursive evaluator (`evaluateNodeRecursive`) still exists and is used in these contexts:

### 1. Binding Evaluation Helpers (Primary Blocker)

`evaluateBindingNodeValues` and `tryMatch` accept a callback `(node) => evaluate(node)` to evaluate default values and guard expressions in destructuring patterns.

**Call sites:**
- `setupUserDefinedCall` — binding params to function args (L1344, L1367, L1381)
- `applyFrame` for `LetBind` — evaluating destructuring defaults (L1792, L1806)
- `applyFrame` for `LoopBind` — loop variable bindings (L1865)
- `applyFrame` for `Match` — pattern guard evaluation (L1595)

### 2. Closure Capture Analysis

`getUndefinedSymbols` in `evaluateFunction` (L612) uses the recursive evaluator to detect which symbols need to be captured in closures.

### 3. Effect Handler Reference Evaluation

In `stepSpecialExpression` for `block` (L866), effect expressions in `do...with` are evaluated recursively to get the effect ref before setting up the handler frame.

### 4. Async Fallback Paths

When binding evaluation returns a Promise, the code falls back to `executeUserDefinedRecursive` (L1347-L1349, L1363, L1370, L1385).

### 5. Dead Code (Can Remove Immediately)

Large sections marked with `/* v8 ignore */`:
- `executeSpecialBuiltinRecursive`
- `executeModuleRecursive`
- Most of `executeFunctionRecursive` branches
- `executeCompRecursive`, `executeJuxtRecursive`, `executeEveryPredRecursive`, etc.
- Spread handling in `evaluateParamsRecursive`
- Anonymous function with placeholders path

## Architecture

### New Frame Types Needed

```typescript
// For evaluating binding default values
interface BindingDefaultFrame {
  type: 'BindingDefault'
  target: BindingTarget
  remainingTargets: BindingTarget[]
  context: Context
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// For pattern matching guards
interface MatchGuardFrame {
  type: 'MatchGuard'
  pattern: BindingTarget
  matchValue: Any
  cases: MatchCase[]
  caseIndex: number
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// For effect ref evaluation in do...with
interface EffectRefFrame {
  type: 'EffectRef'
  handlerNodes: [AstNode, AstNode][]
  evaluatedHandlers: EvaluatedWithHandler[]
  index: number
  bodyNodes: AstNode[]
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}
```

## Implementation Phases

### Phase 0: Remove Dead Code ✅ COMPLETED

**Findings:** Many `/* v8 ignore */` blocks are NOT dead code — they're untested paths that are still reachable. The recursive evaluator is used for binding default evaluation, and complex combinations (like calling `reduce` in a binding default) DO hit these paths.

**Successfully removed:**
1. ✅ Async retry fallback in `evaluateNodeRecursive` for SpecialExpression (L160-166)
2. ✅ Spread handling in `evaluateParamsRecursive` — replaced with error throw
3. ✅ Anonymous function placeholder path — replaced with error throw
4. ✅ Async recur handling in `executeUserDefinedRecursive` (L390-399)
5. ✅ v8 ignore comments on arity check in `executePartialRecursive` (kept the check)

**NOT removed (still needed):**
- `dvalaImpl` check in `evaluateNormalExpressionRecursive` — binding defaults CAN call Dvala-implemented functions
- `executeSpecialBuiltinRecursive` and `executeModuleRecursive` — reachable via function-as-value patterns
- Pure mode checks — kept for defensive programming

**Validation:** All 31,898 tests passing, coverage maintained.

### Phase 1: Frame-Based Binding Evaluation — IN PROGRESS

#### 1.1 Create `FnArgBindFrame` ✅

Created a new frame type `FnArgBindFrame` to handle function argument default evaluation:

```typescript
export interface FnArgBindFrame {
  type: 'FnArgBind'
  phase: 'default' | 'rest-default'
  fn: UserDefinedFunction
  params: Arr
  argIndex: number
  context: Context
  outerEnv: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}
```

#### 1.2 Refactor `setupUserDefinedCall` ✅

Split binding into two paths:
1. **Params provided**: Bind synchronously using `evaluateBindingNodeValues` (still uses recursive eval for nested destructuring defaults)
2. **Params missing (need defaults)**: Call `continueBindingArgs` which pushes `FnArgBindFrame` and evaluates defaults via trampoline

The `applyFnArgBind` function handles the continuation after a default is evaluated.

**What's frame-based now:**
- Top-level function argument defaults (`fn (a, b = 10) -> ...`) go through trampoline

**Still using recursive eval:**
- Nested destructuring defaults (`fn ({a = 10}) -> ...`) still use `evaluateBindingNodeValues` callback
- Rest argument destructuring defaults

#### 1.3 Next Steps (remaining for Phase 1) — DEFERRED

Converting `evaluateBindingNodeValues` to frame-based requires rewriting it to be resumable (similar to CPS transformation). This is complex because:
- Binding patterns can be arbitrarily nested (`{ a = { b = 10 } }`)
- The current callback-based design (`evaluate: (Node) => MaybePromise<Any>`) requires full transformation
- Usage of destructuring defaults is rare in practice (no real occurrences in test suite)

**Decision**: Defer Phase 1.3. Keep the recursive fallback for nested destructuring defaults.
The key path (top-level function argument defaults) is now frame-based via `FnArgBindFrame`.

### Phase 2: Frame-Based Pattern Matching — MOSTLY COMPLETE

**Analysis:** Upon review, pattern matching guards are ALREADY frame-based:
- Guard expressions are evaluated via `{ type: 'Eval', node: guard, env: guardEnv, k: [guardFrame, ...k] }`
- The `MatchFrame` with `phase: 'guard'` handles continuation after guard evaluation

**What uses recursive eval:**
- Literal pattern comparison (`case 1 then ...`) — BUT literals are always simple nodes (numbers, strings, booleans, null) that evaluate synchronously, so this is not a real concern
- Default values in patterns (`case { x = 10 } then ...`) — Same problem as Phase 1.3

**Decision:** Phase 2 is effectively complete. The remaining recursive eval usage (defaults in patterns) is the same complexity as Phase 1.3 and can be deferred.

### Phase 3: Frame-Based Effect Ref Evaluation

Convert `tryMatch` guard evaluation to frame-based.

#### 2.1 Create `MatchGuardFrame`

When a pattern has a guard that needs evaluation:

```typescript
const frame: MatchGuardFrame = {
  type: 'MatchGuard',
  pattern,
  matchValue,
  cases: remainingCases,
  caseIndex,
  env,
  sourceCodeInfo,
}
return { type: 'Eval', node: guardExpr, env: bindingsEnv, k: [frame, ...k] }
```

#### 2.2 Update Match Frame Logic

The existing `MatchFrame` continues to orchestrate, but defers to `MatchGuardFrame` when guards are present.

### Phase 3: Frame-Based Effect Ref Evaluation ✅ COMPLETED

Converted `do...with` effect ref evaluation to frame-based.

#### 3.1 Create `EffectRefFrame` ✅

Added the `EffectRefFrame` interface to `frames.ts`:
- `handlerNodes`: The original handler AST nodes
- `evaluatedHandlers`: Accumulated evaluated handlers
- `index`: Current handler being evaluated
- `bodyNodes`: The block body to evaluate after handlers are set up
- `bodyEnv`: Environment for body evaluation

#### 3.2 Update block special expression ✅

Changed the block case to push an `EffectRefFrame` and evaluate the first effect expression via trampoline, instead of inline `evaluateNodeRecursive` calls.

#### 3.3 Implement `applyEffectRef` ✅

When an effect ref is evaluated:
1. Store the result in `evaluatedHandlers`
2. If more handlers, continue to next effect expression
3. If all done, build `TryWithFrame` and start evaluating body

**Validation:** All 31,899 tests passing.

### Phase 4: Static Closure Capture ✅ COMPLETED

Removed unused `evaluateNode` parameter from `getUndefinedSymbols`.

**Analysis:** The `evaluateNode` callback was passed through the entire `getUndefinedSymbols` chain but NEVER actually called. It was designed for potential future use but turned out to be unnecessary — closure capture is purely static analysis.

**Changes:**
1. Removed `evaluateNode` param from `GetUndefinedSymbols` type in `getUndefinedSymbols/index.ts`
2. Removed `evaluateNode` param from `getUndefinedSymbols` function
3. Removed `evaluateNode` from `BuiltinSpecialExpression.getUndefinedSymbols` interface
4. Updated all special expression `getUndefinedSymbols` implementations (20+ files)
5. Updated `trampoline.ts` `evaluateFunction` to not pass `evaluateNodeRecursive`
6. Updated `tooling.ts` to not import or pass `evaluateNode`

**Validation:** All 31,899 tests passing, `npm run check` passes.

### Phase 5: Remove Async Fallback Paths

Once Phases 1-3 are complete, the async fallback paths (L1347-L1349, etc.) become unreachable. Remove them.

### Phase 6: Final Cleanup

1. Remove `evaluateNodeRecursive` function
2. Remove `evaluateParamsRecursive` function
3. Remove `evaluateNormalExpressionRecursive` function
4. Remove `executeFunctionRecursive` function
5. Remove `executeDvalaFunctionRecursive` function
6. Remove `executeUserDefinedRecursive` function
7. Remove all `execute*Recursive` helper functions
8. Remove imports only used by recursive path
9. Update comments referencing "recursive evaluator"

## Migration Strategy

Each phase should:
1. Be implemented in a single PR
2. Pass all existing tests
3. Not change observable behavior
4. Be covered by existing tests (no new test gaps)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Complex binding patterns break | Existing test coverage is comprehensive |
| Performance regression | Benchmark critical paths before/after |
| Async behavior changes | Async tests exist; add more if needed |
| Suspension through bindings | Test suspension in destructuring defaults |

## Success Criteria

- [ ] `evaluateNodeRecursive` removed
- [ ] All `execute*Recursive` functions removed
- [ ] No `/* v8 ignore */` blocks in trampoline.ts for "recursive path"
- [ ] All 5349+ tests passing
- [ ] Coverage ≥ 97%
- [ ] Suspension works through destructuring defaults
- [ ] Suspension works through pattern match guards

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 0: Dead code removal | 1-2 hours | None |
| Phase 1: Binding frames | 4-6 hours | None |
| Phase 2: Match guard frames | 2-3 hours | Phase 1 |
| Phase 3: Effect ref frames | 1-2 hours | None |
| Phase 4: Closure capture | 1-2 hours | None |
| Phase 5: Async fallback removal | 1 hour | Phases 1-3 |
| Phase 6: Final cleanup | 1-2 hours | All above |
| **Total** | **11-18 hours** | |
