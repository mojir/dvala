# Bundle Type Metadata

**Status:** Draft
**Created:** 2026-04-13
**References:** `2026-04-12_type-system.md`, `2026-04-13_handler-finally.md`

## Goal

Decide how much type and lowering information should survive bundling, while keeping the runtime portable and making the future KMP port practical.

---

## Background

Up to now, the design direction has been to erase all type information after checking and keep the bundle as a pure AST:

```ts
interface DvalaBundle {
  version: 1
  ast: Ast
}
```

That was attractive because:

- the evaluator stays independent of the typechecker
- the AST stays small and portable
- the KMP port does not need to mirror the compiler's full type machinery
- snapshots and serialized continuations stay simpler

However, the current type-system design is now pushing on several places where some typed artifact must survive compilation:

- inferred exported module interfaces
- inferred/declared leaked effect signatures
- host-boundary resume validation
- imported handler/function typing across module boundaries
- possible future evidence-passing or other lowering metadata

This means the real choice is no longer "types in runtime vs no types in runtime". The real choice is:

1. erase everything and reconstruct later
2. append types directly to the AST
3. keep the AST clean and ship parallel metadata

## Proposal

Keep the AST execution-focused, but preserve optional typed metadata in the bundle as side tables.

### Decision

Adopt the following architecture:

1. The AST remains the execution IR.
2. Full compiler types are not embedded directly into AST nodes.
3. Type-derived artifacts that must survive compilation are stored as separate bundle metadata.
4. The runtime ignores metadata unless a specific runtime feature needs it.
5. Future evidence-passing or lowering plans also live in metadata, not in AST nodes.

In short:

- do not move to a typed AST
- do move away from total type erasure

## Why Not Keep Total Erasure

Full erasure is no longer a stable simplification because the system already needs to preserve type-derived information for other reasons.

If everything is erased, the compiler will still need to separately emit:

- leaked effect manifests
- exported interfaces
- effect signature descriptors for runtime validation
- possibly lowering plans for backends

At that point, type-derived data already survives compilation. Treating all of that as ad hoc special cases is worse than introducing one explicit metadata layer.

## Why Not Embed Types Into the AST

Embedding types directly into AST nodes has significant costs:

1. It couples the evaluator to the typechecker too tightly.
2. It bloats every node even though most runtime paths do not need type data.
3. It complicates AST transforms, bundling, deduplication, optimization, and snapshot handling.
4. It forces the KMP runtime to carry compiler-shaped type structure everywhere.

This would be the wrong default unless Dvala later adopts a separate lowered execution IR where embedded metadata is part of the runtime format by design.

## Recommended Bundle Shape

Evolve the bundle from:

```ts
interface DvalaBundle {
  version: 1
  ast: Ast
}
```

to something conceptually like:

```ts
interface DvalaBundle {
  version: 2
  ast: Ast
  metadata?: {
    exports?: Record<string, TypeDescriptor>
    leakedEffects?: Record<string, EffectSignatureDescriptor>
    runtimeChecks?: RuntimeCheckMetadata
    nodeTypes?: Record<number, TypeDescriptor>
    lowering?: {
      evidencePlan?: EvidencePlan
    }
  }
}
```

This does not mean all fields must exist immediately. The important part is the separation of concerns:

- `ast` is for execution
- `metadata` is for semantic and backend information

## Two Kinds of Type Data

The system should explicitly distinguish between compiler types and runtime-checkable descriptors.

### 1. Compiler types

These are the rich internal types used by inference and subtyping.

Examples:

- set-theoretic unions/intersections/negation
- recursive types
- open effect signature environments
- polymorphic handler types such as `Handler<B, O, Σ>`

These are useful for:

- type inference
- module interfaces
- IDE/tooling

These should stay in the compiler and not be required by the runtime.

### 2. Runtime descriptors

These are normalized, portable descriptors used only for runtime validation and backend consumption.

Examples:

- effect argument/return descriptors for leaked effects
- exported interface descriptors if needed by loaders
- host-boundary validators for `resume(...)`

These are useful for:

- runtime type checks
- portable bundle metadata
- KMP implementation

These should be simple enough to serialize, deserialize, and check efficiently in Kotlin.

## KMP Port Implications

This design is a better fit for the KMP port than either full erasure or a typed AST.

### Benefits

1. The evaluator remains close to the current architecture.
2. Kotlin code can ignore metadata when only execution is needed.
3. Metadata can be loaded only where specific features need it.
4. Runtime descriptors can be modeled as simple Kotlin data classes.
5. Compiler-specific type complexity stays out of the runtime.

### Performance

If runtime type checks are needed, side tables are likely a better tradeoff than typed AST nodes:

- less memory churn on hot AST traversal
- metadata can be indexed by stable names or `nodeId`
- runtime checks happen at explicit boundaries instead of on every evaluation step

This should produce a cleaner and probably faster KMP runtime than dragging full type info through every node.

## Evidence Passing And Lowering Metadata

If Dvala later introduces evidence passing or another lowered dispatch strategy, that data should also live in metadata by default.

Reason:

- evidence is a compilation strategy, not source-level meaning
- different backends may want different lowering plans
- the source AST should remain stable across backends

So evidence should not be baked into high-level AST nodes like:

```json
["Perform", payload, nodeId, evidenceIndex]
```

Instead it should live in metadata keyed by node id or symbol, for example:

```json
{
  "lowering": {
    "evidencePlan": {
      "123": { "effect": "@log", "slot": 2 },
      "456": { "effect": "@cache.get", "slot": 5 }
    }
  }
}
```

If Dvala later adopts a separate lowered executable IR, then embedding lowering data into that IR may become appropriate. But that is a different artifact than the current bundle AST.

## Artifact Model

To keep the architecture clear, Dvala should think in terms of three layers even if they are not all exposed immediately.

### 1. Source bundle

- bundled AST
- stable node ids
- no embedded types

### 2. Semantic bundle metadata

- exported inferred types
- leaked effect signatures
- runtime-checkable effect descriptors
- optional node-level type tables for tooling/debugging

### 3. Lowering metadata

- evidence-passing plans
- handler slot layouts
- backend-specific execution hints

The current system can adopt layers 1 and 2 now, and keep layer 3 optional for later.

## Recommendation

Adopt bundle metadata as a first-class architectural layer.

Specifically:

1. Keep the AST execution-only.
2. Stop treating all type information as disposable after checking.
3. Preserve exported types and leaked effect signatures in bundle metadata.
4. Introduce runtime descriptors as a normalized format separate from compiler types.
5. Keep future evidence/lowering data in side tables unless Dvala explicitly moves to a lowered executable IR.

This gives Dvala the benefits of inference-first compilation and runtime portability without over-coupling the runtime to the compiler's internal type representation.

## Open Questions

- Should bundle metadata be optional in development builds only, or always present once the type system ships?
- Should exported inferred interfaces be stored inside the bundle, emitted as separate interface artifacts, or both?
- Do runtime descriptors need their own versioning separate from the AST bundle version?
- Should `nodeTypes` be omitted entirely at first and added only when a concrete feature requires them?
- If KMP needs only runtime descriptors, should JS builds still embed richer semantic metadata for tooling?

## Implementation Plan

1. Update the type-system architecture to replace "erase all types" with "erase from AST, retain typed metadata".
2. Define a serializable `TypeDescriptor` / `EffectSignatureDescriptor` format for runtime checks.
3. Extend `DvalaBundle` with optional metadata while keeping plain AST execution valid.
4. Emit inferred exported types and leaked effect signatures into metadata.
5. Generate host-boundary runtime validators from runtime descriptors.
6. Keep node-level types and lowering/evidence metadata deferred until a concrete feature needs them.