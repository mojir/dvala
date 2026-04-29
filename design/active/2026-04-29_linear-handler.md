# Linear handler — host-style effect handler in Dvala syntax

**Status:** Draft
**Created:** 2026-04-29

## Goal

Add a new Dvala language form, `linear handler ... end` (parallel to the existing `shallow handler ... end`), that produces a handler value with **host-style dispatch semantics**: single-shot resume, barrier-free reach into parallel/race branches, return-as-resume body shape. Settling operations other than resume are exposed as values via a destructured second parameter.

The feature is general — the playground's `.dvala-playground/handlers.dvala` (Phase 1.5 step 23e) is the first consumer, but the construct is intended for production use whenever Dvala-source code wants to install a handler with the same contract a JS-side host handler has today.

---

## Background

### How effect handlers behave today

Dvala has two layers of effect handling:

1. **Dvala-level handlers** — created with `handler ... end` (or `shallow handler ... end`), installed via `do with h; ... end`. The continuation is a persistent immutable structure ([src/evaluator/frames.ts:525–527](../../src/evaluator/frames.ts#L525)), so calling `resume()` more than once **forks the program** (multi-shot is the default). They are isolated by the `ParallelBranchBarrier` frame ([src/evaluator/trampoline-evaluator.ts:3376–3387](../../src/evaluator/trampoline-evaluator.ts#L3376)) — `dispatchPerform` stops walking the stack at the barrier, so effects performed inside `parallel(...)` / `race(...)` branches **do not reach** Dvala handlers installed outside.

2. **Host handlers** — JS functions passed via the `runAsync({ effectHandlers })` API. They are **single-shot** by enforcement: a `settled = true` flag is set on the first call to `resume`/`fail`/`suspend`/`halt`/`next`, and a second call throws ([src/evaluator/trampoline-evaluator.ts:3527–3534](../../src/evaluator/trampoline-evaluator.ts#L3527)). The host-handler list is a **flat shared reference** that flows into every parallel branch ([line 3818](../../src/evaluator/trampoline-evaluator.ts#L3818)) — host handlers traverse barriers freely.

The full host-handler contract has 5 settling operations (`resume`, `fail`, `suspend`, `halt`, `next`), 3 non-settling helpers (`checkpoint`, `resumeFrom`, `onScopeExit`), and 4 read-only properties (`effectName`, `arg`, `signal`, `snapshots`) on `EffectContext` ([src/evaluator/effectTypes.ts](../../src/evaluator/effectTypes.ts)).

### What's missing

There's no Dvala-source way to express "install this handler with host-handler semantics." The boundary-handler concept introduced in the playground's Phase 1.5 step 23e ([2026-04-26_playground-monaco-tree-ls-cli.md](2026-04-26_playground-monaco-tree-ls-cli.md)) tried to bridge the gap by wrapping user code in `do with __playgroundBoundary__; ... end` — a Dvala-level installation. That's wrong on two axes for the boundary use case: multi-shot is allowed (silent program forking on `resume(a); resume(b);`), and parallel-branch effects can't reach the boundary (barrier isolation).

### Why a language feature, not just a playground helper

The playground is the immediate consumer, but the same shape is useful in production embeddings: an SDK that lets users plug in custom handlers in Dvala source, a library boundary that wants its handlers to compose cleanly under parallel composition, a test harness that mocks host handlers in pure Dvala. Making this a language feature — not a private playground helper — earns reuse across all those cases at the cost of one new keyword and one engine extension.

### Related literature

- **Koka** has `linear` handlers ("continuation called at most once," compile/runtime-rejected multi-shot) and `fun` clauses (tail-resumptive — clause body's value IS the resume value). The proposal here is essentially Dvala's flavor of "linear handler with `fun`-style clauses."
- **Multicore OCaml** is one-shot by default — the `Continuation_already_resumed` exception at second `continue k v` is exactly this contract.
- **Eff** is multi-shot only and has no parallel name for what we're adding.

The term "linear" is established in this corner of the algebraic-effects literature; we adopt it.

---

## Proposal

### Surface syntax (v1)

```dvala
let h = linear handler 
  @x(v) -> v * 2                                      // implicit resume(v * 2)
  @y(v) -> if v < 0 then perform(@dvala.error, "neg") else v end
end;
do with h;
  perform(@x, 21)
end
```

Future-form preview (v1.5+ — the destructured-ops syntax this design plans toward):

```dvala
let h = linear handler 
  @x(v) -> v * 2
  @y(v, { fail, halt, suspend }) -> ...
end
```

Lexical rule: `linear` is a **contextual keyword** that triggers only when followed by `handler` and a handler-start token — same precedent as the existing `shallow` keyword ([src/parser/subParsers/parseExpression.ts:92–99](../../src/parser/subParsers/parseExpression.ts#L92), [parseExpression.ts:194–198](../../src/parser/subParsers/parseExpression.ts#L194)).

`linear` and `shallow` are **orthogonal** in principle:

| Form | linear | shallow | dispatch |
|---|---|---|---|
| `handler ... end` | no | no | Dvala layer, barrier-isolated, multi-shot |
| `shallow handler ... end` | no | yes | Dvala layer, barrier-isolated, multi-shot, no reinstall on resume |
| `linear handler ... end` | yes | no | host layer, barrier-free, single-shot, return-as-resume |
| `linear shallow handler ... end` | yes | yes | host layer, single-shot, no reinstall (degenerate but legal) |

### Clause body shape: return-as-resume

The body of a `linear handler` clause:

- **Returns its value as the implicit resume.** `@x(v) -> v * 2` resumes the continuation with `v * 2`. No `resume` keyword.
- **`resume` is forbidden inside linear-handler clauses** at parse time. Allowing both implicit-return-as-resume and explicit `resume(...)` would re-open multi-shot via `resume(a); resume(b); ...`. Disallowing the keyword statically rejects multi-shot by construction.
- The **second parameter** is optional. When present, it's a regular Dvala destructure pulling settling operations from a context object the engine supplies: `(arg, { fail, halt, suspend, next })`. Pay-as-you-go — destructure only what the clause uses.

### Settling operations

**v1 scope (this PR): resume only.** The body's return value is the implicit resume; that's the entire surface. To fail, the user calls `perform(@dvala.error, msg)` from inside the clause body — the perform propagates past this handler to whatever outer handler exists for `@dvala.error`, with normal Dvala semantics. No special `fail` form needed; the existing effect machinery does it.

| Op | Semantics |
|---|---|
| (return value) | Implicit `resume(value)` — continue at the perform site |
| `perform(@dvala.error, msg)` from body | Aborts past this handler via the standard error channel |

**Why scope down from the original "5 ops via destructured second param" plan:** implementing `fail` / `halt` / `suspend` / `next` as Dvala-source values requires either (a) a host-handler bridge that re-enters the trampoline from JS — invasive — or (b) several new internal effects routed from within the handler dispatch path. Both significantly larger than the barrier-crossing change v1 actually needs. The playground's boundary-handler use case (the immediate consumer) only needs resume + a way to fail; `perform(@dvala.error, ...)` covers fail without new mechanism.

**v1.5+ deliverables (non-breaking to add later):**
- Destructured second param `@effect(arg, { fail, halt, suspend, next }) -> body` — additive grammar; existing single-param clauses keep working.
- The four settling ops as values bound from the engine context.
- Non-settling helpers (`checkpoint`, `resumeFrom`, `onScopeExit`).

### Dispatch semantics

When a `linear handler` value is installed via `do with h`, the engine routes the install to the **host-handler list** (rather than the Dvala-handler stack):

- **Single-shot.** The body returns at most once, so resume is implicit-and-once. The settling ops use the existing `settled` flag machinery — calling any of them a second time (e.g. via a closure that escaped the clause) throws "called after already settled."
- **Barrier-free.** Effects performed inside `parallel(...)` / `race(...)` branches reach the linear handler the same way they reach a JS-registered host handler today — host-handler dispatch ignores `ParallelBranchBarrier`.
- **LIFO with respect to outer host handlers.** A nested `do with linearH` pushes onto the host-handler list for the duration of the scope and pops on exit. Innermost wins, falling through to `runAsync({ effectHandlers })` registrations at the bottom.
- **Closures preserved.** The `HandlerFunction` value carries its `closureEnv`; outer `let` bindings are visible inside clause bodies just like in any Dvala lambda.
- **Inner effects.** When a clause body itself performs an effect (e.g. `(v, { fail }) -> if v < 0 then fail("neg") else perform(@y, v) end`), `@y` dispatches through the normal walk *past the linear handler that's currently firing* — same as how a host handler today can perform effects that are caught by other registered host handlers or by Dvala handlers further up.

### Nesting

`linear handler` values can be installed at any nesting level (top of a program, inside `do with`, inside a function called from a parallel branch, inside another linear handler). Same dynamic-scoping rules as Dvala-level `with`, just at the host layer. No "must be at the root" restriction.

### Static checks

**v1: reject `resume` keyword inside linear-handler clauses (parse error).** Free; mechanical; the parser already knows it's inside a linear handler. Error message: *"`resume` is not available in linear handler clauses — return the value to resume, or `perform(@dvala.error, msg)` to fail."*

The other static check from the original design ("type fail/halt/suspend/next as Never") is moot in v1 since those ops aren't surfaced. When the destructured-ops form lands in v1.5+, that check comes with it.

---

## Open Questions

- **Module/package home for documentation.** Does `linear handler` live alongside `shallow handler` in the same chapter, or warrant its own section? Probably a co-located paragraph in the existing handlers chapter is enough.
- **Interaction with `transform`.** Existing `handler ... transform x -> body end` syntax — does `linear handler` support `transform` clauses? Initial answer: yes, same shape; the transform fires on the implicit-resume value just like on an explicit `resume(...)` value. Worth confirming in implementation.
- **Type-checker work for `Never`-as-args.** How precisely is `Never` already tracked in Dvala's type system? May influence the "free dead-code detection" claim — needs a concrete check.
- **Naming for the second-param context object's type.** Internally the engine builds an object with `{ fail, halt, suspend, next }` (and perhaps `effectName`, `signal` later). Is it worth a named type / type alias users can reference, or strictly anonymous-shape?

---

## Implementation Plan

This is the engine-side work. It unblocks the playground's Phase 1.5 step 23e (which is currently shipped with the wrong-shape Dvala-level wrap and pauses here).

1. **Parser — add `linear` contextual keyword.** Mirror the `shallow` keyword path in [src/parser/subParsers/parseExpression.ts](../../src/parser/subParsers/parseExpression.ts) (`isShallowHandlerStart` → add `isLinearHandlerStart`). Permit `linear shallow handler` and `shallow linear handler` (order-insensitive). Update [src/parser/subParsers/parseHandler.ts](../../src/parser/subParsers/parseHandler.ts) to take a `linear: boolean` flag.
2. **AST + types — extend the Handler node.** Add `linear: boolean` to the Handler payload in [src/parser/types.ts](../../src/parser/types.ts) and to the `HandlerFunction` value type. Update the CST node type in [src/cst/types.ts](../../src/cst/types.ts).
3. **Parse-time check — reject `resume` keyword in linear-handler clause bodies.** Walk the clause body during parsing; if a `Resume` node appears, emit a parse error with the suggested message.
4. **Parse the destructured second param.** Allow each clause to optionally take a second parameter (e.g. `@x(v, { fail }) -> body`). Reuse the existing destructure machinery — clause params are already a function-like binding list.
5. **Typecheck — `Never` for the four settling ops.** Bind `fail`/`halt`/`suspend`/`next` in the clause body's scope with `(...) -> Never` types. Verify dead-code detection works through `let` aliases.
6. **Evaluator — install at host-handler layer for `linear: true` handlers.** When `do with h` evaluates and `h.linear === true`, push a new entry onto the run's host-handler list (rather than installing as an `AlgebraicHandleFrame` in the Dvala stack). The entry's JS handler function:
   - Receives `EffectContext` with the standard host shape.
   - Looks up the matching clause in `h.clauseMap`.
   - Re-enters the trampoline to evaluate the clause body in `h.closureEnv` with `arg` bound and the destructure object built from `EffectContext` ops.
   - Routes the body's return value to `ctx.resume(value)` if no settling op was called explicitly inside the body.
   - On scope exit (the `do with` block ending), pop the entry.
7. **Settled-flag integration.** The destructured `fail`/`halt`/`suspend`/`next` are wired to the existing `EffectContext` ops, so the existing `settled` flag and "called after already settled" errors apply automatically — no new error machinery.
8. **Tests.**
   - Parser tests: accept/reject cases for the new keyword(s), reject `resume` in body, accept clause with destructured second param.
   - Typecheck tests: dead-code detection for `fail`/`halt`/`suspend`/`next` and aliases.
   - Engine tests: end-to-end through `runAsync` covering single-shot enforcement, parallel-branch traversal, nested installations, LIFO with `runAsync({ effectHandlers })`, closures captured from outer `let` bindings, inner effects performed from clause bodies, integration with `shallow` modifier.
9. **Update the formatter** ([src/formatter/cstFormat.ts](../../src/formatter/cstFormat.ts)) and the language-service token-scanner ([src/languageService/tokenScan.ts](../../src/languageService/tokenScan.ts)) to recognize the new keyword.
10. **Documentation.** A handlers-chapter section explaining `linear handler`, the body shape, the settling-op destructure, the constraints, and a small worked example. Update the dvala skill / reference data so `dvala doc handler` mentions the linear variant.

After the engine work lands, **return to playground 23e**: replace the current `wrapWithBoundaryHandler` (which prepends a `do with __playgroundBoundary__; ... end` Dvala-level wrap) with one that just wraps the handlers buffer's expression in `linear handler ... end` *if it isn't already a linear-handler value*, and installs it via `do with`. The shape becomes:

```dvala
do with (<handlers buffer contents>);   // user is expected to write `linear handler ... end`
  <user code>
end
```

…or, with a guarding wrap that auto-promotes a regular `handler ... end` to linear:

```dvala
do with linear (<handlers buffer contents>);   // hypothetical promotion form
  <user code>
end
```

The promotion form is a Phase-2 design concern; v1 of the playground integration can simply require that handlers buffers evaluate to a linear-handler value, and document that.

## Phasing & dependencies

- This is an **engine PR**, separable from the playground PRs. Lands on its own branch with its own review.
- Playground Phase 1.5 step 23e is currently shipped against the wrong primitive. Once `linear handler` ships in the engine, 23e gets a follow-up PR that swaps `wrapWithBoundaryHandler` to use the new form. Until then, the existing shipped wrap covers the simple case (no parallel branches in user code, no multi-shot in handlers.dvala) — broken under those conditions, working otherwise.
- 23f–23m of the playground plan can proceed in parallel; none of them depend on this engine work.
