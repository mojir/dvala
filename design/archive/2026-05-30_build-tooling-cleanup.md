# Build & Tooling Cleanup

**Status:** Active
**Created:** 2026-05-30

**Progress:**

- ✅ PR 1 (#211) — Turbo cache-key gap for `rolldown.plugins.mjs` closed.
- ✅ PR 2 (#213) — wireit residue purged; `.prettierignore` → `.oxfmtignore` rename (NOT dead — load-bearing for `oxfmt`).
- ✅ PR 3 (#214) — pre-push hook retargeted to core-tooling + engine + runtime (option B', corrected from doc's original B).
- 🔄 PR 4 — coverage exclusions audited; build-pattern documented; transitive deps fixed (this PR).

## Purpose

Post-monorepo-decomposition audit of the repository's configuration, build DAG, and dev tooling turned up one real functional gap and a handful of housekeeping items. This doc tracks the work to close them.

Scope is intentionally narrow: configuration files, build orchestration (Turborepo / rolldown / tsgo), lint/format/coverage configs, the pre-push hook, and CI workflows. **No source-code refactors.**

---

## Background

The wireit → Turborepo migration ([archived 2026-05-27_monorepo-decomposition.md](../archive/2026-05-27_monorepo-decomposition.md)) and the upstream package-boundary work landed cleanly. The build DAG is now a topological `^build` over `packages/*` + `apps/*`, with each package owning a `rolldown.config.mjs` + `tsgo -p ./tsconfig.json --emitDeclarationOnly`. Final binaries (`cli`, `mcp-server`, `playground-www`, `vscode-dvala`, `playground-builder`) are bundled by top-level rolldown configs after the package subgraph finishes.

That migration left a few loose ends. The most consequential one — the Turbo cache key gap — is invisible day-to-day but produces silently stale builds when a shared rolldown plugin changes.

---

## What needs to happen

### 1. Close the Turbo cache-key gap (P0)

**Problem.** `turbo.json` lists `rolldown.config.mjs` in per-task `inputs` and `tsconfig.json` / `vscode-dvala/tsconfig.json` in `globalDependencies`. The shared `rolldown.plugins.mjs` — imported by every per-package rolldown config — is in neither. Editing a shared plugin produces cache hits that ship stale output.

**Definition of done.** Editing `rolldown.plugins.mjs` invalidates every package build's cache.

**Fix.** Add `rolldown.plugins.mjs` to `globalDependencies` in [turbo.json](../../turbo.json). Verify with `turbo run build --dry=json` before and after a touch of the plugin file to confirm cache key change.

This is the only P0 item in this doc. Land it first, in isolation.

### 2. Realign the pre-push hook with the new package layout (P1)

**Problem.** [.githooks/pre-push](../../.githooks/pre-push) watches `src/` (root-level) to decide whether to enforce a fresh perf benchmark row. That directory was removed during the monorepo decomposition. The hook is now a near-no-op — it never triggers on `packages/*/src/` or `apps/*/src/` changes — so pipeline-perf history goes silently sparse.

**Decision needed.** Three options:

- **A. Retarget broadly.** `SOURCE_PATHS=('packages/' 'apps/')`. Hook becomes useful again at the cost of bench runs on touches that don't affect perf.
- **B'. Retarget narrowly (corrected).** Watch `packages/dvala-core-tooling/src/` + `packages/dvala-engine/src/` + `packages/dvala-runtime/src/` — the three packages the pipeline benchmark actually exercises (`core-tooling` directly via tokenize/parse/typecheck/refinement-solver imports; engine + runtime transitively via `createDvala`). The original lean (engine + runtime only) missed `core-tooling`, which would silently skip the gate on tokenizer/parser/typechecker regressions — the very problem this PR fixes.
- **C. Remove.** If the bench-row gate is no longer valued, delete the hook and the `install-hooks` / `uninstall-hooks` scripts.

**Decision.** Option B' (taken in PR 3). The lockfile and Playwright-image-version checks elsewhere in the script are independent of `SOURCE_PATHS` and worth keeping regardless of which path is taken.

**Definition of done.** A commit that touches `packages/dvala-core-tooling/src/` (and only that) on a fresh HEAD triggers the bench gate.

### 3. Purge wireit residue (P1)

Three leftovers from the migration:

- Local `.wireit/` cache directory still exists on disk (in `.gitignore`, but consuming space; not removed by the `clean` script).
- `.oxlintrc.json#ignorePatterns` still lists `.wireit`.
- `package.json#clean` removes `.turbo` but not `.wireit`.

**Fix.** Drop the `.wireit` entry from oxlint ignore patterns. Add `.wireit` to the `clean` script alongside `.turbo`. Delete the local directory manually (confirm before destruction).

### 4. Prune stale coverage exclusions (P2)

[vite.config.mts](../../vite.config.mts) `coverage.exclude` lists ~20 paths, several of which were added pre-decomposition (`cli/**`, `mcp-server/**`, `playground-builder/**`, plus specific package files like `packages/dvala-engine/src/evaluator/frames.ts`).

**Action.** Audit each entry against the current tree. Remove dead ones. For entries that remain, add a one-line comment explaining why each is excluded — coordinate with the [100%-coverage-on-new-code policy](../../../.claude/projects/-Users-albert-mojir-mojir-dvala/memory/feedback_code_coverage.md).

### 5. Rename `.prettierignore` -> `.oxfmtignore` (P2)

`.prettierignore` is **not** dead config — `oxfmt` reads it by default (its CLI help: "If not specified, .gitignore and .prettierignore in the current directory are used"). Without it, `oxfmt` scans into `dist/`, `build/`, `syntaxes/`, `public/`, etc. and flags ~265 build artifacts.

**Fix.** Rename `.prettierignore` -> `.oxfmtignore` so the filename matches the tool, and pass `--ignore-path=.oxfmtignore` to `oxfmt` invocations in `package.json#lint` / `lint:no-fix`. (Note: `--ignore-path` replaces the default ignore paths entirely — `.gitignore` patterns must also be in `.oxfmtignore`, which is already the case.)

`.DS_Store` is already covered by `.gitignore` line 19 (bare pattern matches at any depth).

### 6. Document the asymmetric build pattern (P3)

Most workspace packages build via `rolldown + tsgo --emitDeclarationOnly`. `@mojir/dvala-cli` and `@mojir/dvala-playground-www` use plain `tsgo` instead — they're final-binary tail nodes that get bundled at the root layer (root `rolldown.config.cli.mjs` / `rolldown.config.playground-www.mjs`). A reader hitting this for the first time will wonder why.

**Action.** Add a short note to `CLAUDE.md` under build conventions, or a one-line comment in each of the two `package.json` files. Either is fine; pick whichever the maintainer prefers.

### 7. Declare transitive workspace deps explicitly (P3)

`dvala-mcp-server` and `dvala-workspace-backend` consume packages they don't declare in `package.json` (silenced via `knip#ignoreDependencies`). pnpm resolves them transitively, so it works — but the implicit coupling is a footgun under future restructures.

**Audit finding (PR 4).** The doc overstated the gap. Both packages already declared `core-tooling`, `engine`, and `types`. The actual missing entry was `@mojir/dvala-runtime` — externalized in both rolldown configs but absent from both `package.json` files. The `knip#ignoreDependencies` entries are NOT redundant: they silence "declared-but-not-directly-imported" warnings for transitive externals (e.g. `mcp-server` declares `engine`/`runtime`/`types` for the bundled output's runtime resolution, but only directly imports from `core-tooling`).

**Fix (PR 4).** Add `@mojir/dvala-runtime` to both `package.json` files. Extend `mcp-server`'s `ignoreDependencies` to include `@mojir/dvala-runtime` (still indirect). Leave `workspace-backend`'s ignore as-is (`types` only — engine + runtime ARE directly imported).

---

## Parked / explicitly out of scope

- **Parallelizing the root `build` script** (currently five sequential `turbo run build --filter=...` calls chained with `&&`). Turbo handles parallelism within each subgraph; the wasted serial time is limited to the trailing root-level rolldown bundles. Worth a measurement before doing the work, not before.
- **Adding `**/\*.tsbuildinfo`to Turbo`outputs`.\*\* Tsgo's incremental info would round-trip through cache, but the current build is already fast enough that this is a polish item, not a correctness item.

---

## Rollout

Suggested PR cadence to keep each change small and reviewable:

1. **PR 1 — "fix turbo cache key for shared rolldown plugin"** (P0 #1). Tiny diff to `turbo.json`. Verify with `turbo run build --dry=json`.
2. **PR 2 — "purge wireit residue + rename .prettierignore -> .oxfmtignore"** (#3, #5). Pure deletions / renames. Low risk.
3. **PR 3 — "retarget pre-push hook to monorepo layout"** (#2). Single behavior change; pick option A/B/C in the PR description.
4. **PR 4 — "config hygiene: coverage exclusions, build-pattern note, transitive deps"** (#4, #6, #7). Light audit + documentation + small `package.json` edits.

Total estimated effort: ~2 hours of focused work across all four PRs.

## Definition of done (whole doc)

- `rolldown.plugins.mjs` is in `globalDependencies` and proven to invalidate cache.
- Pre-push hook either watches `packages/*/src/` (option A or B) or has been removed (option C).
- `.wireit/` directory is gone locally; oxlint ignore patterns and `clean` script no longer mention it.
- `vite.config.mts` coverage exclusions reflect the current tree.
- `.prettierignore` renamed to `.oxfmtignore`; lint scripts pass `--ignore-path=.oxfmtignore`. (`.DS_Store` already covered by `.gitignore`.)
- Asymmetric build pattern documented somewhere a new contributor will find it.
- `dvala-mcp-server` and `dvala-workspace-backend` declare their transitive workspace deps explicitly; `knip.json` overrides for those packages are gone.

When all checkboxes pass, archive this doc to `design/archive/` and remove the `MEMORY.md` pointer.
