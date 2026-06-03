# Backend Authority — Active Roadmap

**Status:** Active
**Created:** 2026-05-26

## Purpose

This is the single active execution doc for the backend-authority effort. It consolidates and replaces three docs that have either fully landed or settled into a small, concrete backlog:

- [2026-05-07_dvala-subprojects-and-release-train.md](../archive/2026-05-07_dvala-subprojects-and-release-train.md) — archived; first `dvala-runtime` extraction + workspace/package promotions landed.
- [2026-05-09_dvala-backend-api-first-boundary.md](../archive/2026-05-09_dvala-backend-api-first-boundary.md) — archived; analysis + runtime-session seams proven; its open questions are carried below as the cleanup backlog.
- [2026-05-12_backend-authority-execution-board.md](../archive/2026-05-12_backend-authority-execution-board.md) — archived; all A1–D2 items completed, workspace-backend package promoted.

The long-term vision remains the standalone north-star in [2026-05-06_dvala-backend-authority.md](2026-05-06_dvala-backend-authority.md), including the settled-but-not-started portable runtime + signed-artifact (CBOR/COSE) direction. This doc tracks only the active near-term execution toward that vision.

---

## What has shipped

- **Monorepo decomposition complete** (PRs #202–#209, May 2026): root `src/` no longer exists. 8 real packages under `packages/*` (`dvala-types`, `dvala-runtime`, `dvala-engine`, `dvala-core-tooling`, `dvala-test-framework`, `dvala-workspace-backend`, `dvala-cli`, `dvala-mcp-server`) plus `apps/playground-www`. Build orchestration via Turborepo; per-package rolldown + tsgo `--emitDeclarationOnly`. See archived [2026-05-27_monorepo-decomposition.md](../archive/2026-05-27_monorepo-decomposition.md) and [2026-05-26_monorepo-package-boundary-strategy.md](../archive/2026-05-26_monorepo-package-boundary-strategy.md).
- **Runtime/engine split landed.** `packages/dvala-runtime` holds the portable contract (run/resume entry, artifacts, capabilities); `packages/dvala-engine` holds the TS implementation of that contract (evaluator, builtins, interop). Both packages have **zero external imports** — they're self-contained, so the boundary adapters from the first extraction (parser/types dependency, `DvalaBundle` compat shape) are gone.
- **Backend authority lives in `packages/dvala-workspace-backend`.** Owns document lifecycle, analysis requests, and runtime-session lifecycle. Was originally seeded under root `src/backend/` and promoted to its own package 2026-05-13.
- **Analysis seam proven** (diagnostics, formatting, hover, completion, navigation routed through backend authority).
- **Runtime-session seam proven** (`startSession`, `resumeSnapshot`, `inspectSession`, `stopSession`, snapshot inspection + backend-owned `validateSnapshot`).
- **First consumers migrated to the workspace-backend package:** CLI runtime client, VS Code diagnostics client, playground LS worker + runtime backend, MCP server boundary, dvala-cli boundary.
- **Build & tooling post-decomp cleanup complete** (PRs #211, #213, #214, #215, May–June 2026). See archived [2026-05-30_build-tooling-cleanup.md](../archive/2026-05-30_build-tooling-cleanup.md).
- **Backend-boundary cleanup backlog complete** (PRs #217, #218, #219, June 2026): per-file `persistFile`/`removeFile` mutations replace `replaceWorkspaceSnapshot`; `workspaceFiles` compatibility payloads retired; canonical result/error envelope locked.
- **Script organization + Turbo parallelization** (PRs #220, #221, June 2026): per-package scripts own their work; root `build` is now a single `turbo run bundle`; final-binary rolldown configs moved out of the repo root into their owning packages; loose `cli/`, `mcp-server/`, `playground-builder/` directories absorbed (`playground-builder/` promoted to `apps/playground-builder/`).

## Active workstreams

### 1. Finish making clients thin (Phases C / D / E)

Each client now has a first backend seam, but none is yet a pure thin client. The goal is the [2026-05-06](2026-05-06_dvala-backend-authority.md) end-state: clients own transport, state sync, and rendering only — no embedded Dvala semantics.

- **C — Playground.** `lsWorker` is an adapter over the backend and `runtimeBackend` uses `createBackend`. Remaining: route any playground-owned runtime orchestration / inspection surfaces through backend session + inspection APIs so the playground is purely a frontend.
- **D — VS Code.** Diagnostics client routes through the backend. Remaining: move the rest of the extension's embedded semantic logic behind backend capabilities; reduce the extension to transport bootstrap, capability registration, and panel/view rendering.
- **E — CLI.** `runAsync` string-program path routes through `createBackend().startSession(...)` with backend resume/inspect/stop. Remaining: bring the **async bundle-execution path** (currently a direct `runner.runAsync(bundle, ...)` fallback) behind the backend.

Definition of done: for each client, no covered run/analysis path composes Dvala semantics directly from root surfaces; all go through the backend authority.

#### What "covered" excludes (explicit carve-out)

The architecture targets **long-lived async lifecycle** — sessions, suspend/resume, snapshot inspection, request correlation, cancellation, stale-result suppression. Backend authority adds no value to surfaces that don't have those concerns. The following stay outside the architecture by design:

- **Sync `run()` (`dvala.run('1 + 1')`)** — single-shot, can't suspend (sync can't unwind a continuation), no correlation/lifecycle. This is the JS-embedding affordance ("Dvala as a calculator / rule engine / config DSL") and depends on staying sync. The async backend can't preserve that ergonomic.
- **REPL preload paths** — internal CLI state; not a covered run/analysis path.
- **Documentation/example generation** (`cliDocumentation/getCliFunctionExamples.ts`) — build-time tooling, not a runtime surface.

These surfaces still consume `dvala-engine` / `dvala-core-tooling` directly. The "one source of semantic authority" invariant is preserved at the package level (only `dvala-engine` evaluates code) — backend authority adds the lifecycle wrapper on top for surfaces that need it.

### 2. Backend-boundary cleanup backlog — ✅ done 2026-06-03

All three items shipped:

- ✅ **`replaceWorkspaceSnapshot(files)` retired** — PR #217. Backend now exposes per-file `persistFile` / `removeFile` mutations; each client (playground LS worker, playground runtime, VS Code diagnostics) maintains a delta-tracking mirror so only changes get posted.
- ✅ **`workspaceFiles` compatibility payloads retired** — PR #218. Dropped from `BackendCompletionRequest` + `BackendNavigationRequest`; `resolveAnalysisWorkspaceSnapshot` deleted; call sites read directly from the backend-owned document store.
- ✅ **Result/error type taxonomy locked** — PR #219. Canonical envelope: `BackendFailure { ok: false, error: BackendRequestError }` + `BackendRequestFailure extends BackendFailure { requestId }` for correlated ops. Locked finite error-kind set (`cancelled`, `invalid-request`, `analysis-failed`, `runtime-failed`, `resync-required`, `session-not-found`). Contract documented in [packages/dvala-workspace-backend/src/requests.ts](../../packages/dvala-workspace-backend/src/requests.ts).

### 3. Decide the `dvala-runtime` vs `dvala-engine` contract surface

The original blockers under this workstream — the parser/types adapter and the `DvalaBundle` compat shape — are resolved by the monorepo decomposition. `packages/dvala-runtime/src/` has zero external imports; same for `packages/dvala-engine/src/`. Code-ownership is done.

What remains is **decisional**, not a refactor: is the surface of `dvala-runtime` (run/resume entry, artifacts, capabilities, `runtimeExecutor` boundary) the right contract for a second implementation (KMP target)? Specifically:

- Are there responsibilities currently in `dvala-engine` (evaluator internals, builtin module dispatch, interop) that belong in the portable `dvala-runtime` contract instead, so a second implementation only has to re-implement the engine, not redefine the contract?
- Conversely, is anything in `dvala-runtime` actually impl-specific and should move to `dvala-engine`?

This is open work, not a code blocker. Pick it up when a concrete forcing function appears — a real KMP slice, or a second hypothetical impl makes a specific gap visible. Until then, keep the dependency direction strict: `dvala-runtime` ← `dvala-engine` ← `dvala-workspace-backend` ← adapters ← clients.

## Parked — await a concrete forcing function

Recorded so they are not forgotten; not active until a trigger appears.

- **Release-train decoupling.** Independent per-package release cycles. Trigger: an external consumer or a cadence divergence (e.g. KMP/runtime moving at a different speed). Until then, one shared release train.
- **Package publishability / distribution hardening.** Per-package build outputs, `exports`/types maps, dependency hygiene, standalone installability, npm publish. Best done after workstream 3 (no point publishing a package whose logic is still half-stranded in root). Trigger: a real external consumer.
- **Further package promotion / `dvala-backend-protocols`.** Carve out a separate protocol/transport package only when that boundary becomes real. Trigger: two non-runtime consumers needing a stable shared contract.

## Open questions (deferred to the vision doc)

The broader architectural open questions — process topology (one process with multiple lanes vs. multiple cooperating processes behind one facade), DAP vs. Dvala-specific RPC for runtime inspection, browser one-worker-vs-many — remain in [2026-05-06_dvala-backend-authority.md](2026-05-06_dvala-backend-authority.md) and are not gating the active workstreams above.
