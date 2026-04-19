import type { FunctionDocs } from '../../interface'
import type { DvalaModule } from '../interface'
import handlerModuleSource from './effectHandler.dvala'

const handlerDocs: Record<string, FunctionDocs> = {
  'retry': {
    // Thunk declared with an open-tailed effect set so effectful thunks
    // can be passed. Return type uses type-var A so the thunk's result
    // type propagates to the caller — declaring Unknown would short-
    // circuit constrain (lhs-Unknown is a no-op) and leave the call
    // result as Never. The wrapper metadata below tells the typechecker
    // how the caught/introduced effects recombine at the call site.
    type: '(Number, (() -> @{dvala.error, ...} A)) -> A',
    // retry catches @dvala.error but re-performs it on final failure, so
    // the error effect still escapes — handled + introduced cancel out.
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
    type: '((() -> @{choose, ...} A)) -> A[]',
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
    type: '((() -> @{choose, ...} A)) -> A',
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
    type: '((() -> @{choose, ...} A)) -> A',
    // Catches @choose and resumes with a random option — selection itself
    // performs @dvala.random.item, which the wrapper introduces into the
    // outer effect set. Closes the Phase A audit follow-up (audit item
    // #effecthandler-chooserandom).
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
    type: '(Number, (() -> @{choose, ...} A)) -> A[]',
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
