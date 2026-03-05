/**
 * Standard effects — built-in effects with default implementations.
 *
 * These effects are always available without requiring explicit host handlers.
 * Host handlers can override them (host handlers take priority in the lookup order).
 *
 * Lookup order: local try/with → host handlers → standard effects → unhandled error
 *
 * Each standard effect has co-located documentation (FunctionDocs) and arity,
 * mirroring the structure of builtin normal expressions and module functions.
 *
 * Sync effects work in both `runSync` and `run`.
 * Async effects (`dvala.sleep`, `dvala.io.read-line` in Node, `dvala.io.read-stdin`) only work in `run` —
 * `runSync` will throw when a Promise surfaces.
 */

import { DvalaError } from '../errors'
import type { Arity, FunctionDocs } from '../builtin/interface'
import type { Any, Arr, UnknownRecord } from '../interface'
import { isEffect, isRegularExpression } from '../typeGuards/dvala'
import { isDvalaFunction } from '../typeGuards/dvalaFunction'
import { assertNumberOfParams, toFixedArity } from '../utils/arity'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { ContinuationStack } from './frames'
import type { Step } from './step'

/* eslint-disable node/prefer-global/process -- isomorphic module: uses `typeof process` for Node/browser feature detection */

// ---------------------------------------------------------------------------
// Standard effect definition type
// ---------------------------------------------------------------------------

/**
 * A standard effect handler returns the next step directly.
 * Sync effects return `Step`, async effects return `Promise<Step>`.
 */
type StandardEffectHandlerFn = (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo) => Step | Promise<Step>

/**
 * A standard effect definition — mirrors BuiltinNormalExpression structure.
 * Each effect has a handler function, arity for validation, and co-located docs.
 */
export interface StandardEffectDefinition {
  handler: StandardEffectHandlerFn
  arity: Arity
  docs: FunctionDocs
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isNode(): boolean {
  return typeof process !== 'undefined' && typeof process.stdout?.write === 'function'
}

/**
 * Format a Dvala value for text output (stdout/stderr).
 * - Strings are printed as-is (no quotes).
 * - Numbers, booleans, null: String() coercion.
 * - Functions: `<function name>` or `<builtin function name>`.
 * - Effects: `<effect name>`.
 * - RegExps (Dvala regular expressions): `/pattern/flags`.
 * - Arrays and objects: JSON.stringify with 2-space indent (Infinity → "∞").
 */
function formatForOutput(value: unknown): string {
  if (typeof value === 'string')
    return value

  if (value === null)
    return 'null'

  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)

  if (isDvalaFunction(value)) {
    if (value.functionType === 'Builtin')
      return `<builtin function ${value.normalBuiltinSymbolType}>`
    return `<function ${(value as unknown as UnknownRecord).n ?? '\u03BB'}>`
  }

  if (isEffect(value))
    return `<effect ${value.name}>`

  if (isRegularExpression(value))
    return `/${value.s}/${value.f}`

  if (typeof value === 'object' && value instanceof RegExp)
    return `${value}`

  // Arrays and objects — JSON.stringify with infinity handling
  return JSON.stringify(replaceSpecialValues(value), null, 2)
}

function replaceSpecialValues(value: unknown): unknown {
  if (value === Number.POSITIVE_INFINITY)
    return '∞'
  if (value === Number.NEGATIVE_INFINITY)
    return '-∞'
  if (isDvalaFunction(value))
    return formatForOutput(value)
  if (isEffect(value))
    return formatForOutput(value)
  if (isRegularExpression(value))
    return formatForOutput(value)
  if (Array.isArray(value))
    return value.map(replaceSpecialValues)
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value))
      result[key] = replaceSpecialValues(val)
    return result
  }
  return value
}

function printHandler(args: Arr, k: ContinuationStack): Step {
  const value = args[0] as Any
  const str = formatForOutput(value)
  if (isNode()) {
    process.stdout.write(str)
  }
  else {
    // eslint-disable-next-line no-console
    console.log(str)
  }
  return { type: 'Value', value, k }
}

function printlnHandler(args: Arr, k: ContinuationStack): Step {
  const value = args[0] as Any
  const str = formatForOutput(value)
  if (isNode()) {
    process.stdout.write(`${str}\n`)
  }
  else if (typeof globalThis.alert === 'function') {
    // eslint-disable-next-line no-alert
    globalThis.alert(str)
  }
  else {
    // eslint-disable-next-line no-console
    console.log(str)
  }
  return { type: 'Value', value, k }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0
    const value = char === 'x' ? random : (random & 0x3 | 0x8)
    return value.toString(16)
  })
}

// ---------------------------------------------------------------------------
// Standard effect definitions (handler + arity + docs)
// ---------------------------------------------------------------------------

const standardEffects: Record<string, StandardEffectDefinition> = {

  // ── I/O ──────────────────────────────────────────────────────────────────

  'dvala.io.print': {
    handler: printHandler,
    arity: toFixedArity(1),
    docs: {
      category: 'effect',
      description: 'Writes a value to stdout without a trailing newline. Accepts any value — strings are printed as-is, other values are auto-formatted. In Node.js uses `process.stdout.write(str)`, in browsers uses `console.log(str)`. Resumes with the original value (identity).',
      returns: { type: 'any' },
      args: {
        value: { type: 'any', description: 'Value to print.' },
      },
      variants: [{ argumentNames: ['value'] }],
      examples: [
        'perform(effect(dvala.io.print), "hello")',
        'perform(effect(dvala.io.print), 42)',
      ],
      seeAlso: ['-effect-dvala.io.println', '-effect-dvala.io.error', 'perform', 'effect'],
    },
  },

  'dvala.io.println': {
    handler: printlnHandler,
    arity: toFixedArity(1),
    docs: {
      category: 'effect',
      description: 'Writes a value to stdout followed by a newline. Accepts any value — strings are printed as-is, other values are auto-formatted. In Node.js uses `process.stdout.write(str + "\\n")`, in browsers uses `alert(str)`. Resumes with the original value (identity).',
      returns: { type: 'any' },
      args: {
        value: { type: 'any', description: 'Value to print.' },
      },
      variants: [{ argumentNames: ['value'] }],
      examples: [
        'perform(effect(dvala.io.println), "hello")',
        'perform(effect(dvala.io.println), [1, 2, 3])',
      ],
      seeAlso: ['-effect-dvala.io.print', '-effect-dvala.io.error', 'perform', 'effect'],
    },
  },

  'dvala.io.error': {
    handler: (args: Arr, k: ContinuationStack): Step => {
      const value = args[0] as Any
      const str = formatForOutput(value)
      if (isNode()) {
        process.stderr.write(`${str}\n`)
      }
      else {
        console.error(str)
      }
      return { type: 'Value', value, k }
    },
    arity: toFixedArity(1),
    docs: {
      category: 'effect',
      description: 'Writes a value to stderr followed by a newline. Accepts any value — strings are printed as-is, other values are auto-formatted. In Node.js uses `process.stderr.write(str + "\\n")`, in browsers uses `console.error(str)`. Resumes with the original value (identity).',
      returns: { type: 'any' },
      args: {
        value: { type: 'any', description: 'Value to write to stderr.' },
      },
      variants: [{ argumentNames: ['value'] }],
      examples: [
        'perform(effect(dvala.io.error), "something went wrong")',
      ],
      seeAlso: ['-effect-dvala.io.print', '-effect-dvala.io.println', 'perform', 'effect'],
    },
  },

  'dvala.io.read-line': {
    handler: (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const message = typeof args[0] === 'string' ? args[0] : ''

      // Browser: window.prompt (synchronous)
      if (typeof globalThis.prompt === 'function') {
        // eslint-disable-next-line no-alert
        const result = globalThis.prompt(message)
        return { type: 'Value', value: result ?? null, k }
      }

      throw new DvalaError('dvala.io.read-line is not supported in this environment. In Node.js, register a "dvala.io.read-line" host handler.', sourceCodeInfo)
    },
    arity: { min: 0, max: 1 },
    docs: {
      category: 'effect',
      description: 'Reads one line of user input. In browsers uses `window.prompt()`. In Node.js uses `readline`. Resumes with the user\'s input string, or `null` on cancel.',
      returns: { type: ['string', 'null'] },
      args: {
        message: { type: 'string', description: 'Optional prompt message to display.' },
      },
      variants: [
        { argumentNames: [] },
        { argumentNames: ['message'] },
      ],
      examples: [
        'effect(dvala.io.read-line)',
      ],
      seeAlso: ['-effect-dvala.io.read-stdin', '-effect-dvala.io.print', '-effect-dvala.io.println', 'perform', 'effect'],
    },
  },

  'dvala.io.read-stdin': {
    handler: (_args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Promise<Step> => {
      if (!isNode() || !process.stdin) {
        throw new DvalaError('dvala.io.read-stdin is not supported in this environment. Node.js is required.', sourceCodeInfo)
      }
      return new Promise<Step>((resolve, reject) => {
        const chunks: string[] = []
        process.stdin.setEncoding('utf-8')
        process.stdin.on('data', (chunk: string) => chunks.push(chunk))
        process.stdin.on('end', () => resolve({ type: 'Value', value: chunks.join(''), k }))
        process.stdin.on('error', (err: Error) => reject(err))
        process.stdin.resume()
      })
    },
    arity: toFixedArity(0),
    docs: {
      category: 'effect',
      description: 'Reads all of stdin until EOF (Node.js only). Resumes with the full stdin content as a string.',
      returns: { type: 'string' },
      args: {},
      variants: [{ argumentNames: [] }],
      examples: [
        'effect(dvala.io.read-stdin)',
      ],
      seeAlso: ['-effect-dvala.io.read-line', 'perform', 'effect'],
    },
  },

  // ── Random ───────────────────────────────────────────────────────────────

  'dvala.random': {
    handler: (_args: Arr, k: ContinuationStack): Step => {
      return { type: 'Value', value: Math.random(), k }
    },
    arity: toFixedArity(0),
    docs: {
      category: 'effect',
      description: 'Returns a random floating-point number in the range [0, 1). Equivalent to `Math.random()` in JavaScript.',
      returns: { type: 'number' },
      args: {},
      variants: [{ argumentNames: [] }],
      examples: [
        'perform(effect(dvala.random))',
      ],
      seeAlso: ['-effect-dvala.random.int', '-effect-dvala.random.uuid', '-effect-dvala.random.item', '-effect-dvala.random.shuffle', 'perform', 'effect'],
    },
  },

  'dvala.random.uuid': {
    handler: (_args: Arr, k: ContinuationStack): Step => {
      return { type: 'Value', value: generateUUID(), k }
    },
    arity: toFixedArity(0),
    docs: {
      category: 'effect',
      description: 'Generates a UUID v4 string.',
      returns: { type: 'string' },
      args: {},
      variants: [{ argumentNames: [] }],
      examples: [
        'perform(effect(dvala.random.uuid))',
      ],
      seeAlso: ['-effect-dvala.random', 'perform', 'effect'],
    },
  },

  'dvala.random.int': {
    handler: (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const min = args[0]
      const max = args[1]
      if (typeof min !== 'number' || !Number.isInteger(min)) {
        throw new DvalaError(`dvala.random.int: min must be an integer, got ${typeof min === 'number' ? min : typeof min}`, sourceCodeInfo)
      }
      if (typeof max !== 'number' || !Number.isInteger(max)) {
        throw new DvalaError(`dvala.random.int: max must be an integer, got ${typeof max === 'number' ? max : typeof max}`, sourceCodeInfo)
      }
      if (max <= min) {
        throw new DvalaError(`dvala.random.int: max (${max}) must be greater than min (${min})`, sourceCodeInfo)
      }
      return { type: 'Value', value: Math.floor(Math.random() * (max - min)) + min, k }
    },
    arity: toFixedArity(2),
    docs: {
      category: 'effect',
      description: 'Returns a random integer in the range [min, max).',
      returns: { type: 'integer' },
      args: {
        min: { type: 'integer', description: 'Minimum value (inclusive).' },
        max: { type: 'integer', description: 'Maximum value (exclusive). Must be greater than min.' },
      },
      variants: [{ argumentNames: ['min', 'max'] }],
      examples: [
        'perform(effect(dvala.random.int), 1, 100)',
      ],
      seeAlso: ['-effect-dvala.random', '-effect-dvala.random.item', 'perform', 'effect'],
    },
  },

  'dvala.random.item': {
    handler: (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const array = args[0]
      if (!Array.isArray(array)) {
        throw new DvalaError(`dvala.random.item: argument must be an array, got ${typeof array}`, sourceCodeInfo)
      }
      if (array.length === 0) {
        throw new DvalaError('dvala.random.item: cannot pick from an empty array', sourceCodeInfo)
      }
      const index = Math.floor(Math.random() * array.length)
      return { type: 'Value', value: array[index] as Any, k }
    },
    arity: toFixedArity(1),
    docs: {
      category: 'effect',
      description: 'Picks a random element from a non-empty array.',
      returns: { type: 'any' },
      args: {
        array: { type: 'array', description: 'Non-empty array to pick from.' },
      },
      variants: [{ argumentNames: ['array'] }],
      examples: [
        'perform(effect(dvala.random.item), ["a", "b", "c"])',
      ],
      seeAlso: ['-effect-dvala.random', '-effect-dvala.random.shuffle', 'perform', 'effect'],
    },
  },

  'dvala.random.shuffle': {
    handler: (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const array = args[0]
      if (!Array.isArray(array)) {
        throw new DvalaError(`dvala.random.shuffle: argument must be an array, got ${typeof array}`, sourceCodeInfo)
      }
      const shuffled: Arr = Array.from(array) as Arr
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = shuffled[i]
        shuffled[i] = shuffled[j]!
        shuffled[j] = tmp!
      }
      return { type: 'Value', value: shuffled, k }
    },
    arity: toFixedArity(1),
    docs: {
      category: 'effect',
      description: 'Returns a new array with the elements of the input array in random order. Uses the Fisher-Yates shuffle algorithm.',
      returns: { type: 'array' },
      args: {
        array: { type: 'array', description: 'Array to shuffle.' },
      },
      variants: [{ argumentNames: ['array'] }],
      examples: [
        'perform(effect(dvala.random.shuffle), [1, 2, 3, 4, 5])',
      ],
      seeAlso: ['-effect-dvala.random', '-effect-dvala.random.item', 'perform', 'effect'],
    },
  },

  // ── Time ─────────────────────────────────────────────────────────────────

  'dvala.time.now': {
    handler: (_args: Arr, k: ContinuationStack): Step => {
      return { type: 'Value', value: Date.now(), k }
    },
    arity: toFixedArity(0),
    docs: {
      category: 'effect',
      description: 'Returns the current timestamp in milliseconds since the Unix epoch. Equivalent to `Date.now()` in JavaScript.',
      returns: { type: 'number' },
      args: {},
      variants: [{ argumentNames: [] }],
      examples: [
        'perform(effect(dvala.time.now))',
      ],
      seeAlso: ['-effect-dvala.time.zone', '-effect-dvala.sleep', 'perform', 'effect'],
    },
  },

  'dvala.time.zone': {
    handler: (_args: Arr, k: ContinuationStack): Step => {
      return { type: 'Value', value: Intl.DateTimeFormat().resolvedOptions().timeZone, k }
    },
    arity: toFixedArity(0),
    docs: {
      category: 'effect',
      description: 'Returns the current IANA timezone string, e.g. `"Europe/Stockholm"` or `"America/New_York"`.',
      returns: { type: 'string' },
      args: {},
      variants: [{ argumentNames: [] }],
      examples: [
        'perform(effect(dvala.time.zone))',
      ],
      seeAlso: ['-effect-dvala.time.now', 'perform', 'effect'],
    },
  },

  // ── Async ────────────────────────────────────────────────────────────────

  'dvala.sleep': {
    handler: (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Promise<Step> => {
      const ms = args[0]
      if (typeof ms !== 'number' || ms < 0) {
        throw new DvalaError(`dvala.sleep requires a non-negative number argument, got ${typeof ms === 'number' ? ms : typeof ms}`, sourceCodeInfo)
      }
      return new Promise<Step>((resolve) => {
        setTimeout(() => resolve({ type: 'Value', value: null, k }), ms)
      })
    },
    arity: toFixedArity(1),
    docs: {
      category: 'effect',
      description: 'Waits for the specified number of milliseconds before resuming. Resumes with `null`. Only works in async execution (`run`) — `runSync` will throw when a Promise surfaces.',
      returns: { type: 'null' },
      args: {
        ms: { type: 'number', description: 'The number of milliseconds to sleep. Must be a non-negative number.' },
      },
      variants: [{ argumentNames: ['ms'] }],
      examples: [
        'effect(dvala.sleep)',
      ],
      seeAlso: ['-effect-dvala.time.now', 'perform', 'effect'],
    },
  },

}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All standard effect names. */
export const standardEffectNames: ReadonlySet<string> = new Set(Object.keys(standardEffects))

/** All standard effect definitions (for reference data generation). */
export const allStandardEffectDefinitions: Readonly<Record<string, StandardEffectDefinition>> = standardEffects

/**
 * Look up a standard effect definition by name.
 * Returns undefined if the effect is not a standard effect.
 */
export function getStandardEffectDefinition(effectName: string): StandardEffectDefinition | undefined {
  return standardEffects[effectName]
}

/**
 * Look up a standard effect handler by name.
 * Validates arity before calling the handler.
 * Returns undefined if the effect is not a standard effect.
 */
export function getStandardEffectHandler(effectName: string): ((args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo) => Step | Promise<Step>) | undefined {
  const def = standardEffects[effectName]
  if (!def)
    return undefined

  return (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo) => {
    assertNumberOfParams(def.arity, args.length, sourceCodeInfo)
    return def.handler(args, k, sourceCodeInfo)
  }
}
