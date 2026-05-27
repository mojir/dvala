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

- `packages/dvala-runtime` extracted as a real workspace package (host-facing run/suspend/resume surface + evaluator cluster first slice).
- `pnpm` workspace with `packages/*` and `apps/*`; shared release train owned at the root.
- Package scaffolds promoted and adopted: `dvala-core-tooling`, `dvala-workspace-backend`, `dvala-cli`, `dvala-mcp-server`.
- Monorepo package-boundary work complete (deep `../../../src/` imports routed through facades; package-name imports; structural minimal/tooling bundle split). See archived [2026-05-26_monorepo-package-boundary-strategy.md](../archive/2026-05-26_monorepo-package-boundary-strategy.md).
- Backend source boundary (`src/backend/`) owns document authority, analysis requests, and one runtime-session seam.
- Analysis seam proven (diagnostics, formatting, hover, completion, navigation behind backend authority).
- Runtime-session seam proven (`startSession`, `resumeSnapshot`, `inspectSession`, `stopSession`, snapshot inspection + backend-owned `validateSnapshot`).
- First consumers migrated to the workspace-backend package shims: CLI runtime client, VS Code diagnostics client, playground LS worker + runtime backend.

## Active workstreams

### 1. Finish making clients thin (Phases C / D / E)

Each client now has a first backend seam, but none is yet a pure thin client. The goal is the [2026-05-06](2026-05-06_dvala-backend-authority.md) end-state: clients own transport, state sync, and rendering only — no embedded Dvala semantics.

- **C — Playground.** `lsWorker` is an adapter over the backend and `runtimeBackend` uses `createBackend`. Remaining: route any playground-owned runtime orchestration / inspection surfaces through backend session + inspection APIs so the playground is purely a frontend.
- **D — VS Code.** Diagnostics client routes through the backend. Remaining: move the rest of the extension's embedded semantic logic behind backend capabilities; reduce the extension to transport bootstrap, capability registration, and panel/view rendering.
- **E — CLI.** `runAsync` string-program path routes through `createBackend().startSession(...)` with backend resume/inspect/stop. Remaining: bring the bundle-execution path (currently a direct fallback) behind the backend and remove the direct `createDvala()` semantic fallback for covered paths.

Definition of done: for each client, no covered run/analysis path composes Dvala semantics directly from root surfaces; all go through the backend authority.

### 2. Backend-boundary cleanup backlog

These are the temporary compatibility seams explicitly marked for removal in the archived API-first doc. They are the most concrete near-term work.

- **Retire `replaceWorkspaceSnapshot(files)`** in favor of explicit persisted-file mutations on the document store.
- **Fully retire the `workspaceFiles` compatibility payloads** in completion/navigation. Currently only isolated behind backend-internal translation; the backend-owned persisted-file model should make them unnecessary.
- **Settle the result/error type taxonomy:** decide which backend result and error types are shared directly with transports vs. kept backend-internal and translated by adapters. Lock the `ok: true | false` outcome shape and the finite error `kind` set as the canonical contract.

### 3. Complete `dvala-runtime` ownership

Finish pulling remaining runtime-semantic code out of root `src/` and into `packages/dvala-runtime`, so the package is the complete, self-contained portable engine (the KMP target) with no runtime logic stranded behind temporary adapters.

- Resolve the temporary boundary adapters from the first extraction: the narrow dependency on `src/parser/types.ts` for evaluator-owned AST types, and the `DvalaBundle`-shape compatibility input.
- Decide which remaining evaluator-adjacent responsibilities still in root (or reachable only via root) should move into the package.
- Keep the dependency direction strict: runtime below workspace backend below adapters below clients.

This is an internal refactor (code ownership), distinct from external publishability (parked below). It supports the long-term portable-runtime / KMP goal in the vision doc.

## Parked — await a concrete forcing function

Recorded so they are not forgotten; not active until a trigger appears.

- **Release-train decoupling.** Independent per-package release cycles. Trigger: an external consumer or a cadence divergence (e.g. KMP/runtime moving at a different speed). Until then, one shared release train.
- **Package publishability / distribution hardening.** Per-package build outputs, `exports`/types maps, dependency hygiene, standalone installability, npm publish. Best done after workstream 3 (no point publishing a package whose logic is still half-stranded in root). Trigger: a real external consumer.
- **Further package promotion / `dvala-backend-protocols`.** Carve out a separate protocol/transport package only when that boundary becomes real. Trigger: two non-runtime consumers needing a stable shared contract.

## Open questions (deferred to the vision doc)

The broader architectural open questions — process topology (one process with multiple lanes vs. multiple cooperating processes behind one facade), DAP vs. Dvala-specific RPC for runtime inspection, browser one-worker-vs-many — remain in [2026-05-06_dvala-backend-authority.md](2026-05-06_dvala-backend-authority.md) and are not gating the active workstreams above.
