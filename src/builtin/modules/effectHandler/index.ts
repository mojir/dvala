import type { FunctionDocs } from '../../interface'
import type { DvalaModule } from '../interface'
import handlerModuleSource from './effectHandler.dvala'

const handlerDocs: Record<string, FunctionDocs> = {
  'retry': {
    category: 'effectHandler',
    returns: { type: 'function' },
    args: { n: { type: 'integer' } },
    variants: [{ argumentNames: ['n'] }],
    description: 'Returns a handler function that retries failing effects up to `$n` times. On final failure, propagates the original error. Passes `@dvala.error` through unchanged.',
    examples: [
      'let { retry } = import(effectHandler); retry(3)',
      'let { retry, fallback } = import(effectHandler);\nperform(@my.eff, "data") ||> [retry(2), @my.eff(x) -> x ++ "!", fallback("gave up")]',
      'let { retry } = import(effectHandler);\nhandle perform(@my.eff, 10) with [retry(3), @my.eff(x) -> x * 2] end',
    ],
  },
  'fallback': {
    category: 'effectHandler',
    returns: { type: 'function' },
    args: { value: { type: 'any' } },
    variants: [{ argumentNames: ['value'] }],
    description: 'Returns a handler function that catches `@dvala.error` and returns `$value` instead.',
    examples: [
      'let { fallback } = import(effectHandler); fallback(0)',
      'let { fallback } = import(effectHandler);\n(0 / 0) ||> fallback(0)',
      'let { fallback } = import(effectHandler);\nhandle let x = 0 / 0; x + 1 with fallback(0) end',
    ],
  },
}

export const handlerModule: DvalaModule = {
  name: 'effectHandler',
  functions: {},
  source: handlerModuleSource,
  docs: handlerDocs,
}
