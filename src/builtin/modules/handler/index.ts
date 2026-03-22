import type { FunctionDocs } from '../../interface'
import type { DvalaModule } from '../interface'
import handlerModuleSource from './handler.dvala'

const handlerDocs: Record<string, FunctionDocs> = {
  'retry': {
    category: 'handler',
    returns: { type: 'function' },
    args: { n: { type: 'integer' } },
    variants: [{ argumentNames: ['n'] }],
    description: 'Returns a handler function that retries failing effects up to `$n` times. On final failure, propagates the original error. Passes `@dvala.error` through unchanged.',
    examples: [
      'let { retry } = import(handler); retry(3)',
    ],
  },
  'fallback': {
    category: 'handler',
    returns: { type: 'function' },
    args: { value: { type: 'any' } },
    variants: [{ argumentNames: ['value'] }],
    description: 'Returns a handler function that catches `@dvala.error` and returns `$value` instead.',
    examples: [
      'let { fallback } = import(handler); fallback(0)',
    ],
  },
}

export const handlerModule: DvalaModule = {
  name: 'handler',
  functions: {},
  source: handlerModuleSource,
  docs: handlerDocs,
}
