import type { FunctionDocs } from '../../interface'
import type { DvalaModule } from '../interface'
import handlerModuleSource from './effectHandler.dvala'

const handlerDocs: Record<string, FunctionDocs> = {
  'retry': {
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
