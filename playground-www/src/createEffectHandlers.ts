import type { Any } from '../../src/interface'
import type { EffectHandler, HandlerRegistration } from '../../src/evaluator/effectTypes'
import type { PlaygroundAPI } from './playgroundAPI'

type ApiValue = PlaygroundAPI[keyof PlaygroundAPI]
type ApiLeaf = (...args: never[]) => unknown

function isApiLeaf(value: unknown): value is ApiLeaf {
  return typeof value === 'function'
}

export function createEffectHandlers(api: PlaygroundAPI): HandlerRegistration[] {
  const handlers: HandlerRegistration[] = []

  function walk(obj: Record<string, unknown>, prefix: string) {
    for (const [key, value] of Object.entries(obj)) {
      const effectName = `${prefix}.${key}`
      if (isApiLeaf(value)) {
        const fn = value
        const handler: EffectHandler = (ctx): void | Promise<void> => {
          try {
            const args = Array.isArray(ctx.arg) ? ctx.arg : [ctx.arg]
            const result = (fn as (...a: unknown[]) => unknown)(...args)
            if (result instanceof Promise) {
              return result.then(r => ctx.resume((r ?? null) as Any)).catch(e => ctx.fail((e as Error).message))
            }
            ctx.resume((result ?? null) as Any)
          } catch (err) {
            ctx.fail(err instanceof Error ? err.message : String(err))
          }
        }
        handlers.push({ pattern: effectName, handler })
      } else if (typeof value === 'object' && value !== null) {
        walk(value as Record<string, unknown>, effectName)
      }
    }
  }

  walk(api as unknown as Record<string, ApiValue>, 'playground')
  return handlers
}
