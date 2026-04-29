# Linear handler — host-style effect handler in Dvala syntax

**Status:** v1 implemented on the `design/linear-handler` branch (parser + AST + return-as-resume + barrier-crossing + book chapter). Ready to PR to main.
**Created:** 2026-04-29

## Goal

Add a new Dvala language form, `linear handler ... end` (parallel to the existing `shallow handler ... end`), that produces a handler value with two host-handler-like dispatch properties:

1. **Single-shot resume.** The continuation is invoked at most once per dispatch. Multi-shot is impossible by construction (the body has no `resume` keyword to call twice — see "return-as-resume" below).
2. **Barrier-free reach.** Effects performed inside `parallel(...)` / `race(...)` branches reach the linear handler installed outside, the same way they reach a JS-registered host handler. Plain `handler ... end` stays barrier-isolated, unchanged.

The feature is general — the playground's `.dvala-playground/handlers.dvala` (Phase 1.5 step 23e) is the immediate consumer, but the construct is intended for production use whenever Dvala-source code wants to install a handler with these properties.

---

## Background

### How effect handlers behave today

Dvala has two layers of effect handling:

1. **Dvala-level handlers** — created with `handler ... end` (or `shallow handler ... end`), installed via `do with h; ... end`. The continuation is a persistent immutable structure ([src/evaluator/frames.ts:525–527](../../src/evaluator/frames.ts#L525)), so calling `resume()` more than once **forks the program** (multi-shot is the default). They are isolated by the `ParallelBranchBarrier` frame ([src/evaluator/trampoline-evaluator.ts:3376–3387](../../src/evaluator/trampoline-evaluator.ts#L3376)) — `dispatchPerform` stops walking the stack at the barrier, so effects performed inside `parallel(...)` / `race(...)` branches **do not reach** Dvala handlers installed outside.

2. **Host handlers** — JS functions passed via the `runAsync({ effectHandlers })` API. They are **single-shot** by enforcement: a `settled = true` flag is set on the first call to `resume`/`fail`/`suspend`/`halt`/`next`, and a second call throws ([src/evaluator/trampoline-evaluator.ts:3527–3534](../../src/evaluator/trampoline-evaluator.ts#L3527)). The host-handler list is a **flat shared reference** that flows into every parallel branch ([line 3818](../../src/evaluator/trampoline-evaluator.ts#L3818)) — host handlers traverse barriers freely.

### What's missing

There's no Dvala-source way to express "install this handler with the two host-handler properties above (single-shot + barrier-free)." Authors that want those semantics from inside Dvala have no construct to reach for.

The playground's Phase 1.5 step 23e ([2026-04-26_playground-monaco-tree-ls-cli.md](2026-04-26_playground-monaco-tree-ls-cli.md)) tried to bridge the gap by wrapping user code in `do with __playgroundBoundary__; ... end` — a plain Dvala-level installation. That's wrong on two axes for the boundary use case: multi-shot is allowed (silent program forking on `resume(a); resume(b);`), and parallel-branch effects can't reach the boundary (barrier isolation).

### Why a language feature, not just a playground helper

The playground is the immediate consumer, but the same shape is useful in production embeddings: an SDK that lets users plug in custom handlers in Dvala source, a library boundary that wants its handlers to compose cleanly under parallel composition, a test harness that mocks host handlers in pure Dvala. Making this a language feature — not a private playground helper — earns reuse across all those cases at the cost of one new keyword and a small engine change.

### Related literature

- **Koka** has `linear` handlers ("continuation called at most once," compile/runtime-rejected multi-shot) and `fun` clauses (tail-resumptive — clause body's value IS the resume value). The proposal here is essentially Dvala's flavor of "linear handler with `fun`-style clauses."
- **Multicore OCaml** is one-shot by default — the `Continuation_already_resumed` exception at second `continue k v` is exactly this contract.
- **Eff** is multi-shot only and has no parallel name for what we're adding.

The term "linear" is established in this corner of the algebraic-effects literature; we adopt it.

---

## Proposal

### Surface syntax

```dvala
let h = linear handler 
  @x(v) -> v * 2                                              // implicit resume(v * 2)
  @y(v) -> if v < 0 then perform(@dvala.error, { message: "neg" })
           else v
           end
end;
do with h;
  perform(@x, 21)
end
```

Lexical rule: `linear` is a **contextual keyword** that triggers only when followed by `handler` (possibly preceded by `shallow`) and a handler-start token — same precedent as the existing `shallow` keyword ([src/parser/subParsers/parseExpression.ts:92–99](../../src/parser/subParsers/parseExpression.ts#L92), [parseExpression.ts:194–198](../../src/parser/subParsers/parseExpression.ts#L194)).

`linear` and `shallow` are **orthogonal** in principle:

| Form | linear | shallow | dispatch |
|---|---|---|---|
| `handler ... end` | no | no | Dvala layer, barrier-isolated, multi-shot |
| `shallow handler ... end` | no | yes | Dvala layer, barrier-isolated, multi-shot, no reinstall on resume |
| `linear handler ... end` | yes | no | Dvala layer with barrier-crossing, single-shot, return-as-resume |
| `linear shallow handler ... end` | yes | yes | barrier-crossing, single-shot, no reinstall (degenerate but legal) |

### Clause body shape: return-as-resume

The body of a `linear handler` clause:

- **Returns its value as the implicit resume.** `@x(v) -> v * 2` resumes the continuation with `v * 2`. No `resume` keyword.
- **`resume` is forbidden inside linear-handler clauses** at parse time. Allowing both implicit-return-as-resume and explicit `resume(...)` would re-open multi-shot via `resume(a); resume(b); ...`. Disallowing the keyword statically rejects multi-shot by construction.
- **Single-arg clauses only** — same shape as a regular Dvala handler clause: `@effect(arg) -> body`. The clause receives the perform's payload as `arg`.

### Operating set: resume only

The body's return value is the implicit `resume`. That is the entire surface.

To **fail** (abort past this handler), the user calls `perform(@dvala.error, { message: "..." })` from inside the clause body. The perform short-circuits evaluation of the body before its tail is reached — the implicit resume never fires. The error propagates up the stack via standard Dvala semantics; whichever outer handler matches `@dvala.error` catches it, or it surfaces as a `UserError` if unhandled.

| Op | Semantics |
|---|---|
| (return value) | Implicit `resume(value)` — continue at the perform site |
| `perform(@dvala.error, payload)` from body | Aborts past this handler via the standard error channel |

**Why no `fail` / `halt` / `suspend` / `next` keywords** (host-handler ops surfaced as Dvala-source values, e.g. `(arg, { fail }) -> fail("nope")`): we considered this in the design pass and rejected it. Implementing those as Dvala-source bindings requires either (a) a host-handler bridge that re-enters the trampoline from JS — invasive — or (b) several new internal effects routed from within the handler dispatch path. Both are significantly larger than the barrier-crossing change linear handlers actually need, and `perform(@dvala.error, ...)` already covers the only use case (failing) that the playground's boundary-handler scenario or any plausible embedding asks for. Resume + Dvala-error is the entire op set.

### Dispatch semantics

When a `linear handler` value is installed via `do with h`:

- Engine path: it lives on the continuation stack as a normal `AlgebraicHandle` frame, **but tagged via `HandlerFunction.linear === true`**. The dispatch loop in `dispatchPerform` walks past `ParallelBranchBarrier` / `ReRunParallel` / `ResumeParallel` frames (which would normally end the search for plain Dvala handlers) and, after crossing one, only considers `linear: true` frames. The result: linear handlers reach effects from inside parallel branches; plain Dvala handlers stay barrier-isolated.
- **Single-shot.** The body returns at most once. Combined with the parser's rejection of explicit `resume`, multi-shot is structurally impossible. No runtime `settled` flag is needed for the user-facing contract — the AST shape forbids the failure mode.
- **Closures preserved.** The `HandlerFunction` value carries its `closureEnv`; outer `let` bindings are visible inside clause bodies just like in any Dvala lambda.
- **Inner effects.** When a clause body itself performs an effect (e.g. `@x(v) -> perform(@y, v) * 2`), `@y` dispatches through the normal walk past the linear handler that's currently firing — clause bodies execute in `outerK` (the continuation past the handler), which is standard handler-clause semantics.

### Implementation: AST-wrap + barrier-crossing

Two engine touchpoints make the contract real:

1. **Parser AST-wrap.** During parsing of a `linear handler` clause body, the last expression is replaced with a `Resume` node wrapping it: `... ; lastExpr` becomes `... ; resume(lastExpr)` in the AST. Earlier statements run as side effects; the tail's value flows through the implicit Resume into the perform site's continuation. If evaluation never reaches the tail (an inner perform suspends, errors propagate, etc.), the wrapping Resume simply never fires. Multi-shot impossibility falls out: the body returns at most one value to the wrapping Resume.

2. **`dispatchPerform` barrier-crossing.** When walking the continuation stack looking for a matching handler, we no longer break at barrier frames — we set `crossedBarrier = true` and keep walking. After crossing, only `frame.handler.linear === true` AlgebraicHandle frames are considered (plain handlers stay isolated as before). After the loop, the existing fall-through to host handlers (`runAsync({ effectHandlers })`) is unchanged.

These are both surgical: ~10 lines in `parseHandler.ts`, ~15 lines in `dispatchPerform`. No new frame types, no new effect dispatch path, no host-handler bridge.

### Nesting

`linear handler` values can be installed at any nesting level (top of a program, inside `do with`, inside a function called from a parallel branch, inside another linear handler). Same dynamic-scoping rules as Dvala-level `with`. No "must be at the root" restriction.

### Static checks

**Reject `resume` keyword inside linear-handler clauses (parse error).** Free; mechanical; the parser already knows it's inside a linear handler. Walk descends into all child AST nodes except nested `Handler` and `Macro` boundaries (those rebind `resume` to themselves). Error message: *"`resume` is not available in linear handler clauses — return the value to resume, or `perform(@dvala.error, msg)` to fail."*

That's the only static check needed. Type inference works correctly through the implicit-Resume wrap without any linear-specific code: the body's tail expression becomes the Resume's argument, which the existing typechecker threads into the perform's resume-return type. Effect-set propagation, dead-code detection, and subtyping all use existing machinery.

### Typecheck (verified empirically)

The typechecker treats `linear handler` clauses the same as plain handler clauses for type inference. The body type → resume argument → perform's resume return type chain works via the existing `Resume` node inference, since the parser's AST-wrap means there's an explicit (if synthetic) `Resume` node at the body's tail. Effect-set inference is also unchanged — the handled effect is subtracted from the inner scope's effect set, identical to plain handlers.

This was verified across three cases at v1 implementation time:

```dvala
// Case 1 — body type matches resume type → clean.
effect @x(Number) -> Number;
linear handler @x(v) -> v * 2 end                        // OK

// Case 2 — body type wrong → type error.
effect @x(Number) -> String;
linear handler @x(v) -> v * 2 end                        // Number is not a subtype of String

// Case 3 — effect propagation.
let outer = (n) -> do with linearH; perform(@x, n); perform(@y, null) end;
// outer's effect set: { @y, ... } — @x correctly subtracted by the linear handler
```

No typecheck changes needed; the existing machinery handles linear handlers via the AST shape alone.

---

## Open Questions

(None remaining for v1.) The design's last open item — the `transform`-clause interaction — was confirmed during step 10 documentation: `linear handler ... transform r -> body end` works the same way it does on a plain handler. The transform fires on the normal-completion path with the implicit-resume value (verified: `linear handler @x(v) -> v * 2 transform r -> { ok: true, value: r } end` returns `{ ok: true, value: 42 }` for `perform(@x, 21)`).

---

## Implementation Plan

This is the engine-side work. v1 unblocks the playground's Phase 1.5 step 23e (which is currently shipped with the wrong-shape Dvala-level wrap and pauses here).

1. **Parser — add `linear` contextual keyword.** Mirror the `shallow` keyword path in [src/parser/subParsers/parseExpression.ts](../../src/parser/subParsers/parseExpression.ts) (`isShallowHandlerStart` → add `isLinearHandlerStart`). Permit `linear shallow handler` and `shallow linear handler` (order-insensitive). Update [src/parser/subParsers/parseHandler.ts](../../src/parser/subParsers/parseHandler.ts) to take a `linear: boolean` flag. ✅ Shipped in `92626ba5`.
2. **AST + types — extend the Handler node.** Add `linear: boolean` to the Handler payload in [src/parser/types.ts](../../src/parser/types.ts) and to the `HandlerFunction` value type. Update the CST node type in [src/cst/types.ts](../../src/cst/types.ts). ✅ Shipped in `92626ba5`.
3. **Parse-time check — reject `resume` keyword in linear-handler clause bodies.** Walk the clause body during parsing; if a `Resume` node appears outside a nested `Handler`/`Macro` boundary, emit a parse error. ✅ Shipped in `c669828b`.
4. **Parser AST-wrap for return-as-resume.** Replace the body's last expression with a `Resume` node wrapping it, so the existing engine machinery handles "body's value goes to resume" without a new evaluation path. ✅ Shipped in `c42178da`.
5. **Engine — barrier-crossing in `dispatchPerform`.** When walking the continuation stack, don't break at barrier frames; set a `crossedBarrier` flag and skip non-linear AlgebraicHandle frames once the flag is set. ✅ Shipped in `c42178da`.
6. **Formatter** ([src/formatter/cstFormat.ts](../../src/formatter/cstFormat.ts)) and **language-service token-scanner** ([src/languageService/tokenScan.ts](../../src/languageService/tokenScan.ts)) recognise `linear` alongside `shallow`. ✅ Shipped in `92626ba5`.
7. **Tests.** Parser smoke + rejection cases, runtime tests for return-as-resume, fail-via-`@dvala.error`, parallel-branch barrier-crossing, regression guard for plain handlers staying isolated. ✅ Shipped progressively (`__tests__/effects.test.ts`).
8. **Documentation.** ✅ Shipped. New "Linear Handlers" section in [book/05-advanced/02-effects.md](../../book/05-advanced/02-effects.md) covers the body shape, `perform(@dvala.error, ...)` for failing, the parallel-branch reach, the `linear shallow handler` / `transform` interactions, and "when to reach for it." (No `dvala doc` reference-data update needed — neither `handler` nor `shallow` currently has a `dvala doc` entry, so there's no precedent to extend; the book chapter is the canonical source.)

After the engine work merges to main, **return to playground 23e**: replace the current `wrapWithBoundaryHandler` (which prepends a plain `do with __playgroundBoundary__; ... end` Dvala-level wrap) with one that wraps the handlers buffer's expression in `linear handler ... end`. The shape becomes:

```dvala
do with (<handlers buffer contents>);   // user is expected to write `linear handler ... end`
  <user code>
end
```

The playground integration can simply require that handlers buffers evaluate to a linear-handler value, and document that.

## Phasing & dependencies

- This is an **engine PR**, separable from the playground PRs. Lands on its own branch with its own review.
- Playground Phase 1.5 step 23e is currently shipped against the wrong primitive. Once `linear handler` ships in the engine, 23e gets a follow-up PR that swaps `wrapWithBoundaryHandler` to use the new form. Until then, the existing shipped wrap covers the simple case (no parallel branches in user code, no multi-shot in handlers.dvala) — broken under those conditions, working otherwise.
- 23f–23m of the playground plan can proceed in parallel; none of them depend on this engine work.
