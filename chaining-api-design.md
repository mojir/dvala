# Chaining API Design — Planning Notes

## Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Once-enforcement | Throw on second call (moot — no builder) |
| 2 | Sync/async | Two terminals: `.run()` and `.runAsync()` |
| 3 | API shape | `createDvala(options?)` factory, program as first arg to `.run()`/`.runAsync()` |
| 4 | Bindings merge | Additive with shadowing — per-run shadows factory |
| 5 | Validation timing | At `.run()` / `.runAsync()` call time |

---

## Final API Shape

```ts
// Factory — reusable infrastructure
const d = createDvala({
  modules: [...],
  bindings: { log: console.log },
  effectHandlers: defaultHandlers,
  cache: 100,
})

// Sync
d.run("x + 1", { bindings: { x: 1 } })

// Async with effects
d.runAsync("perform 'ask'", {
  effectHandlers: extraHandlers,   // stacked on top of factory handlers
  bindings: { context: data },
})

// Pure mode
d.run("x + 1", { pure: true })
```

### Factory options

| Option | Type | Purpose |
|--------|------|---------|
| `modules` | `DvalaModule[]` | Register Dvala modules |
| `bindings` | `Record<string, unknown>` | Global host bindings |
| `effectHandlers` | `EffectHandlers` | Base effect handler layer |
| `cache` | `number` | AST cache size |

### Run options (`.run()` / `.runAsync()`)

| Option | Type | Purpose |
|--------|------|---------|
| `bindings` | `Record<string, unknown>` | Per-run bindings, shadows factory bindings |
| `effectHandlers` | `EffectHandlers` | Per-run handlers, stacked on top of factory handlers |
| `pure` | `boolean` | Enable pure mode — conflicts with `effectHandlers` |

### Rules

- `pure: true` + non-empty `effectHandlers` (from either factory or run options) → throws at run time
- Factory `bindings` + run `bindings` → merged, run shadows factory
- Factory `effectHandlers` + run `effectHandlers` → stacked, run handlers take priority

---

## Tooling — Standalone Functions

These are compiler pipeline utilities, not execution. They don't use the factory:

```ts
tokenize(source)
parse(tokens)
untokenize(tokens)
getUndefinedSymbols(source)
getAutoCompleter(source)
```

---

## Resume

`resume()` is a standalone function — there is no source code involved:

```ts
const result = await d.runAsync("perform 'ask'", { effectHandlers: h })
if (result.type === 'suspended') {
  const next = await resume(result.snapshot, userInput, { effectHandlers: h })
}
```

---

## Debugger

`createDebugger()` stays separate — debugging is a different mode of interaction.
It can optionally accept a `createDvala()` config for consistency.

---

## Next Steps

- [ ] Prototype `createDvala()` and builder types in isolation
- [ ] Migrate one test file to the new API as proof of concept
- [ ] Plan backward compatibility / deprecation of `Dvala` class
