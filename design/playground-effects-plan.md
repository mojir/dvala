# Playground Effects Plan

**Goal:** Enable Dvala programs to control the playground UI through effects, showcasing the effect system while adding fun scripting capabilities.

## Rules

1. After completing each step, update progress in this plan (mark checkbox `[x]`).
2. After completing each step, ask the user if they want to add and commit.

## Decisions

| Decision | Choice |
|----------|--------|
| Architecture | Explicit effects (`perform(effect(...), ...)`) |
| Naming | Nested (`playground.ui.showToast`, `playground.editor.getContent`) |
| Timing | Use `dvala.sleep` (no playground-specific delay) |
| Errors | `fail(msg)` in handlers → routes through `dvala.error` |

## Overview

User code in the playground can perform effects that manipulate the playground itself — showing toasts, running programs, controlling the editor, etc. The playground registers effect handlers that intercept these effects and execute them against the UI.

```dvala
perform(effect(playground.ui.showToast), "Hello!", "success")
let content = perform(effect(playground.editor.getContent))
perform(effect(dvala.sleep), 500)  // use standard sleep
```

**Why explicit effects:**
- Educational — showcases Dvala's effect system directly
- Clear separation between pure code and UI side-effects
- Users learn the pattern

## Proposed Effects

### UI (`playground.ui.*`)
| Effect | Arguments | Returns | Description |
|--------|-----------|---------|-------------|
| `playground.ui.showToast` | `message: string, level?: "info" \| "success" \| "warning" \| "error"` | `nil` | Show a toast notification |
| `playground.ui.setTheme` | `theme: "light" \| "dark"` | `nil` | Switch theme |

> **Note:** For output logging, use `dvala.io.println`. For interactive modals (prompts, confirmations, choices), use `dvala.io.*` effects (`read-line`, `confirm`, `pick`) — the playground already has handlers for these.

### Editor (`playground.editor.*`)
| Effect | Arguments | Returns | Description |
|--------|-----------|---------|-------------|
| `playground.editor.getContent` | none | `string` | Get current editor text |
| `playground.editor.setContent` | `code: string` | `nil` | Replace editor content |
| `playground.editor.insertText` | `text: string, position?: number` | `nil` | Insert text at position |
| `playground.editor.typeText` | `text: string, delayMs?: number` | `nil` | Simulate typing into editor |

### Execution (`playground.exec.*`)
| Effect | Arguments | Returns | Description |
|--------|-----------|---------|-------------|
| `playground.exec.run` | `code: string` | `any` | Execute Dvala code, return result |

### Storage (`playground.storage.*`)
| Effect | Arguments | Returns | Description |
|--------|-----------|---------|-------------|
| `playground.storage.save` | `name: string, code?: string` | `nil` | Save program (defaults to current editor) |
| `playground.storage.load` | `name: string` | `string` | Load saved program |
| `playground.storage.list` | none | `array<string>` | List saved program names |

## Implementation

### Phase 0: PlaygroundAPI Facade

Before implementing effects, create a facade that consolidates playground operations:

```typescript
// playground-www/src/playgroundAPI.ts

export interface PlaygroundAPI {
  ui: {
    showToast(message: string, level?: 'info' | 'success' | 'warning' | 'error'): void
    setTheme(theme: 'light' | 'dark'): void
  }
  editor: {
    getContent(): string
    setContent(code: string): void
    insertText(text: string, position?: number): void
    typeText(text: string, delayMs?: number): Promise<void>
  }
  storage: {
    save(name: string, code?: string): void
    load(name: string): string
    list(): string[]
  }
  exec: {
    run(code: string): Promise<unknown>
  }
}
```

**Why a facade:**
- Effect handlers become thin wrappers: `api.ui.showToast(message, level)`
- Same API usable from keyboard shortcuts, menus, tests
- Decouples effects from DOM/implementation details
- Testable independently

**Migration path:**
1. Create `playgroundAPI.ts` with interface + implementation
2. Implementation calls existing functions from `scripts.ts` (or inlines them)
3. Effect handlers receive the API instance
4. Gradually move logic from `scripts.ts` → facade methods

### Effect Registration

Effect handlers are generated automatically from the API shape:

```typescript
// playground-www/src/createEffectHandlers.ts

function createEffectHandlers(api: PlaygroundAPI): Record<string, EffectHandler> {
  const handlers: Record<string, EffectHandler> = {}
  
  function walk(obj: object, prefix: string) {
    for (const [key, value] of Object.entries(obj)) {
      const effectName = `${prefix}.${key}`
      if (typeof value === 'function') {
        handlers[effectName] = ({ args, resume, fail }) => {
          try {
            const result = value(...args)
            if (result instanceof Promise) {
              return result.then(r => resume(r ?? null)).catch(e => fail(e.message))
            }
            return resume(result ?? null)
          } catch (err) {
            return fail(err instanceof Error ? err.message : String(err))
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        walk(value, effectName)
      }
    }
  }
  
  walk(api, 'playground')
  return handlers
}

// Usage:
const api = createPlaygroundAPI(/* deps */)
const handlers = createEffectHandlers(api)

const dvala = createDvala({
  effectHandlers: handlers
})
```

**Result:** `api.ui.showToast` → effect `playground.ui.showToast`

**Benefits:**
- Zero boilerplate per effect
- Errors automatically route through `dvala.error`
- Async functions (returning Promise) handled automatically
- Single source of truth — the API shape IS the effect schema

### Error Handling

Effect handlers call `fail(msg)` on error → triggers `dvala.error` effect → user code can catch:

```dvala
do
  perform(effect(playground.storage.load), "nonexistent")
with
  case effect(dvala.error) then ([msg]) -> "File not found"
end
```

## UI State Restoration

~~When a program runs:~~
1. ~~**Before run:** Snapshot localStorage (editor content, theme, panel sizes, etc.)~~
2. ~~**Run program:** Execute normally, playground effects can modify UI~~
3. ~~**After run:** Restore the snapshot~~

✅ Done — `run()` captures editor content, context, and theme before `runAsync`, restores in `finally` block.

| Storage | Behavior | Examples |
|---------|----------|----------|
| localStorage | Temporary — restored after run | Editor content, theme, context |
| IndexedDB | Permanent — persists | Saved programs, continuation snapshots |

## Settings

### Existing setting (rephrase)
Current: **"Disable Playground effect handlers"**
→ Rename to: **"Disable standard effect handlers"**
→ Description: *"Disables handlers for `dvala.*` effects (io, sleep, time, random, etc.)"*

### New setting
Add: **"Disable playground effects"**
→ Description: *"Disables handlers for `playground.*` effects (editor, storage, ui, exec)"*

When disabled, performing a `playground.*` effect will trigger `dvala.error`.

## Safety Considerations

~~### Infinite Loop Protection~~
~~- Add timeout for `playground.exec.run` (prevent recursive infinite loops)~~
~~- Consider execution step limits~~

✅ Done — `exec.run` has 10 s timeout (`EXEC_TIMEOUT_MS`) via `Promise.race`.

~~### Rate Limiting~~
~~- Limit toast frequency (debounce)~~
~~- Limit storage operations~~

✅ Done — `showToast` rate-limited to 200 ms minimum interval (`TOAST_MIN_INTERVAL_MS`).

## Fun Demo Ideas

### 1. Self-typing demo
```dvala
let demo = "let x = 1 + 2; x * 3"
perform(effect(playground.editor.setContent), "")
perform(effect(playground.editor.typeText), demo, 50)
perform(effect(dvala.sleep), 500)
perform(effect(playground.ui.showToast), "Running...", "info")
```

### 2. Interactive tutorial
```dvala
perform(effect(dvala.io.println), "Welcome! Let's learn Dvala!")
perform(effect(playground.editor.setContent), "// Try adding two numbers\n1 + 2")
perform(effect(dvala.io.read-line), "Press Enter when ready...")  // waits for user
```

### 3. Code generator
```dvala
let n = 5
let code = "let total = " ++ join(map(range(1, n + 1), fn(i) => str(i)), " + ")
perform(effect(playground.editor.setContent), code)
```

### 4. Mini-game (guess the output)
```dvala
let challenges = [
  {code: "2 + 2", answer: 4},
  {code: "length([1, 2, 3])", answer: 3}
]
// ... quiz logic
```

## Phases

### Phase 0: Preparation
- [x] Create `PlaygroundAPI` interface
- [x] Implement facade wrapping existing `scripts.ts` functions
- [x] Wire up effect handler registration infrastructure
- [x] Rename "Disable Playground effect handlers" → "Disable standard effect handlers"
- [x] Add "Disable playground.* effects" toggle

### Phase 1: Core Effects
- [x] `playground.ui.showToast`
- [x] `playground.editor.getContent`
- [x] `playground.editor.setContent`
- [x] Add "Playground Demo" example to Examples page

### Phase 2: Execution
- [x] `playground.exec.run`

### Phase 3: Storage
- [x] `playground.storage.save`
- [x] `playground.storage.load`
- [x] `playground.storage.list`

### Phase 4: Advanced
- [x] `playground.editor.typeText`
- [x] `playground.editor.insertText`
- [x] `playground.ui.setTheme`

### Future (maybe)
- [x] `playground.context.getContent` / `setContent` — manipulate context panel
- [x] `playground.editor.getSelection` / `setSelection` — cursor/selection control
- [x] `playground.editor.getCursor` / `setCursor`
- [x] `playground.ui.highlight(id)` — highlight a UI element by `data-playground-id` (pulse/glow). Runtime DOM query via `document.querySelector('[data-playground-id="..."]')`; fails with `dvala.error` if element not found. Script must navigate to the right page first.
- [x] `playground.ui.click(id)` — simulate click on a UI element by `data-playground-id`. Same runtime query approach.
- [x] `playground.router.goto(route)` — navigate to a page (e.g. `"settings"`, `"examples"`, `"tutorials/effects"`)
- [x] `playground.router.back` — navigate back
- [x] Add `data-playground-id` attributes to key DOM elements. Some IDs are dynamic (only exist on certain pages), so no static validation — runtime query with clear error messages.

## Discoverability

### Autocomplete
~~Register `playground.*` effect names in the editor autocomplete, alongside `dvala.*` effects. Consider a distinct icon/color to indicate playground-only.~~
✅ Done — playground effect names passed to `getAutoCompleter` via `effectNames` param.

### Reference API
~~Add a separate **"Playground API"** entry in the sidebar (not under "Effects"). This makes it clear these effects are playground-specific and won't work in CLI or embedded hosts.~~
✅ Done — `/playground-api` page with effect tables, descriptions, and example code. Sidebar nav item added.

### Examples
~~Include a **"Playground Demo"** program on the Examples page that showcases the effects in action.~~
✅ Done — "Playground Effects Demo" added to examples.
