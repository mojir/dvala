# Macro Error Propagation

## Problem

When an error occurs during macro expansion, the error message is lost by the time it reaches user-level error handlers. A secondary error replaces the original.

## What we know

### The error-to-effect pipeline

1. `DvalaError` is thrown inside `callMacro` (e.g., expansion depth limit)
2. The evaluator converts it to `perform(@dvala.error, shortMessage)` if a handler exists on the continuation stack
3. The handler catches the effect and returns a value
4. The `MacroEvalFrame` still sits on the stack — it tries to evaluate the handler's return value as AST
5. The return value (e.g., a string) is not valid AST — this produces a secondary error like "M-node cannot be evaluated"
6. The secondary error replaces the original

### Observed behavior

```dvala
let inf = macro (ast) -> inf(ast);

// This works — fallback catches the error, returns static value
(inf(1)) ||> fallback("default")   // → "default"

// This loses the original message
handle
  inf(1)
with @dvala.error(msg) -> msg end
// → "M-node cannot be evaluated" (not the depth limit message)
```

### Why `||> fallback` works

`fallback` is an effect handler that intercepts `@dvala.error` and returns a replacement value. The key difference: `fallback` returns its value as the result of the *entire* `handle...with` block, bypassing the `MacroEvalFrame`. The `MacroEvalFrame` is discarded when the handler unwinds the stack past it.

When using `handle...with @dvala.error(msg) -> msg end` directly, the handler returns `msg` as the continuation of the *handled expression* — which still flows through the `MacroEvalFrame`.

### Root cause

`MacroEvalFrame` does not distinguish between:
- A normal macro return (AST data to evaluate)
- An error recovery path (value that should bypass AST evaluation)

When the error-to-effect conversion routes through a handler, the handler's return value flows back through `applyMacroEval`, which assumes any value it receives is expanded AST and tries to evaluate it.

### What a fix might need to address

- `MacroEvalFrame` should detect that the value arriving is from an error handler, not from normal macro expansion
- Or: the error-to-effect conversion should unwind past `MacroEvalFrame` before dispatching to the handler
- Or: `MacroEvalFrame` should be marked/removed when an error occurs during expansion, before the error is converted to an effect

### Scope

This likely affects all errors during macro expansion, not just the depth limit. Any `DvalaError` thrown while a `MacroEvalFrame` is on the stack will have the same problem.
