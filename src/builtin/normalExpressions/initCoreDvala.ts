import { createContextStack } from '../../evaluator/ContextStack'
import { evaluate } from '../../evaluator/trampoline-evaluator'
import type { Any } from '../../interface'
import { parseToAst } from '../../parser'
import type { UserDefinedFunction } from '../../parser/types'
import { minifyTokenStream } from '../../tokenizer/minifyTokenStream'
import { tokenize } from '../../tokenizer/tokenize'
import { isDvalaFunction } from '../../typeGuards/dvalaFunction'
import { isObj } from '../../typeGuards/dvala'
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

let initialized = false

export function initCoreDvalaSources(): void {
  if (initialized)
    return
  initialized = true

  for (const [, source] of Object.entries(coreDvalaSources)) {
    const tokens = tokenize(source, false, undefined)
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const ast = parseToAst(minified)
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
      // Defensive: all core dvala modules produce UserDefined functions
      /* v8 ignore next */
      if (expression && isDvalaFunction(fn) && (fn as { functionType: string }).functionType === 'UserDefined') {
        expression.dvalaImpl = fn as UserDefinedFunction
      }
    }
  }
}
