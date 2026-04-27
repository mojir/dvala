import { isFunctionType, isNodeType } from '../../constants/constants'
import type { AstNode, DvalaFunction } from '../../parser/types'
import { ATOM_SYMBOL, FUNCTION_SYMBOL } from '../symbols'

function isDvalaFunction(func: unknown): func is DvalaFunction {
  if (func === null || typeof func !== 'object') return false

  return FUNCTION_SYMBOL in func && 'functionType' in func && isFunctionType(func.functionType)
}

function isNode(value: unknown): value is AstNode {
  if (!Array.isArray(value) || value.length < 2) return false
  return isNodeType(value[0])
}

export function valueToString(value: unknown): string {
  if (isDvalaFunction(value)) {
    const kind = value.functionType === 'Macro' ? 'macro' : 'function'
    return `<${kind} ${(value as any).name || '\u03BB'}>`
  }

  if (isNode(value)) return `${value[0]}-node`

  if (value !== null && typeof value === 'object' && ATOM_SYMBOL in value)
    return `:${(value as unknown as { name: string }).name}`

  if (value === null) return 'null'

  if (typeof value === 'object' && value instanceof RegExp) return `${value}`

  if (typeof value === 'object' && value instanceof Error) return value.toString()

  return JSON.stringify(value)
}
