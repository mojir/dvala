# pnpm Migration + Tooling Refresh

**Status:** Draft
**Created:** 2026-04-26

## Goal

Migrate the project from npm to pnpm, plus three small co-shippable tooling additions: `.nvmrc` (or equivalent) to pin Node, **Knip** for dead-code/dep detection, and an opt-in **`tsgo`** (TypeScript-Go) script for fast typecheck iteration.

Single small PR (or short sequence). Independent of and *not* bundled with the playground design doc ([2026-04-26_playground-monaco-tree-ls-cli.md](2026-04-26_playground-monaco-tree-ls-cli.md)) — these are infrastructure changes that complicate the playground refactor if combined.

---

## Background

### Current toolchain (kept)

The project is already on a 2026-native stack:

- **rolldown** (Rust-based bundler) for builds
- **wireit** for content-aware task orchestration and caching
- **vitest 4** for unit + integration tests
- **eslint 10** + **typescript-eslint 8.57** + **@stylistic/eslint-plugin** for lint
- **TypeScript 5.9** + **Node 22**
- **Playwright** for e2e

None of these are being replaced. The work below is additive (pnpm, knip, tsgo opt-in) plus one config field migration (`overrides` → `pnpm.overrides`).

### What the audit found

Two `package.json` files: root + [vscode-dvala/package.json](vscode-dvala/package.json). **No workspaces are configured today.** Most code (`src/`, `cli/`, `playground-www/`, `mcp-server/`, `playground-builder/`, `common/`) lives under the root `package.json`. The vscode-dvala package is partially detached — its typecheck step does its own `npm install --prefix vscode-dvala` ([package.json:216](package.json#L216)).

Concrete npm references to update:

| Location | Current | Becomes |
|---|---|---|
| [.github/workflows/ci.yml:34,50](.github/workflows/ci.yml#L34) | `npm ci` | `pnpm install --frozen-lockfile` |
| [.github/workflows/deploy-pages.yml:30](.github/workflows/deploy-pages.yml#L30) | `npm ci` | same |
| [.github/workflows/publish.yml:25](.github/workflows/publish.yml#L25) | `npm ci` | same |
| [.github/workflows/release.yml:37](.github/workflows/release.yml#L37) | `npm version ...` | `pnpm version ...` |
| All workflows | `cache: npm` on `setup-node` | `pnpm/action-setup@v4` + `cache: 'pnpm'` |
| [.githooks/pre-push:139](.githooks/pre-push#L139) | `npm run benchmarks:run` | `pnpm run benchmarks:run` |
| [package.json:131](package.json#L131) | `"check": "npm install && ..."` | `"check": "pnpm install && ..."` (or drop the install — see open question) |
| [package.json:144,145](package.json#L144) | `"benchmarks:*": "npm run build-dvala && ..."` | `pnpm run build-dvala && ...` |
| [package.json:216](package.json#L216) | `npm install --prefix vscode-dvala` | `pnpm install --dir vscode-dvala` |
| [package.json:3-5](package.json#L3) | `"overrides": { ... }` | `"pnpm": { "overrides": { ... } }` |

### Why now

Pre-1.0 codebase, infrastructure-friendly window before Phase 1 of the playground plan starts editing tens of files. Tooling churn is cheaper now than later.

### Why not now

If the playground design's Phase 0 is also running, doing both at the same time risks attributing CI flakiness or build issues to the wrong change. The playground design and this plan are deliberately separate PRs for that reason.

---

## Proposal

### 1. pnpm migration

**Approach:** mechanical swap; keep current structure (no formal workspaces). The project is structured *like* a monorepo but isn't formally one — that's fine, and we don't need to change it as part of this migration.

- `pnpm install` to generate `pnpm-lock.yaml`. Delete `package-lock.json`.
- Update all CI workflows to use `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile`.
- Update the pre-push hook to `pnpm run benchmarks:run`.
- Update inline references in `package.json` scripts (`check`, `benchmarks:*`, the `npm install --prefix` inside wireit's typecheck task).
- Move `overrides` to `pnpm.overrides` with the same content.
- Optionally add `.npmrc` with `auto-install-peers=true` if peer-dep warnings get noisy (pnpm's default is stricter than npm's).
- **Smoke-test `vsce package`** against the migrated environment before merging — this is the highest-risk surface. If vsce trips on pnpm's symlinked node_modules, fall back to `vsce package --no-dependencies` in the build script. vsce 3.0+ has improved pnpm support; this should usually work without intervention but verify.

**Phantom-dep risk.** pnpm enforces "you can only import what you declared." Code that imports something a transitive dep happens to bring in will fail under pnpm. Most projects find 0–3 such cases. Fix is trivial (add the missing dep to `package.json`).

### 2. Pin Node version (`.nvmrc` or `.tool-versions`)

Single file at repo root pinning Node 22 — same version CI uses ([.github/workflows/ci.yml:31](.github/workflows/ci.yml#L31)). Brings local dev to parity with CI.

Choice: `.nvmrc` (nvm) or `.tool-versions` (asdf, mise). Both work; `.nvmrc` is more universal. One-line change either way.

### 3. Knip — dead-code and dep detection

Add [Knip](https://github.com/webpro-nl/knip) for finding:

- Unused exports
- Unused files
- Unlisted dependencies (imported but not in `package.json` — pnpm catches some of these too, but knip catches more)
- Unused dependencies (in `package.json` but never imported)

Setup: `pnpm add -D knip`, plus a `knip.json` config and a `knip` script.

This pairs well with the playground design's Phase 0 import audit — knip can drive that audit mechanically. Likely produces a list of items to address; tackle them in a follow-up rather than blocking this PR.

**Open question:** add `knip` to the `check` pipeline (warn-only initially, fail later) or keep it manual? Recommended path: warn-only in CI for the first 2 weeks, then promote to a hard gate once the baseline is clean.

### 4. `tsgo` opt-in (TypeScript-Go preview)

Microsoft's Go port of the TypeScript compiler — typically ~10x faster than `tsc` for typecheck. As of early 2026, still in preview as `@typescript/native-preview`.

Add as a parallel `typecheck:fast` script alongside the existing `typecheck`:

```jsonc
"typecheck:fast": "tsgo -p ./tsconfig.compile.json --noEmit && tsgo -p vscode-dvala/tsconfig.json --noEmit"
```

**The `tsc` task in CI is unchanged.** Use `tsgo` locally for fast iteration, especially during Phase 0/1 of the playground design where typecheck-watch matters for HMR DX. If `tsgo` errors on this codebase, the script just doesn't get used — no failure.

**The decision about whether `tsgo` should *replace* `tsc` (vs. stay opt-in) is deferred.** Revisit after a few weeks of using `typecheck:fast` and observing whether it produces the same diagnostics as `tsc`. Triggers to flip:

- `tsgo` hits stable 1.0
- We've used it for 2+ weeks with no spurious errors or missed errors
- A real pain point with `tsc` speed materializes (e.g. CI typecheck dominates wall time)

Until those, `tsgo` stays opt-in.

---

## Open Questions

- **`npm install` inside the `check` script.** Currently [package.json:131](package.json#L131) does `npm install && npm run lint && ...`. Under pnpm: keep `pnpm install` as the first step, or drop it? (pnpm's strict layout makes "did I forget to install?" failures more obvious than npm's, so the safety net matters less. But CI lockfile-drift safety might still want it.)
- **vsce + pnpm.** Will the existing vscode-dvala build path (`node vscode-dvala/build.mjs` plus `@vscode/vsce`) work cleanly under pnpm without `--no-dependencies`? Smoke test before merging.
- **Knip enforcement level.** Warn-only first vs. CI-gated immediately?
- **Node version pin format.** `.nvmrc` (nvm-only) or `.tool-versions` (asdf/mise)? Whichever the maintainer uses locally is the better default.
- **Whether to enable pnpm's `engine-strict=true`** to refuse install on a non-Node-22 host. Stricter, but correct given we already pin Node 22 in CI.

### Deferred decisions

- **`tsgo` replace vs. opt-in.** Deferred until `tsgo` reaches 1.0 and we've used `typecheck:fast` for 2+ weeks without surprises. See section 4.

---

## Implementation Plan

### Step 1: pnpm migration (single PR)

1. Run `pnpm install` locally to generate `pnpm-lock.yaml`. Delete `package-lock.json`.
2. Move `"overrides"` to `"pnpm": { "overrides": { ... } }` in root `package.json`.
3. Update all `package.json` scripts that reference `npm` (specifically lines 131, 144, 145, 216 of root + any in vscode-dvala). Update `npm install --prefix` to `pnpm install --dir`.
4. Update all four GitHub workflows: `pnpm/action-setup@v4`, `cache: 'pnpm'`, `pnpm install --frozen-lockfile`, `pnpm run ...`, and `pnpm version` in release.yml.
5. Update `.githooks/pre-push` to use `pnpm run benchmarks:run`.
6. Smoke test `vsce package` (build the VS Code extension) — ensure it produces a `.vsix` indistinguishable from the npm-built one. If it fails, add `--no-dependencies` to the vsce invocation in `vscode-dvala/build.mjs`.
7. Update README + CONTRIBUTING (or equivalent) with `pnpm install` instead of `npm install`. Update CLAUDE.md "Key Commands" section.
8. Run the full `pnpm run check:no-fix` pipeline to confirm no regressions. Surface any phantom-dep failures and add the missing deps to `package.json`.

### Step 2: tooling additions (same PR or fast-follow)

9. Add `.nvmrc` pinning Node 22 (or `.tool-versions` if preferred).
10. `pnpm add -D knip`. Create `knip.json` with reasonable defaults. Add `"knip": "knip"` script. Run once locally; document any baseline issues but don't block on them.
11. `pnpm add -D @typescript/native-preview`. Add `"typecheck:fast": "tsgo -p ./tsconfig.compile.json --noEmit && tsgo -p vscode-dvala/tsconfig.json --noEmit"` script. Try it once on this codebase; if it errors, document and revert (tsgo opt-in fails to land but doesn't block the rest of the PR).
12. Update CLAUDE.md to document: pnpm as the package manager, `.nvmrc` for Node version, `pnpm run knip` for dead-code checks, `pnpm run typecheck:fast` as the opt-in fast typecheck.

### Step 3: knip baseline cleanup (follow-up PR, not blocking)

13. If knip surfaced unused exports/files/deps, address them in a separate PR. Promote knip to a CI hard-gate once the codebase is clean.

---

## Phasing & Dependencies

- **No external dependencies.** Doesn't gate on anything in the playground design or shared-LS plan.
- **The playground design's Phase 0 work assumes pnpm if this lands first**, npm if it doesn't. Either ordering works; just pick one and document. Recommended order: this plan ships first (it's smaller and faster to validate), then the playground plan starts on the new package manager.
- **Step 3 (knip baseline cleanup) is non-blocking.** Step 1 + Step 2 can ship together in one PR. Step 3 is a follow-up that doesn't gate anything.

---

## Out of scope

These were considered and deliberately not included:

- **Replacing wireit.** It's doing exactly what wireit is for — pnpm doesn't replace it. No pain point justifying a swap.
- **Biome (replacing ESLint).** Project uses `@stylistic/eslint-plugin` for stylistic rules instead of Prettier; the classic "ESLint+Prettier→Biome" pitch only half-applies. Migration cost likely exceeds the speed win.
- **Bun.** Replaces too many things at once during a phase where stability matters. Defer until there's a concrete pain point Bun would solve.
- **TypeScript project references.** Would speed up incremental `tsc`, but `tsgo` makes most of that win moot. If `tsgo` doesn't pan out, revisit project references later.
- **Renovate / Dependabot.** Useful but unrelated to this plan's scope.
- **Formal pnpm workspaces.** Would require giving sub-trees their own `package.json` files. The project isn't structured that way today and there's no concrete benefit until shared-LS extraction happens. Revisit when shared modules need their own publish surface.
