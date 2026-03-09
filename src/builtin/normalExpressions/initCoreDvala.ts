import { createContextStack } from '../../evaluator/ContextStack'
import { evaluate } from '../../evaluator/trampoline'
import type { Any } from '../../interface'
import { parse } from '../../parser'
import type { UserDefinedFunction } from '../../parser/types'
import { minifyTokenStream } from '../../tokenizer/minifyTokenStream'
import { tokenize } from '../../tokenizer/tokenize'
import { isDvalaFunction } from '../../typeGuards/dvalaFunction'
import { isObj } from '../../typeGuards/dvala'
import collectionSource from '../core/collection.dvala'
import sequenceSource from '../core/sequence.dvala'
import arraySource from '../core/array.dvala'
import functionalSource from '../core/functional.dvala'
import objectSource from '../core/object.dvala'
import { normalExpressions } from '.'

const coreDvalaSources: Record<string, string> = {
  collection: collectionSource,
  sequence: sequenceSource,
  array: arraySource,
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
    const body = parse(minified)
    const ast = { body, hasDebugData: false }
    const contextStack = createContextStack()
    const result = evaluate(ast, contextStack) as Any

    if (result instanceof Promise) {
      throw new TypeError('Core dvala sources must be synchronous')
    }

    if (!isObj(result)) {
      continue
    }

    const obj = result
    for (const [name, fn] of Object.entries(obj)) {
      const expression = normalExpressions[name]
      // Defensive: all core dvala modules produce UserDefined functions
      /* v8 ignore next */
      if (expression && isDvalaFunction(fn) && (fn as { functionType: string }).functionType === 'UserDefined') {
        expression.dvalaImpl = fn as UserDefinedFunction
      }
    }
  }
}
