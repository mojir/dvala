# Unified Effect Panel

## Problem

The playground had separate modal systems for each effect type:

- `effect-modal` (static HTML) — unhandled and error effects, already had `< N/M >` nav
- `snapshotPanelContainer` via `pushPanel` — readline, println (each stacked its own panel)
- Dedicated static HTML modals — checkpoint, io-pick, io-confirm

When `parallel()` fires multiple effects simultaneously, each type handled navigation (or not) independently. Built-in handlers (readline, println, etc.) had no parallel nav at all, and each used a single global variable so parallel instances would overwrite each other.

## Solution

One unified panel for **all** effect handlers. Every effect — readline, println, pick, confirm, checkpoint, unhandled, error — registers into a single `pendingEffects[]` queue. One `createModalPanel` panel is opened and its body/footer are re-rendered as the user navigates. Nav `< 2/3 >` appears in the panel header whenever multiple effects are pending simultaneously.

## Core Interface

```typescript
interface PendingEffect {
  ctx: EffectContext
  title: string                              // shown in breadcrumb
  renderBody: (el: HTMLElement) => void      // populates the panel body
  renderFooter: (el: HTMLElement) => void    // populates the panel footer
  onKeyDown?: (evt: KeyboardEvent) => boolean // true = event consumed
  resolve: () => void                        // called when effect is done
}
```

Each handler is a factory function that closes over its local state (text areas, focused index, input mode, etc.) and returns a `PendingEffect`. No handler needs its own global variable.

## Central State

```typescript
let pendingEffects: PendingEffect[] = []
let currentEffectIndex = 0
let effectBatchScheduled = false
// Refs valid while the effect panel is open:
let effectPanelEl: HTMLElement | null = null
let effectPanelBodyEl: HTMLElement | null = null
let effectPanelFooterEl: HTMLElement | null = null
let effectNavEl: HTMLElement | null = null
let effectNavCounterEl: HTMLSpanElement | null = null
```

## Functions

### `registerPendingEffect(entry)`
- Push to `pendingEffects`
- Attach abort handler to `entry.ctx.signal`: auto-suspends the effect, removes it from the queue, re-renders or closes
- Schedule `openEffectPanel()` via `Promise.resolve().then()` if not already scheduled (batch pattern — collects all parallel effects fired in the same tick before opening)

### `openEffectPanel()`
- Create ONE `createModalPanel({ noClose: true })` panel
- Inject `<div.effect-modal__nav>` into the panel header (reuses existing CSS)
- Store refs to body, footer, nav elements
- Call `renderCurrentEffect()`
- `pushPanel(panel, entry.title, undefined, true)`
- `showExecutionControlBar()`

### `renderCurrentEffect()`
- Clear body and footer (`innerHTML = ''`)
- Call `entry.renderBody(effectPanelBodyEl)` and `entry.renderFooter(effectPanelFooterEl)`
- Update nav: hide when 1 effect, show `N / M` when multiple
- Update breadcrumb label in `modalStack` to match current effect's title

### `navigateEffect(delta)` (exported)
- Change `currentEffectIndex`, call `renderCurrentEffect()`

### `resolveEffect(entry)` (internal)
- Remove entry from `pendingEffects`
- If more remain: navigate to next (or stay at same index), `renderCurrentEffect()`
- If empty: `popModal()`, clear all panel refs, `hideExecutionControlBar()`

## Handler Factories

Each returns a `PendingEffect`. All state lives in the closure.

### readline
- `title`: `"Input"`
- `renderBody`: optional prompt text + `<textarea>` (stored in closure)
- `renderFooter`: Submit button
- `onKeyDown`: Enter (without modifier) calls submit
- submit: `ctx.resume(textarea.value)` then `resolveEffect(entry)`

### println
- `title`: `"Output"`
- `renderBody`: `<pre>` with value + copy button
- `renderFooter`: OK button
- submit: `ctx.resume(value)` then `resolveEffect(entry)`

### io-pick
- `title`: prompt text (from args)
- `renderBody`: list of items (clickable rows, highlighted on hover/focus)
- `renderFooter`: empty
- `onKeyDown`: ArrowUp/ArrowDown move focus; Enter submits focused item; Escape shows toast
- submit: `ctx.resume(selectedIndex)` then `resolveEffect(entry)`
- Focus state lives in closure (`focusedIndex`)

### io-confirm
- `title`: question text (from args)
- `renderBody`: Yes / No rows (same structure as io-pick)
- `renderFooter`: empty
- `onKeyDown`: same as pick; Enter submits focused item
- submit: `ctx.resume(bool)` then `resolveEffect(entry)`

### checkpoint
- `title`: `"Checkpoint"`
- `renderBody`: message + optional meta (JSON)
- `renderFooter`: Resume button
- submit: `ctx.next()` then `resolveEffect(entry)`

### unhandled / error effects
- `title`: `ctx.effectName`
- `renderBody`: effect name `<code>` + args rows (with copy buttons)
- `renderFooter`: depends on `inputMode` in closure:
  - `null` → "Ignore" + "Mock response…" buttons
  - `'resume'` → label + textarea + Confirm + Cancel
  - `'fail'` → label + textarea + Confirm + Cancel
- `inputMode` state lives in closure; changing it calls a `rerenderFooter()` helper
- Ignore: `ctx.next()`, resolveEffect
- Resume/Fail: parse input, call `ctx.resume(value)` or `ctx.fail(msg)`, resolveEffect

## Suspend / Halt

```typescript
export function suspendCurrentEffectHandler() {
  for (const entry of pendingEffects) {
    entry.ctx.suspend()
    entry.resolve()
  }
  pendingEffects = []
  currentEffectIndex = 0
  closeEffectPanel()
}

export function haltCurrentEffectHandler() {
  for (const entry of pendingEffects) {
    entry.ctx.halt()
    entry.resolve()
  }
  pendingEffects = []
  currentEffectIndex = 0
  closeEffectPanel()
}
```

## Keyboard Handling

Replace the big per-type if-chain with:

```typescript
if (pendingEffects.length > 0) {
  const entry = pendingEffects[currentEffectIndex]
  if (entry?.onKeyDown?.(evt)) return
  if (evt.key === 'Escape') {
    showToast(EFFECT_MODAL_ESCAPE_HINT, { severity: 'error' })
    return
  }
}
```

## What Gets Deleted

**shell.ts**: `#effect-modal`, `#checkpoint-modal`, `#io-pick-modal`, `#io-confirm-modal` and all their child elements.

**scripts.ts**:
- Globals: `pendingReadline`, `readlineInputEl`, `pendingIoPick`, `pendingIoConfirm`, `pendingPrintln`, `pendingCheckpoint`, `currentCheckpointSnapshot`, `currentEffectCtx`, `pendingEffectAction`
- Elements: all `effectModal*`, `ioPickModal*`, `ioConfirmModal*`, `checkpointModal*` getters
- Functions: `openCheckpointModal`, `closeCheckpointModal`, `resumeCheckpoint`, `dismissPrintln`, `submitReadline`, `cancelReadline`, `submitIoPick`, `submitIoConfirm`, `setPickFocus`, `setConfirmFocus`, `selectEffectAction`, `cancelEffectAction`, `confirmEffectAction`, `openEffectModal`, `closeEffectModal`, `advanceAfterHandle`, old `renderCurrentEffect`

**styles.css**: `.io-pick-list` and any styles only used by deleted modals.

## What Stays

- `snapshotModal` / `snapshotPanelContainer` / `pushPanel` / `createModalPanel` infrastructure
- Execution control bar (suspend/halt) — same behaviour, simpler trigger
- All per-handler UI design (readline still looks like readline)
- `navigateEffect(delta)` export name (used by breadcrumb sub-panel nav elsewhere if any)
- Existing CSS for `.effect-modal__nav`, `.effect-modal__counter`, `.modal-panel`, `.modal-panel__body`, `.modal-panel__footer`
