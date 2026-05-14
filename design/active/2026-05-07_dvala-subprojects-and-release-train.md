# Dvala Subprojects And Release Train

**Status:** Accepted — first `dvala-runtime` extraction slice completed on `main`
**Created:** 2026-05-07

## Status Update

As of 2026-05-08, the first concrete milestone described in this document has landed:

- `packages/dvala-runtime` exists as a real workspace package
- the workspace now includes `packages/*` in [pnpm-workspace.yaml](pnpm-workspace.yaml)
- host-facing runtime contracts and artifact contracts are imported through that package boundary
- the generic runtime bridge implementation now lives in `packages/dvala-runtime`
- the root runtime layer has been reduced to a compatibility shim where needed
- package entrypoint and `./artifacts` subpath coverage have been added as a follow-up hardening step

What has not happened yet:

- the broader evaluator cluster has not been moved wholesale into `packages/dvala-runtime`
- CLI and MCP have now been promoted to real package-style subprojects (`packages/dvala-cli` and `packages/dvala-mcp-server`)
- the wider target monorepo shape in this document remains a later rollout, not an in-progress batch

The current recommendation is to treat the first `dvala-runtime` extraction as complete for this phase and to treat the rest of this document as a roadmap for later forcing functions, not as one continuous implementation track.

## Goal

Define how Dvala should move to real subprojects in the monorepo while keeping a shared release train for now and leaving room for later decoupling.

This document is intentionally more concrete than the backend-authority vision in [2026-05-06_dvala-backend-authority.md](2026-05-06_dvala-backend-authority.md), but it still leaves room for discussion between iterations.

---

## Background

The backend-authority work has produced one strong conclusion:

- the Dvala Runtime should be a separate subproject

Another conclusion is emerging alongside it:

- Dvala should move toward real workspace subprojects in `pnpm`
- releases should still move together for now as one coordinated train

Those two decisions should be kept separate:

- subprojects are an architectural boundary
- release cycles are an operational boundary

The first decision is now strong enough to act on.
The second should remain conservative for now.

Today the repository does not yet express the intended architecture clearly:

- the root [package.json](package.json) is still the main release package, CLI entrypoint, MCP server package root, and build orchestration root
- [pnpm-workspace.yaml](pnpm-workspace.yaml) now includes `packages/*` and `vscode-dvala`, but only `dvala-runtime` has been made real so far
- most of the remaining architectural boundaries still exist only in source layout and design prose, not as real workspace packages

That is workable for a single-package project, but it does not yet support the backend-first structure we now want.

## Proposal

## Core decision

Adopt real subprojects in the monorepo, beginning with `dvala-runtime`, while keeping a shared release train across the repository until there is strong evidence that release decoupling is worth the operational cost.

This means:

- yes to real workspace subprojects
- yes to `dvala-runtime` as the first explicit subproject
- no to independent release cycles for now

The current working interpretation is:

- go as far toward real package boundaries and publishability as practical
- keep the shared release train configured and controlled at the root
- use the package boundaries as architectural discipline, not as a promise of immediate release independence

## Why this split

This gives the architecture what it needs immediately:

- explicit package boundaries
- explicit dependency directions
- a real home for the runtime as a portable engine target
- a monorepo structure that can later support backend modularization cleanly

Without paying the cost too early for:

- per-package release workflows
- per-package compatibility management
- version skew between tightly coupled layers
- premature publishing/process overhead

## Proposed monorepo shape

This is the target direction, not necessarily the full first migration step:

- `packages/dvala-runtime`
- `packages/dvala-core-tooling`
- `packages/dvala-workspace-backend`
- `packages/dvala-backend-protocols` only when that boundary becomes real enough
- `packages/dvala-cli`
- `packages/dvala-mcp-server`
- `apps/playground-www`
- `apps/playground-builder`
- `vscode-dvala`
- root workspace for orchestration only

The important point is not only naming but pressure:

- CLI and MCP should be structured as real package-style subprojects
- the root still owns the coordinated release train
- apps remain the place for product surfaces like playground clients/builders

## First concrete subproject

### `dvala-runtime`

This should become a real workspace subproject first.

The boundary should be defined by future host portability, including a KMP port.
If a future KMP host needs it to verify, run, suspend, or resume a Dvala artifact, it belongs here.
If it is TypeScript-specific tooling, workspace logic, or client integration, it does not.

It should own:

- evaluator semantics
- continuation and suspension model
- effects and handler execution model
- runtime serialization/deserialization contracts
- program/snapshot format contracts needed by a host
- snapshot artifact verification hooks
- builtin-module identity and loading rules
- runtime fingerprint reporting

It should not own:

- file-system adapters
- workspace overlays
- editor integration
- LSP/DAP/RPC transport layers
- CLI command orchestration
- MCP server logic
- UI logic
- workspace indexing/orchestration concerns

This is a design decision, not an open question.

Remaining questions are about:

- public API shape
- migration order

The currently accepted extraction target is not a minimal evaluator kernel.
It is the portable host runtime boundary: everything needed for a host to verify, run, suspend, and resume Dvala semantics, but not more.

## First concrete `dvala-runtime` API

The first public API should be shaped around what a host needs to do, not around today's internal source layout.

That means the first API should answer these host actions directly:

- identify the runtime
- verify a program artifact
- start a session from a verified program artifact
- suspend a live session into a snapshot artifact
- verify a snapshot artifact
- resume a session from a verified snapshot artifact
- provide host capabilities through explicit adapters

It should not expose file-oriented workspace concerns, editor lifecycles, or LSP-shaped request APIs.

### API design rules

- prefer host operations over low-level internals in the main public surface
- make trust and verification explicit rather than implicit preconditions
- model trust as immutable value transitions rather than hidden mutable runtime state
- keep serialization contracts public where hosts must persist or transport artifacts
- keep capability binding explicit so hosts can permit, deny, or swap adapters deliberately
- allow lower-level evaluator entrypoints only as secondary surfaces, not as the main package story

### Interview decisions

The current working decisions from the API interview are:

- the primary runtime API should be host-oriented, not evaluator-oriented
- secure-by-default flows should require immutable verified handles for start/resume
- host capabilities should be bound once into a runtime-host context object
- programs and snapshots should be canonical structured artifacts, not opaque-by-design blobs
- snapshots should be treated as portable runtime artifacts for cross-host resume from the start
- the portable artifact should preserve a Dvala semantic IR, not freeze the current parser AST unchanged as the external contract
- compression is packaging, not the semantic artifact itself
- signatures should cover the canonical artifact, with optional separate integrity for compressed transport wrappers
- the semantic IR should have both a canonical encoded form and a decoded inspectable form
- deterministic CBOR plus COSE is the default artifact stack direction

### First-pass surface

The first pass should likely export a small number of top-level concepts:

- `RuntimeIdentity`
- `RuntimeHost`
- `ProgramArtifact`
- `VerifiedProgram`
- `SnapshotArtifact`
- `VerifiedSnapshot`
- `CapabilityPolicy`
- `VerificationResult`
- `RuntimeSession`
- `DvalaRuntime`

Example shape:

```ts
export type RuntimeIdentity = {
	version: string
	fingerprint: string
	schemaVersion: string
}

export interface RuntimeHost {
	readonly identity: RuntimeIdentity
	readonly policy: CapabilityPolicy
	resolveEffect(name: string): DvalaEffectAdapter | undefined
	verifySignature(artifact: CanonicalArtifact): Promise<boolean>
	loadBuiltinModule(name: string): Promise<Uint8Array | string>
}

export type CapabilityPolicy = {
	allowedEffects: readonly string[]
	mode: 'strict' | 'development'
}

export type ProgramArtifact = {
	kind: 'program'
	runtimeFingerprint: string
	schemaVersion: string
	moduleHash: string
	signature?: string
	payload: CanonicalEncodedProgram
	policy: CapabilityPolicy
}

export type VerifiedProgram = {
	artifact: ProgramArtifact
	verifiedAt: number
	hostFingerprint: string
}

export type SnapshotArtifact = {
	kind: 'snapshot'
	runtimeFingerprint: string
	schemaVersion: string
	moduleHash: string
	signature?: string
	payload: CanonicalEncodedSnapshot
	policy: CapabilityPolicy
}

export type VerifiedSnapshot = {
	artifact: SnapshotArtifact
	verifiedAt: number
	hostFingerprint: string
}

export type VerificationResult =
	| { ok: true }
	| { ok: false; reason: string }

export interface RuntimeSession {
	id: string
	run(): Promise<DvalaRunResult>
	suspend(): Promise<SnapshotArtifact>
	inspect(): DvalaSessionState
	close(): Promise<void>
}

export interface DvalaRuntime {
	getIdentity(): RuntimeIdentity
	bindHost(host: RuntimeHost): BoundRuntime
}

export interface BoundRuntime {
	getIdentity(): RuntimeIdentity
	verifyProgram(artifact: ProgramArtifact): Promise<VerifiedProgram>
	startProgram(artifact: VerifiedProgram): Promise<RuntimeSession>
	verifySnapshot(artifact: SnapshotArtifact): Promise<VerifiedSnapshot>
	resumeSnapshot(artifact: VerifiedSnapshot): Promise<RuntimeSession>
}
```

This sketch is deliberately host-oriented and immutable in flavor.
Verification should produce stronger values rather than mutating ambient runtime state.
It does not yet say how parsing, bundling, workspace import resolution, or editor requests work, because those do not define the runtime boundary.

### Artifact design direction

The current direction for artifacts is:

- one canonical program artifact format
- one canonical snapshot artifact format
- both are intended to be portable across hosts
- the canonical artifact is what gets hashed and signed
- compression is an optional wrapper around the canonical artifact, not the thing being signed
- the semantic IR should support both a canonical encoded representation and a decoded inspectable representation
- deterministic CBOR is the leading canonical encoding for portable artifacts
- COSE is the leading signing envelope for those canonical artifacts

This choice optimizes for long-term portable runtime artifacts rather than easiest initial inspection.
The runtime and tooling should therefore provide decoded inspectable views as a first-class companion to the canonical binary form, instead of treating the binary form itself as the main human-facing representation.

Current working stance:

- canonical program and snapshot artifacts should be deterministically encoded with CBOR
- signatures should be expressed with COSE over the canonical artifact content
- compression remains an outer transport or storage wrapper, not part of artifact identity
- decoded JSON-like inspection views are a tooling concern layered on top of the canonical form
- this is still a working design decision, but it is now the default direction unless implementation evidence forces a change

### Future encryption compatibility

The current baseline is signed, inspectable artifacts, not encrypted-by-default artifacts.
However, the artifact model should leave room for optional encrypted payload sections later, especially for snapshots that may carry sensitive runtime state.

That means the artifact shape should already separate:

- readable manifest-level metadata
- canonical payload sections
- signature material

So that a future version can keep manifest data visible while selectively protecting payload sections such as snapshot machine state.

Current direction:

- signatures remain part of the baseline trust model
- encryption is deferred and optional, not part of the baseline artifact requirement
- the design should avoid assuming every decoded payload section is always visible in plaintext
- the manifest should remain strong enough for routing, compatibility checks, and policy decisions even if some payload sections are protected later

### Canonical artifact envelope sketch

The first concrete artifact shape should be simple and explicit rather than overly generic.
Both program and snapshot artifacts should use the same high-level envelope shape, with different payload sections inside.

High-level layout:

- protected manifest: canonical metadata that is always covered by the signature
- payload sections: canonical CBOR sections for program IR, snapshot machine state, and related runtime material
- COSE signature material: attached to the artifact as the signing envelope over the canonical content

Likely manifest fields:

- artifact kind: `program` or `snapshot`
- schema version
- runtime fingerprint
- module or code hash
- capability policy
- content map describing which payload sections are present
- optional compression wrapper metadata when transported in compressed form

Likely payload sections for a program artifact:

- canonical encoded semantic IR
- builtin-module payloads or references when they are part of sealed execution identity
- optional decoded inspection hints that are explicitly non-authoritative

Likely payload sections for a snapshot artifact:

- canonical encoded semantic IR or a stable reference to the sealed program payload it resumes
- canonical encoded resumable machine state
- capability policy state that must survive across resume
- optional future protected sections for sensitive runtime state

The important constraint is not the exact field names yet.
It is that the manifest remains readable for routing and policy checks, while canonical payload sections remain the signed semantic authority.

### First-pass TypeScript artifact model

The first TypeScript-level artifact model should now be concrete enough to align the runtime API and artifact story, while still leaving low-level payload details open.
It should be B in concreteness, but C-compatible by construction.

That means:

- use explicit `ProgramArtifactEnvelope` and `SnapshotArtifactEnvelope` types
- build them from shared primitives rather than one giant union envelope
- keep named core section slots for the baseline standard sections
- keep a distinct `extensions` lane for non-core sections that may later be promoted into the standard set
- treat canonical bytes as authoritative and signed
- allow optional decoded inspection views, but mark them as non-authoritative

Example direction:

```ts
export type ArtifactManifest = {
	kind: 'program' | 'snapshot'
	schemaVersion: string
	runtimeFingerprint: string
	moduleHash: string
	capabilityPolicy: CapabilityPolicy
	coreSections: readonly CoreSectionKind[]
	extensionSectionIds?: readonly string[]
	compression?: {
		format: CompressionFormat
	}
}

export type ProgramCoreSectionKind = 'semantic-ir' | 'builtin-modules'

export type SnapshotCoreSectionKind =
	| 'embedded-program'
	| 'program-reference'
	| 'machine-state'

export type CoreSectionKind =
	| 'semantic-ir'
	| 'builtin-modules'
	| 'program-reference'
	| 'machine-state'
	| 'embedded-program'

export type ProgramArtifactManifest = Omit<ArtifactManifest, 'kind' | 'coreSections'> & {
	kind: 'program'
	coreSections: readonly ProgramCoreSectionKind[]
}

export type SnapshotArtifactManifest = Omit<ArtifactManifest, 'kind' | 'coreSections'> & {
	kind: 'snapshot'
	coreSections: readonly SnapshotCoreSectionKind[]
}

export type CompressionFormat = 'gzip' | 'brotli' | 'zstd'

export type CorePayloadFormat = 'cbor'

export type ExtensionPayloadFormat =
	| CorePayloadFormat
	| 'cose-encrypted'
	| 'cbor-packed'

export type CanonicalSection<TInspection = unknown> = {
	payloadFormat: CorePayloadFormat
	canonicalBytes: Uint8Array
	inspectionView?: TInspection
}

export type SemanticIrNodeKind =
	| 'module'
	| 'function'
	| 'handler'
	| 'expression'

export type SemanticIrInspectionView = {
	summary?: string
	nodeKinds?: readonly SemanticIrNodeKind[]
	entrypointName?: string
}

export type MachineStateFrameKind =
	| 'sequence'
	| 'call'
	| 'handler'
	| 'parallel'
	| 'match'
	| 'resume'

export type MachineStateInspectionView = {
	summary?: string
	frameKinds?: readonly MachineStateFrameKind[]
	suspendedEffect?: string
}

export type SemanticIrSection = CanonicalSection<SemanticIrInspectionView>

export type BuiltinModuleSection = CanonicalSection<{
	moduleNames: readonly string[]
}>

export type MachineStateSection = CanonicalSection<MachineStateInspectionView>

export type EmbeddedProgramSection = {
	artifact: ProgramArtifactEnvelope
}

export type ProgramReferenceSection = {
	programArtifactId: string
	moduleHash: string
	runtimeFingerprint: string
}

export type ExtensionInspectionView = {
	summary?: string
	declaredPurpose?: string
	decodedFormAvailable?: boolean
}

export type ArtifactExtensionSection = {
	id: string
	payloadFormat: ExtensionPayloadFormat
	canonicalBytes: Uint8Array
	inspectionView?: ExtensionInspectionView
}

export type CoseAlgorithm = 'EdDSA' | 'ES256' | 'ES384'

export type CoseSignatureEnvelope = {
	format: 'cose-sign1'
	keyId?: string
	algorithm?: CoseAlgorithm
	bytes: Uint8Array
}

export type ProgramArtifactEnvelope = {
	manifest: ProgramArtifactManifest
	semanticIr: SemanticIrSection
	builtinModules?: BuiltinModuleSection
	extensions?: readonly ArtifactExtensionSection[]
	signature: CoseSignatureEnvelope
}

export type SnapshotArtifactEnvelope = {
	manifest: SnapshotArtifactManifest
	program: EmbeddedProgramSection | ProgramReferenceSection
	machineState: MachineStateSection
	extensions?: readonly ArtifactExtensionSection[]
	signature: CoseSignatureEnvelope
}
```

Notes on this shape:

- the canonical bytes are the authoritative artifact content and trust boundary
- inspection views are for tooling and humans, not for verification or execution authority
- snapshots support both embedded sealed program content and stable references to sealed program content
- `extensions` is the incubator lane for non-core sections that may later become standard
- this is still a first-pass design sketch, not a frozen wire contract

Draft invariants:

- a `ProgramArtifactEnvelope` must always declare `semantic-ir` in `manifest.coreSections`
- a `SnapshotArtifactEnvelope` must always declare `machine-state` and exactly one of `embedded-program` or `program-reference` in `manifest.coreSections`
- a snapshot must not carry both an embedded program section and a program reference section at the same time
- entries listed in `manifest.extensionSectionIds` should correspond one-to-one with actual `extensions` entries when extensions are present
- verification and execution authority must be derived from canonical bytes and COSE signature material, never from inspection views

### Likely entrypoint split

The package should probably expose a primary host-facing entrypoint and a small number of secondary entrypoints.

Possible direction:

- `@mojir/dvala-runtime` for host-facing run/verify/resume APIs
- `@mojir/dvala-runtime/artifacts` for program/snapshot contract types and serializers
- `@mojir/dvala-runtime/evaluator` only if lower-level evaluator access is still needed internally

The important rule is that hosts should not need to import evaluator internals just to run or resume artifacts correctly.

### What stays out of this first API

- workspace file resolution
- overlay/document lifecycle
- tokenizer/parser convenience APIs for tooling
- diagnostics/hover/completion/navigation/rename/formatting
- CLI command surfaces
- MCP transport/request shapes

## First extraction slice for `packages/dvala-runtime`

The first extraction slice should create a real workspace package without pretending that every runtime-adjacent concern is already cleanly separated.
The goal is to establish the package boundary honestly while moving the minimum set of runtime-owned contracts and implementations needed to support the host-facing surface.

### Goal of the first slice

Create `packages/dvala-runtime` as the canonical home for:

- runtime identity types and reporting
- host-facing runtime interfaces
- program and snapshot artifact contract types
- continuation/suspension serialization contracts used by host suspend/resume flows
- runtime-owned builtin-module loading contracts
- the current evaluator entrypoints needed to run, suspend, and resume

This slice should favor boundary honesty over deep cleanup.
It is acceptable for the first package to wrap or re-export some current implementation surfaces temporarily, as long as the dependency direction is correct and workspace concerns stay out.

### What moves in the first slice

- runtime-facing public types now described in this document
- evaluator entrypoints currently responsible for run, resume, and suspension behavior
- snapshot/program artifact contract definitions and verification hooks
- runtime identity and builtin-module contract surfaces
- any runtime-local utilities that those pieces cannot function without

### What explicitly stays out

- parser/tokenizer convenience APIs for tooling-oriented workflows
- workspace import resolution and overlay state
- editor, LSP, DAP, MCP, or RPC lifecycle logic
- CLI command wiring and repo orchestration scripts
- bundler and project-file discovery concerns unless a temporary adapter boundary is unavoidable

### Current repo mapping for the first slice

The first extraction should be planned against the current source tree explicitly.
These are the concrete files and modules that should move first, split at the boundary, or remain outside.

Move as runtime-owned files first:

- `src/evaluator/trampoline-evaluator.ts`
- `src/evaluator/effectTypes.ts`
- `src/evaluator/suspension.ts`
- `src/evaluator/frames.ts`
- `src/evaluator/ContextStack.ts`
- `src/evaluator/interface.ts`
- `src/evaluator/step.ts`
- `src/evaluator/effectRef.ts`
- `src/evaluator/standardEffects.ts`
- `src/evaluator/dedupSubTrees.ts`
- `src/evaluator/callStack.ts`
- `src/evaluator/contentHash.ts`

These files already sit close to the portable runtime boundary: evaluator execution, continuation/state representation, suspension serialization, runtime context handling, and runtime-local support utilities.

Split at the boundary rather than move wholesale:

- `src/createDvala.ts`
- `src/parser/types.ts`
- `src/bundler/interface.ts`

Current expected split:

- `src/createDvala.ts` is mixed-purpose and should not move as-is. The runtime-owned runner/session factory surface and evaluator wiring should be extracted toward `packages/dvala-runtime`, while tooling-facing helpers such as autocomplete, undefined-symbol analysis, typecheck wiring, and source-to-AST convenience should remain outside.
- `src/parser/types.ts` currently defines runtime-relevant closure/function/handler types and the parser AST. The first slice should avoid moving the whole parser type surface. Instead, it should either temporarily depend on the parser AST types through a narrow boundary or introduce runtime-local aliases for the evaluator-owned subset.
- `src/bundler/interface.ts` is currently the only explicit bundle contract consumed by `createDvala`. The first slice should not pull the bundler package boundary into `dvala-runtime`, but it may temporarily depend on the `DvalaBundle` shape or replace it with a narrower runtime artifact input type.

Leave outside the first slice:

- tokenizer entrypoints and token stream transforms used for source-to-AST convenience
- parser entrypoints used primarily for tooling-facing source compilation flows
- typechecker and tooling helpers currently referenced from `src/createDvala.ts`
- bundler implementation and project-file/module discovery logic
- builtin source authoring and repo-local packaging logic, except for the runtime-owned builtin-module loading contract

That implies the first real code motion should probably begin by extracting a smaller runtime-facing entry surface out of `src/createDvala.ts`, then moving the evaluator cluster underneath it into `packages/dvala-runtime`.

### Implementation checklist with target paths

The first extraction should be executable as a series of explicit repo changes.
This is the current preferred checklist.

1. Scaffold the package boundary.
	Create:
	- `packages/dvala-runtime/package.json`
	- `packages/dvala-runtime/tsconfig.json`
	- `packages/dvala-runtime/src/index.ts`
	- `packages/dvala-runtime/src/artifacts/index.ts`
	- `packages/dvala-runtime/src/evaluator/index.ts`

2. Land runtime-owned public contract types first.
	Preferred target files:
	- `packages/dvala-runtime/src/types/runtime.ts`
	- `packages/dvala-runtime/src/artifacts/types.ts`
	- `packages/dvala-runtime/src/artifacts/signature.ts`

	These files should define the host-facing runtime identity, host/session interfaces, and first-pass artifact contracts described earlier in this document.

3. Extract a smaller runtime-facing entry surface from `src/createDvala.ts`.
	Preferred target files:
	- `packages/dvala-runtime/src/createRuntime.ts`
	- `packages/dvala-runtime/src/run.ts`

	Keep outside for now:
	- autocomplete helpers
	- undefined-symbol analysis
	- typecheck wiring
	- source-string to AST convenience flows

4. Move the evaluator cluster under the new package with minimal shape changes.
	Preferred target paths:
	- `packages/dvala-runtime/src/evaluator/trampoline-evaluator.ts`
	- `packages/dvala-runtime/src/evaluator/effectTypes.ts`
	- `packages/dvala-runtime/src/evaluator/suspension.ts`
	- `packages/dvala-runtime/src/evaluator/frames.ts`
	- `packages/dvala-runtime/src/evaluator/ContextStack.ts`
	- `packages/dvala-runtime/src/evaluator/interface.ts`
	- `packages/dvala-runtime/src/evaluator/step.ts`
	- `packages/dvala-runtime/src/evaluator/effectRef.ts`
	- `packages/dvala-runtime/src/evaluator/standardEffects.ts`
	- `packages/dvala-runtime/src/evaluator/dedupSubTrees.ts`
	- `packages/dvala-runtime/src/evaluator/callStack.ts`
	- `packages/dvala-runtime/src/evaluator/contentHash.ts`

5. Introduce temporary boundary adapters for parser and bundle types instead of forcing full ownership immediately.
	Preferred temporary choices:
	- keep a narrow import dependency on `src/parser/types.ts` for AST-facing evaluator types, or copy the evaluator-owned subset into `packages/dvala-runtime/src/ast/types.ts`
	- keep `DvalaBundle` as an external compatibility type at the boundary, or replace it with a narrower runtime input type in `packages/dvala-runtime/src/artifacts/compat.ts`

6. Add package-local exports that make the boundary real for callers.
	Preferred exports:
	- `packages/dvala-runtime/src/index.ts` for host-facing runtime APIs
	- `packages/dvala-runtime/src/artifacts/index.ts` for artifact types and serializers
	- `packages/dvala-runtime/src/evaluator/index.ts` only for explicitly allowed lower-level access

7. Update existing callers to import through the new package boundary.
	Expected first callers:
	- root package surfaces that currently re-export or construct runtime behavior
	- CLI entrypoints that execute Dvala programs
	- playground/backend flows that need run, suspend, or resume

8. Leave the following as deliberate follow-up work, not first-slice blockers.
	- moving tokenizer/parser/tooling code
	- replacing all temporary AST type dependencies
	- finalizing the public artifact wire contract
	- deeper evaluator cleanup that does not change package ownership

### Migration sequence

1. Create `packages/dvala-runtime` with its own `package.json`, `tsconfig`, and package-local build entrypoints beneath root orchestration.
2. Move the host-facing types and artifact contract types into the new package first so the intended public boundary is explicit early.
3. Move the evaluator run/resume/suspend entrypoints and their directly required runtime internals into the package.
4. Leave tooling-oriented parsing, bundling, and workspace resolution outside the package, using temporary adapters at the boundary where necessary.
5. Update current callers in the root package, CLI, playground, and other hosts to import runtime-owned surfaces from `packages/dvala-runtime` rather than from the old source layout.
6. Only after that boundary is in place, decide which remaining internals should be promoted, wrapped, or left outside as tooling-only code.

### Definition of done for the first slice

The first extraction slice is successful when:

- `packages/dvala-runtime` exists as a real workspace package
- host-facing runtime types and artifact contracts are imported from that package
- run, suspend, and resume flows can be reached through that package boundary
- workspace/editor/transport concerns still live outside the package
- the root release train and root commands continue to work without introducing per-package release machinery

This is intentionally not a demand to finalize the semantic IR, freeze every artifact field, or complete all runtime cleanup in one move.
It is the smallest honest package extraction that makes the architecture real.

This definition of done is now satisfied on `main` for the first `dvala-runtime` extraction slice.
The remaining work described in this document should now be interpreted as follow-up phases rather than unfinished work inside the same slice.

## Release strategy

### Shared release train now

All subprojects should move together in one coordinated release train for now.

That means:

- one repo-level release cadence
- one compatibility-tested set of versions
- root-level build/test/release orchestration remains the main entrypoint
- subprojects gain architectural independence before they gain operational independence

### Future decoupling later

Independent release cycles should be considered only when one or more of these become true:

- `dvala-runtime` has real external consumers with a cadence distinct from the rest of the repo
- KMP/runtime work needs to move at a different speed than backend/client work
- runtime changes and workspace/client changes frequently ship independently in practice
- compatibility boundaries have become explicit and stable enough to support version skew safely

Until then, a shared release train is the simpler and better default.

## Workspace strategy

The repository should move toward a real `pnpm` workspace layout that expresses architectural intent.

Recommended near-term changes:

- expand [pnpm-workspace.yaml](pnpm-workspace.yaml) to include future `packages/*` and `apps/*`
- keep the root package as the orchestration layer for now
- preserve top-level commands like `build`, `test`, `check`, `lint`, and `release` as release-train commands
- extract `dvala-runtime` as the first real workspace package before trying to formalize every later boundary

Those root commands should remain the authoritative repo-wide entrypoints, while package-local scripts own the local implementation work underneath them.

Recommended near-term non-goals:

- do not force every future boundary into a separate package immediately
- do not introduce per-package release automation yet
- do not require every app/client to become independently publishable now

## Dependency rules

The dependency direction should become stricter as subprojects appear.

At minimum:

- `dvala-runtime` must not depend on workspace backend code
- clients must not become the place where canonical Dvala semantics live
- root orchestration may depend on subprojects, but subprojects should not depend on root app logic

Future subprojects should respect the direction already established in the backend-authority document:

- runtime below workspace backend
- workspace backend below adapters
- adapters below clients

## Iteration 1 decision points

This iteration is meant to settle the following:

1. `dvala-runtime` becomes the first real subproject.
2. The repo moves toward real `pnpm` workspace subprojects.
3. Releases remain coordinated in one shared release train for now.
4. CLI and MCP should be treated as package-style subprojects, while the root remains the release-train owner.
5. `dvala-runtime` should be defined by portable host needs, including a future KMP port.
6. `dvala-core-tooling` should remain a source boundary first.
7. Root scripts remain authoritative for repo-wide `build`, `test`, `check`, `lint`, and `release`.
8. Canonical portable artifacts should default to deterministic CBOR plus COSE rather than JSON-first signing layers.

If those are accepted, the next iteration should focus on:

- what the root workspace and top-level scripts should keep owning
- the minimal package-local script surfaces each real subproject should expose beneath those root commands
- implementing the first extraction with thin, temporary boundary adapters only where they are genuinely needed

## Resolved Follow-Up Decisions

- `dvala-core-tooling` should remain a source boundary during the first `dvala-runtime` extraction and be reconsidered only after that boundary has stabilized.
- Real subprojects should expose only the minimal local scripts they need, while the root remains authoritative for repo-wide `build`, `test`, `check`, `lint`, and release flows.
- The first `dvala-runtime` extraction may use thin, temporary boundary adapters where necessary for parser AST or bundle-shape compatibility, but should avoid broad re-export or facade layering.

## Implementation Plan

1. Accept `dvala-runtime` as the first real subproject.
2. Update the design docs to treat subprojects and shared release train as the current strategy.
3. Expand the `pnpm` workspace shape conceptually to `packages/*` and `apps/*`.
4. Treat CLI and MCP as real package-style subprojects within that shared release train.
5. Define the first extraction boundary for `dvala-runtime` using the portable-host rule, including future KMP needs.
6. Keep `dvala-core-tooling` as a source boundary during that first extraction rather than promoting it to a real package in the same slice.
7. Keep package-local scripts minimal under root-owned repo-wide orchestration.
8. Create `packages/dvala-runtime` as the first real extraction slice, moving host-facing contracts and run/suspend/resume runtime entrypoints first while leaving workspace and tooling concerns outside.
9. Use only thin temporary adapters at the parser/bundle boundary, and treat broader compatibility layering as out of bounds for the first slice.

## Current Plan Status

Done now:

- `dvala-runtime` has been accepted and extracted as the first real subproject
- the repo now expresses that first package boundary in the workspace and codebase
- root-owned repo-wide orchestration remains authoritative
- the first extraction used thin temporary adapters rather than broad compatibility layering

Next only when there is a concrete forcing function:

- decide whether any additional evaluator ownership should move into `packages/dvala-runtime`
- promote CLI and MCP into real package-style subprojects
- expand the target package/app shape beyond `dvala-runtime`
- reconsider publishability and release independence only if external consumers or cadence pressure make it worth the cost