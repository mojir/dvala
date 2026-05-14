---
description: Playground architecture conventions. Use when editing apps/playground-www/** or when working on playground features.
applyTo: "apps/playground-www/**"
---

### Naming conventions (canonical — use these terms in code, comments, UI, and design docs)

- **`.dvala-playground/`** — reserved folder at project root. Holds all workspace-level playground state. CLI mode persists it on disk via the bridge backend; web-only mode persists it as a virtual folder in IndexedDB. **Hidden from the file tree** by a tree-rendering rule. `dvala run` ignores this folder entirely — its contents are playground-only and never part of deployable code.
- **scratch buffer** — `.dvala-playground/scratch.dvala`. Pinned to the top of the file tree as a virtual entry labeled `<scratch>`. Tab closable; buffer undeletable.
- **handlers buffer** — `.dvala-playground/handlers.dvala`. Pinned second-from-top in the file tree as a virtual entry labeled `<handlers>`. Holds Dvala-source `let X = handler @tag(...) -> ... end` declarations; the runtime auto-wraps every run with these as outermost effect handlers (boundary handlers). Language-level handlers in user code take precedence within their `do with` scopes.
- **workspace files** — every file outside `.dvala-playground/`. IndexedDB-backed in web mode; disk-backed via the bridge in CLI mode. Same interface in both.
- **snapshots** — JSON files in `.dvala-playground/snapshots/<id>.json`. Discovered via the curated **Snapshots left-panel tab** (not the file tree). Click → opens as an editor-area tab with a UI/Tree/Raw view switcher. Read-only.
- **Imports.** Any `import` that resolves into `.dvala-playground/` is rejected — the folder is playground state, not part of the import graph. Files inside `.dvala-playground/` can import workspace files freely, but scratch / handlers resolve relative paths from a virtual workspace root, so the user-facing forms are `./utils.dvala` or `/utils.dvala`, not `../utils.dvala`. The import resolver enforces this centrally — don't add ad-hoc checks at consumer sites.
- Avoid the older terms **"saved files"**, **"project files"**, **"bindings"** (the bindings UI was removed in Phase 1.5), and **"context" as a left-panel tab** in code paths.

### Top-level files

- `playground-www/src/renderCodeBlock.ts` — unified code block renderer (syntax highlighting, execution, "Use in playground" + copy buttons)
- `playground-www/src/renderDvalaMarkdown.ts` — shared markdown renderer using `renderCodeBlock` for fenced dvala blocks
- `playground-www/src/featureCards/*.md` — feature card content (rendered in modals from start page)
- `playground-www/src/components/startPage.ts` — start page with feature cards (about page merged in)
- `playground-www/src/components/chapterPage.ts` — chapter pages with sticky header (title, prev/next, TOC dropdown)
- `playground-www/src/scripts.ts` — main entrypoint and orchestrator (boot wiring, run/effect handlers, context editor, keybindings, navigation, history). Currently ~6.4k LOC; per-concern modules are being progressively extracted from here.
- `playground-www/src/scripts/*.ts` — per-concern modules extracted from `scripts.ts`. See "Per-concern layout" below.
- `playground-www/src/lib/reactive.ts` — reactive primitive re-exports from `@vue/reactivity`. See "Reactive primitive" below.
- `playground-www/src/playground.ts` — public API barrel (`export * from './scripts'` plus a `navigate` re-export from `./router`); produces the global `Playground.*` object.

### Dev path (Vite + HMR)

`pnpm run dev` runs `vite` against `playground-www/index.html`. Engine imports under `src/` resolve directly to TypeScript source — edits to either `playground-www/src/` or `src/` reflect via HMR without a full rebundle. Production build still emits the static site to `docs/` via the playground-builder + rolldown pipeline (`pnpm run build`).

### Per-concern layout (`playground-www/src/scripts/`)

Phase 0 of the playground seam-split (design [2026-04-26_playground-monaco-tree-ls-cli.md](design/active/2026-04-26_playground-monaco-tree-ls-cli.md)) extracted these modules:

- `playgroundState.ts` — shared mutable state singleton (`state`). Cross-concern `let`s that used to live module-level in `scripts.ts` (modal stack, snapshot keys, timer handles, etc.) all migrate here so peer modules can read/write without circular imports.
- `elements.ts` — DOM element registry (lazy `document.getElementById` getters). All other modules import `elements.foo` instead of querying directly.
- `modals.ts` — modal panel construction, modal stack management, info-dialog flow, toast notifications. Owns `createModalPanel`, `pushPanel`, `popModal`, `closeAllModals`, `showToast`, `showInfoModal`, `pushCheckpointPanel`, `slideBackSnapshotModal`.
- `sidePanels.ts` — left-side tab switching (files / snapshots / context), code-panel sync, URL state sync. Owns `showSideTab`, `getCurrentSideTab`, `syncCodePanelView`, `syncPlaygroundUrlState`, `populateSideSnapshotsList`.
- `files.ts` — file explorer + scratch buffer + auto-save. Owns `loadSavedFile`, `renameFile`, `shareFile`, `deleteSavedFile`, `duplicateFile`, `saveAs`, file-import/export modal, scratch open/save/clear, `populateExplorerFileList`, `scheduleAutoSave`, `flushPendingAutoSave`.

Modules import peers directly (e.g. `modals.ts` ← `elements.ts`, `playgroundState.ts`). They also import a handful of helpers from `scripts.ts` via `import { foo } from '../scripts'` — this creates a deliberate circular dependency that ESM tolerates because the access happens at runtime inside function bodies, not at module init. Eventual barrel-conversion of `scripts.ts` will undo that pattern.

### Reactive primitive (`playground-www/src/lib/reactive.ts`)

Re-exports from [`@vue/reactivity`](https://www.npmjs.com/package/@vue/reactivity) — the standalone, framework-agnostic Vue 3 reactivity package (no compiler, no SFCs, ~6 KB minified). Always import from `./lib/reactive` (not `@vue/reactivity` directly) so the implementation can be swapped without touching call sites.

The state singleton in `playground-www/src/state.ts` (the persisted key/value store, distinct from `scripts/playgroundState.ts` which holds in-memory cross-concern UI state) is wrapped with `reactive(...)`, so reads inside an `effect()` block would automatically track which keys they depend on, and writes trigger dependent effects to re-run. Existing `getState` / `saveState` / `updateState` keep working unchanged.

**Currently exported from `lib/reactive.ts`:** `reactive` only.

**Planned (add when first consumer needs them):**
- `ref(initialValue)` — single reactive value. Read/write via `.value`.
- `effect(fn)` — run `fn` once now, then re-run whenever any reactive value it read changes. Returns a stop handle.
- `computed(fn)` — derived reactive value, lazily recomputed when dependencies change.

When you need one of the planned exports, add it to `lib/reactive.ts` in the same PR that introduces the first consumer.

New Phase 1+ code is expected to use this reactively from the start; the legacy imperative cascades in `scripts.ts` are not being retrofitted (they'll mostly be rewritten by the Monaco editor swap anyway).

### Modal system (`createModalPanel` in `scripts/modals.ts`)

```typescript
createModalPanel({
  title?, icon?, size?: 'small' | 'medium' | 'large',
  markdown?, hamburgerItems?, footerActions?, noClose?, onClose?
})
```

Sizes: small=480px, medium=800px, large=1200px. If `markdown` is provided, body is auto-rendered. If `footerActions` provided, footer buttons are auto-created. Snapshot panel uses `createModalPanel({ size: 'large' })`.
