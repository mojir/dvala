# Backend Authority Execution Board

**Status:** Draft
**Created:** 2026-05-12

## Goal

Turn the three active priority designs into a concrete, issue-ready implementation sequence with clear acceptance criteria, PR slicing, and promotion gates.

---

## Background

Primary drivers:

- [design/active/2026-05-06_dvala-backend-authority.md](2026-05-06_dvala-backend-authority.md)
- [design/active/2026-05-07_dvala-subprojects-and-release-train.md](2026-05-07_dvala-subprojects-and-release-train.md)
- [design/active/2026-05-09_dvala-backend-api-first-boundary.md](2026-05-09_dvala-backend-api-first-boundary.md)

Current proven state on main:

- `packages/dvala-runtime` first extraction slice is completed.
- Backend analysis seam is proven.
- Backend runtime session seam is proven.

Current gap:

- Mixed orchestration still exists in root surfaces.
- CLI and MCP are not yet thin consumers of the backend boundary.
- Workspace-backend package promotion criteria are not explicitly enforced.

## Scope

In scope:

- Stabilize backend v0 boundary as the canonical authority.
- Split mixed orchestration surfaces by ownership.
- Move one non-playground client path (CLI first) to backend boundary.
- Define and enforce package promotion gates for workspace-backend.

Out of scope for this board:

- Full debugger/DAP feature surface.
- Full runtime artifact format finalization.
- Release-train decoupling.

## Success Criteria

1. One backend request/error model is the semantic authority for analysis plus session lifecycle.
2. No client-owned semantic cache remains in playground or CLI flows covered by this board.
3. `src/createDvala.ts` no longer acts as a mixed orchestration root for the covered paths.
4. CLI uses backend session/document operations for at least one complete run/resume path.
5. Workspace-backend promotion decision can be made from explicit, tested gates.

## Workstreams

## A. Backend Contract Stabilization (v0)

Owner: backend
Priority: P0

Issue A1: Freeze backend v0 types and invariants

- Define canonical request/result/error union policy in `src/backend/requests.ts`.
- Add explicit invariants for document versions, cancellation, and stale suppression.
- Document transport translation rules for worker/CLI adapters.

Acceptance criteria:

- All backend operations return normalized `ok: true | false` outcomes.
- Error `kind` values are finite and documented.
- Invariants are captured in doc comments or design notes and asserted in tests.

PR slice:

- Types and docs only plus low-risk adapter updates.

Issue A2: Request-lifecycle contract tests

- Add focused tests for request cancellation and stale-result suppression.
- Add tests for out-of-order document updates and resync-required outcomes.
- Add regression tests proving version mismatch cannot overwrite newer results.

Acceptance criteria:

- Deterministic tests for cancellation, stale suppression, and resync.
- No fallback path that silently accepts version gaps.

PR slice:

- Test-first updates with minimal runtime behavior changes.

## B. Mixed Surface Extraction

Owner: backend + runtime
Priority: P0

Issue B1: Ownership map and split plan for mixed root surfaces

- Map each responsibility in `src/createDvala.ts` and connected runtime entrypoints to one owner:
  - runtime-owned
  - backend-owned
  - tooling-only
- Mark temporary adapters and intended removal points.

Acceptance criteria:

- Ownership table exists in this doc (or linked follow-up design doc).
- No ambiguous "shared" buckets without a decision.

PR slice:

- Documentation and annotations only.

### B1 Ownership Map (first pass)

Source anchor: `src/createDvala.ts`

| Responsibility in current mixed root | Target owner | Notes / split intent |
| --- | --- | --- |
| Runtime run/resume entry wiring via `createRuntimeRunner(...)` | runtime-owned (through backend runtime adapter for clients) | Keep runtime semantics in `dvala-runtime` and runtime adapter path; clients should not call mixed root directly for session lifecycle. |
| Effect handler defaults and disableAutoCheckpoint defaults | runtime-owned | Keep as host/runtime options; backend passes through for session requests. |
| File import resolver plumbing (`fileResolver`, `fileResolverBaseDir`) | backend-owned for workspace/editor flows; runtime-owned only for host-level execution | Workspace overlays/import graph should be backend authority concern for editor/CLI client flows. |
| Tokenize + parse + AST creation (`tokenize`, `minifyTokenStream`, `parseToAst`) | tooling-only | Move behind backend analysis operations where needed; avoid direct client orchestration. |
| AST cache and node ID allocation | backend-owned for workspace authority lane; runtime-owned for isolated host execution lane | Split by execution profile; workspace clients should not own semantic caches. |
| Source-map accumulation across runs | runtime-owned for debug/runtime artifacts, backend-owned for request-scoped analysis views | Remove implicit global accumulation from mixed root for client paths. |
| Type diagnostics emission callback (`emitTypeDiagnostics`) | backend-owned for analysis request lane | Backend should return diagnostics; callback side-effects stay out of client adapters. |
| Scope-to-context conversion (`scopeToGlobalContext`) | runtime-owned | Runtime boundary utility for execution context materialization. |
| `getUndefinedSymbols(...)` | tooling-only (backend consumes) | Keep as tooling API; backend decides request semantics and overlay state. |
| `getAutoCompleter(...)` | tooling-only (backend consumes) | Completion semantics should be backend request behavior, not client direct orchestration. |
| Public `typecheck(...)` facade | backend-owned for workspace analysis, tooling-only fallback for direct library consumers | Keep direct API for library users temporarily; route clients via backend request surfaces. |

### B1 Temporary Adapters And Planned Removal Points

1. Temporary: backend runtime adapter currently bridges through root run/resume entrypoints where needed.
Removal point: after B2 extraction lands for one cohesive session path and tests prove parity.

2. Temporary: compatibility `workspaceFiles` request payloads in completion/navigation.
Removal point: after backend-owned persisted-file mutation model replaces snapshot-in-request compatibility fields.

3. Temporary: direct `createDvala()` consumer paths in non-playground clients.
Removal point: after C1 CLI adapter path is backend-native for selected session lifecycle flows.

Issue B2: First extraction from mixed root to backend/runtime adapters

- Move one cohesive branch of orchestration out of root mixed flow.
- Keep source-first backend API stable while routing runtime semantics through adapter boundaries.
- Avoid broad refactors; keep behavior parity.

Acceptance criteria:

- Covered flow does not rely on mixed root orchestration.
- Existing tests remain green; new focused tests added.

PR slice:

- Small functional extraction with targeted regression tests.

Status update (2026-05-12):

- First extraction slice landed: shared `scopeToGlobalContext` conversion moved out of mixed roots and reused by `createDvala()` and `resume()`.
- Behavior parity verified with focused backend + create/resume test coverage.
- Second extraction slice landed: AST/cache/source-map orchestration moved from `createDvala()` to runtime-owned helper (`src/runtime/createAstBuilder.ts`) and wired through runtime runner boundaries.
- Behavior parity verified across backend + create/resume + CLI test suites.

## C. Thin Client Migration (CLI First)

Owner: CLI + backend
Priority: P1

Issue C1: CLI backend adapter for session lifecycle

- Introduce CLI adapter that calls backend APIs for one full path:
  - open/update document context
  - start session
  - optional resume snapshot
  - inspect/stop session
- Keep CLI UX stable.

Acceptance criteria:

- At least one CLI mode route no longer composes semantic logic directly from mixed root surfaces.
- Same semantic result as existing baseline tests.

PR slice:

- New CLI adapter and wiring behind existing command shape.

Status update (2026-05-12):

- CLI `makeDvala(...).runAsync(...)` now routes string-program execution through `createBackend().startSession(...)` with backend lifecycle calls (`inspectSession`, `stopSession`).
- Bundle execution keeps direct fallback for behavior parity.
- Existing CLI integration tests remain green.

Issue C2: CLI contract tests at adapter boundary

- Add tests asserting CLI behavior through backend boundary for selected commands.
- Add explicit failure-mode tests for backend errors and resync cases.

Acceptance criteria:

- Adapter tests pass with deterministic error mapping.
- No direct semantic fallback bypassing backend for covered path.

PR slice:

- Tests plus minimal error-handling adjustments.

Status update (2026-05-12):

- Added CLI integration coverage asserting backend-routed REPL preload surfaces runtime errors deterministically for unhandled effects.
- Full CLI test suite remains green after backend adapter routing.

## D. Workspace-Backend Promotion Gates

Owner: architecture
Priority: P1

Issue D1: Promotion gate definition

- Define explicit gates for promoting `src/backend` into `packages/dvala-workspace-backend`:
  1. analysis slice proven
  2. runtime slice proven
  3. CLI or second client seam proven
  4. contract tests covering lifecycle rules
  5. no unresolved mixed-orchestration blockers on covered paths

Acceptance criteria:

- Gates are documented and referenced by active tracking issues.
- Each gate has objective evidence links.

PR slice:

- Design/docs only.

### D1 Promotion Gate Evidence Checklist

Gate 1: analysis slice proven

- Evidence: backend analysis request contract + lifecycle tests in `src/backend/createBackend.test.ts`.
- Current status: met.

Gate 2: runtime slice proven

- Evidence: backend runtime session adapter coverage in `src/backend/createBackend.test.ts`.
- Current status: met.

Gate 3: second client seam proven (beyond playground)

- Evidence: CLI `runAsync` string-program path now routed through backend lifecycle in `cli/src/cli.ts`.
- Evidence: CLI integration coverage for backend-routed preload runtime-error surfacing in `cli/__tests__/cli-effects.test.ts`.
- Current status: met.

Gate 4: contract tests covering lifecycle rules

- Evidence: cancellation + version/resync contract tests in `src/backend/createBackend.test.ts`.
- Current status: met.

Gate 5: no unresolved mixed-orchestration blockers on covered paths

- Evidence: `scopeToGlobalContext` extraction plus `createAstBuilder` extraction remove two mixed responsibilities from `createDvala()` while preserving behavior.
- Current status: met for currently covered paths.

Issue D2: Gate review and promote/no-promote decision

- Run a gate review after A+B+C complete.
- Decide one of:
  - promote now to workspace package
  - defer with explicit blocked gates and next unblockers

Acceptance criteria:

- Decision recorded with rationale and follow-up actions.

PR slice:

- Decision log and, if approved, package scaffold PR.

### D2 Decision Log (2026-05-12)

Decision: defer package promotion for one short cycle.

Rationale:

- Functional gates are now met for covered paths, but two temporary compatibility seams are still intentionally active:
  - compatibility `workspaceFiles` request payloads for completion/navigation
  - CLI backend adapter currently covers start-session flow only (resume/inspect snapshot flows are intentionally deferred)
- Promoting to `packages/dvala-workspace-backend` immediately would freeze these temporary seams too early and increase migration overhead.
- This keeps alignment with the API-first/source-boundary-first approach in the backend-boundary design.

Next unblockers before promotion:

1. Retire or isolate `workspaceFiles` compatibility fields behind backend-internal translation.
2. Add one more backend-native client lifecycle path beyond CLI start-session (CLI resume or MCP session path).
3. Re-run gate review and, if unchanged, promote with a small package scaffold PR.

Post-decision progress (2026-05-12):

- Unblocker 1 is now partially completed: `workspaceFiles` is isolated behind backend-internal translation for completion/navigation, with backend-owned state remaining canonical.
- Regression coverage added to ensure compatibility payloads cannot override backend-owned open-document state.
- Unblocker 2 is completed: CLI runtime client now supports backend-native `resumeSnapshot` lifecycle through backend resume/inspect/stop flows, with focused tests in `cli/src/runtimeClient.test.ts`.

Promotion gate re-check (post-unblocker updates):

- Gate 1: met
- Gate 2: met
- Gate 3: met (CLI start + resume lifecycle seams)
- Gate 4: met
- Gate 5: met for covered paths, with remaining compatibility retirement work explicitly isolated and tracked.

Recommended next packaging action:

1. Run a small package scaffold PR for `packages/dvala-workspace-backend` with source re-export shims.
2. Keep behavioral code movement minimal in that PR (structure-first, semantics unchanged).

Packaging progress (2026-05-13):

- `packages/dvala-workspace-backend` scaffold is now present with:
  - package metadata + exports (`package.json`)
  - package TypeScript config (`tsconfig.json`)
  - root shim exports for backend surfaces (`src/index.ts`)
  - runtime shim subpath (`src/runtime/index.ts`)
  - playground protocol shim subpath (`src/adapters/playgroundWorkerProtocol.ts`)
- Behavioral code movement remains unchanged (structure-first scaffold only).
- Package-level validation: `pnpm --filter @mojir/dvala-workspace-backend run typecheck` passes.

Adoption progress (2026-05-13):

- First internal consumer migrated to package shim imports: `cli/src/runtimeClient.ts` now imports backend APIs/types via `packages/dvala-workspace-backend/src/index` instead of direct `src/backend/*` paths.
- Focused regression coverage remains green after the import switch.
- Second internal consumer migrated to package shim imports: `vscode-dvala/src/backendDiagnosticsClient.ts` (and its companion test) now import backend APIs/types via `packages/dvala-workspace-backend/src/index`.
- Focused backend + VS Code diagnostics client tests remain green after the second import switch.
- Playground worker boundary migrated to package shims:
  - `playground-www/src/lsWorker.ts` now imports `createBackend` from `packages/dvala-workspace-backend/src/index`.
  - `playground-www/src/lsWorker.ts` and `playground-www/src/lsWorkerClient.ts` now import worker protocol types from `packages/dvala-workspace-backend/src/adapters/playgroundWorkerProtocol`.
  - `playground-www/src/runtimeBackend.ts` now imports `createBackend` from `packages/dvala-workspace-backend/src/index`.
- Focused playground worker/runtime backend tests remain green after the boundary import switch.
- MCP server boundary migrated to package scaffold:
  - `packages/dvala-mcp-server` now owns the MCP server implementation surface.
  - `mcp-server/src/server.ts` is now a thin entrypoint that delegates to `packages/dvala-mcp-server/src/index`.
  - Package-level typecheck and repo-wide validation remain green after the boundary split.
- CLI boundary migrated to package scaffold:
  - `packages/dvala-cli` now owns the CLI implementation surface.
  - `cli/src/cli.ts` is now a thin entrypoint that delegates to `packages/dvala-cli/src/index`.
  - Package-level typecheck and repo-wide validation remain green after the boundary split.

## Suggested Sequencing

Week 1:

1. A1
2. A2
3. B1

Week 2:

1. B2
2. C1
3. C2

Week 3:

1. D1
2. D2

## Tracking Table

- A1: completed
- A2: completed
- B1: completed
- B2: completed
- C1: completed
- C2: completed
- D1: completed
- D2: completed

## Risks And Mitigations

Risk: accidental reintroduction of client-side semantic state.

Mitigation:

- Add explicit anti-regression tests in worker and CLI adapters.
- Require backend-owned version checks for every covered request.

Risk: over-refactoring slows delivery.

Mitigation:

- Enforce small PR slices with behavior parity first.
- Prefer adapter seams before package moves.

Risk: package promotion before stable boundary.

Mitigation:

- Use D1 gates as hard criteria, not intuition.

## Open Questions

- Which single path in CLI gives highest confidence for first backend migration: file-run, repl-file, or snapshot resume?
- Should MCP or CLI be second client seam after playground, if only one can be done in this phase?
- Do we need a separate backend-transport package before workspace-backend package promotion?

## Implementation Plan

1. Land A1 to lock the backend v0 contract.
2. Land A2 to prove lifecycle behavior with deterministic tests.
3. Land B1 ownership map for mixed root surfaces.
4. Land B2 first extraction from mixed root orchestration.
5. Land C1 backend-driven CLI path for one full session lifecycle.
6. Land C2 adapter-boundary CLI tests.
7. Land D1 package-promotion gates.
8. Run D2 gate review and make promotion decision.
