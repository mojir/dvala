# Monorepo Decomposition — Clean One-Directional Packages

**Status:** Done — Definition of Done reached 2026-05-30 (PRs #202–#209)
**Created:** 2026-05-27 (supersedes the earlier "per-package wireit orchestration" framing)

## Goal

Decompose the root `@mojir/dvala` monolith into a clean, **one-directional** package DAG, adopt **Turborepo** for orchestration (replacing wireit), and **dissolve** the `@mojir/dvala` umbrella package. The priority is a future-proof, extensible repo with cleanly separated packages whose dependencies all point one way — not preserving how things work today.

This removes the single root cause behind three current problems (typecheck OOM, duplicated config, stray in-source build artifacts): the root `src/` is a *mid-graph monolith* that sub-packages depend **up** into, resolved through source path-mappings.

## Background

### Three symptoms, one cause

1. **Typecheck OOM.** `pnpm run typecheck` exhausted a 4 GB heap. Cause: `dvala-core-tooling` depends on the root `@mojir/dvala`, so pnpm created `packages/dvala-core-tooling/node_modules/@mojir/dvala → <repo root>`; since the root contains `packages/`, that's an infinite symlink cycle, and wireit's fast-glob fingerprinting (followSymlinks + dot, collapsing diverse globs to a repo-root base) walked it forever. Patched with `!**/node_modules/**` guards — a band-aid.
2. **Duplicated config.** The same ~29-glob list is hand-copied across five wireit scripts.
3. **In-source build artifacts.** Package builds emit `.js`/`.d.ts` next to source (only gitignored, not prevented). Measured per-package `tsgo -p ./tsconfig.json` emit, tree swept between runs:

   | package build | in-source artifacts |
   | --- | --- |
   | dvala-runtime | **0** |
   | dvala-core-tooling | 618 |
   | dvala-workspace-backend | 634 |
   | dvala-cli | 686 |
   | dvala-mcp-server | 638 |
   | apps/playground-www | 660 |

All three trace to: cross-package imports resolve through the root `tsconfig.json` `paths` → **source**, so each package build drags the whole transitively-imported root/sibling source (outside its `rootDir`) into its program and emits it in place. `dvala-runtime` is clean because it has no `@mojir/*` dependencies.

### Current dependency graph (the backward edge)

```
dvala-runtime          → (nothing)                         ✅ clean leaf
@mojir/dvala (ROOT)    → dvala-runtime
dvala-core-tooling     → @mojir/dvala (ROOT)                ⚠️ backward
dvala-workspace-backend → dvala-core-tooling
dvala-mcp-server       → @mojir/dvala (ROOT), dvala-core-tooling
dvala-cli              → @mojir/dvala (ROOT), core-tooling, runtime, workspace-backend
dvala-playground-www   → dvala-core-tooling, dvala-workspace-backend
```

The root `@mojir/dvala` holds the real tooling/LS/parser/typechecker code; `core-tooling` is literally `export * from '@mojir/dvala/tooling'`. So "core" lives at the root and packages reach back up into it.

### The cyclic core

The core subsystems form one strongly-connected component: `parser ↔ cst`, `parser ↔ evaluator`, `parser ↔ builtin`, `builtin ↔ evaluator`, `builtin ↔ getUndefinedSymbols` all import each other. The coupling is **mostly type-only but not entirely**:

| edge | value imports (non-type) |
| --- | --- |
| evaluator → parser | 6 |
| builtin → parser | 5 |
| evaluator → builtin | 5 |
| parser → builtin | 3 |
| parser → evaluator | 2 |
| builtin → evaluator | 0 (all type-only) |

So a large fraction of the tangle is cuttable by extracting a shared **AST/types leaf**; the residual is a bounded set of value-level imports — most importantly **`runtime → parser`** (evaluator + builtin importing parser values, ~11), which is the load-bearing thing to sever.

### Prior decisions that constrain this (from design docs)

- **Runtime ⊥ parser is a hard line (KMP).** Per `2026-03-23_multi-platform-runtime.md` + `2026-03-28_kmp-migration.md`: the runtime (evaluator, frames, context, effects, serialization, **and builtin functions**) is what a future Kotlin port implements; the **parser stays TypeScript-only**, with KMP consuming precompiled AST bundles + an AST *deserializer*. So `evaluator/builtin → parser` must break; `parser → evaluator/builtin` (tooling above runtime) is fine.
- **The type-only cycles were already meant to be cut by a shared AST-types module** — the first runtime slice planned `packages/dvala-runtime/src/ast/types.ts` (`2026-05-07_dvala-subprojects-and-release-train.md`, archived).
- **`evaluator ↔ builtin` value coupling stays internal to the runtime** — both are KMP-implemented, so co-locating them in `dvala-runtime` is correct, not a compromise.
- **Wire-format stabilization** (name-based builtin identifiers, AST/source-map separation; `2026-03-23_stabilize-wire-formats.md`) is the deeper KMP enabler — **separable** from this package split.
- **Target shape + one-directional rule already decided**; the `dvala-runtime` first slice shipped with temporary parser-types/bundler adapters; finer `core-tooling` granularity was explicitly deferred.

## Decisions (2026-05-27 interview)

1. **Full decomposition** — extract the root `src/` into real packages so every dependency points downward and nothing depends on `@mojir/dvala`. (Not just fixing build mechanics.)
2. **Dissolve `@mojir/dvala` entirely.** No package depends on it. The min/full/iife bundles are dropped (their shape is in poor state and their future is uncertain). **npm publish is paused.** A curated public facade can be re-created later, cheaply, *if and when* real external consumers appear — there are none today (only internal consumers).
3. **Pragmatic-layered package set** (see topology below): an AST/types leaf + `runtime` + one `core-tooling` + `workspace-backend` + clients. Finer tooling splits deferred until there's a forcing function.
4. **Runtime Model 2 (contract + injected engine).** `dvala-runtime` is the portable *contract* (host API, artifact/session/executor interfaces) — the code already follows this. A separate **engine** package (TS evaluator + builtins) *implements* it; KMP is a second implementation later. The concrete engine and runtime-value types do **not** live in `dvala-runtime` itself.
5. **Turborepo deferred into the decomposition, not a standalone foundation.** On today's root-centric task graph it would be an awkward, mostly-`//#` config that earns its keep only once packages own their tasks. Introduce it as that happens.
6. **Transition resolution: tsconfig `paths` → source.** Cross-package imports resolve to source via tsconfig `paths` (+ a vite alias for test/dev). The Oxc resolver behind rolldown/vite honors `paths`, so this needs **no build-ordering wiring** — confirmed by a clean build with the leaf's `dist` deleted (the bundle inlined the leaf from source; the built CLI ran). Each standalone-`paths` tsconfig (root, `vscode-dvala`) must add the new package's mapping. The dist/`exports` resolution (validated by the spike) is the **end-state**, reserved for the Turborepo/publish era.
7. **Sequencing: integration branch with reviewed PRs, solo-focused** — see below.

### Progress / RESUME HERE (updated 2026-05-27)

**Types-leaf extraction COMPLETE and merged to main** (`@mojir/dvala-types` is the dependency-free owner of the full type vocabulary):
- **PR #193 (merged):** leaf scaffold + zero-dep foundation — `constants`, `utils/symbols`, the HAMT `persistent` data structures.
- **PR #194 (merged):** foundational vocab (`Arity`, special-expr types, `SourceCodeInfo`, reserved names) + the value/AST vocabulary (`interface.ts` → `values.ts`, `parser/types.ts` → `ast.ts`). Broke the `Any ↔ DvalaFunction` cycle (co-located); opaqued `Context` → `unknown` in `EvaluatedFunction` (6 consumer casts). `src/interface.ts` and `src/parser/types.ts` no longer exist.
- Resolution stays **source-via-tsconfig-`paths`** (+ vite alias); no build-ordering wiring. Leaf imports nothing external (only `vitest` in its tests).
- Discipline that mattered: re-point **by module name** (catch `../x`/`./x`, not just `dir/x`); always **sweep in-source `.js`/`.d.ts` artifacts before typecheck** — stale emitted `.d.ts` *mask* broken imports otherwise.

**NEXT (do this first next session): `dvala-engine` extraction (Model 2) + `runtime → parser` sever.**
- **Spike result (done):** `runtime → parser` is cleanly **severable** — only 3 call sites (evaluator import-resolution ×2, `initCoreDvala` ×1), all the same "compile source → AST" capability (tokenize + parse). Sever by injecting a `parseSource` host capability into the evaluator `env` (which already threads `allocateNodeId`/`debug`/`getModule`); TS host (`createDvala`) supplies tokenize+parse; KMP supplies precompiled AST. `initCoreDvala` is a host-init step → relocates to the host with the engine boundary.
- **Engine boundary mapped** — candidate engine = `src/evaluator` + `src/builtin` (+ their `.dvala` sources). Its outward pulls from the rest of `src/`: `typeGuards` (118), `utils` (61), `tokenizer` (8), `parser` (3, the sever target), `reference` (1, must sever).

#### Boundary decisions (2026-05-28 interview — DECIDED)

The boundary-decisions interview is **closed**. Lock these answers; do not re-litigate during execution.

1. **`typeGuards/` → `@mojir/dvala-types` leaf.** Pure predicates over leaf vocab (imports nothing but `@mojir/dvala-types`). Confidence: high. Rationale: leaf already ships `isPersistentVector`/`isPersistentMap` next to the persistent collections — same pattern. No new package edge created; both engine and tooling already depend on the leaf. Alternatives rejected: into `dvala-engine` would force a `dvala-core-tooling → dvala-engine` backward edge for ~7 sites; a new shared package isn't justified by the volume.

2. **`src/utils/` → per-file split.**
   - **To leaf:** `arity.ts`, `debug/`, `getAssertionError.ts` — validators and diagnostic primitives that operate on leaf types and are needed by both engine and tooling.
   - **To engine:** `interop.ts`, `maybePromise.ts`, `docString/` — engine-internal mechanics (JS↔Dvala interop, effect plumbing, builtin doc generation).
   - **`utils/index.ts` barrel dissolves** — each consumer imports from the actual home.
   - Confidence: medium-high (down from high — a new `dvala-utils` package has a real, currently-untriggered benefit of keeping the leaf strictly types+predicates; we'd extract later if needed).
   - **Independent caveat (must address in this same pass):** `arity`/`debug/`/`getAssertionError` all transitively depend on `src/errors.ts`, which today imports `evaluator/callStack`. Anything moving to the leaf can't reach engine code, so this edge must be inverted before the moves complete.

3. **Engine package = `@mojir/dvala-engine`.** Model 2 confirmed: engine *implements* the `dvala-runtime` contract (host/session/executor interfaces). Value vocabulary stays in `dvala-types`; contract stays in `dvala-runtime`; concrete evaluator + builtins live in engine. KMP becomes a second implementation of the same contract later.
   - **First-PR scope (definite):** `src/evaluator/`, `src/builtin/` (incl. `.dvala` sources), `src/resume.ts`, `src/retrigger.ts`, plus the engine-only utils from (2): `interop.ts`, `maybePromise.ts`, `docString/`.
   - **Gray-zone (adjudicate file-by-file during execution, not now):** `src/runtime/{scopeToGlobalContext, createRuntimeRunner, createAstBuilder, createDefaultRuntimeBridgeAdapter}` (likely engine — bridge-adapter side); `Cache.ts` (engine — sole consumer is `runtime/createAstBuilder`); `allModules.ts` (engine surface, but consumed by typechecker tests + `tooling.ts` — needs a placement call); `prettyPrint.ts` (genuinely shared by builtin + typechecker + playground — deserves its own placement question when touched); `ast/expandMacros.ts` (stays in tooling — typechecker consumer; lands in `core-tooling` later).

4. **`reference/` → relocate the 3 type-only edges into engine.** `EffectReference`, `FunctionReference` move from `reference/index.ts` into engine (likely co-located with `FunctionDocs`/`SpecialExpressionDocs` in `src/builtin/interface.ts`). `CoreNormalExpressionName` moves from `reference/api.ts` into engine (it's derived from the engine's own builtin registry — properly engine-owned). `reference/` re-imports them from engine, matching the direction it already takes for `FunctionDocs`/`SpecialExpressionDocs`. Confidence: high. After this, `reference → engine` is the single direction (matches reality — `reference/index.ts` already pulls dozens of values from `src/builtin/*`).

#### Then execute
As a dedicated pass on its own branch → PR (foundation-style), with sweep-before-verify throughout.

### PR G followups (next, before core-tooling)

PR G shipped (#202, merged 2026-05-28). Three known followups, attacking in order:

- **PR H — move cyclic engine tests to `__tests__/`.** ~70 engine test files import `@mojir/dvala` (umbrella) for `createDvala` (68) or `getUndefinedSymbols` (2). They're integration tests of the host running engine code; architecturally they belong at host level. Moves them to `__tests__/`, updates imports (engine internals via `@mojir/dvala-engine`, host orchestrator stays `@mojir/dvala`), then removes engine's `@mojir/dvala` devDep. Clears the workspace cyclic-deps warning. Foundation for PR I.
- **PR I — engine rolldown bundling.** Engine dist currently has raw `.dvala` imports (tsgo doesn't inline) — bench uses a tsx loader workaround. Add rolldown config for engine mirroring root's `.dvala` plugin so `packages/dvala-engine/dist/index.js` is self-contained. Drop the loader.
- **PR J — full reference-types relocation (deferred PR D).** Move `FunctionReference`, `EffectReference`, `Argument`, `TypedValue`, `CommonReference`, `Variant` + the 13 ApiName sub-unions and `api.ts` machinery from `reference/` into engine. `reference/` re-imports. Delete `packages/dvala-engine/src/reference-shapes.ts`. Confirms `reference → engine` as the only direction.

### Remaining after the followups
`core-tooling` ownership (move parser/cst/formatter/typecheck/LS into `dvala-core-tooling`), dissolve `@mojir/dvala` (re-point clients, drop bundles, pause npm), Turborepo per-package.

### Hard constraint

The playground must stay **live** at `https://mojir.github.io/dvala/` throughout (it may *lag* — need not update on every merge). Already guaranteed: [deploy-pages.yml](../../.github/workflows/deploy-pages.yml) has `deploy` with `needs: build`, so a failed build skips deploy and the last good site keeps serving (fail-closed). A broken intermediate build means the site is stale, not down.

## Target package topology

```
dvala-types (leaf)         → (nothing)                       [AST + value vocab + tokens + constants]
dvala-runtime (contract)   → dvala-types                     [host/session/executor interfaces; KMP implements this]
dvala-engine (TS impl)     → dvala-types, dvala-runtime       [evaluator + builtins; implements the contract; NO parser dep]
dvala-core-tooling         → dvala-types, dvala-runtime
dvala-workspace-backend    → dvala-core-tooling, dvala-engine
dvala-cli / dvala-mcp-server / apps/playground-www / vscode-dvala → (the above)
(no @mojir/dvala package)
```

- **`dvala-types`** (leaf, **created**) — shared AST node types, value vocabulary (`Any`, the `DvalaFunction` family…), token types, constants/symbols. No dependencies. Breaks the type-only majority of the core cycles.
- **`dvala-runtime`** (contract) — host/session/executor interfaces, artifact/capability types. Portable; KMP implements against it. No engine code.
- **`dvala-engine`** (TS impl; name TBD) — evaluator, builtins (as functions), effects, continuations/serialization. Implements the runtime contract. **Must not depend on the parser.**
- **`dvala-core-tooling`** — tokenizer, parser, cst, formatter, typechecker, languageService, AutoCompleter, getUndefinedSymbols, completion/diagnostic helpers. TypeScript-only.
- **`dvala-workspace-backend`**, **clients** — re-point imports off `@mojir/dvala` onto specific packages.
- **Transition resolution:** cross-package imports resolve to **source via tsconfig `paths`** (no build-ordering). **End-state:** dist/`exports` resolution under Turborepo (scoped per-package builds, stops in-source emit).

Placement of low-level/edge pieces (`tokenizer` impl vs token *types*, `bundler`, reference data, `testFramework`, `typeGuards`) is settled during execution, with the principle: types the runtime needs → the leaf; TS-only syntax/tooling → `core-tooling`.

## The cycle-breaking work (the crux)

1. **Extract the AST/types leaf** — cuts the type-only majority cheaply.
2. **Sever `runtime → parser`** — the ~11 value imports (evaluator→parser 6, builtin→parser 5). Load-bearing; **front-load this as a spike** (see risks). `evaluator ↔ builtin` stays internal to `runtime`.
3. **Wire-format stabilization** (name-based builtins, position/source-map separation) — needed for KMP serialization, **not required** for the package split. Track separately; do not let it expand this effort's scope.

## Sequencing & branch strategy

**Foundations on main first** (independently valuable; banks insurance against a stall):
- Extract the `dvala-types` leaf — zero-dep foundation first (constants + symbols, **done**), then the value/AST vocabulary. Wired via tsconfig `paths` + vite alias; **no Turborepo needed yet**.
- (Turborepo is introduced later, once packages own their tasks — see Decisions 5.)

**Integration branch `decomp`** for the interdependent remainder, with small reviewed PRs merged *into the branch* (not main):
- Move tooling code into `core-tooling` (it owns the code, no longer re-exports from root).
- Sever `runtime → parser`.
- Dissolve `@mojir/dvala`; re-point all internal consumers (cli, mcp, playground, vscode) onto specific packages; drop the min/full/iife bundles; pause npm publish.

Merge the branch to main once at the end (`--no-ff`, preserving the reviewed PR history).

**Guardrails:**
- CI must run green on the integration branch **and** every PR into it (add `decomp` to the `ci.yml` triggers — it currently keys on `main`).
- **Front-load the `runtime → parser` severing spike as the first branch PR** — it's the one place a fundamental surprise could live; prove severability before sinking weeks.
- If any hotfix lands on main mid-effort, rebase/merge it into `decomp` promptly (drift ≈ 0 while solo-focused).
- Clear branch exit criteria (see Definition of done) so "done" is unambiguous.

Rationale: the cross-cutting steps don't decompose into clean green-on-main increments without throwaway shims; an integration branch reaches the clean end-state without shipping half-states, while PRs-against-the-branch keep full reviewability and solo-focus keeps drift near zero. The playground stays live throughout via the fail-closed deploy.

## Risks & mitigations

- **`runtime → parser` resists severing** (e.g., macro expansion or import resolution needs the parser at runtime). → Front-loaded spike. If fundamental, fall back to a narrow runtime-owned interface/adapter or revisit the boundary before committing the rest.
- **All-or-nothing on the branch** — if the effort stalls, main got nothing. → The two foundations land on main first; the "work until done" commitment is the premise.
- **Turborepo migration touches the build entrypoint** — the Pages workflow runs `pnpm run build-book`. → Repoint it to the Turbo equivalent (must still produce `docs/`); keep the build-before-`upload-pages-artifact` shape so the deploy stays fail-closed.
- **tsgo + built-`.d.ts` resolution unproven** — confirm tsgo resolves a dependency through its `dist/*.d.ts` (not only source path-maps) early; per-package typecheck stays `tsgo -p ./tsconfig.json --noEmit` (no reliance on a `tsgo --build` mode).
- **Broad consumer re-pointing** — mechanical but touches every client; covered by the per-PR reviews on the branch.

## Open questions

- Exact placement of `tokenizer` impl vs token types, `bundler`, reference data, `testFramework`. (~~`typeGuards`~~ — decided 2026-05-28: leaf.)
- ~~Does the evaluator's parser dependency resist clean severing?~~ — spike says no; 3 sites, all the same capability.
- Timing of wire-format stabilization (name-based builtins) — KMP-relevant, separable from this.
- Whether to keep producing *any* bundle (a build-only top entry) or none until consumers exist (currently: none).
- ~~Final name for the AST/types leaf package.~~ — `@mojir/dvala-types` (shipped #193/#194).
- Gray-zone files inside the engine extraction (`src/runtime/*`, `Cache.ts`, `allModules.ts`, `prettyPrint.ts`) — adjudicated file-by-file during execution per the 2026-05-28 interview.

## Definition of done

- Clean one-directional DAG; **nothing depends on `@mojir/dvala`** (dissolved).
- **Turborepo** orchestrates; wireit removed; no duplicated glob lists; the `!**/node_modules/**` band-aids removed (the symlink cycle is gone with the backward edge).
- `dvala-runtime` has **no parser dependency**.
- **No in-source `.js`/`.d.ts` emit** (verified by building every package with the tree swept clean → zero), and the in-source artifact `.gitignore` rules are **removed**, not relied upon.
- Playground builds and the live Pages site stayed up throughout; deploy remains fail-closed.
- npm publish intentionally paused and documented; bundles dropped.
