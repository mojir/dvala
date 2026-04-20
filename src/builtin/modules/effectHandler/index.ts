import type { FunctionDocs } from '../../interface'
import type { DvalaModule } from '../interface'
import handlerModuleSource from './effectHandler.dvala'

const handlerDocs: Record<string, FunctionDocs> = {
  'retry': {
    // Row-polymorphic signature: the thunk's remainder effects (ρ) flow
    // through to the caller. retry catches @dvala.error internally but
    // re-performs it on final failure — the concrete effect stays in both
    // the thunk's declared effect set and the return's, so they cancel.
    // The wrapper metadata below is kept as a fast-path for the existing
    // HandlerWrapperInfo application-law branch at call sites; row-var
    // propagation yields the equivalent result via biunification.
    type: '(Number, (() -> @{dvala.error | r} A)) -> @{dvala.error | r} A',
    wrapper: { paramIndex: 1, handled: ['dvala.error'], introduced: ['dvala.error'] },
    category: 'effectHandler',
    returns: { type: 'any' },
    args: {
      n: { type: 'integer' },
      bodyFn: { type: 'function' },
    },
    variants: [{ argumentNames: ['n', 'bodyFn'] }],
    description: 'Executes ``bodyFn()`` and retries up to ``n`` times on `@dvala.error`. On final failure, propagates the error.',
    examples: [
      'let { retry } = import("effectHandler");\ndo with (handler @dvala.error(msg) -> "gave up" end); retry(3, -> 0 / 0) end',
    ],
  },
  'fallback': {
    // Returns a Handler value; the user applies it via `h(-> body)` or
    // `with h`. The handler-as-callable path (Phase 4-B) then does the
    // application-law arithmetic. Introduced = @{} (the clause just
    // returns the fallback value; no effects performed).
    type: '(Unknown) -> Handler<Unknown, Unknown, @{dvala.error}>',
    category: 'effectHandler',
    returns: { type: 'function' },
    args: { value: { type: 'any' } },
    variants: [{ argumentNames: ['value'] }],
    description: 'Returns a handler that catches `@dvala.error` and aborts with ``value``. Install with `with fallback(v);` or `fallback(v)(-> body)`.',
    examples: [
      'let { fallback } = import("effectHandler");\ndo with fallback(0); 0 / 0 end',
      'let { fallback } = import("effectHandler");\nfallback(0)(-> 0 / 0)',
    ],
  },
}

const chooseDocs: Record<string, FunctionDocs> = {
  'chooseAll': {
    // Row-polymorphic: thunk's remainder effects (ρ) flow through to the caller.
    // The `@{| r}` return annotation is required (not omittable) — an omitted
    // annotation parses as `PureEffects` (Closed empty), which would declare
    // chooseAll as pure and cut off row-var propagation at the call site.
    type: '((() -> @{choose | r} A)) -> @{| r} A[]',
    // Catches @choose and resumes per option. Introduces nothing.
    wrapper: { paramIndex: 0, handled: ['choose'], introduced: [] },
    category: 'effectHandler',
    returns: { type: 'array' },
    args: { bodyFn: { type: 'function' } },
    variants: [{ argumentNames: ['bodyFn'] }],
    description: 'Runs ``bodyFn()`` under a nondeterminism handler that explores **all** branches of every `perform(@choose, options)`. Returns an array of all results. Uses multi-shot continuations — `resume` is called once per option.',
    examples: [
      'let { chooseAll } = import("effectHandler");\nchooseAll(-> perform(@choose, [1, 2, 3]) * 10)',
      'let { chooseAll } = import("effectHandler");\nchooseAll(-> do\n  let a = perform(@choose, [1, 2]);\n  let b = perform(@choose, [10, 20]);\n  [a, b]\nend)',
    ],
  },
  'chooseFirst': {
    // Row-polymorphic: thunk's remainder effects (ρ) flow through to the caller.
    type: '((() -> @{choose | r} A)) -> @{| r} A',
    // Catches @choose and resumes with the first option. Introduces nothing.
    wrapper: { paramIndex: 0, handled: ['choose'], introduced: [] },
    category: 'effectHandler',
    returns: { type: 'any' },
    args: { bodyFn: { type: 'function' } },
    variants: [{ argumentNames: ['bodyFn'] }],
    description: 'Runs ``bodyFn()`` under a nondeterminism handler that always picks the **first** option. Deterministic — equivalent to replacing every `perform(@choose, options)` with `first(options)`.',
    examples: [
      'let { chooseFirst } = import("effectHandler");\nchooseFirst(-> perform(@choose, [1, 2, 3]) * 10)',
    ],
  },
  'chooseRandom': {
    // Row-polymorphic payoff case: thunk's remainder effects flow through ρ
    // into the result, alongside the introduced @dvala.random.item. With
    // biunification, the result type is exactly `@{dvala.random.item | ρ} A`
    // where ρ expands to whatever extras the thunk performed — no more
    // HandlerWrapperInfo escape hatch required to produce this.
    type: '((() -> @{choose | r} A)) -> @{dvala.random.item | r} A',
    // Kept as a fast-path: at call sites, the HandlerWrapperInfo branch
    // applies the same application law directly. Row-var biunification
    // yields the equivalent result via `constrain`.
    wrapper: { paramIndex: 0, handled: ['choose'], introduced: ['dvala.random.item'] },
    category: 'effectHandler',
    returns: { type: 'any' },
    args: { bodyFn: { type: 'function' } },
    variants: [{ argumentNames: ['bodyFn'] }],
    description: 'Runs ``bodyFn()`` under a nondeterminism handler that picks a **random** option at each `perform(@choose, options)`. Uses `@dvala.random.item` internally.',
    examples: [
      'let { chooseRandom } = import("effectHandler");\nchooseRandom(-> perform(@choose, [1, 2, 3, 4, 5]))',
    ],
  },
  'chooseTake': {
    // Row-polymorphic: thunk's remainder effects (ρ) flow through to the caller.
    type: '(Number, (() -> @{choose | r} A)) -> @{| r} A[]',
    // Like chooseAll but capped at n results. Still catches @choose with
    // nothing introduced.
    wrapper: { paramIndex: 1, handled: ['choose'], introduced: [] },
    category: 'effectHandler',
    returns: { type: 'array' },
    args: {
      n: { type: 'integer' },
      bodyFn: { type: 'function' },
    },
    variants: [{ argumentNames: ['n', 'bodyFn'] }],
    description: 'Like `chooseAll` but stops after collecting ``n`` results. Branches beyond the limit are not explored.',
    examples: [
      'let { chooseTake } = import("effectHandler");\nchooseTake(2, -> perform(@choose, [1, 2, 3]) * 10)',
    ],
  },
}

export const handlerModule: DvalaModule = {
  name: 'effectHandler',
  description: 'Utilities for creating and composing algebraic effect handlers.',
  functions: {},
  source: handlerModuleSource,
  docs: { ...handlerDocs, ...chooseDocs },
}
