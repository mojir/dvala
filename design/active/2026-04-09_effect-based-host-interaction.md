# Effect-Based Host Interaction

**Status:** Approved
**Created:** 2026-04-09

## Goal

Replace the `bindings` host injection mechanism with effect-based host interaction. All communication between Dvala programs and the host environment should flow through the effect system, making it testable, composable, and consistent with Dvala's effect-centric architecture.

---

## Background

Today, host-injected values (e.g. `configExists`, `dirName` in `cli/src/init.dvala`) are passed via the `bindings` option in `runAsync()`. This creates a parallel value-resolution path alongside the effect system:

```
Host TS -> runAsync(source, { bindings: { configExists, dirName } })
  -> createContextStack({ bindings })
  -> ContextStack.lookUpByName() checks contexts -> hostValues
```

This is inconsistent: Dvala is effect-centric, but host values bypass effects entirely. They can't be intercepted, mocked, or composed with handlers.

### What bindings touches today

- **Core API**: `createDvala()`, `run()`, `runAsync()`, `resume()`, `retrigger()` — all accept `bindings`
- **ContextStack**: `values` field, `getValue()`, `lookUpByName()` fall back to host values
- **Tooling**: `getUndefinedSymbols()`, `getAutoCompleter()` accept `bindings`
- **CLI**: REPL context, `init.dvala` host bindings, `execute()` function
- **Playground**: context panel groups bindings and effect handlers separately
- **Tests**: 25+ test files use `bindings`
- **Suspension/resume**: `ResumeOptions`, `RetriggerOptions` carry `bindings`

## Decisions

All open questions have been resolved:

1. **Effect names**: `@dvala.host`, `@dvala.env`, `@dvala.args` — top-level under `@dvala`, not under `@dvala.io` (these aren't interactive I/O)
2. **Host API**: No new API surface. Use existing `effectHandlers` array. Provide a `hostHandler()` utility that takes a record and returns a `HandlerRegistration`
3. **Default handlers**: `@dvala.env` and `@dvala.args` are standard effects (like `dvala.io.print`), hardcoded in `getStandardEffectHandler()`. Host can override by registering their own handler (checked before standard effects)
4. **Unhandled `@dvala.host`**: Custom error message — `Host binding "${name}" not provided. Install a @dvala.host effect handler.`
5. **`@dvala.env` missing var**: Returns `null` (not `""`). Preserves distinction between "not set" and "set to empty". Works with `??` for defaults
6. **`@dvala.args` stripping**: Strip both `node` and script path. Return user args only
7. **Pure mode**: All three effects blocked in pure mode
8. **`hostHandler()` unknown name**: Calls `fail()` with message `Host binding "${name}" not provided` — Dvala-level error, catchable by error handlers
9. **Playground context panel**: Single group "Effects" — no separate bindings section
10. **REPL state**: Use `globalContext` for accumulated let-bindings instead of `bindings`
11. **`definedBindings` in RunResult**: Rename to `scope`
12. **Suspension/resume**: Remove `bindings` from `ResumeOptions`/`RetriggerOptions` — host provides `@dvala.host` handler via existing `handlers` option
13. **Tooling**: Remove `bindings` from `getUndefinedSymbols`/`getAutoCompleter` — with effects, `let x = perform(...)` is a normal `let` binding, no special tracking needed

## Proposal

### New Effects

Three new built-in effects:

| Effect | Argument | Returns | Default handler |
|---|---|---|---|
| `@dvala.host` | `string` (name) | any | none — custom error if unhandled |
| `@dvala.env` | `string` (name) | string or null | standard: reads `process.env` |
| `@dvala.args` | none | string[] | standard: reads `process.argv` (stripped) |

All blocked in pure mode.

#### `@dvala.host` — host-injected values

```dvala
let configExists = perform(@dvala.host, "configExists");
let dirName = perform(@dvala.host, "dirName");
```

The host installs a handler via the existing `effectHandlers` API:

```typescript
import { hostHandler } from 'dvala'

await dvala.runAsync(source, {
  effectHandlers: [
    hostHandler({ configExists, dirName }),
    ...otherHandlers,
  ]
})
```

`hostHandler()` is a convenience utility that takes a record and returns a `HandlerRegistration` with pattern `'dvala.host'`. When a name is not found, it calls `fail()` with `Host binding "${name}" not provided`.

#### `@dvala.env` — environment variables

```dvala
let home = perform(@dvala.env, "HOME");
let port = perform(@dvala.env, "PORT") ?? "3000";
```

Per-entry only (not fetch-all) for security and observability. Returns `null` for unset variables. Standard effect — default handler reads `process.env`, host can override.

#### `@dvala.args` — CLI arguments

```dvala
let args = perform(@dvala.args);
let [filename, ...flags] = args;
```

No argument — returns the full array (stripped of `node` and script path). Standard effect — default handler reads `process.argv`.

### Removals

- Remove `bindings` from `CreateDvalaOptions`, `DvalaRunOptions`, `DvalaRunAsyncOptions`
- Remove `bindings` from `ResumeOptions`, `RetriggerOptions`
- Remove `values` / `hostValues` from `ContextStack`
- Remove `getValue()` host-value fallback in `ContextStack.lookUpByName()`
- Remove `CreateContextStackParams.bindings`
- Remove `assertSerializableBindings()`, `mergeBindings()`
- Remove `bindings` from tooling (`getUndefinedSymbols`, `getAutoCompleter`)
- Remove `getHostValues()` from `ContextStack`
- Rename `definedBindings` → `scope` in `RunResult`
- REPL: use `globalContext` for accumulated let-bindings

### Playground Changes

- Remove the Bindings group from the context panel
- Single group: **Effects**
- All context is expressed as effect handlers

### Future: `declare` syntax

Once this foundation is in place, `declare x;` can be added as syntactic sugar that desugars to `let x = perform(@dvala.host, "x");` — a parser-level transformation with no new evaluator logic.

## Implementation Plan

### Phase A: Add effects + remove bindings from core

**Add the new mechanism:**

1. Register `@dvala.host`, `@dvala.env`, `@dvala.args` as built-in effects
2. Implement standard handlers for `@dvala.env` and `@dvala.args` in `getStandardEffectHandler()` — guard with `typeof process !== 'undefined'`, return `null` / `[]` in browser
3. Add custom unhandled-effect error for `@dvala.host` in `dispatchPerform()`
4. Create `hostHandler()` utility function (exported from main entry)
5. Add tests for all three effects

**Remove the old mechanism:**

6. Remove `values` / `hostValues` from `ContextStack`
7. Remove `getHostValues()` from `ContextStack`
8. Remove host-value fallback in `lookUpByName()` and `getValue()`
9. Remove `bindings` from all API option types (`CreateDvalaOptions`, `DvalaRunOptions`, `DvalaRunAsyncOptions`, `ResumeOptions`, `RetriggerOptions`, `CreateContextStackParams`)
10. Remove `assertSerializableBindings()`, `mergeBindings()`
11. Remove `bindings` from tooling (`getUndefinedSymbols`, `getAutoCompleter`)
12. Rename `definedBindings` → `scope` in `RunResult`

### Phase B: Update consumers

13. Update CLI REPL — use `globalContext` for accumulated bindings, `effectHandlers` for host values
14. Update CLI `init.dvala` — use `perform(@dvala.host, "name")` with `hostHandler()`
15. Update playground context panel — remove Bindings group, single "Effects" group
16. Update playground code execution — use `effectHandlers` instead of `bindings`
17. Update all test files (25+) — use `effectHandlers` / `hostHandler()` instead of `bindings`
18. Audit and update `reference/`, example programs, and any docs that mention `bindings`
19. Run full check pipeline, e2e tests, manual playground testing
