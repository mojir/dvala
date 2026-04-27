# Playground: Monaco Editor + Tree View + LS Parity + CLI Launch

**Status:** Draft
**Created:** 2026-04-26

## Goal

Evolve the playground from a browser-only demo surface into a lightweight in-browser IDE for Dvala that can also be launched locally against a real project directory. Four phases, each independently shippable:

0. **Phase 0** — DX foundation: resolve engine imports to source files so HMR works end-to-end; establish "playground consumes engine via the public API" discipline.
1. **Phase 1** — Replace the current editor with Monaco; turn the flat file list in the left bar into a tree view; add tabs and the right + bottom debug panels.
2. **Phase 2** — Reach feature parity with the Dvala language service (diagnostics, hover, go-to-def, rename, etc.) inside the playground.
3. **Phase 3** — Ship a `dvala playground` CLI subcommand that opens the current working directory in the playground.

**Release surfaces.** The hosted playground at `mojir.github.io/dvala` receives Phases 0–2 as continuous releases. Phase 3 introduces a CLI-launched variant that runs the same bundle against a local FS — one codebase, two release surfaces (hosted + CLI-bundled).

---

## Background

### Current state

- Editor: a custom textarea-based editor with a `SyntaxOverlay` component painting tokens on top ([playground-www/src/SyntaxOverlay.ts](playground-www/src/SyntaxOverlay.ts)).
- File list: a flat list rendered in [playground-www/src/shell.ts](playground-www/src/shell.ts), backed by [playground-www/src/fileStorage.ts](playground-www/src/fileStorage.ts) (IndexedDB via [playground-www/src/idb.ts](playground-www/src/idb.ts)). No folders.
- Language service: lives in [src/languageService/](src/languageService/) — `WorkspaceIndex`, `SymbolTableBuilder`, `tokenScan`. Used today by the CLI and (partially) by the editor for highlighting only. Cross-file rename, hover, completions, go-to-def are not wired into the playground.
- CLI: [cli/src/cli.ts](cli/src/cli.ts) supports `run`, `doc`, `list`, `tokenize`, `parse`, `examples`. No `playground` subcommand.

### Why now

- The custom editor has accumulated friction: selection edge cases, IME issues, no multi-cursor, no minimap, no folding, no proper find-and-replace. Monaco gives us all of that for free and is purpose-built for the LSP-style features Phase 2 needs.
- Phase 2 (LS parity) has been blocked partly by editor limitations — Monaco's `languages.*` API is the canonical surface for hover/diagnostics/rename providers and removes a class of integration work.
- Phase 3 (`dvala playground`) closes the loop between the local CLI workflow and the playground. Once we have a tree view and LS parity, opening a real project becomes natural rather than a stretch goal.

### Related design docs

- [Language Service Next](2026-04-02_language-service-next.md) — cross-file rename + shared-LS extraction. This plan depends on the shared-LS track making the LS callable from a browser context.
- [Shared Language Services](2026-04-16_shared-language-services.md) — extraction strategy.

---

## Proposal

### Phase 0 — DX foundation

**Problem.** Today, any change to the playground or engine source requires a full `rolldown` rebundle (~seconds) plus a manual page reload before the playground reflects it. This kills the iteration loop on UI-heavy work — a constant tax on a project where the playground is the primary demo surface.

**Cause.** The playground is bundled by [rolldown.config.playground-www.mjs](../../rolldown.config.playground-www.mjs) into a single IIFE at `playground-www/build/playground.js`, then served as a static asset via `npx serve docs`. There is no dev server with HMR. (Engine imports already resolve directly to TS source — e.g. `import { createDvala } from '../../src/createDvala'` — so the issue isn't a stale dist intermediary; it's the absence of HMR.)

**Fix.** Migrate `playground-www` to Vite for real HMR. This is a meaningful migration, not a config tweak — scope it accordingly:

- Add `vite.config.ts` to `playground-www/`; introduce `index.html` as the entry. Dev server serves `playground-www/` directly during development; `pnpm run dev` becomes `vite` instead of `npx serve docs`.
- Port the rolldown plugins from [rolldown.plugins.mjs](../../rolldown.plugins.mjs) — `dvalaSourcePlugin`, `markdownSourcePlugin`, `bookChaptersPlugin` — to Vite plugin shape. Plugin APIs are compatible (rolldown is rollup-shaped, Vite uses rollup plugins natively for build), so most porting is mechanical.
- Reconcile with [playground-builder/](../../playground-builder/) — the builder generates the static site (book/reference/examples pages) around the playground bundle. Production build still produces the same `docs/` output; only dev mode changes.
- Verify HMR end-to-end: editing files under `playground-www/src/` *and* `src/` reflects without rebundle. Stack traces resolve to source.
- Budget: ~1–3 days, depending on builder-integration papercuts.

**Discipline: public API only.** While we're rewiring imports, audit what the playground currently reaches for and constrain it to the engine's public surface (`src/full.ts` / `src/index.ts`):

- **First choice:** if the playground needs something not currently exported, add it to the public API — an LSP server or future tool plugin probably needs it too.
- **Second choice:** if a symbol is genuinely tooling-only (AST viewer internals, snapshot inspection, internal type-system structures used by the type viewer), expose it via an explicit introspection entry point — e.g. `import { ... } from 'dvala/internal'` or `dvala/playground-api`. Documents that this surface is for tooling, not end users, and that breaking changes are allowed there. **Note for Phase 2:** the LS Web Worker is a future consumer of this same entry point. Keep DOM / browser-only code out of `dvala/internal` so the worker bundle stays clean. Revisit splitting into a narrower `dvala/lsp-worker` entry point only if Phase 2 evidence shows the bundle is genuinely too large.
- **Last resort:** deep import into engine internals. Mark with a comment explaining why; track as tech debt.

**Two distinct surfaces.** The engine exposes two consumer surfaces with different stability contracts:

- **Public API (`dvala`, via `src/full.ts` / `src/index.ts`):** what end users running Dvala consume. Stable shape, semver-ish (with sub-1.0 caveats). Small and curated.
- **Introspection API (`dvala/internal`):** what tooling consumes. **Expected to be large** — AST node types and walkers, continuation frame types, type-system internals, snapshot/replay machinery, evaluator hooks. Breaking changes allowed (consumers are us — playground, LS, future tools). The size is *intentional*: rich introspection is what makes the AST viewer, state-history inspector, snapshot panel, and language service possible. One surveyed introspection surface beats scattered deep imports.

When adding a new export, ask: *is this for end users running Dvala?* → public. *Is this for tooling that walks engine internals?* → internal. The discipline isn't "keep `internal` small" — it's "keep `internal` explicit, intentional, and DOM-free" (so the LS worker can consume it).

**Architecture note.** This stays bundled — single artifact, single deploy. We're not splitting the engine into a separately-published package. The two-surface discipline is a discipline, not a packaging boundary. (Sub-1.0 — locking in a published API contract is premature.)

**Execution-semantics spike.** While we're auditing, also spike the divergence (if any) between the playground's current execution path and `dvala run` on multi-file inputs. Hours of work — read the two entry points, run a few multi-file programs through both, write down the diff. The result determines whether Phase 1 needs an alignment step or not. We're not closing the gap in Phase 0 (that's Phase 1 if it exists) — we're answering "is there a gap?" before we commit to Phase 1's scope.

**Code-organization cleanup.** [scripts.ts](playground-www/src/scripts.ts) is currently **7,636 LOC** — 61% of the playground codebase in a single file. That's past the comfort zone for navigation, code review, and merge conflicts. Phase 1 will edit several different concerns inside this file simultaneously (tabs, panels, tree, editor mount, file ops), which would create a constant merge-hazard if the file isn't split first.

Phase 0 splits `scripts.ts` along concern boundaries. Likely seams (final list determined by reading the code):

- `playground-www/src/scripts/sidePanels.ts` — `showSideTab`, `syncCodePanelView`, side-panel icon/header sync
- `playground-www/src/scripts/contextEditor.ts` — `updateContextState`, `renderContextEntryList`, context UI
- `playground-www/src/scripts/files.ts` — `loadSavedFile`, `populateExplorerFileList`, `populateSavedFilesList`
- `playground-www/src/scripts/modals.ts` — `createModalPanel`, `pushPanel`, `popModal`, modal stack
- `playground-www/src/scripts/runActions.ts` — run / typecheck / format wiring
- `playground-www/src/scripts/keybindings.ts` — keyboard shortcut wiring
- `playground-www/src/scripts/init.ts` — entrypoint that wires everything together

This is a **mechanical refactor** — pure file-splitting + import fixing, no behavior changes. Splits should preserve git-blame where possible (use `git mv` for files that move whole; for cuts within a file, do them in one PR per concern so blame stays meaningful per chunk). No feature work in this step; the whole point is to give Phase 1 a workspace where edits don't all collide on one file.

**Reactivity primitive (`@vue/reactivity`).** The playground's UI code is heavily imperative — state writes cascade through 5–7 manual sync calls per event ([scripts.ts](playground-www/src/scripts.ts) has 77+ such calls). Phase 1 multiplies this (file tree, tabs, resizable panels, conflict prompts each need multi-region sync). Phase 0 adopts `@vue/reactivity` (the standalone, framework-agnostic Vue 3 reactivity package) as the playground's reactive primitive:

- **API consumed:** `ref<T>(initial)`, `effect(fn)`, `computed(fn)`. Optional later: `watch(source, cb)` if a real need surfaces.
- **Why a library over homemade:** the five edge cases that matter (active-effect stack, dep cleanup before re-run, re-entrancy guard, `Object.is` equality check, snapshot-subscribers-before-iterate) are exactly what `@vue/reactivity` has handled in production for years. ~6 KB minified is rounding error against Monaco's ~3 MB. Zero implementation cost; we get tested code instead of "200 LOC of custom reactive code that probably has a subtle bug."
- **Bundle/dep concerns:** `@vue/reactivity` is published independently of Vue itself (it's the lowest layer of Vue 3) and is very stable — major version churn is rare. Treeshakes well; we only use `ref`/`effect`/`computed`. No tooling impact (no Vue compiler, no SFCs).
- **Adoption pattern:** wrap [state.ts](playground-www/src/state.ts) so its existing `getState()` / `updateState()` exports stay as thin wrappers over `ref`-backed state; convert the worst existing cascades (`loadSavedFile`, `showSideTab`, `updateContextState`) to `effect` blocks; new Phase 1 code uses reactivity natively. Don't rewrite working pages (startPage, chapterPage, AST viewer) — they're already clean.

### Phase 1 — Monaco + tree view

**1a. Editor swap to Monaco**

- Add `monaco-editor` as a dependency in `playground-www/`. Use the AMD/ESM loader pattern that Vite supports.
- Register a Dvala language: `monaco.languages.register({ id: 'dvala' })`.
- Port the existing tokenizer to a `monaco.languages.TokensProvider` backed by `tokenizeSource` from [src/tooling.ts](../../src/tooling.ts) — single source of truth across highlighter, parser, and LS. Add line-resumable state to the tokenizer if needed for Monaco's incremental per-line tokenization. (Note: `tokenScan` is a separate let-binding scanner in the language service, not the tokenizer.)
- Define a Dvala theme that matches the current playground colors so the visual change is minimal.
- Replace the textarea + `SyntaxOverlay` mount in [playground-www/src/shell.ts](playground-www/src/shell.ts) with a Monaco instance. Wire the existing `state.ts` get/set hooks to `editor.getValue()` / `editor.setValue()` and `editor.onDidChangeModelContent`.
- Delete `SyntaxOverlay.ts` once nothing references it.
- Keep keybindings the user relies on (Ctrl/Cmd-Enter to run, etc.) — Monaco's `addCommand` covers this.

**1b. Tree view in the left bar**

- Extend the file model: today files are flat (`name: string`). Introduce a `path: string` field (e.g. `src/foo.dvala`) and treat `/` as the folder separator.
- Render the left bar as a tree by grouping paths on `/`. Folder nodes are derived (no separate folder records). Rename / drag-move updates paths; delete-folder cascades.
- Storage: bump the schema version in [playground-www/src/idb.ts](playground-www/src/idb.ts); the upgrade handler drops the old store (pre-1.0, ephemeral state — no migration).
- UX: collapse/expand with state persisted in localStorage (per workspace). New-file/new-folder actions in a context menu.

**1c. Layout**

```
+--------+-----------------------------+----------+
|  Tree  |  Tabs                       |  AST /   |
|        +-----------------------------+  outline |
|  ...   |                             |  (right  |
|        |  Editor                     |   side)  |
|        |                             |          |
|        +-----------------------------+----------+
|        |  Run output / state history / snapshots|
|        |  (bottom)                              |
+--------+----------------------------------------+
```

- **Left:** file tree (existing).
- **Center:** tab strip + Monaco editor.
- **Right:** structural / hierarchical views — AST viewer, outline. Vertical content, scroll-down — pairs naturally with reading code left-to-right. Toggleable.
- **Bottom:** linear / terminal-shaped views — run output, state history, snapshots, effects traces. Consulted reactively after running. Collapsible (Cmd/Ctrl-J).
- Both right and bottom panels are tabbed internally (so adding new debug surfaces later is just another tab inside the appropriate panel, not a new top-level region).
- Panel sizes persisted in localStorage per workspace.

**1d. Editor tabs**

- Tab strip above the Monaco instance. Each open file has a tab; clicking a tree node opens (or focuses) a tab.
- Tab order: insertion order. No drag-to-reorder in v1.
- Per-tab state: each tab maps to `(path → ITextModel + viewState)`; switching tabs swaps the model and restores view state (cursor, scroll, folds, selection).
- Modified indicator: dot on tabs with unsaved changes (mostly relevant in CLI mode where there's a debounce window before write-through completes).
- Persistence: open tab list + active tab persisted in localStorage per workspace.
- Keyboard shortcuts (via Monaco's `addCommand`): Cmd/Ctrl-W close active tab; Cmd/Ctrl-1..9 jump to tab N; Cmd/Ctrl-PgUp / Cmd/Ctrl-PgDn cycle. Middle-click closes a tab.
- Quick Open (Cmd/Ctrl-P): file picker via Monaco's `quickInput` API. Cheap to add alongside tabs and complements them for keyboard-first switching.

### Phase 2 — Language service parity

The language service today exposes `WorkspaceIndex` + symbol table primitives. Phase 2 wires those into Monaco providers. Order of delivery (each independently shippable):

1. **Diagnostics** — push parse errors and typecheck errors as `monaco.editor.setModelMarkers`. Already partially wired; tighten and run in a debounced worker.
2. **Hover** — `registerHoverProvider`: show inferred type, doc string for built-ins (from the `docs` property), and the source location for user-defined symbols.
3. **Go-to-definition** — `registerDefinitionProvider`: backed by `WorkspaceIndex` symbol resolution.
4. **Find-references** — `registerReferenceProvider`: same index.
5. **Rename** — `registerRenameProvider`: reuse the cross-file rename engine from the LS-next track ([2026-04-02_language-service-next.md](2026-04-02_language-service-next.md)).
6. **Completions** — `registerCompletionItemProvider`: in-scope symbols, built-in functions, module imports.
7. **Document formatting** — `registerDocumentFormattingEditProvider`: backed by `prettyPrint`.

**Architecture note.** The LS runs in a Web Worker from day one. Monaco providers in the main thread, LS logic in the worker, message-passing between them. The worker plumbing is greenfield — the current VSCode extension ([vscode-dvala/src/extension.ts](../../vscode-dvala/src/extension.ts), 1026 LOC) implements providers in-process, so there's no existing LSP-style protocol to reuse. The worker discipline (serializable I/O, no shared object identity) is what the shared-LS extraction track is establishing anyway, so the cost is paid in shared-LS regardless.

**Dependency.** Phase 2 has a **hard prerequisite** on shared-LS extraction ([2026-04-16_shared-language-services.md](2026-04-16_shared-language-services.md)) — the playground needs to consume LS APIs without dragging in CLI/Node-only code. The extraction track has been moved up in priority and is actively driven so it lands before Phase 2 starts.

**Risk: Monaco's provider model may not fit every Dvala feature.** Monaco's `languages.*` API is shaped around mainstream languages. Dvala-specific introspection — refinement-type evidence trails, effect handler resolution paths, snapshot/replay diffing, suspended-continuation state — may not map cleanly to `registerHoverProvider` / `setModelMarkers` / `registerCodeLensProvider` / etc. **Mitigation:** Phase 2 ships LS parity for what fits; features that don't fit move to Phase 2.5 and live in the right or bottom panels we already built in Phase 1 (right panel for structural views: types, refinements, AST detail; bottom panel for traces, snapshots, effect resolution timelines). The layout shell *is* the escape hatch — we don't need to invent new UI surfaces, just populate them.

### Phase 3 — `dvala playground` CLI

- New subcommand in [cli/src/cli.ts](cli/src/cli.ts): `dvala playground [path]` (default `path = .`).
- Behavior: spin up a small local HTTP server (e.g. `http.createServer` — no extra deps), serve the built playground bundle, and expose the project directory via a small file-system bridge endpoint (`GET /fs/list`, `GET /fs/read`, `PUT /fs/write`). Auto-open the user's browser to `http://127.0.0.1:<port>/?token=<hex>`.
- The playground detects "local mode" via a query param or runtime feature flag and switches its `FileBackend` from `IndexedDBBackend` to `BridgeBackend`. The tree view and editor are unchanged.
- Watcher: use `fs.watch` to push change events through SSE so external edits show up live.
- Security: bind to `127.0.0.1` only; reject any path outside the requested root; require the random per-session token (header) and a matching `Origin` on every bridge request (defeats DNS rebinding).
- Build: the CLI ships the playground bundle as a static asset (added to `dist/` on build).

**Persistence model (CLI mode).** Direct write-through, debounced ~300ms. Disk is the source of truth — `BridgeBackend` writes the buffer through to FS on each debounced commit; no IndexedDB cache layer in CLI mode. "What you see is what's on disk," matching the contract a user expects when they open their real project.

**External-edit conflicts.** The watcher pushes disk changes back to Monaco. For files with no pending unflushed edits, reload silently. For files with pending edits, show an inline "file changed on disk — use disk / keep mine" prompt (track per-file `lastSyncedHash` on the editor side).

**Project files vs. scratch files.** In CLI mode the tree shows two roots: the project (real FS via the bridge) and a "Scratch" section (browser IndexedDB, ephemeral per-workspace). Scratch files can import project files (`import "./utils.dvala"`); project files cannot import scratch files. The import resolver enforces this asymmetry — scratch is visible *into* the project graph but not *from* it. Concrete syntax for scratch imports (e.g. `scratch:foo` prefix) is a Phase 3 detail to settle during implementation. Web-only mode has no project, so the distinction doesn't apply — all files are equal. **Scratch files have no CLI execution path** — they exist only inside the playground; the execution-equivalence guarantee with `dvala run` applies only to project files.

**Execution semantics.** The playground drives execution through `dvala run` semantics from day one, even in single-file mode. Same evaluator, same module loader, same import resolver as the CLI. Eliminates the "playground silently runs your code differently than `dvala run` would" failure mode by construction.

---

## Open Questions

- ~~**Monaco bundle size.**~~ **Decided 2026-04-26: bundle Monaco into the main `dvala` package.** ~3 MB is acceptable; splitting into a separate `@dvala/playground` package is cheap to do later if install-size complaints arrive (the playground is already its own workspace, no programmatic API to preserve).
- ~~**Token provider strategy.**~~ **Decided 2026-04-26 (corrected 2026-04-27): `TokensProvider` backed by `tokenizeSource` from [src/tooling.ts](../../src/tooling.ts).** Single source of truth between highlighter, parser, and language service. The original decision said `tokenScan`, but that's the let-binding scanner in the language service, not the tokenizer — corrected here. Risk to watch: `tokenizeSource` may need line-resumable state for Monaco's incremental per-line tokenization; if perf becomes a problem, address it then rather than preemptively falling back to Monarch.
- ~~**File path migration.**~~ **Decided 2026-04-26: wipe silently.** Pre-1.0 — playground state is treated as ephemeral. Bump the IndexedDB schema in `playground-www/src/idb.ts` and let the upgrade handler drop the old store. No banner, no migration code.
- ~~**LS in a worker.**~~ **Decided 2026-04-26: worker from day one.** The LS already runs out-of-process for the VSCode extension, so the message protocol exists; reusing it in the playground costs little and avoids a future retrofit across every Monaco provider. Budget half a day for Vite worker bundling papercuts (Monaco's own workers, source maps across the boundary).
- ~~**CLI mode auth model.**~~ **Decided 2026-04-26: token + Origin check.** CLI generates a random token at startup, prints `http://127.0.0.1:<port>/?token=<hex>`, auto-opens the browser. Every bridge request must include the token (header) AND have a matching `Origin` (defeats DNS rebinding). Token rotates per CLI invocation; no persistence. Standard Jupyter-style pattern — familiar to users, ceiling of what's reasonable for a local dev tool.
- ~~**Multi-file vs. single-file.**~~ **Decided 2026-04-26: drive the playground through `dvala run` semantics from day one (option D).** Same evaluator / module loader / import resolver as the CLI, even for single-file execution. Audit + close any semantics gap before Phase 1 ships rather than carrying it as a footgun. **Scratch files (CLI mode):** scratch imports project (one-way visibility); project cannot import scratch. Same evaluator, just restricted import-graph reachability — keeps the "if it runs in the playground, it runs via `dvala run`" invariant for project files intact.
- ~~**Persistence model (CLI mode).**~~ **Decided 2026-04-26: direct write-through, debounced.** Edits → ~300ms debounce → bridge → disk. Disk is the source of truth; no IndexedDB cache layer in CLI mode. Web-only mode keeps IndexedDB as the source of truth (no disk to sync). Two `FileBackend` implementations, no cross-mode sync logic. External-edit conflicts handled via per-file `lastSyncedHash` + inline reload prompt.
- ~~**Phase 0 build-system direction.**~~ **Decided 2026-04-27: migrate `playground-www` to Vite for real HMR.** Original plan misdiagnosed the problem (assumed Vite was already in use). Real change: drop rolldown for the playground's dev path, port the three rolldown plugins to Vite plugin shape, restructure to a Vite project layout. ~1–3 days of work. Production build still emits the same `docs/` output. Synergy with Phase 2's worker bundling (Monaco workers, LS worker) — both are Vite-shaped concerns, so doing the migration in Phase 0 amortizes the build-config debugging across both phases.
- ~~**Reactive primitive — build vs. buy.**~~ **Decided 2026-04-27: use `@vue/reactivity`.** Battle-tested implementation of exactly the API we need (`ref`, `effect`, `computed`); ~6 KB minified is rounding error against Monaco's ~3 MB. The five reactive-edge-case bugs that would cost a homemade implementation an afternoon each are handled by `@vue/reactivity` already. Migration out is symmetric (~1 hour of import-rewriting) if we ever want to.

### Open before implementation

These need answers before Phase 0 starts. The user is taking the shared-LS extraction plan ([2026-04-16_shared-language-services.md](2026-04-16_shared-language-services.md)) first; some of these may resolve naturally during that work.

- **Phase 2 / shared-LS sequencing.** Phase 2 is hard-blocked on shared-LS extraction, which is unstarted (`src/shared/` doesn't exist yet). Sequence options: (a) strictly serial — Phase 0 → Phase 1 → shared-LS → Phase 2; (b) parallel — shared-LS as an independent track alongside Phase 0+1; (c) roll shared-LS extraction into Phase 1's scope. Decision deferred until shared-LS work begins and its pace is known.
- **Two-surface API discipline (`dvala/internal`).** The plan describes a `dvala` (public) vs. `dvala/internal` (introspection) split. In a single-package monorepo where the playground imports via `'../../src/...'` paths today, this is a *discipline*, not a packaging boundary. Question: do we add a real `src/internal.ts` re-export module to make the discipline visible (and grep-able), or document it as a code-review convention only? Decide during the Phase 0 import audit (step 3) once we see how large the actual deep-import surface is.
- **`scripts.ts` split — single PR or per-concern slices.** The plan calls for one PR per concern (sidePanels, contextEditor, files, modals, runActions, keybindings, init) for git-blame preservation. That's ~6 PRs of pure mechanical refactor. Alternative: one big mechanical PR. Trade-off: blame granularity vs. review overhead. Lean per-concern, but worth confirming when we get there.
- ~~**Execution-semantics spike (Phase 0 step 5) — keep or drop.**~~ **Resolved 2026-04-27: divergence found, Phase 1 step 17 is NOT a no-op.** The 30-minute read of [playground-www/src/scripts.ts](../../playground-www/src/scripts.ts) and [cli/src/cli.ts](../../cli/src/cli.ts) found:
  - **Load-bearing divergence:** the playground does not pass a `fileResolver` to `createDvala` (scripts.ts ~L100). Multi-file imports therefore fail in the playground but work in `dvala run` (cli.ts:208–220, 231). Phase 1 step 17 must wire the playground's `FileBackend` into `createDvala` as a `fileResolver`.
  - **Intentional differences (not gaps to close):** CLI adds `cliModules` (fs + proc; cli.ts:230) on top of `allBuiltinModules`; playground only has `allBuiltinModules`. These modules are inherently Node-only and should remain CLI-exclusive.
  - **Cosmetic differences:** CLI uses sync `runner.run()` and inline `typecheck: !noCheck`; playground uses async `runAsync` (needed for suspendable evaluation / time travel) and a separate `typecheckAndReport()` call site. Same typecheck logic, different invocation point. Both produce equivalent diagnostics for non-deferred-effect code.

  Step 5 in the implementation plan is now "documented" rather than "to do." The follow-on alignment work is captured in step 17 below.
- **`FileBackend` interface shape.** Phase 1 step 15 introduces `FileBackend` with read/write/list/watch. Phase 3 step 40 adds the scratch namespace (project files vs. browser-only scratch files in CLI mode). Question: does `FileBackend` model the scratch/project split natively (two backends in CLI mode, one root each), or is "scratch" a layer above two `FileBackend` instances? Resolves naturally when we design the interface in Phase 1 — flagging here because it affects Phase 3 step 40's scope.

### Non-goals (called out so they don't sneak back in)

- **Hosted-to-localhost mode (`https://mojir.github.io/dvala` talking to a local bridge).** Decided 2026-04-26: not in Phase 3. The Origin-check defense relies on same-origin between bundle and bridge; opening that to a fixed external origin trades a meaningful security boundary for "always up-to-date convenience." Possible future opt-in (`dvala playground --hosted`) if there's demand and the protocol stabilizes — but never the default.
- **Electron app.** Decided 2026-04-26: not pursuing. The product is "a playground + a CLI that opens it locally," not "our own desktop IDE." Going Electron means becoming a desktop-app vendor (signing, notarization, auto-update, cross-platform packaging) and competing with VSCode (which is itself Electron — anything we'd build there, we can ship as a VSCode extension). Bundle goes from ~3 MB Monaco worry to ~150 MB per platform. PWA install is the lighter answer if "feels like a real app" matters — revisit only if that surfaces as a real ask.

---

## Implementation Plan

### Phase 0 — DX foundation

1. Migrate `playground-www` to Vite. Add `playground-www/vite.config.ts` and `index.html`; replace `npx serve docs` with `vite` for `pnpm run dev`. Port the three rolldown plugins from [rolldown.plugins.mjs](../../rolldown.plugins.mjs) (`dvalaSourcePlugin`, `markdownSourcePlugin`, `bookChaptersPlugin`) to Vite plugin shape. Reconcile with [playground-builder/](../../playground-builder/) — production build still emits the same `docs/` output; only dev mode changes.
2. Verify HMR works end-to-end: edit a file under `playground-www/src/` *and* `src/`, confirm the playground reflects it without rebundling. Confirm stack traces resolve to source, not bundled output.
3. Audit playground imports: catalog every place the playground reaches past `src/full.ts` / `src/index.ts` into engine internals.
4. For each deep import, decide: (a) promote to public API, (b) expose via explicit introspection entry point (`dvala/internal` or similar), or (c) keep as deep import with a comment explaining why (tracked as tech debt). **Time-boxed:** for imports where the decision is painful or non-obvious, mark with `// FIXME: deep import, see Phase 0 audit` and defer to a follow-up PR. Phase 0 ships when HMR works + the audit is documented, not when every import is perfect.
5. ~~Execution-semantics spike~~ — **done 2026-04-27.** Findings documented in the Open Questions section: load-bearing divergence is the playground's missing `fileResolver`, which Phase 1 step 17 will close by wiring `FileBackend` into `createDvala`.
6. Split [scripts.ts](playground-www/src/scripts.ts) (7,636 LOC) into per-concern files under `playground-www/src/scripts/`. Likely seams (finalize after reading): `sidePanels.ts`, `contextEditor.ts`, `files.ts`, `modals.ts`, `runActions.ts`, `keybindings.ts`, `init.ts`. **Pure mechanical refactor — no behavior changes.** Run the existing test suite + e2e to confirm no regressions. Use one PR per concern slice so git-blame stays meaningful.
7. Add `@vue/reactivity` as a dependency. Create a thin re-export at `playground-www/src/lib/reactive.ts` (`export { ref, effect, computed } from '@vue/reactivity'`) so consumers import from one playground-local path — leaves the door open for swapping the implementation later without touching call sites.
8. Wrap [state.ts](playground-www/src/state.ts) in reactive primitives — replace the plain object with a reactive equivalent. Keep the existing `getState()` / `updateState()` exports as thin wrappers so existing call sites keep working unchanged. New consumers subscribe via `effect` instead of polling `getState()`.
9. Convert the three worst existing cascades as proof-of-concept: `loadSavedFile` (7 manual updates → reactive), `showSideTab` (11+ DOM mutations → reactive), `updateContextState` (5 cascade calls → reactive). Each becomes ~3 lines of state writes + one `effect` block per affected DOM region. Now living in the split files from step 6.
10. Update `CLAUDE.md` Playground Architecture section to document (a) the Vite dev path and how engine imports are consumed, (b) the reactive primitive at `playground-www/src/lib/reactive.ts` (re-exporting `@vue/reactivity`) — what it is and when to use `ref` vs. `effect` vs. `computed`, and (c) the `playground-www/src/scripts/` per-concern layout.

### Phase 1 — Monaco + tree view

11. Add `monaco-editor` to `playground-www/package.json`; configure Vite for Monaco workers.
12. Write a `TokensProvider` backed by `tokenScan`. If `tokenScan` lacks line-resumable state, add it (single source of truth between highlighter, parser, and LS).
13. Define a Dvala theme matching current colors.
14. Introduce `path` on the file model; bump IndexedDB schema (upgrade handler drops the old store — no migration).
15. Introduce a `FileBackend` interface (read / write / list / watch — keep tiny); the web-only mode uses an `IndexedDBBackend` implementation. (Phase 3 adds `BridgeBackend`.)
16. Swap the editor mount in `shell.ts`; wire state hooks (through `FileBackend`, not directly to IndexedDB) and keybindings; delete `SyntaxOverlay.ts`.
17. Close any execution-semantics divergence found in Phase 0 step 5: align the playground's run path with `dvala run` (same evaluator, module loader, import resolver). No-op if Phase 0 found no divergence.
18. Render the left bar as a tree; add new-file / new-folder / rename / delete with path updates.
19. Persist expand/collapse state per workspace.
20. Layout shell: introduce right panel (AST / outline) and bottom panel (run output / state history / snapshots), both internally tabbed and collapsible. Migrate existing debug surfaces into the appropriate panel. Persist panel sizes + collapsed state in localStorage.
21. Editor tabs: tab strip above Monaco; per-tab `(model + viewState)`; insertion-order; modified-dot indicator; localStorage persistence of open tabs + active tab; keyboard shortcuts (Cmd/Ctrl-W, Cmd/Ctrl-1..9, Cmd/Ctrl-PgUp/PgDn); middle-click close.
22. Quick Open (Cmd/Ctrl-P) via Monaco's `quickInput` API.
23. e2e: cover editor swap, tree operations, tab switching/persistence, panel toggling, and multi-file import execution parity with `dvala run`.

### Phase 2 — LS parity

24. Audit which LS features are already callable from the browser; list the import-graph blockers (Node-only deps, etc.).
25. Stand up the worker: Vite `?worker` import, Monaco's own workers configured, LS message protocol (reused from VSCode extension) wired across the boundary. Confirm dev + prod bundles both load the worker correctly.
26. Wire diagnostics first — debounced, runs after parse/typecheck, pushed via `setModelMarkers`.
27. Hover provider (built-in docs + inferred types).
28. Go-to-definition + find-references (backed by `WorkspaceIndex`).
29. Rename provider (depends on LS-next cross-file rename).
30. Completions provider.
31. Document formatter.
32. Performance pass: profile on a 50-file workspace; tune debouncing and message-batching as needed.

### Phase 3 — CLI

33. New `dvala playground` subcommand: arg parsing, default path, port selection.
34. Static bundle serving (the playground build output as an asset).
35. File-system bridge: `list / read / write`, scoped to the requested root with path-traversal guards.
36. Implement `BridgeBackend` (the second `FileBackend` introduced in step 15): debounced ~300ms write-through to the bridge.
37. SSE-based file watcher; playground subscribes and reloads files with no pending edits.
38. External-edit conflict handling: track per-file `lastSyncedHash`; show inline "use disk / keep mine" prompt when the watcher fires for a file with unflushed local edits.
39. Playground "local mode" flag: swap the active `FileBackend` to `BridgeBackend` based on query param.
40. Scratch namespace: add a "Scratch" tree root in CLI mode (backed by `IndexedDBBackend`); update the import resolver to enforce one-way visibility (scratch → project allowed; project → scratch rejected).
41. Auth: per-session random token (header) + Origin check on every bridge request. Token rotates per CLI invocation; CLI auto-opens the browser to the tokenised URL.
42. Bundle-size check: confirm the added playground assets don't bloat the CLI tarball unacceptably.
43. Docs: README section + `dvala playground --help`.

---

## Phasing & Dependencies

- Phase 0 has no dependencies and is small (config + audit). Ship first — every subsequent phase benefits from the faster iteration loop.
- Phase 1 depends on Phase 0 only via DX (not strictly blocking, but Phase 1's audit of execution semantics + introducing the `FileBackend` interface is dramatically easier with HMR working). Otherwise Phase 1 has no external dependencies.
- Phase 2 has a hard prerequisite: shared-LS extraction must land first. Extraction has been moved up in priority to ensure it doesn't gate Phase 2.
- Phase 3 depends on Phase 1 (tree view + multi-file + tabs + layout) and is much more useful with Phase 2 (LS features against a real project).
