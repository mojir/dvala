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
- [Shared Language Services](../archive/2026-04-16_shared-language-services.md) — extraction strategy. Phase 1 + 2 of the extraction shipped (`src/shared/` exists with `typeDisplay`, `diagnosticBuilder`, `callContext`, `completionBuilder`); doc archived.

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

### Phase 1.5 — Playground state model overhaul

Phase 1 left the playground's state model fragmented: scratch as a sentinel string with bespoke persistence keys, effect handlers as JS functions stored in a "Context" UI, snapshots as in-memory objects inspected via modals, bindings as a half-used UI feature. With Phase 2's LS worker about to operate on path-addressed files and Phase 3 turning the tree into an IDE pointed at on-disk projects, the fragmentation is going to compound. Phase 1.5 reshapes the entire state model into one uniform architecture: **everything the playground persists is a file in a known location**.

**The reserved playground folder.**

All workspace-level playground state lives under a single hidden folder at the project root: `.dvala-playground/`. CLI mode persists this on disk via the bridge backend; web-only mode persists it in IndexedDB as a virtual folder. The folder is hidden from the file tree — users see only its specially-pinned entries.

Initial contents:
- `.dvala-playground/scratch.dvala` — the scratch buffer (Dvala source).
- `.dvala-playground/handlers.dvala` — boundary effect handlers (Dvala source; auto-wrapped around runs).
- `.dvala-playground/snapshots/<id>.json` — saved snapshots (JSON state captures).

`.gitignore` policy is left to the user; default `dvala init` doesn't ignore the folder so projects can commit their handler setup if they want collaborators to share it.

**Naming convention (becomes canonical, added to CLAUDE.md).**

- **scratch buffer** — `.dvala-playground/scratch.dvala`. Pinned at the top of the file tree as a virtual entry labeled `<scratch>` (first position). Tab is closable; the buffer itself is undeletable. Editing is Monaco-on-Dvala-source like any file.
- **handlers buffer** — `.dvala-playground/handlers.dvala`. Pinned second-from-top in the file tree as a virtual entry labeled `<handlers>`. Same UI shape as scratch.
- **workspace files** — every other file in the project (everything outside `.dvala-playground/`). IndexedDB in web mode, disk via the bridge in CLI mode. Same interface in both.
- **snapshots** — JSON files in `.dvala-playground/snapshots/`; opened as editor-area tabs with a UI/Tree/Raw view switcher. Discovered via the curated Snapshots left-panel tab.
- Avoid the older terms **"saved files"** and **"project files"** in code paths that aren't CLI-specific. Both are subsumed by **workspace files**.

**Boundary effect handlers (Dvala-defined, auto-wrapped).**

Today: effect handlers are JS functions stored alongside bindings in the "Context" UI. This is three different kinds of wart that each get worse over time: two-language playground (JS in a Dvala learning surface), no LS support on handler bodies, and a doomed match-the-real-host story once Dvala targets non-JS hosts (KMP roadmap).

Phase 1.5 retires this entirely. The new model:
- `.dvala-playground/handlers.dvala` is a regular Dvala source file. Each top-level `let X = handler @tag(...) -> ... end` declaration registers a boundary handler.
- The runtime auto-wraps the user's code with `do with X; do with Y; ... end` for each declaration in the file before evaluation.
- Precedence: language-level handlers in the user's code take priority within their `do with` scope; boundary handlers catch what falls through (outermost wrap).
- LS treats `handlers.dvala` as plain Dvala source. Diagnostics, hover, completions, and refinement-type checking all work without any special-casing of the handler form.
- Authoring happens in the Monaco tab opened from the `<handlers>` pinned buffer entry — no parallel "context editor" UI, no JS editor anywhere in the playground.

**Bindings UI removed entirely.** The "Context" left-panel tab and its bindings sub-section are dropped. Initial scope for runs is empty unless the user's code (or boundary handlers) provides values. Migration: silent wipe of stored bindings (pre-1.0).

**CLI execution parity (clarification).** `.dvala-playground/` is a playground-only concept. `dvala run` ignores the folder entirely — production runs use real host handlers (or surface "unhandled effect" errors when the host doesn't support an effect), never the playground's mock handlers. The "playground runs same as `dvala run`" guarantee applies to workspace files, not to playground state. This preserves the production-equivalence story for deployable code while keeping mock setups out of real runs.

**Tree rendering rules.**
- Walk the workspace.
- Skip the `.dvala-playground/` folder when listing workspace contents.
- Pin `<scratch>` and `<handlers>` virtual entries at the top of the tree (mapping to the corresponding files inside the folder).
- Snapshot files inside `.dvala-playground/snapshots/` are not rendered in the tree; they're exposed via the Snapshots left-panel tab as a curated list.

**Imports.**
- Any `import` that resolves into `.dvala-playground/` is rejected — regardless of where the import originates. Rejected by the import resolver with a clear error ("playground state, not part of the deployable project — move the file outside `.dvala-playground/` to make it importable"). Tightened from the original "outside-only" wording during 23g implementation; see step 23g below for the rationale.
- Files inside `.dvala-playground/` can import workspace files freely. Scratch and handlers can pull helpers from the project as needed.

**Save As modal (reusable).**

- Filename input + folder picker (with inline folder creation) + collision check.
- First consumer: scratch buffer → "save copy to workspace path" flow (the natural escape hatch when scratch grows into something worth keeping).
- Reused wherever else a "save to a path" prompt fits — e.g. duplicating a workspace file into a different folder.

**Snapshots — JSON file model.**

Snapshots stop being in-memory objects with modal-based inspection. Each captured snapshot is a JSON file in `.dvala-playground/snapshots/<id>.json`. The id is timestamp-based with a short suffix to disambiguate near-simultaneous saves.

- The Snapshots left-panel tab stays as a curated list — sorted by time, with names, with delete gestures. It's a nicer view onto the same JSON files.
- Clicking a snapshot opens its JSON file as an editor-area tab — same flow as Files → click → tab.
- The tab has a **view switcher** in the header: **UI** (custom snapshot inspector — source view at the suspension point, scope, suspended computation, resume controls), **Tree** (interactive JSON tree), **Raw** (Monaco JSON with syntax highlighting). Default view: UI. View choice persisted per-tab in localStorage.
- Tabs are read-only. Editing the underlying JSON would require a power-user gesture; not in v1.
- The Tree + Raw views are file-type-specific to JSON — generalizable to any future workspace JSON file. The UI view is snapshot-specific.
- Modal-based snapshot inspection is retired entirely.
- Lifecycle: deleting a snapshot from the left-panel list deletes the JSON file → any open snapshot tab auto-closes (standard file-tab lifecycle).

**Left-panel sub-tabs after Phase 1.5.** Three tabs, simplified from today's *files / snapshots / context*:
- **Files** — the workspace tree, with `<scratch>` and `<handlers>` pinned at top.
- **Snapshots** — curated list of snapshot JSON files.
- The legacy **Context** tab is removed (Bindings UI gone; effect handlers moved to the `<handlers>` buffer).

**Legacy modal cleanup.**

Phase 1's right-panel multi-tool (Tokens / AST / CST / Doc Tree) replaced most modal-based output viewers; the snapshot tab-based view above retires the snapshot modal. Audit what remains: delete modals whose function is fully covered by the right panel or by the new snapshot tabs; keep any that serve a context where neither applies (e.g. info dialogs, confirmation prompts, error overlays).

### Phase 1.6 — Right-panel REPL

A REPL tool added as the first tab in the right panel for `.dvala` files. Mirrors `dvala repl` semantics exactly — same load contract, same evaluation model — so a user gets identical bindings whether they invoke `dvala repl -l <file>` from the terminal or open the REPL on the same file in the playground. Lands after Phase 1.5 so the REPL is built against the uniform "current file → right panel" surface (scratch buffer included).

**Load contract.** When the REPL opens (or `:reload` fires), the current file is executed via the same evaluator as the run path. If the file's return value is a dict, those entries become the initial scope. Otherwise, scope starts empty. Top-level `let` bindings inside the file are NOT exposed unless the file explicitly returns them — same as `loadFileIntoContext` in [cli/src/cli.ts:247](../../cli/src/cli.ts#L247). Divergence from CLI semantics is rejected by design: a user running the same file two ways must get the same bindings.

**Reload trigger.** Manual only — `:reload` command + a "Reload" button that appears in the panel header *only when the loaded file, its transitive import closure, or the handlers buffer has drifted from what the REPL last loaded*. Staleness is computed from a hash of the **live editor model** of every file in the closure (queried via `WorkspaceIndex`), plus `.dvala-playground/handlers.dvala` (boundary handlers are part of the runtime context — changing them means the REPL's accumulated bindings would behave differently going forward). Hashes are taken against live editor content, not last-saved. When in-sync, no button is shown. Mirrors the CLI's "frozen until reload" contract while solving the playground's "the file is right there on the left and easy to forget I edited it" problem.

**State lifecycle.** REPL state (accumulated bindings + history) is per-tab and persisted in localStorage so browser refresh survives. Closing the tab discards state. Different file = different REPL session. Pattern: REPL is for ephemeral exploration; durable bindings graduate into code.

**Effects.** Same handler set as the playground's run path. No interactive `read-line` shim in v1 — code that performs `@io.readLine` behaves the same way it does when run from the editor. Add later if there's demand.

**Suspended evaluation.** A REPL line that suspends (deferred effect, time travel checkpoint) routes the snapshot through the same path as editor runs — the snapshot is saved to `.dvala-playground/snapshots/<id>.json` and surfaces in the Snapshots left-panel list. The originating REPL output line shows a clickable "↪ snapshot" link that opens the JSON file as a tab (with the UI/Tree/Raw view switcher from Phase 1.5).

**Output rendering.** Plain rendering for scalars; rich expandable tree-viewer for objects, dicts, and lists (reuses the right-panel multi-tool's tree component). Errors print formatted, matching the run path's error shape.

**History.** Up/down arrow keys recall prior input; persisted alongside bindings per-tab.

**Scratch + handlers buffers.** Post-Phase 1.5 the scratch and handlers buffers are regular workspace files at reserved paths under `.dvala-playground/`, so the REPL tab applies uniformly when one of them is the active editor tab. The import rule (`.dvala-playground/*` not importable from outside that folder) is enforced by the import resolver, so REPL-loading scratch works exactly the same as REPL-loading any workspace file.

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

**Design lens: IDE-scale, not playground-scale.** Phase 3 (`dvala playground` CLI + `BridgeBackend`) turns the playground into a real IDE pointed at on-disk projects of arbitrary size. Phase 2's protocol/worker shape must scale to that, not to today's playground-www toy files. Concretely: the worker is **stateful**, holding parsed ASTs + `WorkspaceIndex` per file, and the main thread sends **edit deltas** (Monaco `onDidChangeContent` events) plus a sequence number — not the full document on every keystroke. Sending full docs of a 50+ file project on every typecheck would burn CPU/memory; redesigning the protocol after every provider has shipped against it is much more expensive than getting the shape right now.

**Cancellation protocol.** With debounced ~200ms diagnostics on a real project, requests overlap (user types, debounce fires, worker starts typechecking, user types again). Worker uses **cooperative cancellation**: a `cancelled` flag is checked at well-known yield points between pipeline phases (parse / typecheck / diagnostic-build); a new request arriving cancels the in-flight one and partial work is dropped. The trampoline evaluator's natural yield boundaries make these checks cheap (~10 lines of `if (cancelled) throw CancellationError`). Discarding stale work via sequence-number filtering on the main thread alone is rejected — it would waste hundreds of ms of CPU per keystroke on large workspaces.

**Dependency status (updated 2026-04-29).** The shared-LS extraction track ([archive/2026-04-16_shared-language-services.md](../archive/2026-04-16_shared-language-services.md)) has substantially shipped: [src/shared/](../../src/shared/) provides `typeDisplay`, `diagnosticBuilder`, `callContext`, `completionBuilder`, and `types` — all DOM-free and consumed by the VS Code extension today. **Unblocked:** the first three Phase 2 deliverables (diagnostics, hover, completions). **Still gated:** workspace-level features (go-to-def, find-references, rename) — these read through `WorkspaceIndex` / `SymbolTableBuilder` which are still under [src/languageService/](../../src/languageService/) and not yet consumable by a worker bundle. Track that remaining extraction as it's unblocked by the first Phase 2 PR (provider patterns + worker boundary stabilize).

**First PR scope.** Worker plumbing has no validation surface in isolation — to know it works end-to-end you need a real provider exercising it. The first Phase 2 PR therefore bundles two things:

1. **Worker stand-up.** Vite `?worker` import, Monaco's own languages-workers configured, an LS message protocol skeleton (request/response shape + correlation IDs, transferable error objects, sequence number on every edit-delta message). Worker is stateful from the start — it holds a per-file map of `path → { sourceVersion, parsedAST, typecheckResult }`. Main thread subscribes to Monaco `onDidChangeContent` and forwards edit deltas; the worker applies them to its mirror buffer and re-parses lazily on demand. Cooperative cancellation: a `cancelled` flag checked at parse / typecheck / diagnostic-build phase boundaries; new requests cancel in-flight ones. Smoke test: a no-op round-trip from main thread → worker → main thread, plus a "type fast, only the latest diagnostics arrive, prior ones are cancelled" e2e test.
2. **Diagnostics provider.** On every parse/typecheck (debounced ~200ms), the main thread sends a `requestDiagnostics(path, sourceVersion)` message; the worker (with up-to-date mirror buffers from streamed edit deltas) runs parse + typecheck + builds diagnostics via `src/shared/diagnosticBuilder` (`buildParseDiagnostics`, `buildSymbolDiagnostics`, `buildTypeDiagnostics`); the main thread receives them and pushes to `monaco.editor.setModelMarkers`. Replies stamped with `sourceVersion` so the main thread can sanity-check ordering on top of cancellation.

Diagnostics is the right first provider because it's *push-only* — no synchronous query path, no UI race conditions to debug. If the worker bundle, message protocol, or diagnostic mapping has a bug, it surfaces as marker misalignment in the editor — easy to localize. Subsequent Phase 2 PRs (hover, completions, go-to-def, rename, formatter) each add a provider on top of the established worker. Hover and completions are the natural next picks since `typeDisplay` and `completionBuilder` are already in `src/shared/`.

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

**Workspace files vs. playground state.** Phase 1.5 establishes the canonical model used in both modes: **workspace files** (the regular files — IDB in web mode, disk via bridge in CLI mode) and **playground state** under `.dvala-playground/` (scratch buffer, handlers buffer, snapshot JSON files). In CLI mode `.dvala-playground/` lives on disk, persisting across machines and clones; in web-only mode it's a virtual folder in IDB. The folder is hidden from the file tree; scratch and handlers appear as pinned `<scratch>` / `<handlers>` virtual entries at the top. **`dvala run` ignores `.dvala-playground/` entirely** — production runs use real host handlers (or surface "unhandled effect" errors), never the playground's mock handlers. The execution-equivalence guarantee with `dvala run` applies to workspace files; `.dvala-playground/` is playground-only.

**Execution semantics.** The playground drives execution through `dvala run` semantics from day one, even in single-file mode. Same evaluator, same module loader, same import resolver as the CLI. Eliminates the "playground silently runs your code differently than `dvala run` would" failure mode by construction.

---

## Open Questions

- ~~**Monaco bundle size.**~~ **Decided 2026-04-26: bundle Monaco into the main `dvala` package.** ~3 MB is acceptable; splitting into a separate `@dvala/playground` package is cheap to do later if install-size complaints arrive (the playground is already its own workspace, no programmatic API to preserve).
- ~~**Token provider strategy.**~~ **Decided 2026-04-26 (corrected 2026-04-27): `TokensProvider` backed by `tokenizeSource` from [src/tooling.ts](../../src/tooling.ts).** Single source of truth between highlighter, parser, and language service. The original decision said `tokenScan`, but that's the let-binding scanner in the language service, not the tokenizer — corrected here. Risk to watch: `tokenizeSource` may need line-resumable state for Monaco's incremental per-line tokenization; if perf becomes a problem, address it then rather than preemptively falling back to Monarch.
- ~~**File path migration.**~~ **Decided 2026-04-26: wipe silently.** Pre-1.0 — playground state is treated as ephemeral. Bump the IndexedDB schema in `playground-www/src/idb.ts` and let the upgrade handler drop the old store. No banner, no migration code.
- ~~**LS in a worker.**~~ **Decided 2026-04-26: worker from day one.** The LS already runs out-of-process for the VSCode extension, so the message protocol exists; reusing it in the playground costs little and avoids a future retrofit across every Monaco provider. Budget half a day for Vite worker bundling papercuts (Monaco's own workers, source maps across the boundary).
- ~~**CLI mode auth model.**~~ **Decided 2026-04-26: token + Origin check.** CLI generates a random token at startup, prints `http://127.0.0.1:<port>/?token=<hex>`, auto-opens the browser. Every bridge request must include the token (header) AND have a matching `Origin` (defeats DNS rebinding). Token rotates per CLI invocation; no persistence. Standard Jupyter-style pattern — familiar to users, ceiling of what's reasonable for a local dev tool.
- ~~**Multi-file vs. single-file.**~~ **Decided 2026-04-26: drive the playground through `dvala run` semantics from day one (option D).** Same evaluator / module loader / import resolver as the CLI, even for single-file execution. Audit + close any semantics gap before Phase 1 ships rather than carrying it as a footgun. **Scratch buffer (both modes, post Phase 1.5):** scratch imports workspace files (one-way visibility); workspace files cannot import scratch. Same evaluator, just restricted import-graph reachability — keeps the "if it runs in the playground via a workspace file, it runs via `dvala run`" invariant intact.
- ~~**Persistence model (CLI mode).**~~ **Decided 2026-04-26: direct write-through, debounced.** Edits → ~300ms debounce → bridge → disk. Disk is the source of truth; no IndexedDB cache layer in CLI mode. Web-only mode keeps IndexedDB as the source of truth (no disk to sync). Two `FileBackend` implementations, no cross-mode sync logic. External-edit conflicts handled via per-file `lastSyncedHash` + inline reload prompt.
- ~~**Phase 0 build-system direction.**~~ **Decided 2026-04-27: migrate `playground-www` to Vite for real HMR.** Original plan misdiagnosed the problem (assumed Vite was already in use). Real change: drop rolldown for the playground's dev path, port the three rolldown plugins to Vite plugin shape, restructure to a Vite project layout. ~1–3 days of work. Production build still emits the same `docs/` output. Synergy with Phase 2's worker bundling (Monaco workers, LS worker) — both are Vite-shaped concerns, so doing the migration in Phase 0 amortizes the build-config debugging across both phases.
- ~~**Reactive primitive — build vs. buy.**~~ **Decided 2026-04-27: use `@vue/reactivity`.** Battle-tested implementation of exactly the API we need (`ref`, `effect`, `computed`); ~6 KB minified is rounding error against Monaco's ~3 MB. The five reactive-edge-case bugs that would cost a homemade implementation an afternoon each are handled by `@vue/reactivity` already. Migration out is symmetric (~1 hour of import-rewriting) if we ever want to.

### Open before implementation

These need answers before each phase starts. The shared-LS extraction track ([archive/2026-04-16_shared-language-services.md](../archive/2026-04-16_shared-language-services.md)) was driven in parallel with Phase 0 + 1 and resolved naturally — see the Phase 2 sequencing entry below.

- ~~**Phase 2 / shared-LS sequencing.**~~ **Resolved 2026-04-29: parallel track (option b) was taken in practice.** Shared-LS Phase 1 + 2 shipped while Phase 1 of the playground plan was running — `src/shared/` exists with `typeDisplay`, `diagnosticBuilder`, `callContext`, `completionBuilder`, and DOM-free `types`. The first three Phase 2 deliverables (diagnostics, hover, completions) are unblocked; workspace-level features (go-to-def, find-references, rename) still depend on a worker-safe extraction of `WorkspaceIndex` / `SymbolTableBuilder` and will be addressed as their PRs come up.
- ~~**Two-surface API discipline (`dvala/internal`).**~~ **Decided 2026-04-29: real `src/internal.ts` re-export module + lint enforcement.** With the LS worker landing in Phase 2's first PR, the cost of an accidental DOM import in tooling-only code shifts from "bundle bloat warning" to "worker fails to load." A grep-able re-export file plus an `eslint-no-restricted-imports` rule (or equivalent CI check) blocks deep `'../../src/...'` access from `playground-www/` and the worker bundle, making the rule mechanical instead of vibes-based. Cheap to add (~30 minutes) and pays off across every subsequent provider PR.
- **`scripts.ts` split — single PR or per-concern slices.** The plan calls for one PR per concern (sidePanels, contextEditor, files, modals, runActions, keybindings, init) for git-blame preservation. That's ~6 PRs of pure mechanical refactor. Alternative: one big mechanical PR. Trade-off: blame granularity vs. review overhead. Lean per-concern, but worth confirming when we get there.
- ~~**Execution-semantics spike (Phase 0 step 5) — keep or drop.**~~ **Resolved 2026-04-27: divergence found, Phase 1 step 17 is NOT a no-op.** The 30-minute read of [playground-www/src/scripts.ts](../../playground-www/src/scripts.ts) and [cli/src/cli.ts](../../cli/src/cli.ts) found:
  - **Load-bearing divergence:** the playground does not pass a `fileResolver` to `createDvala` (scripts.ts ~L100). Multi-file imports therefore fail in the playground but work in `dvala run` (cli.ts:208–220, 231). Phase 1 step 17 must wire the playground's `FileBackend` into `createDvala` as a `fileResolver`.
  - **Intentional differences (not gaps to close):** CLI adds `cliModules` (fs + proc; cli.ts:230) on top of `allBuiltinModules`; playground only has `allBuiltinModules`. These modules are inherently Node-only and should remain CLI-exclusive.
  - **Cosmetic differences:** CLI uses sync `runner.run()` and inline `typecheck: !noCheck`; playground uses async `runAsync` (needed for suspendable evaluation / time travel) and a separate `typecheckAndReport()` call site. Same typecheck logic, different invocation point. Both produce equivalent diagnostics for non-deferred-effect code.

  Step 5 in the implementation plan is now "documented" rather than "to do." The follow-on alignment work is captured in step 17 below.
- ~~**`FileBackend` interface shape.**~~ **Resolved 2026-04-29 in Phase 1.5 design (revised same day):** one `FileBackend` per mode — `IndexedDBBackend` in web mode, `BridgeBackend` in CLI mode. Both serve the entire workspace including the reserved `.dvala-playground/` folder. The earlier "scratch-only second backend" idea was rejected when the folder convention landed; "playground state never bleeds into deployable code" is enforced by the import resolver and tree-rendering rules, not by backend separation. The "Scratch namespace" of multiple ephemeral browser-only files in CLI mode is dropped entirely — one scratch buffer only.

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

### Phase 1.5 — Playground state model overhaul

These steps land **before Phase 2** so the LS worker, REPL, and CLI mode are all built against the final state model. Granular per-step PRs preserve git-blame; some steps will batch naturally (e.g. 23c and 23h are tightly coupled).

23a. Lock in the naming convention. Update `CLAUDE.md` Playground Architecture section to define the canonical pair (**scratch buffer** / **handlers buffer** / **workspace files** / **snapshots**) plus the **`.dvala-playground/`** reserved folder convention and the import rules. Sweep the playground codebase for stale terms ("saved files", "project files" in non-CLI-specific code paths) and rename where mechanical.

23b. Introduce the `.dvala-playground/` folder convention. Define the reserved-folder contract: web mode persists it as a virtual folder in IndexedDB; CLI mode (Phase 3) persists it on disk via the bridge backend. The folder is hidden from the file tree by a tree-rendering rule, not a backend rule.

23c. Reshape scratch as a workspace file at `.dvala-playground/scratch.dvala`. Persistence routes through the standard `FileBackend` — no separate scratch-only backend. Tree pinning rule: render `<scratch>` as a virtual entry at the top of the file tree, pointing at the underlying file. Buffer undeletable (`deleteWorkspaceFile` refuses the scratch path). The legacy `scratch-code` / `scratch-context` `localStorage` keys are dropped from `state.ts`; no migration / wipe — pre-1.0, so leftover keys in users' browsers are harmless cruft and pre-existing scratch contents are intentionally not preserved. **Tab-level "closable" deferred to 23h** — the `SCRATCH_KEY` / `current-file-id === null` sentinels stay until the broader migration retires them; the scratch tab remains sticky for now, but the underlying storage already routes through `FileBackend`.

23d. Add the handlers buffer at `.dvala-playground/handlers.dvala`. Same tree pinning treatment as scratch (`<handlers>` virtual entry, second pinned position). File starts empty; user authors `let X = handler @tag(...) -> ... end` declarations as they would in any Dvala file.

23e. Implement the boundary-handler runtime auto-wrap. Before evaluating user code (run path, REPL load), the playground synthesises this wrap when the handlers buffer is non-empty:

```dvala
let __playgroundBoundary__ = do
  <handlers.dvala contents>
end;
do with __playgroundBoundary__;
  <user code>
end
```

The handlers buffer is a regular Dvala expression — its **result value** is the boundary handler. Single handler, multiple effect cases, composed via `effectHandler.compose`, dynamically built — anything that evaluates to a handler value works. No AST walking / name extraction is needed. Language-level `do with` clauses inside the user's code shadow the boundary within their scope (verified: an inner handler takes precedence). When the handlers buffer is empty / whitespace-only, no wrap is applied. Parse errors in the buffer surface as runtime errors when the user's code runs (the wrap is built lazily; the engine reports the error against the wrapped source).

23f. Remove the Bindings UI and the legacy effect-handler authoring UI. Drop the "Context" left-panel tab; remove the `'binding'` and `'effect-handler'` kinds from `state.ts`; silent wipe of any stored bindings + JS handler entries (pre-1.0). After this step the legacy JS-handler authoring surface is gone.

23g. Migrate the import resolver. New rule: any `import` that resolves into `.dvala-playground/*` is rejected with a clear error ("playground state is not part of the deployable project"), regardless of where the import originates. Imports from inside the folder out to workspace files (e.g. scratch importing `../utils.dvala`) are still allowed — that's the only direction the playground actually exercises. The blanket "not importable" rule is simpler than an asymmetric workspace-vs-playground gate, and inside→inside imports have no real-world use case (handlers is auto-wrapped not imported, scratch is single-instance, snapshots are JSON). Implementation lives in the resolver, not in N consumers. **Tightened during implementation 2026-04-29:** original spec only forbade outside→inside; the inside→inside corner is now also forbidden because no use case allows it and the simpler rule is forward-compatible as the folder grows (snapshots in 23i, future state files).

23h. Migrate consumers off the legacy scratch + handler sentinels. Tabs, tree, history, right panel, code-panel sync — each consumer now treats both pinned buffers as regular files at their reserved paths, with the two UI-only rules (pinned to top, undeletable).

23i. Snapshots as JSON files. Shift snapshot persistence to `.dvala-playground/snapshots/<id>.json` (timestamp-based id with disambiguator suffix). The Snapshots left-panel tab becomes a curated list reading from this folder. Existing in-memory snapshot UI retired. **Implementation decisions (2026-04-30, captured via /interview):**
- **Storage = real `WorkspaceFile` entries.** Each snapshot is a workspace file at `.dvala-playground/snapshots/<id>.json`, with the entry JSON in the `code` field. Single source of truth that lets Phase 3's `BridgeBackend` watcher pick up snapshot files like any other workspace path. Workspace-file iterators (file tree, quick open, "no user files" hint, save / clear flows, explorer renderer) gain a snapshot-folder skip alongside the existing scratch + handlers skip.
- **API split preserved.** `getSavedSnapshots()` / `getTerminalSnapshots()` stay as filtering wrappers over the workspace-file list; the 90 existing consumers don't churn. The saved-vs-terminal distinction lives in each entry's JSON via the `kind` field.
- **In-memory caches retired.** `fileStorage` already caches workspace files; `snapshotStorage`'s parallel `savedCache` / `terminalCache` arrays are dropped. The list / detail render paths re-derive from `getWorkspaceFiles()` on demand (small dataset, no perf concern). The modal-based snapshot inspector is *not* in 23i scope — that retirement belongs to 23j (tab swap) + 23l (legacy-modal sweep).
- **Legacy data wiped, not migrated.** On first 23i boot the legacy `SAVED_SNAPSHOTS_STORE` + `TERMINAL_SNAPSHOTS_STORE` IDB arrays are cleared outright. Pre-1.0 — no rollback story owed; consistent with the silent-wipe approach in 23f / 23g / 23h.

23j. Snapshot tab + view switcher. Clicking a snapshot in the Snapshots list opens the JSON file as an editor-area tab. Tab content has a header view-switcher: **UI** (custom snapshot inspector — source view at suspension point, scope tree, suspended computation, resume controls), **Tree** (interactive JSON tree), **Raw** (Monaco JSON with syntax highlighting). Default: UI. View choice persisted per-tab in localStorage. Tabs are read-only.

23k. Build the reusable Save As modal. Filename input, folder picker with inline folder creation, collision check. First consumer: scratch buffer → "save copy to workspace path" flow.

23l. Audit + retire legacy modals. Delete the modal-based output viewers (tokenize / parse / AST / CST) the right-panel multi-tool covers; delete the modal-based snapshot inspection (replaced by 23j). Keep modals that serve genuine right-panel-less / tab-less contexts (info dialogs, confirmations, error overlays).

23m. e2e coverage: scratch + handlers buffers survive reload, tab close-and-reopen for both, tree pinning works in both modes, save-copy-to-workspace via Save As, scratch importing a workspace file works, workspace file importing `.dvala-playground/*` is rejected with a clear error, handlers auto-wrap fires on every run, boundary handlers apply outside language-level handlers, JS-handler legacy data is silently wiped on first load, snapshot deletion → tab auto-closes, snapshot tab opens with UI view as default and remembers the last-active view per tab.

### Phase 1.6 — Right-panel REPL

Lands after Phase 1.5. New first tab in the right-panel multi-tool, shown for `.dvala` files (scratch buffer + handlers buffer included).

23n. REPL tab skeleton. Add as the first tab in the right-panel multi-tool. Visible/active for `.dvala` files only; inactive on non-Dvala files. Wire panel layout, header, scrollable transcript area, single-line input.

23o. Load mechanism + evaluation loop. Mirror `loadFileIntoContext` ([cli/src/cli.ts:247](../../cli/src/cli.ts#L247)): execute the current editor model via the playground's run path (which auto-wraps boundary handlers from `.dvala-playground/handlers.dvala`); if the result is a dict, merge its entries as initial scope. Per-line evaluation via `runAsync({ scope, effectHandlers })`; new scope accumulates between lines. Same effect-handler set as the run path. Special commands: `:help`, `:help <name>`, `:context`, `:reload`, `:quit`. History variables (`*1*`–`*9*`) per CLI behavior.

23p. Staleness tracking + reload button. Compute the loaded file's transitive import closure via `WorkspaceIndex`; record a hash per closure member at load time, plus a hash of `.dvala-playground/handlers.dvala`. Recompute on every editor change (debounced); show the "Reload" button (and enable `:reload`) only when any tracked file's live-editor-model hash drifts from the recorded hash. Hide when in-sync.

23q. Suspended evaluation routing. A REPL line that suspends saves a snapshot through the same path as editor runs (writes to `.dvala-playground/snapshots/<id>.json`; appears in the Snapshots left-panel list). The originating REPL output line gets a clickable "↪ snapshot" link that opens the snapshot's JSON file as a tab (UI/Tree/Raw view switcher from Phase 1.5's snapshot tab work). Resume produces the result, which prints in the REPL transcript.

23r. Rich output + history. Compound values (objects, dicts, lists) render in an inline expandable tree viewer (reuses the right-panel tree component); scalars plain via `stringifyValue`. Errors print formatted, matching the run path's error shape. History (input lines + accumulated bindings) persisted in localStorage per-tab; up/down arrows recall.

23s. e2e: load contract (file with dict return → bindings populated; file without → empty scope), scope accumulation across lines, staleness indicator fires when the loaded file edits, when an imported file edits, AND when `.dvala-playground/handlers.dvala` edits; suspended-line snapshot link opens the snapshot tab with the correct view; browser refresh restores REPL state; tab close clears it; switching tabs swaps REPL sessions.

### Phase 2 — LS parity

**First PR (steps 24–26): worker + diagnostics.** Bundled because worker plumbing has no validation surface alone. Each subsequent step is a separate PR.

24. Audit which `src/shared/` modules + remaining `src/languageService/` modules are worker-safe. Most of `src/shared/` is already DOM-free by design; the gap is `WorkspaceIndex` / `SymbolTableBuilder` (still under `src/languageService/`, not yet consumed by the VS Code extension via the shared-LS path). Audit output: a short list of additional files (if any) the diagnostics worker needs and confirmation they import nothing browser-incompatible. **Land `src/internal.ts` + lint rule in this step:** create the introspection re-export module (initially exporting whatever `diagnosticBuilder` and the worker need) and add an `eslint-no-restricted-imports` rule restricting `playground-www/**` and the worker bundle from reaching past `src/index.ts` / `src/full.ts` / `src/internal.ts` into deep `'../../src/...'` paths. Subsequent provider PRs grow the `internal.ts` exports as needed.
25. Stand up the worker: Vite `?worker` import, Monaco's own languages-workers configured, LS message protocol skeleton (request/response shape + correlation IDs, transferable error objects, sequence-numbered edit-delta messages). Worker is stateful — it holds a `path → { sourceVersion, parsedAST, typecheckResult }` map and applies edit deltas streamed from the main thread's `onDidChangeContent` subscription. Implement cooperative cancellation: a `cancelled` flag checked at parse / typecheck / diagnostic-build phase boundaries; arriving requests cancel in-flight work for the same `path`. Confirm dev + prod bundles both load the worker correctly. **Smoke tests (e2e):** (a) no-op round-trip from main thread → worker → main thread; (b) rapid-typing test asserts cancellation drops stale work and only the latest result is applied.
26. Diagnostics provider — debounced ~200ms after parse/typecheck. Main thread sends `requestDiagnostics(path, sourceVersion)`; worker (mirror buffer up to date from streamed deltas) computes via `src/shared/diagnosticBuilder` (`buildParseDiagnostics`, `buildSymbolDiagnostics`, `buildTypeDiagnostics`); main thread pushes to `monaco.editor.setModelMarkers`, sanity-checking the reply's `sourceVersion` matches the model's current version. Replace the playground's existing best-effort diagnostics path. Cover with e2e: parse error → marker present, fix → marker clears, type error → underline + hover summary.
27. Hover provider (built-in docs + inferred types). Backed by `src/shared/typeDisplay` (`findTypeAtPosition`, `formatHoverType`).
28. Completions provider. Backed by `src/shared/completionBuilder` + `src/shared/callContext`.
29. Go-to-definition + find-references (backed by `WorkspaceIndex`). Depends on `WorkspaceIndex` being made worker-safe (extraction follow-up; tracked as a separate PR before this step).
30. Rename provider (depends on LS-next cross-file rename).
31. Document formatter (backed by `prettyPrint`).
32. Performance pass: profile on a 50-file workspace; tune debouncing and message-batching as needed.

### Phase 3 — CLI

33. New `dvala playground` subcommand: arg parsing, default path, port selection.
34. Static bundle serving (the playground build output as an asset).
35. File-system bridge: `list / read / write`, scoped to the requested root with path-traversal guards.
36. Implement `BridgeBackend` (the second `FileBackend` introduced in step 15): debounced ~300ms write-through to the bridge.
37. SSE-based file watcher; playground subscribes and reloads files with no pending edits.
38. External-edit conflict handling: track per-file `lastSyncedHash`; show inline "use disk / keep mine" prompt when the watcher fires for a file with unflushed local edits.
39. Playground "local mode" flag: swap the active `FileBackend` to `BridgeBackend` based on query param.
40. `.dvala-playground/` on disk — `BridgeBackend` serves the reserved folder like any other workspace path. Initial CLI startup: if `.dvala-playground/` doesn't exist, create it with empty `scratch.dvala` and `handlers.dvala`. The watcher (step 37) covers `.dvala-playground/` so external edits to scratch / handlers / snapshot files reflect in the playground. Tree-rendering rule (skip the folder, pin scratch + handlers virtually) carries over from Phase 1.5 unchanged.
41. Auth: per-session random token (header) + Origin check on every bridge request. Token rotates per CLI invocation; CLI auto-opens the browser to the tokenised URL.
42. Bundle-size check: confirm the added playground assets don't bloat the CLI tarball unacceptably.
43. Docs: README section + `dvala playground --help`.

---

## Phasing & Dependencies

- Phase 0 has no dependencies and is small (config + audit). Ship first — every subsequent phase benefits from the faster iteration loop.
- Phase 1 depends on Phase 0 only via DX (not strictly blocking, but Phase 1's audit of execution semantics + introducing the `FileBackend` interface is dramatically easier with HMR working). Otherwise Phase 1 has no external dependencies.
- Phase 1.5 depends on Phase 1 (`FileBackend` interface, tree, tabs, right panel) and lands **before Phase 2** so the LS worker, REPL, and CLI mode are all built against the final state model. Pure playground-side work — no engine changes. Significantly larger than original scope after the 2026-04-29 design pass; granular per-step PRs (23a–23m) preserve git-blame.
- Phase 1.6 depends on Phase 1.5 (uniform workspace-file model, `.dvala-playground/handlers.dvala` for boundary handlers, snapshot JSON file model) and reuses CLI primitives (`loadFileIntoContext` shape, `runAsync` evaluation, history variables, special commands). Mirrors `dvala repl` semantics exactly — no engine changes; pure playground integration. `WorkspaceIndex` is consumed for closure-staleness tracking (also covers `.dvala-playground/handlers.dvala`); doesn't need to be worker-safe yet (LS worker arrives in Phase 2).
- Phase 2's first PR (worker + diagnostics) is unblocked: shared-LS Phase 1 + 2 shipped in parallel with the playground's Phase 1, and `src/shared/diagnosticBuilder` is everything the diagnostics provider needs. Hover + completions PRs are also unblocked. Workspace-level providers (go-to-def, find-references, rename) still need `WorkspaceIndex` / `SymbolTableBuilder` extracted into a worker-safe form — handle as a follow-up extraction PR before step 29 lands.
- Phase 3 depends on Phase 1 (tree view + multi-file + tabs + layout) and Phase 1.5 (folder convention; `BridgeBackend` serves `.dvala-playground/` like any other workspace path). Much more useful with Phase 2 (LS features against a real project).
