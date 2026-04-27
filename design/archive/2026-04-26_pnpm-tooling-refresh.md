# pnpm Migration + Tooling Refresh

**Status:** Draft
**Created:** 2026-04-26

## Goal

Migrate the project from npm to pnpm, plus three co-shippable tooling additions (`.nvmrc` to pin Node, **Knip** for dead-code/dep detection, opt-in **`tsgo`** for fast typecheck iteration) and one fast-follow once the migration is on `main`: **Renovate** for automated dependency upgrades.

Single PR for the migration + co-shippable tooling, then Renovate as a fast-follow. Independent of and *not* bundled with the playground design doc ([2026-04-26_playground-monaco-tree-ls-cli.md](2026-04-26_playground-monaco-tree-ls-cli.md)) — these are infrastructure changes that complicate the playground refactor if combined.

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

None of these are being replaced. The work below is additive (pnpm, knip, tsgo opt-in, Renovate fast-follow) plus one config field migration (`overrides` → `pnpm.overrides`).

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

- `pnpm install` locally to generate `pnpm-lock.yaml`. **Commit the lockfile and delete `package-lock.json` from git in the same change** — CI uses `--frozen-lockfile` and will fail on a fresh checkout if the lockfile isn't tracked.
- Add `"packageManager": "pnpm@<version>"` to root `package.json`. Corepack uses this to auto-install the correct pnpm version on a fresh checkout, so contributors don't need a manual `npm i -g pnpm` step.
- Add `"engines": { "node": ">=22 <23" }` to root `package.json` if not already present. Pairs with `.nvmrc` (section 2) and lets `engine-strict=true` actually enforce something.
- Update all CI workflows to use `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile`.
- Update the pre-push hook to `pnpm run benchmarks:run`.
- Update inline references in `package.json` scripts (`check`, `benchmarks:*`, the `npm install --prefix` inside wireit's typecheck task).
- Move `overrides` to `pnpm.overrides` with the same content.
- Add `.npmrc` with: `auto-install-peers=true` (pnpm's default is stricter than npm's), and optionally `engine-strict=true` to enforce the Node version on install.
- **Smoke-test `vsce package`** against the migrated environment before merging — this is the highest-risk surface. Note: [vscode-dvala/build.mjs:39](vscode-dvala/build.mjs#L39) already passes `--no-dependencies` to vsce, so we're starting at the safe baseline. Just rebuild and confirm the `.vsix` is byte-equivalent (or at least functional) vs. the npm-built one. If something still goes wrong (e.g. vsce can't find its own binary at `../node_modules/.bin/vsce` under pnpm's symlinked layout), the fallback is `node-linker=hoisted` in `.npmrc`, which flattens pnpm to npm-like and sacrifices strict-layout phantom-dep detection.
- **Smoke-test wireit caching** after migration: a fresh `pnpm run check:no-fix` followed by an immediate second run should be fast (cache hit). Confirms wireit's content-tracking still works under pnpm's symlinked node_modules.

**Phantom-dep risk.** pnpm enforces "you can only import what you declared." Code that imports something a transitive dep happens to bring in will fail under pnpm. Most projects find 0–3 such cases. Fix is trivial (add the missing dep to `package.json`).

**`npx` calls in scripts.** [package.json](package.json) has many `npx` invocations (`npx tsx`, `npx playwright`, `npx serve`, `npx @modelcontextprotocol/inspector`). These keep working under pnpm — `npx` is a Node tool, not npm-specific. **Leave them alone.** Mass-converting to `pnpm dlx` is churn for no functional benefit.

**`npm publish` for the publish step.** [publish.yml:33](.github/workflows/publish.yml#L33) uses `npm publish --provenance --access public`. **Keep this as `npm publish`** even after the migration — npm's publish pipeline is what the npm registry expects, and `--provenance` is well-tested with npm. Use pnpm everywhere else; use `npm` only for the registry-publishing step.

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

Microsoft's Go port of the TypeScript compiler — typically ~10x faster than `tsc` for typecheck. As of early 2026, still in preview as `@typescript/native-preview` (verify the exact package name at install time — it has shifted before and may be renamed at 1.0).

**Status (2026-04-27 attempt):** tsgo `7.0.0-dev.20260427.1` does not run on this codebase without `tsconfig.json` changes — it errors on `downlevelIteration` (removed) and `moduleResolution: "node"` (removed; needs `"node10"`, `"node16"`, or `"bundler"`). Touching those settings is risky because it also affects `tsc`'s build. Per plan section 4, the script doesn't get used — opt-in failed to land but doesn't block the migration. Revisit when tsgo nears 1.0 and can either accept the legacy options or when we're ready to migrate to a modern `moduleResolution` value (likely `bundler` given rolldown).

Add as a parallel `typecheck:fast` script alongside the existing `typecheck`. The existing wireit typecheck task does `npm install --prefix vscode-dvala && tsc -p ./tsconfig.compile.json --noEmit && tsc -p vscode-dvala/tsconfig.json --noEmit` — the `--prefix` install ensures vscode-dvala's deps are present. `typecheck:fast` mirrors that:

```jsonc
"typecheck:fast": "pnpm install --dir vscode-dvala && tsgo -p ./tsconfig.compile.json --noEmit && tsgo -p vscode-dvala/tsconfig.json --noEmit"
```

(If skipping the install in the inner dev loop materially helps, add a `typecheck:fast:no-install` variant for when vscode-dvala deps are already up to date.)

**The `tsc` task in CI is unchanged.** Use `tsgo` locally for fast iteration, especially during Phase 0/1 of the playground design where typecheck-watch matters for HMR DX. If `tsgo` errors on this codebase, the script just doesn't get used — no failure.

**The decision about whether `tsgo` should *replace* `tsc` (vs. stay opt-in) is deferred.** Revisit after a few weeks of using `typecheck:fast` and observing whether it produces the same diagnostics as `tsc`. Triggers to flip:

- `tsgo` hits stable 1.0
- We've used it for 2+ weeks with no spurious errors or missed errors
- A real pain point with `tsc` speed materializes (e.g. CI typecheck dominates wall time)

Until those, `tsgo` stays opt-in.

### 5. Renovate — automated dependency upgrades (fast-follow)

Add [Renovate](https://github.com/apps/renovate) (Mend-hosted GitHub App, free for open-source) for grouped weekly upgrade PRs with auto-merge for low-risk updates. Lands *after* the pnpm migration is on `main`, not in the same PR — a bad pnpm interaction would otherwise be hard to attribute.

**Why Renovate (not Dependabot).** Dependabot is GitHub-native and zero-config but has coarser grouping and auto-merge. With ~100 dev deps, Renovate's `packageRules` are the difference between "one weekly PR I skim" and "a dozen PRs I ignore." Renovate also has first-class pnpm support (understands `pnpm.overrides`, lockfile maintenance) and can pin GitHub Actions to commit digests for supply-chain safety.

**Config sketch** (commit as `renovate.json` at repo root):

```jsonc
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":dependencyDashboard", ":semanticCommits"],
  "schedule": ["before 6am on monday"],
  "timezone": "Europe/Stockholm",
  "prConcurrentLimit": 5,
  "lockFileMaintenance": { "enabled": true, "schedule": ["before 6am on monday"] },
  "packageRules": [
    {
      "description": "Group dev-dep minor/patch and auto-merge",
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "dev dependencies (non-major)",
      "automerge": true
    },
    { "matchPackagePatterns": ["^eslint", "^@typescript-eslint/", "^@stylistic/"], "groupName": "eslint ecosystem" },
    { "matchPackageNames": ["typescript", "@typescript/native-preview"], "groupName": "typescript" },
    { "matchPackagePatterns": ["^vitest", "^@vitest/"], "groupName": "vitest" },
    {
      "description": "Manual review for runtime deps and all majors",
      "matchDepTypes": ["dependencies"], "automerge": false, "labels": ["runtime-dep"]
    },
    { "matchUpdateTypes": ["major"], "automerge": false, "labels": ["major-update"] },
    { "matchManagers": ["github-actions"], "pinDigests": true }
  ],
  "vulnerabilityAlerts": { "labels": ["security"], "automerge": true, "schedule": ["at any time"] }
}
```

Behavior summary: one grouped Monday PR for dev-dep minor/patch (auto-merge if `/check` passes); vulnerability alerts run any time and auto-merge; `lockFileMaintenance` weekly to refresh transitives without bumping declared ranges; runtime deps and majors always require manual review (labeled for filtering); GitHub Actions pinned to commit digests as defense against tag-rewrite supply-chain attacks.

**Auto-merge prerequisites.** Branch protection on `main` already requires `/check`; Renovate inherits that gate. The GitHub App grants merge permission. `/check` must be stable — if it's flaky, auto-merge is either annoying (false fails) or dangerous (false passes). If unsure, ship with `automerge: false` everywhere and enable per-group as confidence builds.

---

## Open Questions

- **`npm install` inside the `check` script.** Currently [package.json:131](package.json#L131) does `npm install && npm run lint && ...`. Under pnpm: keep `pnpm install` as the first step, or drop it? (pnpm's strict layout makes "did I forget to install?" failures more obvious than npm's, so the safety net matters less. But CI lockfile-drift safety might still want it.)
- **vsce + pnpm.** Will the existing vscode-dvala build path (`node vscode-dvala/build.mjs` plus `@vscode/vsce`) work cleanly under pnpm without `--no-dependencies`? Smoke test before merging.
- **Knip enforcement level.** Warn-only first vs. CI-gated immediately?
- **Node version pin format.** `.nvmrc` (nvm-only) or `.tool-versions` (asdf/mise)? Whichever the maintainer uses locally is the better default.
- **Whether to enable pnpm's `engine-strict=true`** to refuse install on a non-Node-22 host. Stricter, but correct given we already pin Node 22 in CI.
- **Renovate auto-merge from day one, or warm-up period?** Recommended: ship with auto-merge enabled for dev-dep minor/patch since `/check` is comprehensive. Dial back if the first 2–3 weeks produce surprises.
- **Renovate schedule day.** Monday before 6am means PRs ready when the week starts. Friday afternoon is the alternative (review-and-merge before weekend).
- **Renovate concurrent PR limit.** Set to 5 in the config sketch. Lower if the dashboard gets noisy; higher if grouping leaves PRs queued.
- **Is the `file-type` override at [package.json:3-4](package.json#L3) still needed?** If it's residue from a fixed upstream issue, drop it as a 1-line cleanup before Renovate starts proposing bumps for it. If still needed, add a `# renovate: ignore` comment so Renovate doesn't fight the pin.
- **GitHub Actions digest-pinning churn.** `pinDigests: true` produces a PR every action release. Project has only 4 workflows so churn should be low — turn off if the noise outweighs the supply-chain safety value.

### Deferred decisions

- **`tsgo` replace vs. opt-in.** Deferred until `tsgo` reaches 1.0 and we've used `typecheck:fast` for 2+ weeks without surprises. See section 4.

---

## Implementation Plan

### Step 1: pnpm migration (single PR)

**Order matters:** edit all configuration *before* generating the lockfile. If `pnpm install` runs while `overrides` is still at the top level instead of under `pnpm.overrides`, pnpm ignores it and the lockfile reflects the wrong resolution.

1. Edit root `package.json`:
   - Add `"packageManager": "pnpm@<latest>"` (Corepack auto-installs the matching version on fresh checkouts).
   - Add `"engines": { "node": ">=22 <23" }`.
   - Move `"overrides": {...}` to `"pnpm": { "overrides": {...} }`.
2. Add root `.npmrc` with `auto-install-peers=true` and `engine-strict=true`.
3. Update all `package.json` scripts that reference `npm` (specifically [package.json:131](package.json#L131) `check`, [package.json:144-145](package.json#L144) `benchmarks:*`, [package.json:216](package.json#L216) inside the wireit `typecheck` task). Convert `npm install --prefix` → `pnpm install --dir`. Leave `npx` calls alone.
4. Update all four GitHub workflows: `pnpm/action-setup@v4`, `cache: 'pnpm'`, `pnpm install --frozen-lockfile`, `pnpm run ...` (covers `npm run check:no-fix` at [ci.yml:36](.github/workflows/ci.yml#L36), `npm run build` at [ci.yml:54](.github/workflows/ci.yml#L54), `npm run test:e2e` at [ci.yml:56](.github/workflows/ci.yml#L56), `npm run check:no-fix` at [publish.yml:27](.github/workflows/publish.yml#L27), `npm run build-book` at [publish.yml:31](.github/workflows/publish.yml#L31) and [deploy-pages.yml:34](.github/workflows/deploy-pages.yml#L34)). In `release.yml` update `npm version` → `pnpm version`. In `publish.yml` **keep `npm publish`** (registry compatibility).
5. Update [.githooks/pre-push](.githooks/pre-push) to use `pnpm run benchmarks:run` (3 references: lines 11 and 136 are comments, line 139 is the live invocation — update all three for consistency).
6. **Now** run `pnpm install` locally to generate `pnpm-lock.yaml` (the lockfile will reflect the moved `pnpm.overrides`).
7. Stage `pnpm-lock.yaml`; `git rm package-lock.json`. CI's `--frozen-lockfile` will fail without the new lockfile committed.
8. Smoke test `vsce package` (run `node vscode-dvala/build.mjs` or whatever the build script is). [vscode-dvala/build.mjs:39](vscode-dvala/build.mjs#L39) already uses `--no-dependencies`, so the smoke test is just "does the build still produce a usable `.vsix` under pnpm's layout?" If `vsce` can't resolve its own binary via `../node_modules/.bin/vsce`, fall back to `node-linker=hoisted` in `.npmrc`.
9. Smoke test wireit caching: clean `.wireit`, run `pnpm run check:no-fix` twice. Second run should be substantially faster (cache hit). Confirms wireit's file-tracking works under pnpm's symlinked layout.
10. Update [CLAUDE.md](CLAUDE.md) — replace `npm run` with `pnpm run` throughout: "Key Commands" section (lines 9-14, 22, 27), "Demo Convention" section (lines 56, 93-95, 106), "Skills & Agents" section (line 121). Update "Run npm run check after any medium or larger code change" wording to match. (Note: README.md's user-facing `npm install @mojir/dvala` examples on lines 100, 130 are end-user install instructions — leave those as-is. No CONTRIBUTING file exists.)
11. Run the full `pnpm run check:no-fix` pipeline to confirm no regressions. Surface any phantom-dep failures and add the missing deps to `package.json`.
12. **Note for whoever lands the PR:** the first CI run after this PR will be slow (cold pnpm cache). GitHub Actions cache key changes when `package-lock.json` → `pnpm-lock.yaml`. Subsequent runs are fast.

### Step 2: tooling additions (same PR or fast-follow)

13. Add `.nvmrc` pinning Node 22 (or `.tool-versions` if preferred).
14. `pnpm add -D knip`. Create `knip.json` with reasonable defaults. Add `"knip": "knip"` script. Run once locally; document any baseline issues but don't block on them.
15. `pnpm add -D @typescript/native-preview` (verify package name first — see section 4 caveat). Add `"typecheck:fast": "pnpm install --dir vscode-dvala && tsgo -p ./tsconfig.compile.json --noEmit && tsgo -p vscode-dvala/tsconfig.json --noEmit"` script. Try it once on this codebase; if it errors, document and revert (tsgo opt-in fails to land but doesn't block the rest of the PR).
16. Update [CLAUDE.md](CLAUDE.md) again to document: pnpm as the package manager (already done in step 10 above), `.nvmrc` for Node version, `pnpm run knip` for dead-code checks, `pnpm run typecheck:fast` as the opt-in fast typecheck. Add "Toolchain" section if not already present.

### Step 3: Renovate setup (fast-follow, after Step 1+2 has shipped to `main`)

17. Audit the `file-type` override at [package.json:3-4](package.json#L3). If still needed, leave it; if residue, drop it now so Renovate doesn't immediately propose un-pinning.
18. Install the [Renovate GitHub App](https://github.com/apps/renovate) on `mojir/dvala`. Grant the requested permissions.
19. Renovate opens an onboarding PR titled "Configure Renovate." Replace its proposed config with the `renovate.json` from section 5 above. Merge.
20. Review the first wave: one grouped "dev dependencies (non-major)" PR (auto-merges if `/check` passes), possibly several major-bump PRs labeled `major-update` (review individually), any vulnerability fixes labeled `security`.
21. Update [CLAUDE.md](CLAUDE.md) with a short "Dependencies" section: Renovate runs Mondays before 6am Europe/Stockholm; dev-dep minor/patch auto-merges on green `/check`; runtime-dep and major-update PRs require manual review; the dashboard issue is the source of truth.
22. After 2 weeks live: audit PR volume, auto-merge success rate, any deps Renovate didn't pick up. Tune `packageRules` if needed.

### Step 4: knip baseline cleanup (follow-up PR, not blocking)

23. If knip surfaced unused exports/files/deps, address them in a separate PR. Promote knip to a CI hard-gate (add to `check` pipeline) once the codebase is clean — until then, it stays a warn-only manual command.

---

## Phasing & Dependencies

- **No external dependencies.** Doesn't gate on anything in the playground design or shared-LS plan.
- **The playground design's Phase 0 work assumes pnpm if this lands first**, npm if it doesn't. Either ordering works; just pick one and document. Recommended order: this plan ships first (it's smaller and faster to validate), then the playground plan starts on the new package manager.
- **Step 3 (Renovate) sequences after Step 1+2 lands on `main`.** Same PR or concurrent PRs would muddy attribution if anything breaks. Once pnpm is on `main`, Renovate can land any time — no further gating.
- **Step 4 (knip baseline cleanup) is non-blocking.** Step 1 + Step 2 ship together in one PR. Step 3 is a fast-follow. Step 4 doesn't gate anything.

---

## Out of scope

These were considered and deliberately not included:

- **Replacing wireit.** It's doing exactly what wireit is for — pnpm doesn't replace it. No pain point justifying a swap.
- **Biome (replacing ESLint).** Project uses `@stylistic/eslint-plugin` for stylistic rules instead of Prettier; the classic "ESLint+Prettier→Biome" pitch only half-applies. Migration cost likely exceeds the speed win.
- **Bun.** Replaces too many things at once during a phase where stability matters. Defer until there's a concrete pain point Bun would solve.
- **TypeScript project references.** Would speed up incremental `tsc`, but `tsgo` makes most of that win moot. If `tsgo` doesn't pan out, revisit project references later.
- **Snyk / Socket.dev / supply-chain risk analysis.** Distinct concern (malicious packages, install scripts, license risk) from version freshness. Renovate's `vulnerabilityAlerts` covers known CVEs; deeper supply-chain analysis is a separate decision.
- **`pnpm audit` as a hard CI gate.** Renovate's `vulnerabilityAlerts` already opens PRs for fixable CVEs. Adding `pnpm audit` to the `check` pipeline is redundant and produces noise on advisories that have no fix yet.
- **Self-hosted Renovate.** Mend's hosted version is free for open-source and adequate at this scale.
- **Formal pnpm workspaces.** Would require giving sub-trees their own `package.json` files. Out of scope for *this* PR — but **recommended as a fast-follow before shared-LS extraction begins** (see [2026-04-27_workspace-conversion.md](2026-04-27_workspace-conversion.md)). Validating the workspace setup in isolation (does vsce still work? does release.yml's version sync still work?) is cheaper than bundling it with shared-LS extraction's package design.
