# KMP Migration Plan

**Status:** Draft
**Created:** 2026-03-28

## Goal

Port Dvala's runtime core to Kotlin Multiplatform (KMP), targeting JVM, native, and JS (browser) runtimes. Keep parsing, tooling, and the playground in TypeScript. The handler redesign is implemented directly in Kotlin — no more building features twice.

---

## Background

### Why now

The handler redesign (Phase 1 on the roadmap) fundamentally changes the evaluator. Porting the current evaluator only to rewrite it makes no sense. Better to port now, implement the new handler model in Kotlin, and continue the roadmap (laziness, persistent structures, multi-shot) in a single codebase.

### Why KMP

- **JVM**: real multi-threaded concurrency for multi-shot effects
- **Native**: embeddable runtime without a VM
- **JS**: compiles to JavaScript — the playground keeps working
- **Kotlin**: strong type system, coroutines, `kotlinx.collections.immutable` for Phase 3

### The split

| Stays in TypeScript | Moves to KMP |
|---|---|
| Tokenizer | Evaluator (trampoline loop) |
| Parser | Frames (continuation stack) |
| Playground UI | Values (runtime representation) |
| Tooling (CLI, bundling) | Context stack (lexical scope) |
| Syntax highlighting | Effect dispatch |
| | Serialization (suspend/resume) |
| | Standard effects |
| | Builtin functions |

The interface between TS and KMP is the **AST** — the parser produces it (JSON-serializable), the evaluator consumes it.

---

## Proposal

### Architecture

```
┌──────────────────────┐     ┌──────────────────────────────┐
│  TypeScript layer     │     │  KMP core                    │
│                       │     │                              │
│  Tokenizer            │     │  Evaluator (trampoline)      │
│  Parser ──── AST ────────>  │  Frames + Steps              │
│  Playground UI        │     │  Values (Any, Arr, Obj, ...) │
│  CLI tooling          │     │  ContextStack                │
│  Syntax overlay       │     │  Effect dispatch             │
│                       │  <──── Result/Snapshot             │
│                       │     │  Serialization               │
│                       │     │  Builtin functions           │
│                       │     │  Standard effects            │
└──────────────────────┘     └──────────────────────────────┘
                                    │         │         │
                                   JS       JVM      Native
                                (browser) (server)  (embed)
```

### AST contract

The AST is the bridge between TS and KMP. It's already JSON-serializable — tuple-based nodes:

```typescript
// TS side: parser produces this
type AstNode<T extends NodeType, Payload> = [T, Payload, number]
```

```kotlin
// KMP side: evaluator consumes this
sealed class AstNode {
    abstract val nodeType: NodeType
    abstract val payload: Any?
    abstract val sourceId: Int
}
```

The TS parser serializes the AST to JSON. The KMP evaluator deserializes it. This is the only integration point.

### Builtin functions

Two options:

**Option A: Re-implement in Kotlin**
All 150+ builtins rewritten in Kotlin. One implementation, all platforms.

**Option B: JS bridge for non-core builtins**
Port core builtins (array, object, math, string) to Kotlin. Keep module builtins (linear-algebra, grid, etc.) in TS, called via JS interop on the browser target.

**Recommendation:** Option A. The builtins are straightforward — math, string manipulation, array operations. Kotlin has equivalents for everything. A bridge adds complexity and only works on the JS target.

### What gets implemented fresh in Kotlin (not ported)

The handler redesign, lazy evaluation, persistent data structures, and multi-shot continuations are all new features. Instead of porting the current TS evaluator and then modifying it, implement the new evaluator in Kotlin from scratch, using the current TS implementation as a reference:

- **Handler redesign** — abort/resume/return model, implemented directly in Kotlin
- **Lazy evaluation** — thunk representation, force points, `lazy` handler keyword
- **Persistent data structures** — `kotlinx.collections.immutable` or custom HAMTs
- **Multi-shot** — immutable frames + coroutine-based forking on JVM

### Cross-platform serialization

Continuation snapshots must be portable — serialize on JVM, resume on JS, or vice versa. The format is already JSON-based. Both platforms must produce and consume the same schema.

This is critical for the workflow use case: a computation starts on a server (JVM), suspends, serializes to a database, and resumes in a browser (JS) or on a different server.

---

## What Stays in TypeScript

### Parser

The parser is a pure data transformer: source code → tokens → AST. It has no runtime dependencies. Keeping it in TS means:

- The playground's live parsing stays fast (no KMP-to-JS overhead for parsing)
- The CLI tools (`dvala parse`, `dvala tokenize`) stay in TS
- Syntax highlighting and error reporting stay close to the source

If KMP parsing is ever needed (e.g. for a native CLI), the parser can be ported independently later.

### Playground

The playground UI is a TS/HTML application. It calls the KMP evaluator via the JS compilation target. The integration:

```typescript
// Playground calls KMP-compiled JS
import { evaluate } from '@dvala/core'  // KMP → JS bundle

const ast = parse(sourceCode)           // TS parser
const result = evaluate(ast, handlers)  // KMP evaluator (compiled to JS)
```

### Tooling

CLI commands, bundling, development server, test harness — all stay in TS/Node.js. The KMP core is a library consumed by the tooling, not a standalone application.

---

## Porting scope

### Core evaluator (~15K lines TS → ~40-50K lines Kotlin)

| Component | TS files | Purpose |
|---|---|---|
| Trampoline evaluator | `evaluator/trampoline-evaluator.ts` | Main evaluation loop (tick, stepNode, applyFrame) |
| Frames | `evaluator/frames.ts` | 15+ frame types for continuation stack |
| Steps | `evaluator/step.ts` | Step types (ValueStep, EvalStep, ApplyStep, PerformStep) |
| Context stack | `evaluator/ContextStack.ts` | Lexical scope chain, bindings, module lookup |
| Effect types | `evaluator/effectTypes.ts` | Snapshot, EffectHandler, Handlers |
| Effect dispatch | `evaluator/effectRef.ts` | Effect reference resolution |
| Standard effects | `evaluator/standardEffects.ts` | Built-in effect handlers (suspend, checkpoint, yield) |
| Serialization | `evaluator/suspension.ts`, `serialization.ts` | Continuation serialize/deserialize |
| Deduplication | `evaluator/contentHash.ts`, `dedupSubTrees.ts` | Optimization for serialization |
| Runtime types | `interface.ts` | Any, Arr, Obj, Coll, DvalaFunction, EffectRef |
| AST types | `parser/types.ts` | Node types (consumed by evaluator) |
| Constants | `constants/constants.ts` | NodeTypes, FunctionType, operators |
| Builtins | `builtin/core/*.ts`, `builtin/specialExpressions/*.ts` | 150+ functions |

### Not ported

| Component | Reason |
|---|---|
| Tokenizer (`src/tokenizer/`) | Parser infrastructure, stays in TS |
| Parser (`src/parser/`) | Pure data transformer, stays in TS |
| Pretty printer (`src/prettyPrint.ts`) | Used by playground and tooling |
| Reference docs (`reference/`) | Documentation generation |
| Playground (`playground-www/`) | UI layer |
| Tests (`__tests__/`, `e2e/`) | Rewritten as Kotlin tests for KMP core |

---

## Open Questions

- **Build system integration**: How does the KMP build (Gradle) integrate with the existing npm/TS build? Monorepo with both? Separate repo for KMP core?
- **KMP-to-JS bundle size**: How large is the compiled JS? Does it impact playground load time?
- **Debugging KMP-to-JS**: Source maps? How to debug evaluator issues in the browser?
- **Parser port later?**: If a native CLI is desired, the parser needs porting too. Defer or plan for it?
- **Test strategy**: Port existing integration tests to Kotlin, or keep TS tests calling KMP-to-JS?
- **kotlinx.collections.immutable**: Use it for Phase 3, or build custom persistent structures in Kotlin too?
- **Coroutines for multi-shot**: Kotlin coroutines are one-shot by design. How to model multi-shot? Custom continuation passing, or work around coroutine limitations?

---

## Implementation Plan

1. **Set up KMP project structure** — Gradle multiplatform project targeting JVM, JS, Native. Integrate with existing npm workspace.
2. **Port AST types and constants** — the contract between parser and evaluator. Verify JSON round-trip compatibility with TS parser output.
3. **Port runtime value types** — Any, Arr, Obj, DvalaFunction, EffectRef. Define Kotlin sealed class hierarchy.
4. **Port ContextStack** — lexical scope chain, binding lookup.
5. **Port frames and steps** — continuation stack types. Kotlin sealed classes map well to the discriminated unions.
6. **Port trampoline evaluator** — the core loop. Implement against the current (pre-handler-redesign) semantics first to validate correctness.
7. **Port builtin functions** — core builtins first (array, string, math, object), modules later.
8. **Port serialization** — suspension/resume with cross-platform JSON compatibility.
9. **Integration test** — TS parser → JSON AST → KMP evaluator → result. Run existing test suite against KMP-to-JS.
10. **Implement handler redesign in Kotlin** — Phase 1 of the roadmap, directly in the new codebase.
11. **Wire up playground** — replace TS evaluator with KMP-to-JS bundle. Verify playground works end-to-end.
