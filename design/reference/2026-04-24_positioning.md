# Dvala — Executive Positioning

**Status:** Forward-looking executive summary. Assumes v1.0 — set-theoretic type system, bounded refinement types (per `design/active/2026-04-23_refinement-types.md`), and the KMP runtime port (per `design/active/2026-03-28_kmp-migration.md`) all shipped.
**Created:** 2026-04-24
**References:** `design/VISION.md`, `design/ROADMAP.md`, type-system and refinement-types design docs

---

## One sentence

Dvala is a **pure functional scripting language** with **multi-shot algebraic effects**, **serializable continuations**, a **set-theoretic plus refinement type system**, and a **Kotlin Multiplatform runtime** — designed for long-running, verifiable, embedded computation.

No other language combines these four properties. Each exists somewhere; the combination is novel.

---

## The four pillars

### 1. Purity + algebraic effects (multi-shot)

Every value immutable. Every side effect explicit and dispatched through handlers the caller controls. The code says "I need X"; the handler decides what X actually means. This single mechanism — `perform` + `handle` — replaces the zoo of frameworks most languages accrete for dependency injection, testing, transactions, middleware, and configuration.

**Resumes are multi-shot.** A handler can call `resume(v)` more than once, forking the continuation into parallel branches. Purity + immutability make forks safe — no shared mutable state to corrupt. This distinguishes Dvala from most "algebraic effect" implementations (Koka, OCaml 5, many research languages) which ship one-shot resumes by default. Multi-shot is what turns effects into a substrate for search, backtracking, and speculation — not just a dispatch mechanism.

### 2. Serializable continuations

Execution state is data. A Dvala program can suspend mid-computation, serialize its entire state (AST + environment + stack frames), store it anywhere, and resume days later in a different process with different handlers. No workflow engine. No saga pattern. No state machine DSL. Just code.

### 3. Set-theoretic + refinement type system

Types are sets of values; operations are set operations. Unions, intersections, negation, literal types are primitive — not bolted on as in TypeScript. Match exhaustiveness falls out of set difference. Effects use the same subtyping machinery as values.

**Refinement types (bounded Tier B) add provable data constraints** — non-empty collections, bounded integers, validated strings, range invariants, state-machine states. The decision procedure always terminates (polynomial, no SMT dependency); failures produce concrete counterexamples or explicit "outside the fragment" rejections, never silent timeouts. Sound by construction: every fact is either proved by the solver, runtime-checked by `assert`, or validated at a trust boundary. No unsafe escape hatches.

### 4. Portable runtime — minimal kernel, self-hosted library

The runtime is Kotlin Multiplatform: compiles to JVM, Android, iOS, native, and JS. A Dvala bundle (compiled AST + type manifest) runs unchanged on every target. Embed Dvala in a Kotlin backend, an Android app, an iOS app, a Node.js service — same bundle, same semantics, same type guarantees.

But the deeper bet sits below KMP: **the runtime kernel is deliberately small**. Most core functions and nearly all modules are implemented **in Dvala itself**, not in the host language. A growing set of "special" forms desugars to simpler primitives via macros rather than living as hard-coded evaluator cases. As that kernel shrinks toward a few thousand lines of irreducible primitive code, retargeting to a new host becomes a project on the order of weeks, not years.

The roadmap is: **TypeScript → Kotlin Multiplatform → open.** What comes after KMP is a convenience question, not a necessity. A Rust kernel for WASM-first and embedded deploys. A Go kernel for cloud-native stacks. Eventually a Dvala-on-Dvala bootstrap once the kernel is minimal enough. Whatever hosts make sense — the architecture doesn't force any one of them.

This is rare for a feature-rich language. Most languages with effects, continuations, or sophisticated type systems are inseparable from their runtimes (Koka, F\*, Unison, Elixir's BEAM). Dvala's bet is that a minimal kernel with a self-hosted library gives the same expressive power while keeping portability cheap.

---

## What this combination enables

Each feature amplifies the others. The emergent capabilities are the product, not the sum:

- **Purity + continuations** → the stack is plain data, so it can serialize and ship. Neither alone does this.
- **Purity + multi-shot + immutability** → forking the computation is free. Search, backtracking, and speculative execution become library patterns, not language features — a multi-shot handler is ten lines, not a framework. Scope caveat: this unlocks *expressiveness*, not *throughput*. Small-to-medium problems and declarative rule systems fit; industrial-scale combinatorial solving belongs in a real solver that Dvala can orchestrate via effects.
- **Effects + handlers** → the same code runs in production, test, dry-run, and replay modes, just by swapping handlers. No dependency injection framework.
- **Refinement types + effects** → manifest signatures like `@getScore : () -> Integer & {n | 0 <= n <= 100}` are enforced at the host-language boundary. Host misbehavior fails fast with a clear error, not silent corruption.
- **Refinement types + exhaustiveness** → rules and decision systems are provably total and valid. Unhandled cases and out-of-range values are compile-time errors.
- **KMP + serializable continuations** → a workflow started on a backend can resume on a mobile device (or vice versa) with the same bundle. Mobile agents that survive restarts and network changes become mechanically simple.
- **Minimal kernel + self-hosted modules** → retargeting the runtime is cheap. Core functions and modules live in Dvala; only a small primitive kernel is in the host language. A new host (Rust, Go, WASM-native, custom embedded) is a weekend-to-weeks project rather than a year-long rewrite. Portability isn't locked to one runtime family.
- **Capability-controlled effects** → the host decides which effects are available; the type system proves the program uses only the allowed set. Plugin sandboxing without a separate security layer.

---

## Target domains

Dvala wins where **correctness matters, execution is long-lived, and deployment is heterogeneous**.

| Domain | Why Dvala |
|---|---|
| Workflow orchestration | Serializable continuations = suspend-on-approval, survive-restarts, resume-elsewhere — with no workflow engine. |
| Rule engines / decision systems | Exhaustive match + refinement types = provably total, provably valid business rules. |
| Plugin / extension systems | Capability-controlled effects = host decides what plugins can do; type system proves it. |
| Auditable business logic | Typed effects = static audit trail of every side effect; refinements = proof of valid state transitions. |
| Multi-tenant automation | Effect row types + capability isolation = tenant A's code provably touches only tenant A's resources. |
| Cross-platform embedded scripting | Same bundle runs on JVM, Android, iOS, native, JS — embed where needed. |
| Small-to-medium search problems | Multi-shot resume + immutability = forking is free; the handler stack is the search strategy. Backtracking, N-queens-sized CSPs, meeting-scheduling, rule evaluation across tens-to-hundreds of facts. Expressive, not industrial — write a solver in ten lines, not Z3 in Dvala. |
| Orchestrating external solvers | `perform(@solve, problem)` dispatches to Z3 / OR-Tools / MiniZinc via the host. Refinement types validate inputs and outputs; continuations survive long-running solves. Dvala is the conductor and the safe boundary — the solver is in C++. |
| Agentic / AI orchestration | Durable conversations, tool-use pipelines, resumable after days or across processes. Multi-shot enables speculative tool calls and branch-exploration. |
| Financial / regulated systems | Refinement types = compile-time proof of invariants (non-negative balances, bounded ranges, state-machine validity). |
| Healthcare / compliance workflows | Auditability + soundness + durable execution — regulators accept provable correctness claims. |

---

## Where Dvala doesn't fit

Equally important to be honest about:

- **Hot-path performance code.** The trampoline evaluator eats throughput for suspendability. Not for game engines, real-time loops, graphics, or stream-processing GB/second.
- **Low-level systems.** No manual memory control, no FFI to C, no zero-cost abstractions. Dvala is a scripting language on top of a host runtime.
- **General-purpose application code.** Not a JavaScript or Python competitor. Dvala is specialized; its sweet spot is *programs that need control over execution and correctness*, not *programs in general*.
- **Large legacy ecosystems.** Dvala doesn't interop with vast JS / Python package catalogs. Host integration is via declared effects, not arbitrary library imports. This is a feature for security and auditability — and a real friction for migration.
- **Teams without functional-programming discipline.** Pure by default + typed effects + refinement types demand design thought per line. A team used to writing first-draft JavaScript will find Dvala slow going until the mental model clicks.
- **Industrial-scale constraint solving, SAT, or probabilistic inference.** Multi-shot resume expresses search elegantly, but Dvala's trampoline evaluator is not competitive with Z3, OR-Tools, or Stan on throughput. For these workloads, Dvala's role is orchestrating an external solver (validating inputs with refinement types, surviving long solves via continuations) — not *being* the solver.

---

## Competitive landscape

| Feature | TypeScript | Kotlin | Rust | Elixir | Koka | F\* | Temporal SDK | Dvala |
|---|---|---|---|---|---|---|---|---|
| Pure by default | No | No | No | No | Yes | Yes | No | **Yes** |
| Algebraic effects | No | No | No | No | Yes | Some | No | **Yes** |
| Multi-shot resume | No | No | No | No | Restricted | No | No | **Yes** |
| Serializable continuations | No | No | No | No | No | No | Yes (library) | **Yes (native)** |
| Set-theoretic types | Partial | No | No | Yes (1.17+) | No | No | N/A | **Yes** |
| Refinement types (sound) | No | No | No (Flux research) | No | No | Yes (SMT) | N/A | **Yes (bounded, no SMT)** |
| Cross-platform runtime | Node/Deno/Bun | JVM/Android/iOS/native | Native | BEAM | C | OCaml | Go/TS | **KMP (all)** |
| Minimal retargetable kernel | No | No | No | No | No | No | N/A | **Yes** |
| Production-ready | Yes | Yes | Yes | Yes | Research | Research | Yes | **Not yet** |

The unique cell is the bottom row: **pure + effects + multi-shot + serializable + set-theoretic + refinement + KMP + retargetable kernel**. No other language lights up all nine at once. Multi-shot resume specifically excludes Koka and OCaml 5's default mode — both require an explicit flag for multi-shot semantics and discourage it in production. And the retargetable-kernel property distinguishes Dvala from every language whose implementation *is* the language: Koka is the Koka C runtime; F\* is bound to its OCaml backend; Unison is one specific VM. Dvala's runtime is one of several that could implement the language.

**Closest neighbors:**

- **Koka** has effects and purity but ships one-shot resumes by default, no continuations, no set-theoretic types, no portable runtime. Research language, Microsoft-origin.
- **F\*** has refinement types (with SMT) and effects but no serializable continuations, no dynamic runtime story. Used for Project Everest (verified crypto). Not a scripting language.
- **Elixir** has set-theoretic types (added 2023) but its concurrency model is actors, not continuations. No refinement types. BEAM runtime only.
- **Temporal** delivers workflow suspension via an SDK — not a language. No type-system guarantees; the user wrangles Go/TypeScript correctness manually.
- **Unison** has content-addressed code and some serializable semantics, but not algebraic effects or set-theoretic types.

Dvala is not competing with any one of these. It's competing with the **stack** users build today when they have Dvala's problem — a workflow engine plus a rules DSL plus a sandbox plus a capability system plus a cross-platform embed, glued together across languages.

---

## When would you choose Dvala?

- The program runs for days, weeks, or longer, and must survive restarts.
- Correctness compounds: one bug costs more than one incident.
- The same logic must run on backend, mobile, and edge with identical semantics.
- Side effects should be inspectable and controllable at every boundary.
- The user base is small but skilled; design discipline is affordable.
- A supported host exists for the target environment. At v1.0 that means **JVM, Android, iOS, native, or JS** (via KMP). A minimal-kernel architecture keeps new-host ports cheap, so "no host today" is a "not yet", not a "never".

If all six are yes: Dvala is the most ambitious option, and the most aligned tool.

If any are no: something else probably fits better — and that's fine.

---

## The bet

Dvala is specialized infrastructure scripting — the layer between a host application and the rules, workflows, and logic it needs to execute reliably. The wager is that a small, principled foundation (pure + effects + serializable + typed + portable) can replace a stack of specialized tools, with code that's shorter, more composable, and easier to audit.

The risk is real. Nobody has shipped this combination in production. The interactions between these features at scale haven't been stress-tested. Refinement-type UX, serializable-continuation overhead across KMP targets, effect-typed cross-boundary communication — all are theoretically sound and individually proven in research languages, but the combined production story is unproven.

The payoff, if it works, is a language where **writing correct long-running programs is easier than writing incorrect ones** — and a market where correctness compounds finds the tool irresistible.

---

## Summary

Dvala at v1.0, with the full type system (set-theoretic + bounded refinements) and the KMP runtime, is:

- A **principled** language — pure, sound, auditable. No escape hatches.
- A **practical** one — embeds in real host applications, runs the same bundle everywhere Kotlin does.
- A **specialized** one — for long-running, verifiable, embedded computation. Not a general-purpose competitor.
- **Ambitious** — no one has shipped this combination before.
- **Risky** — unproven at scale; feature interactions haven't been stress-tested.

Dvala is not competing with JavaScript for the general application layer. It's competing for the **infrastructure scripting** slot — a slot currently held by brittle combinations of workflow engines, rule DSLs, capability wrappers, and type-poor dynamic languages.

If the bet pays off, Dvala replaces the stack.
