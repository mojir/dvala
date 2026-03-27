# Error System Redesign — Structured Hierarchy & Serializable Payloads

**Status:** Ready
**Created:** 2026-03-27

## Goal

Replace the flat `DvalaError` class (used for everything from tokenizer failures to runtime type mismatches) with a proper error hierarchy, and make `@dvala.error` carry structured serializable data instead of a bare string.

---

## Background

### Current state

All errors are `DvalaError` or one of three subclasses:

```
DvalaError (268 throw sites — tokenizer, parser, runtime, all mixed)
├── UserDefinedError    (unhandled @dvala.error converted back to throw)
├── AssertionError      (assert() failures)
└── UndefinedSymbolError (missing symbols)
```

**Problems:**

1. **No categorization** — tokenizer errors, parse errors, arity mismatches, type errors, and division by zero all throw bare `DvalaError`. Handlers and hosts can't distinguish them programmatically.

2. **`@dvala.error` carries only a string** — when the runtime converts a `DvalaError` to `perform(@dvala.error, msg)`, source location, error type, and all context are lost. Handlers receive `(arg, eff, nxt)` where `arg` is just `"Division by zero"`.

3. **Macro error propagation breaks** — `MacroEvalFrame` can't distinguish a handler's return value (error recovery) from a macro's return value (AST to evaluate), because both arrive as untyped values. With structured error data, the frame could detect non-AST values from error paths.

4. **Host-side filtering is impossible** — a host handler matching `@dvala.error` gets a string, so it can't route assertion failures differently from type errors.

### Error sites by phase

| Phase | Count | Current type | Examples |
|-------|-------|-------------|----------|
| Tokenizer | ~10 | `DvalaError` | Unterminated string, invalid character, bad number literal |
| Parser | ~40 | `DvalaError` | Unexpected token, missing `end`, duplicate binding, bad destructuring |
| Runtime: type/arity | ~150 | `DvalaError` | Wrong argument type, arity mismatch, expected array |
| Runtime: reference | 2 | `UndefinedSymbolError` | Undefined symbol |
| Runtime: assertion | ~25 | `AssertionError` | `assert()` and typed assertions |
| Runtime: arithmetic | ~5 | `DvalaError` | Division by zero |
| Runtime: macro | ~5 | `DvalaError` | Expansion depth, invalid AST |
| Runtime: user | 2 | `UserDefinedError` | Unhandled `@dvala.error` |

## Proposal

### 1. Error hierarchy (TypeScript classes)

```
DvalaError                    (base — never thrown directly after migration)
├── TokenizerError            (invalid tokens, unterminated strings)
├── ParseError                (unexpected token, missing end, bad syntax)
└── RuntimeError              (base for all evaluation-time errors)
    ├── TypeError             (wrong argument type, arity mismatch)
    ├── ReferenceError        (undefined symbol — replaces UndefinedSymbolError)
    ├── AssertionError        (assert() failures — already exists)
    ├── ArithmeticError       (division by zero, numeric overflow)
    ├── MacroError            (expansion depth, invalid AST return)
    └── UserError             (user-thrown via perform(@dvala.error) — replaces UserDefinedError)
```

Each subclass adds:
- A `type` string constant (e.g. `'TypeError'`, `'ParseError'`) — used in serialized payload
- Possibly subclass-specific fields (e.g. `symbol` on `ReferenceError`, `expected`/`got` on `TypeError`)

`TokenizerError` and `ParseError` happen before runtime. They never go through `@dvala.error` — they appear only in `RunResult.error`.

### 2. Structured `@dvala.error` payload

When a `RuntimeError` (or subclass) is routed through the effect system, the payload becomes a structured Dvala object instead of a string:

```dvala
{
  type: "TypeError",
  message: "Expected number, got string",
  data: { expected: "number", got: "string" }
}
```

**Guaranteed fields (set by the runtime):**

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Machine-readable error category. Coerced to string. Defaults to `"UserError"` if not provided. Built-in types are not reserved — user code can use any string. |
| `message` | `string` | Human-readable description. Coerced to string. Required in manual performs. |

These two fields are the contract. The runtime ensures they are always strings.

**Additional fields:**

Any other fields on the error object are passed through untouched. The runtime does not strip, validate, or restructure them. By convention, builtins use a `data` field for type-specific context (e.g. `ReferenceError` → `{ data: { symbol: "foo" } }`), but this is not enforced.

**Runtime-internal metadata (NOT in payload):**

The runtime tracks these internally on the continuation stack / error context — they are not visible to Dvala code:

| Internal | Description |
|----------|-------------|
| `nodeId` | AST node ID where the error originated. Resolved to source location for `RunResult.error`. |
| `timestamp` | Wall-clock `Date.now()` when the error was created. Available to the host via `RunResult.error`. |

Both are preserved on re-throws — the runtime keeps the original values from when the error was first raised.

**Example — handler inspects and re-throws:**
```dvala
handle
  riskyCode()
with @dvala.error({ type, message }) ->
  if type == "ArithmeticError" then 0
  else perform(@dvala.error, { type: type, message: message })
  end
end
```

### 3. Manual error raising

`perform(@dvala.error, payload)` is the low-level primitive. The contract is strict:

- **Payload must be an object** with at least a `message` field
- **`perform(@dvala.error)` (no payload)** → TypeError: `@dvala.error` requires an error object
- **`perform(@dvala.error, "oops")` (non-object)** → TypeError: `@dvala.error` requires an error object
- **`perform(@dvala.error, { })` (missing message)** → TypeError: `@dvala.error` requires a message field

The runtime then:
- Coerces `type` to string, defaults to `"UserError"` if absent
- Coerces `message` to string
- Passes all other fields through untouched

| User performs | Handler receives |
|---|---|
| `perform(@dvala.error, { message: "oops" })` | `{ type: "UserError", message: "oops" }` |
| `perform(@dvala.error, { type: "MyError", message: "bad" })` | `{ type: "MyError", message: "bad" }` |
| `perform(@dvala.error, { type: "MyError", message: "bad", data: { x: 1 }, extra: 2 })` | `{ type: "MyError", message: "bad", data: { x: 1 }, extra: 2 }` |
| `perform(@dvala.error, "oops")` | TypeError |
| `perform(@dvala.error)` | TypeError |

This is not optimized for ergonomics — it's the completeness primitive. Convenient wrappers (e.g. a `throw` builtin) can come later.

### 4. Backward compatibility

- `fallback(value)` still works — it ignores the payload entirely
- Handlers that destructure `@dvala.error(msg)` where `msg` was a string will now get an object — **this is a breaking change**
- `retry` handler passes the payload through — still works

**Migration path:** Since this is pre-1.0, a clean break is acceptable. Update all handlers in the codebase and document the change.

### 5. Macro error propagation fix

With structured payloads, `MacroEvalFrame.applyMacroEval()` can detect error recovery:

```typescript
function applyMacroEval(frame: MacroEvalFrame, value: Any, k: ContinuationStack): Step {
  if (frame.expanded) {
    return { type: 'Value', value, k }
  }
  // If value is a structured error object (from error handler), don't evaluate as AST
  if (isErrorPayload(value)) {
    return { type: 'Value', value, k }
  }
  // Normal path: evaluate returned AST
  // ...
}
```

This cleanly separates the error recovery path from the normal macro expansion path.

### 6. Host-side RunResult

`RunResult.error` already carries the full `DvalaError` — no change needed. The subclass hierarchy gives hosts `instanceof` checks:

```typescript
if (result.type === 'error') {
  if (result.error instanceof ParseError) { /* syntax issue */ }
  if (result.error instanceof TypeError) { /* type issue */ }
}
```

## Resolved Decisions

- **Payload location info:** Source location (`nodeId`) and `timestamp` are tracked internally by the runtime, not in the Dvala-visible payload. Host gets them via `RunResult.error`. Both preserved on re-throws.
- **Payload shape:** Only `type` (string) and `message` (string) are guaranteed by the runtime. All other fields pass through untouched. `data` is a convention builtins follow, not enforced.
- **Type field:** Flat strings (`"TypeError"`, `"MyError"`). Not qualified names. Not reserved — user code can use any string.
- **Manual performs are strict:** `perform(@dvala.error, ...)` requires an object with a `message` field. Strings, nulls, and missing payloads are TypeErrors. Convenience wrappers (e.g. `throw`) come later.
- **Re-throw origin preservation:** Runtime preserves the original error origin from the continuation context, not from the payload. "First writer wins" — if an error origin already exists on the continuation, keep it.
- **`AssertionError` naming:** Reviewed — the spelling is correct (`assertion` = `assert` + `ion`). No change needed.
- **Stack traces:** Future feature, not in this redesign. When implemented: collect `nodeId`s from continuation frames at error creation time, store as internal metadata (like `nodeId` and `timestamp`). Purely additive.

## Open Questions

None — all resolved. See Resolved Decisions.

## Implementation Plan

1. **Design review** — settle open questions
2. **Add error subclasses** — `TokenizerError`, `ParseError`, `RuntimeError`, `TypeError`, `ReferenceError`, `ArithmeticError`, `MacroError`, `UserError` in `src/errors.ts`
3. **Migrate throw sites** — replace `new DvalaError(...)` with appropriate subclass across ~268 sites (largest task, mostly mechanical)
   - Tokenizer (~10 sites) → `TokenizerError`
   - Parser (~40 sites) → `ParseError`
   - Runtime type/arity (~150 sites) → `TypeError`
   - Runtime arithmetic (~5 sites) → `ArithmeticError`
   - Runtime macro (~5 sites) → `MacroError`
   - Remaining runtime → `RuntimeError`
4. **Structured payload** — change `tryDispatchDvalaError()` to build `{ type, message, ...data }` from the error subclass instead of passing `error.shortMessage`. Store `nodeId` and `timestamp` on the continuation frame, not in the payload.
5. **Validate manual performs** — in `dispatchPerform()`, when effect is `@dvala.error`: require object payload with `message` field, coerce `type`/`message` to string, default `type` to `"UserError"`.
6. **Re-throw origin preservation** — when `@dvala.error` is performed and an existing error origin is on the continuation, preserve it instead of overwriting.
7. **Update handlers** — migrate `fallback`, `retry`, assertion module, and all test handlers to work with structured payload
8. **Fix MacroEvalFrame** — add error payload detection in `applyMacroEval()`
9. **Update tests** — ~30 test files reference error messages or handler patterns
10. **Update docs** — effect handler documentation, `@dvala.error` reference

### Future features (not in this redesign)

- **Stack traces** — collect `nodeId`s from continuation frames at error creation time, store as internal metadata alongside `nodeId` and `timestamp`. Expose to host via `RunResult.error.stack: SourceCodeInfo[]`. Purely additive — no breaking changes. Design work needed on filtering (which frames are "interesting") and cross-suspension behavior.
- **`throw` builtin** — convenient wrapper: `throw("message")` or `throw("message", { data: ... })`. Builds the error object and performs `@dvala.error`. Sugar, not a new mechanism.
