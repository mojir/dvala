# Chaining API Design — Planning Notes

## Core Idea

Replace the `Dvala` class with a function-first chaining API where the program is the entry point:

```ts
dvala("1 + 2").run()
dvala("x + y").bind({ x: 1, y: 2 }).run()
dvala("import vector; ...").modules(vectorModule).run()
```

The program is always present — it's the one thing every execution needs.

---

## Current State

### What exists today

1. **`Dvala` class** — thin wrapper holding `astCache`, `debug`, `modules`. Methods: `run()`, `async.run()`, `tokenize()`, `parse()`, `getUndefinedSymbols()`, `getAutoCompleter()`.
2. **Standalone effects API** — `run()`, `runSync()`, `resume()` functions in `effects.ts`.
3. **`createDebugger()`** — standalone factory, already bypasses `Dvala` entirely.

### Problems with the class

- Instance state is minimal (cache + config) — it's really a frozen config bag, not a stateful object.
- Two separate APIs for the same thing (class methods vs standalone functions).
- The `Dvala` class can't do effects/suspend — users must switch to the standalone API for that.
- The debugger ignores the class entirely.

---

## Proposed Shape

```ts
const builder = dvala("program source")
  .modules(...)
  .async()
  .registerHandlers(...)
  .pure()
  .bind(...)

const result = builder.run()
```

### Builder methods (non-terminal)

| Method | Purpose | Notes |
|--------|---------|-------|
| `.modules(...modules)` | Register Dvala modules | |
| `.bind(bindings)` | Add host bindings | Additive? Shadowing? |
| `.async()` | Switch to async execution | Changes `.run()` return type |
| `.registerHandlers(handlers)` | Add effect handlers | |
| `.pure()` | Enable pure mode | |

### Terminal methods

| Method | Returns |
|--------|---------|
| `.run()` | `unknown` (sync) or `Promise<unknown>` (async) |

---

## Open Questions

### 1. "Once" functions — how to enforce?

Methods like `.modules()`, `.async()`, `.pure()`, `.registerHandlers()` should only be called once. Options:

- **A) Throw on second call.** Simple, runtime-only. Fails fast but ordering matters for error messages.
- **B) TypeScript type narrowing.** Each call returns a narrower type that omits the used method. Full compile-time safety, but complex generic types. E.g.:
  ```ts
  dvala("...").modules(m)          // returns Omit<Builder, 'modules'>
              .modules(m)          // TS error: property 'modules' does not exist
  ```
- **C) Last-write-wins.** No enforcement — just use the last value. Simplest but allows confusing chains.

**Comment:** Option A is the pragmatic choice. Option B is elegant but can make error messages ugly and the implementation harder to maintain. Option C invites bugs. I'd go with A — throw on second call — unless TS narrowing turns out to be clean enough to maintain.

### 2. Should ordering matter?

The user said ordering should not matter. But some combinations are invalid:

- `.pure()` + `.registerHandlers({...})` — contradictory.
- `.registerHandlers()` implies async behavior.

Options:

- **A) Validate at `.run()` time.** Ordering truly doesn't matter — collect all config, validate once. Downside: errors are distant from the problematic call.
- **B) Validate at each call.** `.pure()` throws if handlers already set, and vice versa. Ordering matters for error reporting but not for valid chains.
- **C) Validate at each call, order-independent.** Both `.pure()` and `.registerHandlers()` set flags; `.run()` checks for conflicts. Combines the worst of both — deferred errors but also call-time state tracking.

**Comment:** Option A (validate at `.run()`) is the cleanest if ordering truly shouldn't matter. The builder silently accumulates config; `.run()` is the single point where invariants are checked. This keeps the builder methods simple and order-independent. Error messages at `.run()` time can be descriptive: "Cannot use pure mode with effect handlers".

### 3. `.bind()` — additive or replace?

- **Additive with shadowing:** `.bind({ x: 1 }).bind({ x: 2, y: 3 })` → `{ x: 2, y: 3 }`. Natural, like nested scopes.
- **Replace:** Each `.bind()` replaces previous bindings entirely.
- **Additive, throw on conflict:** `.bind({ x: 1 }).bind({ x: 2 })` throws.

**Comment:** Additive with shadowing is the most useful. It lets users layer config: `.bind(defaults).bind(overrides)`. Throwing on conflict is overly strict — shadowing is intentional and familiar from every scoping system.

If `.bind()` is additive, should it also be "once"? Probably not — multiple `.bind()` calls is the whole point of additive layering.

### 4. `.async()` — explicit toggle or inferred?

- **Explicit:** User must call `.async()` to get `Promise<unknown>` from `.run()`.
- **Inferred from `.registerHandlers()`:** Having handlers implies effects, which are always async.
- **Two terminals:** `.run()` for sync, `.runAsync()` for async — no `.async()` method at all.

**Comment:** Two terminals (`.run()` / `.runAsync()`) might be cleaner than a mode toggle. It's explicit at the call site, and TypeScript can give different return types naturally without generics gymnastics. `.registerHandlers()` + `.run()` could throw: "Use .runAsync() when handlers are registered." This avoids the `.async()` method entirely.

Alternatively, if `.registerHandlers()` auto-implies async, `.async()` is only needed for the case where you want async execution *without* handlers (pure async Dvala code using built-in async operations). How common is that case?

### 5. `.pure()` ↔ `.registerHandlers()` relationship

Pure mode means no side effects. Handlers *are* side effects. So:

- `.pure().registerHandlers({...})` — contradictory.
- `.registerHandlers({}).pure()` — also contradictory.
- `.pure().registerHandlers({})` — empty handlers, arguably fine?

**Comment:** Simplest rule: `.pure()` and `.registerHandlers()` with non-empty handlers are mutually exclusive. Validate at `.run()` time (per question 2). Empty handlers `{}` is a no-op and should be allowed with `.pure()`.

### 6. Should `dvala()` take an options object?

```ts
// Option A: Everything through chaining
dvala("program").modules(m).bind(b).run()

// Option B: Common config in options, per-run stuff chained
dvala("program", { modules: m, cache: 100 }).bind(b).run()

// Option C: Separate factory for reusable config
const d = createDvala({ modules: m, cache: 100 })
d("program").bind(b).run()
```

**Comment:** Option C has a nice separation of concerns. `createDvala()` handles infrastructure config that rarely changes (modules, cache size). The returned `d()` function handles per-execution config. This mirrors the current `Dvala` class usage pattern where one instance is created and reused for many `run()` calls — especially in the playground. Option A is cleanest for simple cases. Option B is a middle ground but mixes paradigms.

### 7. Where does the AST cache live?

The AST cache is the one piece of genuinely useful mutable state in the current `Dvala` class. Options:

- **In `createDvala()` factory (Option C above).** The factory closure owns the cache. Each `d("program")` call checks/populates it.
- **Explicit opt-in per chain.** `.cache(cacheInstance)` — user manages cache lifetime.
- **Drop it.** Parsing is fast enough. Cache adds complexity for marginal benefit.

**Comment:** If going with `createDvala()` factory, the cache lives naturally in the closure. If going pure-function, either drop it or let users pass a `Map` for caching. The playground is the main consumer — measure whether it actually matters before deciding.

### 8. What about `.tokenize()`, `.parse()`, etc.?

Currently `Dvala` exposes `tokenize()`, `parse()`, `transformSymbols()`, `untokenize()`, `getUndefinedSymbols()`, `getAutoCompleter()`. These are used by the playground and tooling.

Options:

- **Terminal methods on the builder.** `.tokenize()` returns tokens instead of running, `.parse()` returns AST. Mutually exclusive with `.run()`.
- **Separate standalone functions.** `tokenize(source)`, `parse(tokens)` — no builder needed.
- **Both.** Standalone functions for pipeline use, builder terminals for convenience.

**Comment:** These are really compiler pipeline utilities, not execution modes. They don't need bindings, modules, handlers, or pure mode. Making them builder terminals conflates two concerns. Better as standalone exports: `tokenize(source)`, `parse(tokens)`, `untokenize(tokens)`. The builder is for *execution*. The playground can call these directly.

### 9. What about `resume()`?

`resume()` takes a snapshot from a suspended execution and continues it. It doesn't start with a program string — it starts with a `Snapshot`.

- **Standalone function.** `resume(snapshot, value, options?)` — current design.
- **Method on RunResult.** `result.resume(value)` if `result.type === 'suspended'`.
- **Separate builder.** `dvala.resume(snapshot, value).handlers(h).run()`.

**Comment:** `resume()` is fundamentally different from `dvala("program")` — there's no source code involved. A standalone function makes the most sense. Alternatively, a `.resume(value)` method on the suspended `RunResult` is very ergonomic:

```ts
const result = await dvala("perform 'ask'").registerHandlers(h).runAsync()
if (result.type === 'suspended') {
  const next = await result.resume("user input")
}
```

This is appealing but means `RunResult` needs to capture the handlers/modules/bindings context for the resume call. Trade-off between convenience and explicitness.

### 10. The debugger

`createDebugger()` is already function-based with its own state (history, step index). It should stay separate — debugging is a different mode of interaction, not a configuration option.

**Comment:** No change needed here. `createDebugger()` is the right shape. It could optionally accept a `createDvala()` config for consistency, but its internal architecture is fine as-is.

---

## Possible Final Shapes

### Shape A: Pure function, chaining only

```ts
// Simple
dvala("1 + 2").run()

// Full
dvala("program")
  .modules(vectorModule, gridModule)
  .bind({ x: 42 })
  .pure()
  .run()

// Async with effects
const result = await dvala("perform 'ask'")
  .registerHandlers(handlers)
  .bind({ context: data })  
  .runAsync()

// Resume — standalone
const next = await resume(result.snapshot, userInput, { handlers })

// Tooling — standalone
const tokens = tokenize(source)
const ast = parse(tokens)
```

### Shape B: Factory + chaining

```ts
// One-off
dvala("1 + 2").run()

// Reusable config (with cache)
const d = createDvala({ modules: allBuiltinModules, cache: 100 })
d("1 + 2").run()
d("x + y").bind({ x: 1, y: 2 }).run()

// Async with effects
const result = await d("perform 'ask'")
  .registerHandlers(handlers)
  .runAsync()
```

### Shape C: Options object + minimal chaining

```ts
// Simple
dvala("1 + 2").run()

// With options
dvala("program", { modules: [vectorModule], pure: true, bindings: { x: 1 } }).run()

// Chaining for overrides
dvala("program", { modules: [vectorModule] })
  .bind({ x: 1 })
  .run()
```

**Comment:** Shape B feels like the best balance. `dvala()` for one-offs, `createDvala()` for reusable setups (playground, REPL, test suites). Chaining for per-run config. Standalone functions for tooling and resume. Shape A works but loses the cache story. Shape C mixes paradigms.

---

## Next Steps

- [ ] Decide on enforcement strategy (once-functions vs throw vs types)
- [ ] Decide on `.run()` vs `.runAsync()` vs `.async().run()`
- [ ] Decide on `dvala()` vs `createDvala()` + `d()`
- [ ] Decide on `.bind()` semantics (additive/shadow)
- [ ] Decide on validation timing (call-time vs `.run()`-time)
- [ ] Prototype the builder type in isolation
- [ ] Migrate one test file to the new API as a proof of concept
- [ ] Plan backward compatibility / deprecation of `Dvala` class
