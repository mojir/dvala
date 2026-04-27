import { isMatrix } from '../src/typeGuards/annotatedCollections'
import { isAtom, isEffect, isRegularExpression } from '../src/typeGuards/dvala'
import { isDvalaFunction } from '../src/typeGuards/dvalaFunction'

export function stringifyValue(value: unknown, html: boolean): string {
  const gt = html ? '&gt;' : '>'
  const lt = html ? '&lt;' : '<'
  if (isDvalaFunction(value)) {
    if (value.functionType === 'Builtin') return `${lt}builtin function ${value.normalBuiltinSymbolType}${gt}`
    const kind = value.functionType === 'Macro' ? 'macro' : 'function'
    return `${lt}${kind} ${'name' in value && value.name ? value.name : '\u03BB'}${gt}`
  }
  if (value === null) return 'null'

  if (typeof value === 'object' && value instanceof Error) return value.toString()

  if (typeof value === 'object' && value instanceof RegExp) return `${value}`

  if (typeof value === 'number') {
    return `${value}`
  }

  if (isAtom(value)) return `:${value.name}`

  if (isEffect(value)) return `${lt}effect ${value.name}${gt}`

  if (isRegularExpression(value)) return `/${value.s}/${value.f}`

  if (typeof value === 'string') return `"${value}"`

  if (Array.isArray(value) && isMatrix(value)) return stringifyMatrix(value)

  return smartStringify(replaceInfinities(value), 0)
}

const MAX_WIDTH = 80
const INDENT = 2

/**
 * Smart JSON-like stringifier that inlines flat arrays and objects
 * when they fit within MAX_WIDTH, and breaks to multi-line when they don't.
 */
function smartStringify(value: unknown, indent: number): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (isAtom(value)) return `:${value.name}`

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    // Force multi-line if any element is an array or object — keeps inner elements readable
    const hasComplex = value.some(v => v !== null && typeof v === 'object')
    if (!hasComplex) {
      // All primitives — try flat
      const flat = `[${value.map(v => smartStringify(v, indent)).join(', ')}]`
      if (indent * INDENT + flat.length <= MAX_WIDTH) return flat
    }
    // Multi-line — each element tries to inline
    const pad = ' '.repeat((indent + 1) * INDENT)
    const items = value.map(v => `${pad}${smartStringify(v, indent + 1)}`)
    return `[\n${items.join(',\n')}\n${' '.repeat(indent * INDENT)}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    // Try flat
    const flat = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${smartStringify(v, indent)}`).join(', ')} }`
    if (indent * INDENT + flat.length <= MAX_WIDTH) return flat
    // Multi-line
    const pad = ' '.repeat((indent + 1) * INDENT)
    const items = entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${smartStringify(v, indent + 1)}`)
    return `{\n${items.join(',\n')}\n${' '.repeat(indent * INDENT)}}`
  }

  return String(value)
}

function replaceInfinities(value: unknown): unknown {
  if (value === Number.POSITIVE_INFINITY) {
    return '∞'
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return '-∞'
  }
  if (Array.isArray(value)) {
    return value.map(replaceInfinities)
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = replaceInfinities(val)
    }
    return result
  }
  return value
}

function stringifyMatrix(matrix: (null | number | string | boolean)[][]): string {
  const padding = matrix.flat().reduce((max: number, cell) => Math.max(max, `${cell}`.length), 0) + 1
  const rows = matrix.map(row => `[${row.map(cell => `${cell}`.padStart(padding)).join(' ')} ]`)
  return rows.join('\n')
}

export function findAllOccurrences(input: string, pattern: RegExp): Set<string> {
  const matches = [...input.matchAll(pattern)]
  return new Set(matches.map(match => match[0]))
}
