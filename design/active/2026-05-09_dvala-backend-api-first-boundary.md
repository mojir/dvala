# Dvala Backend API First Boundary

**Status:** Draft
**Created:** 2026-05-09

## Goal

Define the first concrete backend API boundary that moves Dvala closer to the backend-authority architecture without prematurely freezing the full long-term platform shape.

This design is meant to answer one immediate question: what is the smallest backend surface worth making real now so clients can start becoming thin while `dvala-runtime` stays focused on portable host/runtime concerns.

---

## Background

The current repo now has an explicit `dvala-runtime` package, and that first extraction slice should be treated as complete rather than as an unfinished migration batch.

The remaining architectural pressure is elsewhere:

- the playground LS worker already speaks a backend-like protocol for document sync, diagnostics, formatting, hover, completion, navigation, cancellation, and stale-result suppression
- runtime execution and resume flows still compose directly from root surfaces that mix parsing, typechecking, evaluator wiring, source-map accumulation, and runtime orchestration
- `createDvala()` is still a mixed composition root rather than a clean runtime boundary or a clean backend boundary

That means the next step toward [2026-05-06_dvala-backend-authority.md](2026-05-06_dvala-backend-authority.md) is not “move more files into `dvala-runtime` until it feels complete.”

The next step is to create an explicit backend service boundary that owns:

- canonical document and overlay state
- analysis requests over that state
- at least one real runtime session seam over the same authority model
- request lifecycle rules such as cancellation, correlation, and stale-result suppression

The main discipline for this iteration is to keep `dvala-runtime` portable-host-oriented and keep workspace/editor semantics out of it.

## Proposal

Create a first backend API as a source boundary before promoting it to a full package boundary.

This backend should sit above `dvala-runtime` and above tooling/indexing layers, while staying below:

- playground UI code
- Monaco/VS Code registration code
- CLI presentation and prompt orchestration
- any transport-specific browser or editor glue

The backend should be intentionally small. It should cover only the capabilities needed to establish one semantic authority and one shared request model.

### Scope decisions

The current scope decisions for the first boundary are:

- keep `replaceWorkspaceSnapshot(files)` as a temporary compatibility operation in the first backend API
- make `startSession` source-first in the public API, while allowing verified-runtime input only through internal adapters for now
- keep first-pass analysis request payloads close to the current playground worker protocol
- define cleaner backend-owned result and error semantics rather than inheriting current worker response shapes wholesale
- keep the backend as a root-internal source boundary until at least one analysis slice and one runtime slice are both proven

### First-boundary capabilities

The first backend boundary should include exactly four capability groups.

#### 1. Document authority

The backend owns open-document state and overlay versions.

Required operations:

- `openDocument(path, source, version)`
- `updateDocument(path, source, version, previousVersion)`
- `closeDocument(path)`
- `replaceWorkspaceSnapshot(files)` for non-open persisted files or compatibility snapshot flows

Rules:

- unsaved open-document content is canonical for all backend operations
- version gaps are backend-detected and returned explicitly
- clients do not maintain semantic caches outside the backend authority

#### 2. Analysis requests

The backend should own the current LS-worker class of requests.

Required requests:

- `requestDiagnostics`
- `requestFormatting`
- `requestHover`
- `requestCompletion`
- `requestNavigation` for `definition`, `references`, and `rename`

Rules:

- requests operate on backend-owned document state
- temporary compatibility requests may still allow explicit workspace snapshot payloads where current clients depend on them
- cancellation and stale-result filtering are part of backend behavior, not client policy

#### 3. Runtime session requests

The first runtime seam should be minimal and session-oriented.

Required requests:

- `startSession` from source or a backend-accepted program input
- `resumeSnapshot`
- `stopSession`
- `inspectSession`

Explicit non-goals for this first seam:

- debugger stepping
- breakpoints
- trace streaming
- replay controls
- rich runtime inspection panels

The point is not to finish the runtime feature surface. The point is to make one runtime lifecycle path live behind the same backend authority model as analysis.

#### 4. Request lifecycle

The backend should define and own:

- request IDs
- cancellation
- stale-result suppression
- explicit resync requests on version mismatch
- backend-generated errors and compatibility failures

This keeps request semantics uniform across analysis and runtime lanes even if the implementation topology differs internally.

### Ownership split

This iteration should make the ownership split explicit.

#### Belongs in `dvala-runtime`

Code belongs in `dvala-runtime` when a portable host needs it to:

- identify the runtime
- verify a runtime artifact or runtime-compatible input
- start execution
- suspend execution
- resume execution
- expose host/runtime contracts for those flows

#### Does not belong in `dvala-runtime`

Code does not belong in `dvala-runtime` when it is primarily about:

- open-document lifecycle
- workspace overlays
- diagnostics
- hover/completion/navigation/rename/formatting
- workspace indexing
- editor or worker request protocols
- browser/client persistence policy
- CLI UX and prompt orchestration

#### Mixed current surfaces

Mixed surfaces should be split rather than moved wholesale.

Current examples:

- `src/createDvala.ts` is a mixed composition root combining parsing, AST caching, type diagnostics, module wiring, and runtime runner composition
- `src/runtime/createRuntimeRunner.ts` is runtime-adjacent but still depends on root evaluator/context-stack code and caller-facing run semantics
- `playground-www/src/lsWorker.ts` already models a backend request protocol and should become an adapter over the new backend surface rather than remain the place where the backend contract is defined

### Source-boundary-first strategy

The first backend API should be introduced as a source boundary before it becomes a real workspace package.

Rationale:

- the API shape is still being discovered
- the first goal is semantic ownership, not package ceremony
- promoting too early to a package risks freezing the wrong abstractions

Indicative path:

- `src/backend/` or `src/workspaceBackend/` for the first implementation boundary

Only after the first client seam proves stable should this be promoted to a real subproject such as `packages/dvala-workspace-backend`.

Promotion gate:

- do not promote this boundary into a real workspace package until at least one analysis slice and one runtime slice have both been proven behind it

### First API sketch

The initial TypeScript shape should be narrow and operation-oriented.

```ts
export type BackendRequestId = number

export type BackendDocumentVersion = number

export type BackendTextDocument = {
	path: string
	source: string
	version: BackendDocumentVersion
}

export type BackendWorkspaceSnapshotFile = {
	path: string
	code: string
}

export type BackendResyncRequired = {
	ok: false
	kind: 'resync-required'
	path: string
}

export type BackendAccepted = {
	ok: true
}

export type BackendDocumentSyncResult = BackendAccepted | BackendResyncRequired

export type BackendNavigationKind = 'definition' | 'references' | 'rename'

export interface DvalaBackend {
	openDocument(document: BackendTextDocument): Promise<void>
	updateDocument(document: BackendTextDocument, previousVersion: number): Promise<BackendDocumentSyncResult>
	closeDocument(path: string): Promise<void>
	replaceWorkspaceSnapshot(files: readonly BackendWorkspaceSnapshotFile[]): Promise<void>

	requestDiagnostics(args: {
		requestId: BackendRequestId
		path: string
		version: BackendDocumentVersion
	}): Promise<BackendDiagnosticsResult>

	requestFormatting(args: {
		requestId: BackendRequestId
		path: string
		source: string
		version: BackendDocumentVersion
	}): Promise<BackendFormattingResult>

	requestHover(args: {
		requestId: BackendRequestId
		path: string
		source: string
		version: BackendDocumentVersion
		line: number
		column: number
		startColumn?: number
		endColumn?: number
	}): Promise<BackendHoverResult>

	requestCompletion(args: {
		requestId: BackendRequestId
		path: string
		source: string
		version: BackendDocumentVersion
		line: number
		column: number
		prefix: string
		importPrefix: string | null
	}): Promise<BackendCompletionResult>

	requestNavigation(args: {
		requestId: BackendRequestId
		path: string
		source: string
		version: BackendDocumentVersion
		kind: BackendNavigationKind
		line: number
		column: number
		newName?: string
	}): Promise<BackendNavigationResult>

	startSession(args: {
		requestId: BackendRequestId
		path?: string
		source: string
	}): Promise<BackendSessionStartResult>

	resumeSnapshot(args: {
		requestId: BackendRequestId
		snapshot: unknown
		value?: unknown
	}): Promise<BackendSessionResumeResult>

	inspectSession(sessionId: string): Promise<BackendSessionInspectionResult>
	stopSession(sessionId: string): Promise<void>
	cancelRequest(requestId: BackendRequestId): Promise<void>
}
```

This sketch is intentionally operation-shaped rather than transport-shaped. Browser workers, VS Code transports, CLI mode, or local in-process use can wrap it differently.

### Proposed root-internal file layout

The first implementation should live under `src/backend/`.

Recommended initial layout:

```text
src/backend/
  index.ts
  types.ts
  errors.ts
  requests.ts
  sessions.ts
  DvalaBackend.ts
  createBackend.ts
  documentStore.ts
  cancellation.ts
  analysis/
    diagnostics.ts
    formatting.ts
    hover.ts
    completion.ts
    navigation.ts
    workspaceSnapshotIndex.ts
  runtime/
    startSession.ts
    resumeSnapshot.ts
    runtimeAdapter.ts
  adapters/
    playgroundWorkerProtocol.ts
```

Purpose of each file:

- `src/backend/index.ts`: public root-internal exports for backend clients and adapters
- `src/backend/types.ts`: shared backend-facing input and result types
- `src/backend/errors.ts`: backend-owned error/result taxonomy
- `src/backend/requests.ts`: request argument and result aliases grouped by capability
- `src/backend/sessions.ts`: backend session types, handles, and inspection views
- `src/backend/DvalaBackend.ts`: the main interface definitions
- `src/backend/createBackend.ts`: factory for the concrete in-memory backend implementation
- `src/backend/documentStore.ts`: canonical document and persisted-snapshot overlay state
- `src/backend/cancellation.ts`: request cancellation registry and helpers
- `src/backend/analysis/*`: one file per analysis operation, plus snapshot-index compatibility helpers
- `src/backend/runtime/*`: one file per runtime operation, with adapters around current run/resume surfaces
- `src/backend/adapters/playgroundWorkerProtocol.ts`: current playground-worker-compatible message types and translation helpers

Deliberately not in this first layout:

- filesystem watchers
- editor registration code
- browser storage policy
- CLI prompting logic
- DAP or debugger protocol code

### Proposed interface split

The first implementation should separate three layers explicitly.

#### 1. Backend interface layer

This is what adapters such as the playground worker should depend on.

Suggested file: `src/backend/DvalaBackend.ts`

```ts
import type {
	BackendCancelResult,
	BackendCompletionRequest,
	BackendCompletionResult,
	BackendDiagnosticsRequest,
	BackendDiagnosticsResult,
	BackendDocumentSyncResult,
	BackendFormattingRequest,
	BackendFormattingResult,
	BackendHoverRequest,
	BackendHoverResult,
	BackendNavigationRequest,
	BackendNavigationResult,
	BackendReplaceWorkspaceSnapshotRequest,
	BackendSessionInspectionResult,
	BackendSessionResumeRequest,
	BackendSessionResumeResult,
	BackendSessionStartRequest,
	BackendSessionStartResult,
	BackendTextDocument,
} from './requests'

export interface DvalaBackend {
	openDocument(document: BackendTextDocument): Promise<void>
	updateDocument(document: BackendTextDocument, previousVersion: number): Promise<BackendDocumentSyncResult>
	closeDocument(path: string): Promise<void>
	replaceWorkspaceSnapshot(request: BackendReplaceWorkspaceSnapshotRequest): Promise<void>

	requestDiagnostics(request: BackendDiagnosticsRequest): Promise<BackendDiagnosticsResult>
	requestFormatting(request: BackendFormattingRequest): Promise<BackendFormattingResult>
	requestHover(request: BackendHoverRequest): Promise<BackendHoverResult>
	requestCompletion(request: BackendCompletionRequest): Promise<BackendCompletionResult>
	requestNavigation(request: BackendNavigationRequest): Promise<BackendNavigationResult>

	startSession(request: BackendSessionStartRequest): Promise<BackendSessionStartResult>
	resumeSnapshot(request: BackendSessionResumeRequest): Promise<BackendSessionResumeResult>
	inspectSession(sessionId: string): Promise<BackendSessionInspectionResult>
	stopSession(sessionId: string): Promise<void>

	cancelRequest(requestId: number): Promise<BackendCancelResult>
}
```

#### 2. Backend state/services layer

This is internal to the backend implementation and should not leak into adapters.

Suggested file: `src/backend/createBackend.ts`

```ts
import type { DvalaBackend } from './DvalaBackend'
import type { BackendCancellationRegistry } from './cancellation'
import type { BackendDocumentStore } from './documentStore'
import type { BackendRuntimeAdapter } from './runtime/runtimeAdapter'

export type CreateBackendOptions = {
	documents?: BackendDocumentStore
	cancellation?: BackendCancellationRegistry
	runtime: BackendRuntimeAdapter
}

export function createBackend(options: CreateBackendOptions): DvalaBackend
```

The backend implementation should compose internal services rather than accumulating behavior in one giant worker-shaped file.

#### 3. Runtime adapter layer

This is the compatibility layer between backend session APIs and current runtime entrypoints.

Suggested file: `src/backend/runtime/runtimeAdapter.ts`

```ts
import type { RuntimeRunResult, RuntimeSnapshot } from '@mojir/dvala-runtime'

export type BackendRuntimeStartInput = {
	path?: string
	source: string
	requestId: number
}

export type BackendRuntimeResumeInput = {
	requestId: number
	snapshot: RuntimeSnapshot
	value?: unknown
}

export type BackendRuntimeSessionHandle = {
	sessionId: string
	result: RuntimeRunResult
}

export interface BackendRuntimeAdapter {
	start(input: BackendRuntimeStartInput): Promise<BackendRuntimeSessionHandle>
	resume(input: BackendRuntimeResumeInput): Promise<BackendRuntimeSessionHandle>
	inspect(sessionId: string): Promise<{ status: 'running' | 'suspended' | 'completed' | 'failed' | 'missing' }>
	stop(sessionId: string): Promise<void>
}
```

This layer should initially adapt current `createDvala()` and `resume()`-based flows, while preserving the ability to route through `dvala-runtime`-native verified inputs later.

### Proposed request and result types

The first interface draft should make request payloads familiar to current playground code, but should normalize results and errors at the backend boundary.

Suggested file: `src/backend/requests.ts`

```ts
import type { CompletionItem } from '../shared/completionBuilder'
import type { Diagnostic } from '../shared/types'
import type { RuntimeSnapshot } from '@mojir/dvala-runtime'

export type BackendRequestId = number
export type BackendDocumentVersion = number

export type BackendTextDocument = {
	path: string
	source: string
	version: BackendDocumentVersion
}

export type BackendWorkspaceSnapshotFile = {
	path: string
	code: string
}

export type BackendDocumentSyncResult =
	| { ok: true }
	| { ok: false; error: { kind: 'resync-required'; path: string } }

export type BackendReplaceWorkspaceSnapshotRequest = {
	files: readonly BackendWorkspaceSnapshotFile[]
	versionTag?: string
}

export type BackendDiagnosticsRequest = {
	requestId: BackendRequestId
	path: string
	version: BackendDocumentVersion
}

export type BackendDiagnosticsResult =
	| {
		ok: true
		requestId: BackendRequestId
		path: string
		version: BackendDocumentVersion
		diagnostics: (Diagnostic & { readonly severity: 'error' | 'warning' | 'info'; readonly source: string })[]
	}
	| BackendRequestFailure

export type BackendFormattingRequest = {
	requestId: BackendRequestId
	path: string
	source: string
	version: BackendDocumentVersion
}

export type BackendFormattingResult =
	| {
		ok: true
		requestId: BackendRequestId
		path: string
		version: BackendDocumentVersion
		formatted: string
	}
	| BackendRequestFailure

export type BackendHoverRequest = {
	requestId: BackendRequestId
	path: string
	source: string
	version: BackendDocumentVersion
	line: number
	column: number
	startColumn?: number
	endColumn?: number
}

export type BackendHoverResult =
	| {
		ok: true
		requestId: BackendRequestId
		path: string
		version: BackendDocumentVersion
		inferredType?: string
	}
	| BackendRequestFailure

export type BackendCompletionRequest = {
	requestId: BackendRequestId
	path: string
	source: string
	version: BackendDocumentVersion
	line: number
	column: number
	prefix: string
	importPrefix: string | null
	workspaceFiles?: readonly BackendWorkspaceSnapshotFile[]
}

export type BackendCompletionResult =
	| {
		ok: true
		requestId: BackendRequestId
		path: string
		version: BackendDocumentVersion
		items: CompletionItem[]
	}
	| BackendRequestFailure

export type BackendNavigationRequest = {
	requestId: BackendRequestId
	path: string
	source: string
	version: BackendDocumentVersion
	kind: 'definition' | 'references' | 'rename'
	line: number
	column: number
	newName?: string
	workspaceFiles?: readonly BackendWorkspaceSnapshotFile[]
}

export type BackendNavigationResult =
	| {
		ok: true
		requestId: BackendRequestId
		path: string
		version: BackendDocumentVersion
		kind: 'definition' | 'references' | 'rename'
		locations?: readonly { file: string; line: number; column: number; endColumn: number }[]
		edits?: readonly { file: string; text: string; range: { startLine: number; startColumn: number; endLine: number; endColumn: number } }[]
	}
	| BackendRequestFailure

export type BackendSessionStartRequest = {
	requestId: BackendRequestId
	path?: string
	source: string
}

export type BackendSessionStartResult =
	| {
		ok: true
		requestId: BackendRequestId
		sessionId: string
		runResult: unknown
	}
	| BackendRequestFailure

export type BackendSessionResumeRequest = {
	requestId: BackendRequestId
	snapshot: RuntimeSnapshot
	value?: unknown
}

export type BackendSessionResumeResult =
	| {
		ok: true
		requestId: BackendRequestId
		sessionId: string
		runResult: unknown
	}
	| BackendRequestFailure

export type BackendSessionInspectionResult = {
	ok: true
	sessionId: string
	status: 'running' | 'suspended' | 'completed' | 'failed' | 'missing'
	lastUpdatedAt?: number
}

export type BackendCancelResult = { ok: true }

export type BackendRequestFailure = {
	ok: false
	requestId: BackendRequestId
	path?: string
	version?: BackendDocumentVersion
	error: {
		kind: 'cancelled' | 'not-found' | 'invalid-request' | 'analysis-failed' | 'runtime-failed' | 'resync-required'
		message: string
		path?: string
	}
}
```

Two important decisions are encoded here:

- request payloads stay close to current playground worker shapes where that reduces migration risk
- result and error types are normalized around `ok: true | false` backend outcomes rather than transport-specific message names

### Proposed document-store contract

The document store is the first concrete expression of backend authority.

Suggested file: `src/backend/documentStore.ts`

```ts
import type { BackendDocumentVersion, BackendTextDocument, BackendWorkspaceSnapshotFile } from './requests'

export type BackendOpenDocument = BackendTextDocument

export interface BackendDocumentStore {
	open(document: BackendOpenDocument): void
	update(document: BackendOpenDocument, previousVersion: BackendDocumentVersion): { ok: true } | { ok: false; path: string }
	close(path: string): void
	replaceWorkspaceSnapshot(files: readonly BackendWorkspaceSnapshotFile[]): void
	getOpenDocument(path: string): BackendOpenDocument | undefined
	getDocumentSource(path: string): string | undefined
	getWorkspaceSnapshot(): readonly BackendWorkspaceSnapshotFile[]
	getEffectiveSource(path: string): string | undefined
}
```

`getEffectiveSource(path)` is the key authority method: open-document overlays win over persisted snapshot content.

### Proposed first implementation mapping

The first implementation should map current code into the new boundary like this.

#### Analysis-side dependencies

- `src/tooling.ts`
  - `tokenizeSource`
  - `parseTokenStreamRecoverable`
  - `formatSource`
- `src/internal.ts`
  - `WorkspaceIndex`
  - `typecheck`
- `src/shared/diagnosticBuilder.ts`
- `src/shared/typeDisplay.ts`
- `playground-www/src/lsCompletions.ts` only temporarily if those completion helpers are not yet moved into `src/backend/analysis/`

#### Runtime-side dependencies

- `src/createDvala.ts` as a temporary start-session adapter input
- `src/resume.ts` as a temporary resume adapter input
- `src/runtime/createDefaultRuntimeBridgeAdapter.ts` only if that reduces duplication during the first runtime slice

#### Client adapters

- `playground-www/src/lsWorker.ts` becomes an adapter over `src/backend/`
- later, VS Code or CLI adapters can depend on the same backend boundary rather than rebuilding orchestration themselves

### Recommended implementation order

For the actual TypeScript work, the lowest-risk order is:

1. Add `src/backend/requests.ts`, `src/backend/DvalaBackend.ts`, and `src/backend/documentStore.ts`.
2. Implement diagnostics and formatting first because they require the least workspace-index compatibility surface.
3. Move hover next, since it shares the typecheck pipeline but not the snapshot workspace index path.
4. Move completion and navigation after that, using temporary `workspaceFiles` compatibility fields.
5. Add `src/backend/runtime/runtimeAdapter.ts` with source-first `start` and snapshot `resume` adapters over current root APIs.
6. Only then introduce `src/backend/createBackend.ts` as the single composed in-memory implementation used by playground adapters.

### Compatibility posture

This first boundary should tolerate a small number of temporary compatibility adapters.

Allowed temporary adapters:

- explicit workspace snapshot inputs for completion/navigation while the backend grows a longer-lived workspace index
- verified-runtime inputs behind internal adapters while the public backend surface remains source-first
- thin adapters between existing run/resume entrypoints and backend session APIs

Disallowed temporary shortcuts:

- new client-owned semantic caches
- pushing workspace overlay rules back into playground or VS Code glue
- broad facade layers that merely rename current mixed abstractions without changing ownership

## First Consumer Slice

The playground should be the first consumer, but only in a thin and staged way.

### Stage 1: analysis surface

Move the protocol definition currently implicit in `playground-www/src/lsWorker.ts` into the backend source boundary.

Then make the worker an adapter that:

- forwards document sync to the backend
- forwards analysis requests to the backend
- forwards cancellation to the backend
- translates backend responses into current worker message shapes

This preserves current behavior while moving semantic ownership downward.

### Stage 2: one runtime seam

After analysis is using the backend surface, move one runtime path behind the same backend.

Preferred path:

- `startSession`
- `resumeSnapshot`

Not yet:

- debugger controls
- time-travel UI
- rich trace/replay panels

This gives the backend one real runtime lifecycle without forcing the entire runtime-inspection roadmap into the same iteration.

## Non-Goals

This design does not attempt to:

- finalize the public artifact wire format
- force all runtime-adjacent code into `dvala-runtime`
- create a debugger/DAP surface
- solve browser process topology
- package CLI and MCP in the same iteration
- remove temporary compatibility adapters before they have done their job

## Open Questions

- When should `replaceWorkspaceSnapshot(files)` be retired in favor of explicit persisted-file mutations?
- What is the first runtime-backed client flow worth proving behind `startSession` and `resumeSnapshot` after the analysis slice lands?
- Which backend result and error types should be shared directly with transports, and which should stay backend-internal and be translated by adapters?
- What concrete evidence should count as “analysis slice proven” and “runtime slice proven” for package-promotion purposes?

## Implementation Plan

1. Create a first backend source boundary that defines backend-owned document, analysis, session, and request-lifecycle interfaces.
2. Move the current playground LS worker protocol types into that backend boundary or into a shared adapter-facing protocol file owned by the backend layer.
3. Implement backend-owned document mirrors, version checks, cancellation flags, and stale-result behavior for the current analysis surface.
4. Make `playground-www/src/lsWorker.ts` an adapter over backend analysis operations rather than the canonical owner of the protocol and state model.
5. Introduce one runtime session adapter that routes `startSession` and `resumeSnapshot` through backend-owned orchestration using `dvala-runtime` only for portable runtime responsibilities.
6. Identify the remaining mixed code in `src/createDvala.ts` and split it into runtime-owned, backend-owned, and tooling-only slices.
7. Reassess whether the backend boundary is stable enough to promote into a real workspace package.