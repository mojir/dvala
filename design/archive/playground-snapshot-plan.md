# Playground Snapshot Support Plan

## Overview

Add support for suspended programs (continuations/snapshots) in the playground:

1. Render a "Program suspended" component in the Output panel when a program suspends
2. An "Open" button on that component opens a Snapshot modal with metadata and actions
3. Handle snapshot links in the URL — decode snapshot, pre-open modal, show component

---

## Phase 1 — Output Panel: Suspended Component

**File:** `playground-www/src/scripts.ts`

When `runResult.type === 'suspended'`, instead of silently outputting `null`, render a custom element in the output panel.

### Changes

**1.1 — Create `createSuspendedElement(snapshot: Snapshot): HTMLElement`**

Build a styled `<div>` in the output panel:

```
┌──────────────────────────────────┐
│  ⏸  Program suspended            │
│                                  │
│           [Open]                 │
└──────────────────────────────────┘
```

- Styled consistently with existing output panel theme (dark background, monospace)
- "Open" button calls `openSnapshotModal(snapshot)`
- Store `snapshot` reference on the element (or in a module-level variable keyed by run)

**1.2 — Wire into run handler**

In `scripts.ts` around line 936, handle `'suspended'`:

```typescript
if (runResult.type === 'suspended') {
  addOutputSeparator()
  addOutputElement(createSuspendedElement(runResult.snapshot))
  return
}
```

---

## Phase 2 — Snapshot Modal

**Files:** `docs/index.html` (HTML structure), `playground-www/src/scripts.ts` (logic)

Add a new `#snapshot-modal` alongside the existing `#effect-modal`.

### HTML Structure (`docs/index.html`)

```html
<div id="snapshot-modal" style="display:none; position:fixed; inset:0; z-index:200; ...">
  <div style="background:rgb(42 42 42); border-radius:...">
    <!-- Header -->
    <h3>Snapshot</h3>

    <!-- Metadata table -->
    <div id="snapshot-modal-meta">
      <!-- Populated dynamically: index, timestamp, runId, meta (if any) -->
    </div>

    <!-- Action buttons -->
    <div id="snapshot-modal-buttons">
      <button onclick="Playground.closeSnapshotModal()">Close</button>
      <button onclick="Playground.createSnapshotLink()">Create link</button>
      <button onclick="Playground.downloadSnapshot()">Download</button>
      <button onclick="Playground.resumeSnapshot()">Resume</button>
    </div>
  </div>
</div>
```

### Logic (`scripts.ts`)

**2.1 — Module-level state**

```typescript
let currentSnapshot: Snapshot | null = null
```

**2.2 — `openSnapshotModal(snapshot: Snapshot)`**

- Store snapshot in `currentSnapshot`
- Populate `#snapshot-modal-meta` with:
  - Index, timestamp (human-readable), runId, meta (pretty-printed JSON if present)
- `display: flex` the modal

**2.3 — `closeSnapshotModal()`**

- `display: none` the modal
- Clear `currentSnapshot`

**2.4 — `createSnapshotLink()`**

Encode the snapshot into a URL query parameter (similar to existing `share()`):

```typescript
function encodeSnapshot(snapshot: Snapshot): string {
  return btoa(encodeURIComponent(JSON.stringify(snapshot)))
}
```

Produce URL: `?snapshot=<encoded>`

Render the link into the output panel (same pattern as `share()`), and copy to clipboard.

**2.5 — `downloadSnapshot()`**

Trigger a JSON file download:

```typescript
const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
const url = URL.createObjectURL(blob)
// create <a download="snapshot.json"> and click it
```

**2.6 — `resumeSnapshot()`**

Call `dvalaRunner.runAsync(code, { snapshot: currentSnapshot, ... })` (the existing Dvala API supports resuming from a snapshot). Handle the result normally through the existing run pipeline. Close the modal.

> Note: verify the exact API for resuming from a snapshot in `createDvala.ts` / `effectTypes.ts`.

---

## Phase 3 — Snapshot URL Handling

**Files:** `playground-www/src/state.ts`, `playground-www/src/scripts.ts`

### Changes

**3.1 — `state.ts`: add `encodeSnapshot` / `decodeSnapshot`**

```typescript
export function encodeSnapshot(snapshot: Snapshot): string {
  return btoa(encodeURIComponent(JSON.stringify(snapshot)))
}

export function decodeSnapshot(encoded: string): Snapshot | null {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded))) as Snapshot
  } catch {
    return null
  }
}
```

**3.2 — `scripts.ts`: extend `getDataFromUrl()`**

Currently reads `?state=`. Extend to also read `?snapshot=`:

```typescript
function getDataFromUrl() {
  const params = new URLSearchParams(location.search)

  const state = params.get('state')
  if (state) { /* existing logic */ }

  const snapshotParam = params.get('snapshot')
  if (snapshotParam) {
    const snapshot = decodeSnapshot(snapshotParam)
    if (snapshot) {
      // 1. Clean up URL
      history.replaceState(null, '', location.pathname)
      // 2. Render the suspended component in the output panel
      addOutputElement(createSuspendedElement(snapshot))
      // 3. Auto-open the snapshot modal
      openSnapshotModal(snapshot)
    } else {
      appendOutput('Invalid snapshot link', 'error')
    }
  }
}
```

---

## File Change Summary

| File | Change |
|------|--------|
| `playground-www/src/scripts.ts` | `createSuspendedElement()`, `openSnapshotModal()`, `closeSnapshotModal()`, `createSnapshotLink()`, `downloadSnapshot()`, `resumeSnapshot()`, extend run handler, extend `getDataFromUrl()` |
| `playground-www/src/state.ts` | `encodeSnapshot()`, `decodeSnapshot()` |
| `docs/index.html` | Add `#snapshot-modal` HTML block |
| `playground-www/public/styles.css` | Styles for suspended component and snapshot modal (if not inline) |

---

## Open Questions / To Verify Before Implementing

1. **Resume API** — confirm the exact call signature for resuming from a snapshot in `createDvala.ts`. Is it `runAsync(code, { snapshot })` or something else?
2. **Snapshot serializability** — is the `Snapshot` object safe to `JSON.stringify` (i.e., is `continuation` serializable)? This is required for "Create link" and "Download".
3. **Modal source-of-truth** — the modal HTML currently lives inline in the generated `docs/index.html`. Decide whether to keep it there or move template generation into `scripts.ts` (creating elements dynamically), which would be more maintainable.
4. **`currentSnapshot` scoping** — if multiple suspended outputs can appear in a single session, the modal needs to bind to a specific snapshot, not a module-level variable. Consider passing the snapshot via closure or data attribute.
