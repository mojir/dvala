import type { Context } from '../evaluator/interface'
import { validateFromJS } from '../utils/interop'

export function scopeToGlobalContext(scope?: Record<string, unknown>): Context | undefined {
  if (!scope) return undefined

  const context: Context = {}
  for (const [key, value] of Object.entries(scope)) {
    context[key] = { value: validateFromJS(value, `scope binding "${key}"`) }
  }

  return context
}
