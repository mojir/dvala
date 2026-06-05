# Minimize KMP Runtime Surface via `.dvala` Builtins

**Status:** Draft
**Created:** 2026-06-05

## Goal

Shrink the amount of code that must be reimplemented in the Kotlin Multiplatform
(KMP) port by pushing as much builtin/core-function logic as possible **out of
TypeScript and into `.dvala` source**.

The target end-state: the Kotlin runtime implements only

1. the **evaluator core** (trampoline, frames, continuations, context stack,
   value model, effect dispatch, serialization), and
2. an **irreducible set of primitive builtins** that genuinely cannot be
   expressed in Dvala (arithmetic, string primitives, the host/IO boundary,
   anything that bottoms out in a native operation).

Everything else — `map`, `filter`, `reduce`, most collection/sequence/functional
operations, and the module-level derived functions — ships as parsed `.dvala`
AST and runs on the shared evaluator. Those functions then need **zero** Kotlin
reimplementation: porting the evaluator automatically ports them.

## Background

### The mechanism already exists and is shipped

[design/archive/2026-03-05_core-dvala-source-plan.md](../archive/2026-03-05_core-dvala-source-plan.md)
(done, all phases) added the ability to implement builtin functions in `.dvala`
files while keeping docs/arity in TypeScript. At build time a `dvalaSourcePlugin`
turns each `.dvala` file into a string constant; on first construction it is
parsed and evaluated through the trampoline, and the resulting functions are
stored as `dvalaImpl` on the expression object. The TS `evaluate` remains only as
a fallback.

Its original motivation was *effects/suspension in HOF callbacks* (Dvala-implemented
functions traverse the trampoline naturally), **not** KMP. But the byproduct is
exactly the lever we want here.

It is already used broadly — ~18 builtin `.dvala` files ship today:

- Core: [collection.dvala](../../packages/dvala-engine/src/builtin/core/collection.dvala),
  [functional.dvala](../../packages/dvala-engine/src/builtin/core/functional.dvala),
  [sequence.dvala](../../packages/dvala-engine/src/builtin/core/sequence.dvala),
  [object.dvala](../../packages/dvala-engine/src/builtin/core/object.dvala),
  [error.dvala](../../packages/dvala-engine/src/builtin/core/error.dvala)
- Modules: math, string, vector, matrix, grid, bitwise, convert, linear-algebra,
  number-theory, macros, assertion, test, effectHandler.

### The KMP plan currently assumes the opposite

[design/active/2026-03-28_kmp-migration.md](2026-03-28_kmp-migration.md)
§"Builtin functions" selects **Option A: re-implement all 150+ builtins in
Kotlin**, on the reasoning that "the builtins are straightforward." Its scope
estimate (~40–50K Kotlin LOC) is sized against re-porting every builtin. That
doc predates how far the `.dvala`-source migration has actually progressed, and
the two threads have never been reconciled.

A related direction is already on the books:
[design/archive/2026-03-23_multi-platform-runtime.md](../archive/2026-03-23_multi-platform-runtime.md)
establishes that **modules are precompiled at build time in TS**, the parser stays
in TS, and the runtime only needs to *deserialize and evaluate* the precompiled
form — not re-parse source. This proposal extends that same logic from *modules*
down to *core builtins*.

**Open: what is the shipped artifact?** That doc says "precompiled AST," but that
predates the wire-format work and should not be treated as settled. The artifact
could be:

- the **raw parser AST**, serialized — simplest, but couples the artifact to the
  parser's output shape (source ranges, comment/CST detail, un-expanded macro-call
  nodes, all the sugar). KMP would have to handle every node kind the parser emits.
- a **normalized wire-format representation** (macros pre-expanded, sugar lowered,
  ranges optional/stripped) — an extra TS lowering step, but a *narrower* surface:
  fewer node kinds for the Kotlin evaluator to implement. This is the same
  surface-minimization this doc is about, applied one level down.

This proposal does **not** depend on which is chosen — the thesis ("KMP gets these
builtins for free once it can evaluate the precompiled form") holds either way. But
the choice matters a lot for *how small* the KMP evaluator can be, and it is
blocked on the wire-format decision (cf. the CBOR/COSE artifact direction, settled
in principle but not started). If the wire format defines a normalized IR, that IR
effectively *becomes* the `dvala-runtime` ↔ KMP contract — see the open
contract-surface question below.

### The contract this builds on: `dvala-runtime` vs `dvala-engine`

The monorepo already separates the *contract* from its *implementation*:

- **`@mojir/dvala-runtime`** — zero dependencies, almost no logic. It defines the
  abstract interfaces ([types/runtime.ts](../../packages/dvala-runtime/src/types/runtime.ts):
  `DvalaRuntime`, `BoundRuntime`, `RuntimeHost`, `RuntimeSession`, `RuntimeExecutor`)
  and the artifact/wire types ([artifacts/types.ts](../../packages/dvala-runtime/src/artifacts/types.ts):
  `ProgramArtifactEnvelope`, `SnapshotArtifactEnvelope`, `BuiltinModuleSection`,
  `EmbeddedProgramSection`, COSE signatures). It even ships a placeholder
  `createUnimplementedRuntimeExecutor` — the real executor is *injected*.
- **`@mojir/dvala-engine`** — the TS implementation: trampoline evaluator, frames,
  value model, builtins. It provides the real `RuntimeExecutor` behind the contract.

`RuntimeExecutor` is the seam a second implementation plugs into: **TS wires in the
engine's executor today; a Kotlin port would satisfy the same `dvala-runtime`
interfaces with its own.** Consumers (CLI, playground, core-tooling,
workspace-backend) already import the contract types and don't know which
implementation is behind them.

Two facts make this proposal a contract-surface decision, not just an engine
refactor:

- **Builtin modules are already modeled at the contract layer.**
  `RuntimeHost.loadBuiltinModule(name): Promise<Uint8Array | string>` and the
  `BuiltinModuleSection` artifact type mean `.dvala` builtins are already first-class
  *loadable artifacts*. So the classification maps directly: **native primitives** =
  what each `RuntimeExecutor` implementation must provide in-language; **`.dvala`
  builtins** = `BuiltinModuleSection` artifacts the host loads and the shared
  evaluator runs. The primitive set is, in effect, the executor's half of the contract.
- **The shipped-artifact question lives here too.** Whatever form the precompiled
  builtins take (raw AST vs normalized IR) becomes an `artifacts/types.ts` shape. So
  the wire-format decision *is* the same conversation as "what does the
  `dvala-runtime` contract carry."

The open work (flagged in
[2026-05-26_backend-authority-active-roadmap.md](2026-05-26_backend-authority-active-roadmap.md)
§3) is that the split exists *structurally* but hasn't been validated as neutral and
complete enough to host a Kotlin implementation: is anything engine-private leaking
through the seam, are the artifact types genuinely platform-neutral/serializable, and
is the impl/contract line drawn in the right place. This proposal sharpens that
question by pinning down one concrete piece of it — the primitive set.

## Proposal

Reframe the KMP builtin strategy from "Option A — port all 150+ to Kotlin" to:

> **Option C: port the evaluator + irreducible primitives; ship everything else as `.dvala` AST.**

Concretely:

1. **Classify every builtin** into one of three buckets:
   - **Primitive (native Kotlin required):** bottoms out in a host operation —
     numeric arithmetic, comparison, string codepoint/encoding ops, `Math.*`,
     type predicates on the native value model, RNG/host/IO, parsing of literals.
   - **Already `.dvala`:** the ~18 files above; free on KMP once the evaluator
     lands.
   - **Portable to `.dvala`:** currently TS but expressible purely in terms of
     other builtins (much of collection/sequence/functional/grid). Migrate these
     to `.dvala` *before* the KMP port begins.

2. **Drive the "portable" bucket to zero remaining TS** (or as close as is
   sound/performant) so the KMP port inherits them for free.

3. **Define the irreducible primitive set explicitly** — this becomes the actual
   Kotlin builtin work item, and the honest KMP scope number.

4. **Precompile `.dvala` builtins at build time** (in TS) and embed the result
   in the runtime artifact — in whatever form the wire format settles on (raw
   serialized AST or normalized IR; see Background). The Kotlin side then needs
   only a deserializer + evaluator, not a Dvala parser.

### Why this is attractive

- The machinery is already built and battle-tested; this is mostly *migration
  work in TS we already know how to do*, not new infrastructure.
- It directly attacks the largest line-item in the KMP estimate.
- It keeps a single source of truth for derived-function semantics (the `.dvala`
  file), eliminating TS-vs-Kotlin behavioral drift for those functions.

### Costs / risks to weigh

- **Performance:** a `.dvala` `map`/`filter`/matrix op runs through the evaluator
  rather than a tight native loop. Need to measure the hot-path cost (the
  pipeline perf bench is the tool) and decide which performance-critical builtins
  stay native even though they *could* be `.dvala`.
- **Refinement typechecking & serialization:** confirm these treat native vs
  `.dvala` builtins identically (docs/arity already live in TS regardless).
- **Bootstrapping order:** primitives a `.dvala` builtin depends on must be
  available at lazy-init time; circular dependencies between `.dvala` files need
  a defined load order.

## Open Questions

- What is the **minimal primitive set**? (The deliverable of step 1 — likely a
  few dozen functions, not 150+.) Can we get a hard count?
- Which builtins are **performance-critical enough** to keep native even though
  they're expressible in Dvala? What does the pipeline bench say about the cost
  of moving the big collection HOFs to `.dvala`?
- Does any builtin rely on TS-specific value identity / host capabilities
  (e.g. `prettyPrint` via capability, RNG, time) that complicate a `.dvala`
  rewrite?
- What is the **shipped artifact form** — raw serialized AST or a normalized
  wire-format IR? (Blocked on the wire-format decision; determines how small the
  KMP node-handling surface can be. See Background.)
- Should core-builtin precompilation reuse the existing module-precompile path,
  or need its own build step?
- Once the primitive set is pinned down, does the `RuntimeExecutor` /
  `BuiltinModuleSection` contract need to change to express it cleanly? (See
  "The contract this builds on" above — this is the concrete slice of the open
  contract-surface question in
  [2026-05-26_backend-authority-active-roadmap.md](2026-05-26_backend-authority-active-roadmap.md)
  §3.)

## Implementation Plan

1. **Inventory & classify** all builtins (core + modules) into
   primitive / already-`.dvala` / portable-to-`.dvala`. Produce counts and a
   per-function table. (Pure analysis; no code change.)
2. **Define the irreducible primitive set** and write it down as the KMP builtin
   contract.
3. **Benchmark** representative "portable" builtins as `.dvala` vs TS-native to
   establish the perf budget and flag any that must stay native.
4. **Migrate the portable bucket** to `.dvala`, function by function (the
   existing gradual mechanism already supports per-function migration with TS
   fallback), running the perf bench as we go.
**Deliverable of this doc:** the primitive-set contract, the inventory counts, and
the perf budget — i.e. the evidence that the KMP builtin surface is the primitive
set + evaluator, not 150+ functions.

### Out of scope (downstream, not owned here)

- **Revising [2026-03-28_kmp-migration.md](2026-03-28_kmp-migration.md)** (Option A →
  Option C, LOC re-estimate). This doc *recommends* the change and supplies the
  inputs; the actual KMP-doc edit is a follow-up, and the precise LOC number is
  blocked on the wire-format decision regardless.
- **The KMP port itself** — implementing the deserializer + primitive builtins in
  Kotlin. Separate, deferred effort; the migrated `.dvala` builtins come along for
  free once it lands.
