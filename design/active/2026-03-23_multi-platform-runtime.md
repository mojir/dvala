# Dvala: Portable Continuation Runtime

## Vision

Dvala's core value is not the language — it's the **runtime**: suspend anywhere, serialize the continuation as JSON, resume on any platform. The language is the ergonomic interface to this runtime capability.

"Resume everywhere" requires the runtime to actually run everywhere.

## Core Requirements
1. **Suspend + serialize continuations as JSON** — wire-compatible across all platforms
2. **Core functions** (builtins) — same semantics everywhere
3. **Effect system** — the host boundary for I/O, enabling platform-native integration

## Priority Targets
1. **JVM** — server-side Java/Kotlin apps
2. **iOS and Android** — mobile
3. JS (browsers, Node.js) — already works today

## Prerequisites

**Stabilize wire formats first.** See [stabilize-wire-formats.md](stabilize-wire-formats.md) — the continuation, AST, and bundle JSON formats must be specified, validated, and tested before the KMP port begins. Key preparation work:
- Remove dedup pool, switch builtins to name-based references in serialization
- Separate source info from AST
- Spec all three formats with conformance test suites
- Design bundle format (currently POC)

## What Makes This Possible

The existing architecture was built for this (perhaps by design):

- **Trampoline evaluator**: explicit continuation stack of plain-object frames — no host call stack involved
- **JSON-serializable continuations**: all runtime state is data, not closures (`src/evaluator/suspension.ts`)
- **Effect system as FFI contract**: all I/O goes through `perform()` → host handles effects. The runtime itself is pure computation.
- **Zero platform dependencies** in the core

A continuation captured on a JVM server can be serialized to JSON, sent to an iOS client, and resumed there — if both run the same runtime. This is the product.

## Strategy: Kotlin Multiplatform (KMP)

KMP is the natural fit: one `commonMain` codebase compiles to JVM, iOS (via LLVM), Android, JS, and Wasm. The Kotlin compiler handles the cross-compilation — no manual LLVM IR or platform-specific code needed.

### Why KMP fits

| Target | KMP compilation | Use case |
|--------|----------------|----------|
| **JVM** | `jvm` → JAR | Server-side: orchestrate workflows, suspend, serialize to DB |
| **Android** | `androidTarget` → AAR | Mobile: resume workflows started on server |
| **iOS** | `iosArm64` → .framework | Mobile: same, callable from Swift |
| **JS** | `js` → npm package | Browser/Node: playground, existing ecosystem |
| **Wasm** | `wasmJs` → .wasm | Edge workers |

All targets share 100% of `commonMain` (evaluator, builtins, serialization). Only UUID generation, regex, and console I/O need `expect/actual` per platform.

### Architecture fit

The frame system maps directly to Kotlin sealed classes:
```kotlin
sealed class Frame {
    data class Sequence(val nodes: List<AstNode>, val index: Int, val env: ContextStack) : Frame()
    data class IfBranch(val thenNode: AstNode, val elseNode: AstNode?, val env: ContextStack) : Frame()
    // ... 33 more
}

sealed class Step {
    data class Value(val value: Any?, val k: List<Frame>) : Step()
    data class Eval(val node: AstNode, val env: ContextStack, val k: List<Frame>) : Step()
    // ...
}
```

JSON continuation serialization via `kotlinx.serialization` — multiplatform, supports sealed class polymorphism.

### Migration scope

| Component | TS lines | Est. Kotlin lines |
|-----------|----------|-------------------|
| Trampoline evaluator | ~4,100 | ~6,000 |
| Frame types | ~930 | ~1,500 |
| Step types | ~200 | ~300 |
| ContextStack | ~280 | ~400 |
| Suspension/serialization | ~400 | ~600 |
| Core builtins | ~3,000 | ~5,000 |
| Module builtins | ~5,000 | ~8,000 |
| Tokenizer + parser | ~2,000 | ~3,000 |
| **Total** | **~16,000** | **~25,000** |

## Cross-Platform Architectural Decisions

### Number representation

**Decision: Double everywhere (for now).**

All numbers are IEEE 754 64-bit doubles on every platform. This guarantees:
- Identical semantics to the current JS implementation — zero behavioral divergence
- Wire-compatible continuations — `3` in a JSON blob means the same thing on every platform
- JSON round-trips perfectly (JSON numbers are IEEE 754)

**Future: introduce integers after JS retirement.** Once the JS implementation is retired and KMP is the sole codebase, a proper `Int`/`Double` distinction can be introduced as a language-level feature:
- Design proper semantics: division behavior, promotion rules, overflow
- Bump wire format version — old Double-only continuations remain valid
- All platforms updated simultaneously from one KMP codebase
- This is a language evolution, not a porting concern

### Regex: portable safe subset + platform-native execution

JS, Java, and iOS regex engines differ in syntax, flags, and edge-case behavior. A regex in a continuation could produce different match results on different platforms.

**Decision:** Define a "Dvala regex subset" that behaves identically across all engines. Validate patterns at construction time, execute with the platform's native engine.

**The safe subset:**
- Character classes: `[abc]`, `[a-z]`, `[^x]`, `.`
- Quantifiers: `*`, `+`, `?`, `{n}`, `{n,m}`
- Anchors: `^`, `$`, `\b`
- Groups: `(...)`, `(?:...)`
- Alternation: `|`
- Escapes: `\d`, `\w`, `\s`, `\D`, `\W`, `\S`
- Named groups: `(?<name>...)`
- Flags: `i`, `g`, `m` only

**Excluded (non-portable):**
- Lookbehind `(?<=)` / `(?<!)` — inconsistent across engines
- Unicode categories `\p{L}` — flag and syntax differences
- Backreferences beyond `\1`-`\9`
- Platform-specific flags (`u`, `v`, `s`, `y`)

**How it works:**
- Validate regex pattern against the safe subset at construction time
- Reject non-portable features with a clear error
- Execute with the platform's native regex engine
- The subset is a floor, not a ceiling — expandable later

### Async: Kotlin coroutines for parallel/race

`parallel` and `race` are central to Dvala's workflow story (fan-out / fan-in). They must work identically on all platforms.

**Decision:** Use `kotlinx.coroutines` (already KMP-ready: JVM, JS, Native, Wasm). The trampoline evaluator stays synchronous in `commonMain`. The async layer is thin.

**Architecture:**
- **Trampoline evaluator**: fully synchronous `commonMain` code, no coroutines
- **`run()`**: synchronous, calls trampoline directly
- **`runAsync()`**: `suspend` function, calls trampoline but can suspend at async boundaries
- **`parallel`/`race`**: defined in `commonMain` using `kotlinx.coroutines`

**Mapping from JS to Kotlin:**

| Dvala concept | JS (current) | Kotlin coroutines |
|---------------|-------------|-------------------|
| `runAsync()` | `async function` → `Promise<RunResult>` | `suspend fun runAsync(): RunResult` |
| `parallel(a, b, c)` | `Promise.allSettled(...)` | `coroutineScope { listOf(async { run(a) }, ...) }.awaitAll()` |
| `race(a, b, c)` | `Promise.race()` + `AbortController` | `select { ... }` + `Job.cancel()` |
| Async effect handler | `Promise` resolved later | `suspendCoroutine { cont -> ... }` |
| Cancellation | `AbortController.signal` | `Job.cancel()` / `isActive` check |

Dependency: `org.jetbrains.kotlinx:kotlinx-coroutines-core` (~200KB, multiplatform).

### Modules: parser required on all platforms

14 built-in modules already have `.dvala` source files, and this pattern is growing — modules written in Dvala will become more common over time. This means:

- **The parser must be ported to KMP `commonMain`** — it cannot be skipped or deferred
- Every platform needs to parse Dvala source at module initialization time
- The bundle format is still useful for distributing user programs (skip re-parsing), but the runtime itself always needs a parser

### Other concerns

- **Object key ordering** — JS preserves insertion order. Use `LinkedHashMap` in KMP to match. Document that key order is insertion order.
- **Floating point edge cases in JSON** — `NaN`, `Infinity`, `-0` are valid Dvala numbers but not valid JSON. Need clear errors or tagged encoding (`{ "__special": "NaN" }`) when these appear in serializable contexts.

## Implementation Plan

### Phase 0 — Stabilize Wire Formats (prerequisite)
See [stabilize-wire-formats.md](stabilize-wire-formats.md). Must be completed before KMP port begins.

### Phase 1 — Design Public API Surface (1-2 weeks)

The playground, CLI, MCP server, and VS Code extension currently import from internal Dvala modules. Before splitting into a separate `dvala-runtime` repo, define what `dvala-runtime` exports publicly.

**Currently used internals that need to become public API:**

| Internal import | Used by | Purpose |
|----------------|---------|---------|
| `evaluator/effectTypes.ts` — `EffectContext`, `HandlerRegistration`, `Snapshot`, `Handlers` | Playground, VS Code ext | Effect system types |
| `evaluator/standardEffects.ts` — `standardEffectNames` | Playground | Syntax highlighting for built-in effects |
| `evaluator/suspension.ts` — `extractCheckpointSnapshots()` | Playground | Checkpoint inspection UI |
| `parser/subParsers/parseTemplateString.ts` — `splitSegments()` | Playground, CLI | Template string parsing for syntax overlay |
| `allModules.ts` — `allBuiltinModules` | Playground, CLI, MCP, VS Code | Module registration |
| `builtin/interface.ts` — `ExampleEntry`, `Arity`, `DvalaModule` | Playground, CLI | Introspection types |
| `builtin/specialExpressionTypes.ts` — `specialExpressionTypes` | MCP server | Expression enumeration |
| `symbolPatterns.ts` — symbol regex patterns | CLI | Symbol validation |
| `errors.ts` — `DvalaErrorJSON` | Playground | Error display |
| `bundler/interface.ts` — `DvalaBundle`, `isDvalaBundle` | CLI | Bundle handling |

**Design tasks:**
1. Group these into public API categories: core (`createDvala`, `run`, types), introspection (module list, expression keys, arity), tooling (tokenizer, parser, autocomplete, bundler), effect system (types, standard effects, snapshots)
2. Define the export surface for `dvala-runtime` — what's public, what stays internal
3. Refactor consumers to import from public API entry points, not internal paths
4. This also informs the KMP module structure (`commonMain` public API)

### Phase 2 — JVM-only Vertical Slice (learning phase)

Before tackling the full KMP port, build a minimal end-to-end Dvala evaluator on JVM only — no multiplatform, no serialization, no modules. The goal is to learn Kotlin idioms on familiar ground.

**Scope:**
1. Tokenizer — port just enough to handle numbers, strings, identifiers, operators
2. Parser — `let`, `if`, arithmetic, function definitions/calls
3. Frame types — a handful of sealed classes (SequenceFrame, IfFrame, LetFrame, FunctionCallFrame)
4. Trampoline evaluator — minimal version that can step through the above
5. A few core builtins — `+`, `-`, `*`, `/`, `==`, `not`, `isNumber`

**Target:** Evaluate `let double = (x) -> x * 2; double(21)` → `42` on JVM.

**Why this matters:**
- Learn Kotlin's type system, sealed classes, `when` expressions, null safety on a problem you fully understand
- Discover friction points (Gradle, project structure, testing) before they compound with KMP complexity
- The code written here feeds directly into Phase 3 — it's not throwaway

### Phase 3 — KMP Core (2-3 months)
Expand the Phase 2 JVM prototype to full KMP `commonMain`:
1. Migrate JVM project to KMP project structure
2. Port remaining tokenizer + parser
3. Port all frame types and step types (sealed classes)
4. Port full trampoline evaluator (~4K lines, the core)
5. Port core builtins (math, string, array, object, predicates)
6. Port JSON continuation serialization — **must be wire-compatible with TS version**
7. Platform-specific `expect/actual` for UUID, regex, console I/O
8. Validate against existing test suite (run TS tests against KMP via JS target)

**Wire compatibility is the critical constraint.** A JSON continuation blob produced by the TS runtime must deserialize and resume correctly on the KMP runtime, and vice versa. This is what makes "suspend on server, resume on mobile" work.

### Phase 4 — Mobile Targets (1-2 months)
1. Configure `androidTarget` and `iosArm64` / `iosSimulatorArm64`
2. Build Android AAR and iOS .framework
3. Write thin platform wrappers (Android: Kotlin API, iOS: Swift-friendly API)
4. Port remaining module builtins as needed
5. End-to-end test: suspend on JVM → JSON → resume on iOS/Android

### Phase 5 — Evaluate KMP JS Target
Before deciding on the TS codebase, evaluate the KMP JS output:
1. Compare bundle size: current IIFE is 139KB — KMP JS will include Kotlin stdlib (expect 300KB-1MB+)
2. Test in the browser playground — does it work, any quirks?
3. Test in Node.js — does the npm package story still work?
4. Verify wire compatibility: TS-produced JSON continuations resume on KMP JS target and vice versa

### Phase 6 — TS Codebase Decision

**If KMP JS target is good enough** (reasonable bundle size, no behavioral quirks):
- Migrate playground, VS Code extension, MCP server, CLI to KMP JS output
- Retire the TypeScript implementation entirely
- One codebase, all platforms

**If KMP JS target is too large or rough**:
- Keep TS for the web/npm ecosystem (battle-tested, 139KB, rich tooling)
- KMP is the canonical implementation (source of truth for semantics)
- TS tracks KMP behavior
- Wire compatibility ensures cross-platform continuations still work

**Decide after Phase 3, not before.**

## Resources

### Kotlin Multiplatform (KMP)
- [KMP Quickstart](https://kotlinlang.org/docs/multiplatform/quickstart.html) — official getting-started guide
- [Get started with KMP](https://kotlinlang.org/docs/multiplatform/get-started.html) — full walkthrough: project setup, shared code, platform APIs
- [KMP Wizard](https://kmp.jetbrains.com/) — generates production-ready KMP project scaffolding
- [KMP on Android Developers](https://developer.android.com/kotlin/multiplatform) — Google's guide for KMP adoption

### kotlinx.serialization (for JSON continuation serialization)
- [kotlinx.serialization Guide](https://github.com/Kotlin/kotlinx.serialization/blob/master/docs/serialization-guide.md) — comprehensive guide: sealed classes, polymorphism, custom serializers
- [Kotlin Serialization Docs](https://kotlinlang.org/docs/serialization.html) — official docs with setup instructions
- [kotlinx.serialization GitHub](https://github.com/Kotlin/kotlinx.serialization) — source, multiplatform setup, format support

## Key Files

- `src/evaluator/trampoline-evaluator.ts` — core evaluator (4,128 lines), primary port target
- `src/evaluator/frames.ts` — 35+ frame types → Kotlin sealed classes
- `src/evaluator/suspension.ts` — JSON continuation serialization (the wire format contract)
- `src/createDvala.ts` — public API surface (embedding contract)
- `dist/dvala.iife.js` — the 139KB bundle GraalJS would load directly
