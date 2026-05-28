import { createContextStack } from '../../evaluator/ContextStack'
import { evaluate } from '../../evaluator/trampoline-evaluator'
import type { Any } from '@mojir/dvala-types'
import type { UserDefinedFunction } from '@mojir/dvala-types'
import { isDvalaFunction } from '@mojir/dvala-types'
import { isObj } from '@mojir/dvala-types'
import type { ParseSource } from '../../evaluator/interface'
import collectionSource from '../core/collection.dvala'
import sequenceSource from '../core/sequence.dvala'
import functionalSource from '../core/functional.dvala'
import errorSource from '../core/error.dvala'
import objectSource from '../core/object.dvala'
import { normalExpressions } from '.'

const coreDvalaSources: Record<string, string> = {
  collection: collectionSource,
  error: errorSource,
  sequence: sequenceSource,
  functional: functionalSource,
  object: objectSource,
}

export function initCoreDvalaSources(parseSource: ParseSource): void {
  for (const [, source] of Object.entries(coreDvalaSources)) {
    const ast = parseSource(source)
    const contextStack = createContextStack()
    const result = evaluate(ast, contextStack) as Any

    if (result instanceof Promise) {
      throw new TypeError('Core dvala sources must be synchronous')
    }

    if (!isObj(result)) {
      continue
    }

    // PersistentMap doesn't expose entries via Object.entries — iterate directly.
    for (const [name, fn] of result) {
      const expression = normalExpressions[name]
      // Idempotent: already-patched implementations win (skip re-allocating nodeIds
      // when called repeatedly, e.g. once per createDvala() instance).
      if (
        expression &&
        !expression.dvalaImpl &&
        isDvalaFunction(fn) &&
        // Defensive: all core dvala modules produce UserDefined functions
        /* v8 ignore next */
        (fn as { functionType: string }).functionType === 'UserDefined'
      ) {
        expression.dvalaImpl = fn as UserDefinedFunction
      }
    }
  }
}
