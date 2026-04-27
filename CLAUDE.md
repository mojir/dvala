## Git Workflow

- **NEVER commit directly to `main`.** Always work on a feature branch.
- Before starting work, check the current branch. If on `main`, create and switch to a new branch.
- When work is complete, ask the user if they want to create a pull request to `main`.

## Key Commands

- `pnpm run check` — full pipeline: lint + typecheck + test + build
- `pnpm run test` — run tests only
- `pnpm run build` — build all bundles
- `pnpm run benchmarks:run` — run the Dvala pipeline perf bench (tokenize → parse → typecheck → run + refinement-typechecker scenarios); appends a row to `benchmarks/pipeline-performance.md`

Run `pnpm run check` after any medium or larger code change.

When piping CLI output through `tail`/`cat`/`grep`, prepend `NO_COLOR=1` so ANSI escape codes don't pollute the captured output (applies to `vitest`, `eslint`, etc.).

## Performance tracking

**Source-code changes (anything under `src/`) MUST run the pipeline perf benchmark before the PR merges.**

The `.githooks/pre-push` hook automates this: when you push a commit that touched any `src/` file and HEAD's hash isn't yet in `benchmarks/pipeline-history.json`, it runs the bench, aborts the push, and asks you to commit the bench data and re-push. Install once per clone with `pnpm run install-hooks` (sets `core.hooksPath=.githooks`). Disable with `pnpm run uninstall-hooks`.

**Multi-commit gotcha:** the bench tags rows with HEAD's hash. If you stack docs/test/config commits on top of a src/ change before pushing, HEAD won't be the src/-touching commit and the hook will refuse to push (with a clear "rebase or --no-verify" error). Easiest path: push the src/-touching commit on its own first — let the hook bench it — then stack follow-ups. Don't try to run `pnpm run benchmarks:run` proactively from a HEAD that's already past the src/ change; the row gets tagged with the wrong SHA.

**Escape hatch:** for trivially non-perf-relevant `src/` changes (comment typo, dead-code removal, error-message wording), bypass the gate with `git push --no-verify`. The hook is intentionally conservative — broader-than-necessary so we don't miss a regression. Use `--no-verify` thoughtfully; if in doubt, run the bench.

Manual flow if you skip the hook:
- Run `pnpm run benchmarks:run` on the PR branch's tip (after the last code change).
- Commit the resulting changes to `benchmarks/pipeline-history.json` and `benchmarks/pipeline-performance.md` to the PR branch.
- Push so the perf data is part of the PR's history.

If a source-touching PR was merged without perf data: open a follow-up PR that runs the benchmark on `main` (so the row's commit hash is the merge commit) and ships the resulting `.md` / `.json` updates. Don't backfill onto the merged commit retroactively — keep the perf history honest about when the data was captured.

Why: the rendered `.md` table is the at-a-glance regression signal during PR review. Skipping it means a future regression goes unnoticed until someone manually re-runs the bench.

## Project Structure

- Entry: `src/index.ts` (minimal), `src/full.ts` (full with all modules)
- Built-ins: `src/builtin/core/` (normal expressions), `src/builtin/specialExpressions/`
- Modules: `src/builtin/modules/<name>/`
- Shared: `src/prettyPrint.ts` (smart AST formatter, used by Dvala + playground)
- Reference data: `reference/index.ts` (derived from co-located docs)
- Tests: `__tests__/` (integration), `src/**/*.test.ts` (unit), `e2e/` (playwright)
- Playground: `playground-www/src/` — see Playground Architecture below

## Workspace Layout

The repo is a **pnpm workspace** ([pnpm-workspace.yaml](pnpm-workspace.yaml)). Members:

- **`.` (root)** — the `@mojir/dvala` package (engine, CLI, MCP server, playground builder, playground-www).
- **`vscode-dvala/`** — the VS Code extension (separate publish surface; built into a `.vsix` via `pnpm run build-vscode-ext`).

Single root `pnpm-lock.yaml` covers both members. `pnpm install` at the root installs everything; never run install inside `vscode-dvala/` directly.

**Versioning:** the release workflow ([release.yml](.github/workflows/release.yml)) bumps the root version, syncs it to `vscode-dvala/package.json`, and runs `pnpm install --lockfile-only` to refresh the lockfile's `importers.vscode-dvala` entry. Don't manually edit version fields.

## TS Coding Conventions

- Do not shadow variables
- Imports must be sorted alphabetically
- `it()` descriptions must begin with lowercase
- No side-effect imports for module registration
- Every built-in function needs a `docs` property with `category`, `description`, `returns`, `args`, `variants`, `examples`
- Always add descriptive comments in code — explain the *why*, not just the *what*

## Demo Convention

For user-facing features, include **demo blocks** in the commit message. These serve as an interactive changelog — `pnpm run demo [ref]` extracts them and generates playground URLs.

### Commit message format

Use a `---` separator after the description, then markdown with ` ```demo ` fenced blocks.
If the demo code contains triple backticks (e.g. code templates), use 4+ backtick fences (`````demo ... `````):

````
feat: implement feature X

Description of the change.

---

```demo
description: short description of what the demo shows
code:
let x = 42;
x + 1
```
````

Multiple demos per commit are fine. For demos needing context (bindings):

````
```demo
description: macro with custom handler
context:
let h = handler @my.eff(x) -> resume(x * 2) end
code:
do with h; perform(@my.eff, 10) end
```
````

### Generating playground links

```bash
pnpm run demo          # from HEAD
pnpm run demo HEAD~3   # from specific ref
pnpm run demo abc123   # from hash
```

### Before committing

Always show the user a playground demo link before committing. Generate it with:

```bash
node -e "const code = 'let x = 42; x + 1'; console.log('http://localhost:22230/?state=' + btoa(encodeURIComponent(JSON.stringify({'dvala-code': code}))))"
```

The playground runs on `http://localhost:22230/` (start with `pnpm run dev`).

## Creating design documents and plans
I encurage you to structurize bigger tasks by creating .md plans.
Create .md files inside /design

Prefix all design document filenames with the creation date in ISO format: `YYYY-MM-DD_<name>.md` (e.g. `2026-01-02_my-design.md`).

## Skills & Agents

Use the project skills and agents proactively — don't do manually what a skill already handles.

### When to use skills

- **`/dvala`** — Load this before writing, debugging, or reasoning about Dvala language code. Always load when you need syntax reference, AST node format, or macro details.
- **`/check`** — After any code change, use this instead of running `pnpm run check` manually. It also runs e2e tests and fixes failures.
- **`/demo`** — Before committing user-facing features. Generates playground links and formats demo blocks for commit messages.
- **`/design`** — When the user asks to create a design document or plan.
- **`/fix-issue`** — When the user asks to fix a GitHub issue by number.
- **`/report-issue`** — When the user reports a bug or asks to file an issue.
- **`/dvala-run`** — When the user wants to quickly run a Dvala snippet.

### When to use agents

- **`explorer`** — For deep codebase research ("how does X work?", "where is Y implemented?"). Use this instead of doing many sequential searches yourself — it runs in isolated context with haiku for speed.
- **`test-fixer`** — When tests are failing after code changes. Delegate diagnosis and repair to this agent.
- **`reviewer`** — Before committing. Ask it to review staged changes for quality and convention adherence.

## Dvala Language Reference

For Dvala language syntax, semantics, macros, and AST format, use the `/dvala` skill (loaded on demand).

Use `dvala` CLI subcommands to look up documentation and run code:
- `dvala run '<code>'` — execute Dvala code (also accepts `-f <file>` or no args for project entry)
- `dvala doc <name>` — documentation for a function/expression
- `dvala list [module] [--modules] [--datatypes]` — list functions
- `dvala tokenize '<code>' [--debug]` / `dvala parse '<code>' [--debug]` — inspect internals (also accept `-f <file>`)
- `dvala examples` — example programs

Before suggesting Dvala code to the user, verify it works by running it with `dvala run`.

## Playground Architecture

### Top-level files

- `playground-www/src/renderCodeBlock.ts` — unified code block renderer (syntax highlighting, execution, "Use in playground" + copy buttons)
- `playground-www/src/renderDvalaMarkdown.ts` — shared markdown renderer using `renderCodeBlock` for fenced dvala blocks
- `playground-www/src/featureCards/*.md` — feature card content (rendered in modals from start page)
- `playground-www/src/components/startPage.ts` — start page with feature cards (about page merged in)
- `playground-www/src/components/chapterPage.ts` — chapter pages with sticky header (title, prev/next, TOC dropdown)
- `playground-www/src/scripts.ts` — main entrypoint and orchestrator (boot wiring, run/effect handlers, context editor, keybindings, navigation, history). Currently ~6.4k LOC; per-concern modules are being progressively extracted from here.
- `playground-www/src/scripts/*.ts` — per-concern modules extracted from `scripts.ts`. See "Per-concern layout" below.
- `playground-www/src/lib/reactive.ts` — reactive primitive re-exports from `@vue/reactivity`. See "Reactive primitive" below.
- `playground-www/src/playground.ts` — public API barrel (`export * from './scripts'`); produces the global `Playground.*` object.

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

Re-exports from [`@vue/reactivity`](https://www.npmjs.com/package/@vue/reactivity) — the standalone, framework-agnostic Vue 3 reactivity package (no compiler, no SFCs, ~6 KB minified). Currently exports `reactive`; `ref`, `effect`, `computed` will be added when the first consumer needs them.

The state singleton in `playground-www/src/state.ts` is wrapped with `reactive(...)`, so reads inside an `effect()` block automatically track which keys they depend on, and writes trigger dependent effects to re-run. Existing `getState` / `saveState` / `updateState` keep working unchanged.

When to use which:
- `ref(initialValue)` — single reactive value. Read/write via `.value`.
- `reactive(obj)` — make a plain object reactive. Reads and writes to its properties are tracked. Used for the state singleton.
- `effect(fn)` — run `fn` once now, then re-run whenever any reactive value it read changes. Returns a stop handle.
- `computed(fn)` — derived reactive value, lazily recomputed when dependencies change. Cached until invalidated.

Always import from `./lib/reactive` (not `@vue/reactivity` directly) so the implementation can be swapped without touching call sites. New Phase 1+ code is expected to use this reactively from the start; the legacy imperative cascades in `scripts.ts` are not being retrofitted.

### Modal system (`createModalPanel` in `scripts/modals.ts`)

```typescript
createModalPanel({
  title?, icon?, size?: 'small' | 'medium' | 'large',
  markdown?, hamburgerItems?, footerActions?, noClose?, onClose?
})
```

Sizes: small=480px, medium=800px, large=1200px. If `markdown` is provided, body is auto-rendered. If `footerActions` provided, footer buttons are auto-created. Snapshot panel uses `createModalPanel({ size: 'large' })`.

In general when coding under src/, make sure code coverage is 100% (or near 100% )for new code. Also apply boy scout principle, try to improve code coverage on neighbouring code