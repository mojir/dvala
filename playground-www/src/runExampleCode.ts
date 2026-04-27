/**
 * Utility for running example code in the playground.
 * - No debug mode
 * - print/println just return their argument (no actual output)
 * - All other effects cause no output to be shown
 */

import { createDvala } from '../../src/createDvala'
import { allBuiltinModules } from '../../src/allModules'
import type { EffectContext, HandlerRegistration } from '../../src/evaluator/effectTypes'
import { stringifyValue } from '../../common/utils'

const dvala = createDvala({ debug: false, modules: allBuiltinModules })

class EffectPerformedError extends Error {
  effectName: string
  constructor(effectName: string) {
    super(`Effect performed: ${effectName}`)
    this.name = 'EffectPerformedError'
    this.effectName = effectName
  }
}

// print: just resume with the argument (identity behavior for example validation)
const printHandler: HandlerRegistration = {
  pattern: 'dvala.io.print',
  handler: (ctx: EffectContext) => {
    ctx.resume(ctx.arg)
  },
}

// Interactive effects that would trigger prompts - intercept and throw
// (Must be explicit patterns since * falls back to standard handlers)
const interactiveEffectHandler = (ctx: EffectContext) => {
  throw new EffectPerformedError(ctx.effectName)
}

const readlineHandler: HandlerRegistration = {
  pattern: 'dvala.io.read',
  handler: interactiveEffectHandler,
}

const pickHandler: HandlerRegistration = {
  pattern: 'dvala.io.pick',
  handler: interactiveEffectHandler,
}

const confirmHandler: HandlerRegistration = {
  pattern: 'dvala.io.confirm',
  handler: interactiveEffectHandler,
}

const readStdinHandler: HandlerRegistration = {
  pattern: 'dvala.io.readStdin',
  handler: interactiveEffectHandler,
}

// All other effects: pass through standard effects, throw for unknown
const haltOnEffectHandler: HandlerRegistration = {
  pattern: '*',
  handler: (ctx: EffectContext) => {
    // Pass through to standard handlers for non-interactive standard effects
    if (
      ctx.effectName.startsWith('dvala.random') ||
      ctx.effectName.startsWith('dvala.time') ||
      ctx.effectName === 'dvala.checkpoint' ||
      ctx.effectName.startsWith('dvala.error')
    ) {
      ctx.next()
      return
    }
    // dvala.sleep would block rendering, intercept it
    throw new EffectPerformedError(ctx.effectName)
  },
}

const exampleHandlers: HandlerRegistration[] = [
  printHandler,
  readlineHandler,
  pickHandler,
  confirmHandler,
  readStdinHandler,
  haltOnEffectHandler,
]

/**
 * Compile context effect handler source strings into HandlerRegistrations.
 * These come from example context definitions in reference/examples.ts.
 */
function compileContextHandlers(handlers?: { pattern: string; handler: string }[]): HandlerRegistration[] {
  if (!handlers) return []
  return handlers.map(({ pattern, handler: source }) => ({
    pattern,
    handler: eval(`(${source})`) as HandlerRegistration['handler'],
  }))
}

/**
 * Run example code and return formatted output.
 * print/println return their argument. Other effects cause no output.
 * Optional contextEffectHandlers are installed before the default handlers.
 */
export function runExampleCode(
  code: string,
  contextEffectHandlers?: { pattern: string; handler: string }[],
): string | null {
  try {
    const contextHandlers = compileContextHandlers(contextEffectHandlers)
    const value = dvala.run(code, {
      effectHandlers: [...contextHandlers, ...exampleHandlers],
    })
    return stringifyValue(value, false)
  } catch (e) {
    if (e instanceof EffectPerformedError) {
      return `<effect ${e.effectName}>` // Show which effect halted execution
    }
    return `Error: ${String(e instanceof Error ? e.message : e)}`
  }
}
