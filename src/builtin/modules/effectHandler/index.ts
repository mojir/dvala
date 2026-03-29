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

export const handlerModule: DvalaModule = {
  name: 'effectHandler',
  functions: {},
  source: handlerModuleSource,
  docs: handlerDocs,
}
