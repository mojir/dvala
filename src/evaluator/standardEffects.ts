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
 * Async effects (`dvala.sleep`, `dvala.io.read` in Node, `dvala.io.read-stdin`) only work in `run` —
 * `runSync` will throw when a Promise surfaces.
 */

import { DvalaError } from '../errors'
import type { Arity, FunctionDocs } from '../builtin/interface'
import type { Any, UnknownRecord } from '../interface'
import { isEffect, isRegularExpression } from '../typeGuards/dvala'
import { isDvalaFunction } from '../typeGuards/dvalaFunction'
import { toFixedArity } from '../utils/arity'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { ContinuationStack } from './frames'
import type { Step } from './step'

// ---------------------------------------------------------------------------
// Standard effect definition type
// ---------------------------------------------------------------------------

/**
 * A standard effect handler returns the next step directly.
 * Sync effects return `Step`, async effects return `Promise<Step>`.
 */
type StandardEffectHandlerFn = (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo) => Step | Promise<Step>

/**
 * A standard effect definition — mirrors BuiltinNormalExpression structure.
 * Each effect has a handler function, arity for validation, and co-located docs.
 */
export interface StandardEffectDefinition {
  handler?: StandardEffectHandlerFn
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

function printHandler(arg: Any, k: ContinuationStack): Step {
  const value = arg
  const str = formatForOutput(value)
  if (isNode()) {
    process.stdout.write(str)
  } else {
    // eslint-disable-next-line no-console
    console.log(str)
  }
  return { type: 'Value', value, k }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0
    const value = char === 'x' ? random : (random & 0x3 | 0x8)
    return value.toString(16)
  })
}

// ---------------------------------------------------------------------------
// Standard effect name union — add new effects here
// ---------------------------------------------------------------------------

type StandardEffectName =
  | 'dvala.io.print'
  | 'dvala.io.error'
  | 'dvala.io.read'
  | 'dvala.io.pick'
  | 'dvala.io.confirm'
  | 'dvala.io.read-stdin'
  | 'dvala.random'
  | 'dvala.random.uuid'
  | 'dvala.random.int'
  | 'dvala.random.item'
  | 'dvala.random.shuffle'
  | 'dvala.time.now'
  | 'dvala.time.zone'
  | 'dvala.checkpoint'
  | 'dvala.sleep'

// ---------------------------------------------------------------------------
// Standard effect definitions (handler + arity + docs)
// ---------------------------------------------------------------------------

const standardEffects: Record<StandardEffectName, StandardEffectDefinition> = {

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
        { code: 'perform(@dvala.io.print, "hello")', noRun: true },
        { code: 'perform(@dvala.io.print, 42)', noRun: true },
      ],
      seeAlso: ['-effect-dvala.io.error', '-effect-dvala.io.read', 'perform', 'effect'],
    },
  },

  'dvala.io.error': {
    handler: (arg: Any, k: ContinuationStack): Step => {
      const str = formatForOutput(arg)
      if (isNode()) {
        process.stderr.write(`${str}\n`)
      } else {
        // eslint-disable-next-line no-console
        console.error(str)
      }
      return { type: 'Value', value: arg, k }
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
        { code: 'perform(@dvala.io.error, "something went wrong")', noRun: true },
      ],
      seeAlso: ['-effect-dvala.io.print', 'perform', 'effect'],
    },
  },

  'dvala.io.read': {
    handler: (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const message = typeof arg === 'string' ? arg : ''

      // Browser: window.prompt (synchronous)
      if (typeof globalThis.prompt === 'function') {

        const result = globalThis.prompt(message)
        return { type: 'Value', value: result ?? null, k }
      }

      throw new DvalaError('dvala.io.read is not supported in this environment. In Node.js, register a "dvala.io.read" host handler.', sourceCodeInfo)
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
        '@dvala.io.read',
      ],
      seeAlso: ['-effect-dvala.io.read-stdin', '-effect-dvala.io.print', '-effect-dvala.io.pick', '-effect-dvala.io.confirm', 'perform', 'effect'],
    },
  },

  'dvala.io.pick': {
    handler: (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const argObj = arg as UnknownRecord
      const items = argObj?.['items']
      const options = argObj?.['options']

      if (!Array.isArray(items)) {
        throw new DvalaError(`dvala.io.pick: first argument must be an array, got ${typeof items}`, sourceCodeInfo)
      }
      if (items.length === 0) {
        throw new DvalaError('dvala.io.pick: items array must not be empty', sourceCodeInfo)
      }
      for (let i = 0; i < items.length; i++) {
        if (typeof items[i] !== 'string') {
          throw new DvalaError(`dvala.io.pick: items[${i}] must be a string, got ${typeof items[i]}`, sourceCodeInfo)
        }
      }

      let promptMessage: string | undefined
      let defaultIndex: number | undefined

      if (options !== undefined) {
        if (typeof options !== 'object' || options === null || Array.isArray(options)) {
          throw new DvalaError(`dvala.io.pick: second argument must be an object, got ${typeof options}`, sourceCodeInfo)
        }
        const opts = options as UnknownRecord
        if (opts['prompt'] !== undefined) {
          if (typeof opts['prompt'] !== 'string') {
            throw new DvalaError('dvala.io.pick: options.prompt must be a string', sourceCodeInfo)
          }
          promptMessage = opts['prompt']
        }
        if (opts['default'] !== undefined) {
          if (typeof opts['default'] !== 'number' || !Number.isInteger(opts['default'])) {
            throw new DvalaError('dvala.io.pick: options.default must be an integer', sourceCodeInfo)
          }
          defaultIndex = opts['default']
          if (defaultIndex < 0 || defaultIndex >= items.length) {
            throw new DvalaError(`dvala.io.pick: options.default (${defaultIndex}) is out of bounds for array of length ${items.length}`, sourceCodeInfo)
          }
        }
      }

      // Browser: window.prompt (synchronous)
      if (typeof globalThis.prompt === 'function') {
        const listLines = (items as string[]).map((item, i) => `${i}: ${item}`).join('\n')
        const header = promptMessage ?? 'Choose an item:'
        const defaultHint = defaultIndex !== undefined ? ` [default: ${defaultIndex}]` : ''
        const message = `${header}${defaultHint}\n${listLines}`

        const result = globalThis.prompt(message)
        if (result === null) {
          return { type: 'Value', value: null, k }
        }
        const trimmed = result.trim()
        if (trimmed === '') {
          return { type: 'Value', value: defaultIndex !== undefined ? defaultIndex : null, k }
        }
        const parsed = Number(trimmed)
        if (!Number.isInteger(parsed) || parsed < 0 || parsed >= items.length) {
          throw new DvalaError(`dvala.io.pick: invalid selection "${trimmed}"`, sourceCodeInfo)
        }
        return { type: 'Value', value: parsed, k }
      }

      throw new DvalaError('dvala.io.pick is not supported in this environment. In Node.js, register a "dvala.io.pick" host handler.', sourceCodeInfo)
    },
    arity: { min: 1, max: 2 },
    docs: {
      category: 'effect',
      description: 'Presents a numbered list of items and asks the user to choose one. In browsers uses `window.prompt()`. In Node.js, register a host handler. Resumes with the index of the chosen item, or `null` if the user cancels.',
      returns: { type: ['integer', 'null'] },
      args: {
        items: { type: 'array', description: 'Non-empty array of strings to display.' },
        options: { type: 'object', description: 'Optional settings: `prompt` (string label) and `default` (integer index to use when the user submits an empty input).' },
      },
      variants: [
        { argumentNames: ['items'] },
        { argumentNames: ['items', 'options'] },
      ],
      examples: [
        '@dvala.io.pick',
      ],
      seeAlso: ['-effect-dvala.io.read', '-effect-dvala.io.confirm', 'perform', 'effect'],
    },
  },

  'dvala.io.confirm': {
    handler: (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const argObj = arg as UnknownRecord
      const question = typeof arg === 'string' ? arg : argObj?.['question']
      const options = typeof arg === 'string' ? undefined : argObj?.['options']

      if (typeof question !== 'string') {
        throw new DvalaError(`dvala.io.confirm: first argument must be a string, got ${typeof question}`, sourceCodeInfo)
      }

      if (options !== undefined) {
        if (typeof options !== 'object' || options === null || Array.isArray(options)) {
          throw new DvalaError(`dvala.io.confirm: second argument must be an object, got ${typeof options}`, sourceCodeInfo)
        }
        const opts = options as UnknownRecord
        if (opts['default'] !== undefined && typeof opts['default'] !== 'boolean') {
          throw new DvalaError('dvala.io.confirm: options.default must be a boolean', sourceCodeInfo)
        }
      }

      // Browser: window.confirm (synchronous)
      if (typeof globalThis.confirm === 'function') {
        return { type: 'Value', value: globalThis.confirm(question), k }
      }

      throw new DvalaError('dvala.io.confirm is not supported in this environment. In Node.js, register a "dvala.io.confirm" host handler.', sourceCodeInfo)
    },
    arity: { min: 1, max: 2 },
    docs: {
      category: 'effect',
      description: 'Asks the user a yes/no question. In browsers uses `window.confirm()` and returns `true` (OK) or `false` (Cancel). In Node.js, register a host handler. The optional `default` hints the preferred answer to host handlers (e.g. for rendering `[Y/n]` in a CLI), but has no effect on the browser implementation.',
      returns: { type: 'boolean' },
      args: {
        question: { type: 'string', description: 'The yes/no question to present.' },
        options: { type: 'object', description: 'Optional settings: `default` (boolean, hints the preferred answer for host handlers).' },
      },
      variants: [
        { argumentNames: ['question'] },
        { argumentNames: ['question', 'options'] },
      ],
      examples: [
        '@dvala.io.confirm',
      ],
      seeAlso: ['-effect-dvala.io.read', '-effect-dvala.io.pick', 'perform', 'effect'],
    },
  },

  'dvala.io.read-stdin': {
    handler: (_arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Promise<Step> => {
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
        '@dvala.io.read-stdin',
      ],
      seeAlso: ['-effect-dvala.io.read', 'perform', 'effect'],
    },
  },

  // ── Random ───────────────────────────────────────────────────────────────

  'dvala.random': {
    handler: (_arg: Any, k: ContinuationStack): Step => {
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
        'perform(@dvala.random)',
      ],
      seeAlso: ['-effect-dvala.random.int', '-effect-dvala.random.uuid', '-effect-dvala.random.item', '-effect-dvala.random.shuffle', 'perform', 'effect'],
    },
  },

  'dvala.random.uuid': {
    handler: (_arg: Any, k: ContinuationStack): Step => {
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
        'perform(@dvala.random.uuid)',
      ],
      seeAlso: ['-effect-dvala.random', 'perform', 'effect'],
    },
  },

  'dvala.random.int': {
    handler: (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const a = Array.isArray(arg) ? arg : []
      const min = a[0]
      const max = a[1]
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
    arity: toFixedArity(1),
    docs: {
      category: 'effect',
      description: 'Returns a random integer in the range [min, max). Pass a two-element array `[min, max]`.',
      returns: { type: 'integer' },
      args: {
        range: { type: 'array', description: 'A two-element array [min, max] where min is inclusive and max is exclusive. Both must be integers with max > min.' },
      },
      variants: [{ argumentNames: ['range'] }],
      examples: [
        'perform(@dvala.random.int, [1, 100])',
      ],
      seeAlso: ['-effect-dvala.random', '-effect-dvala.random.item', 'perform', 'effect'],
    },
  },

  'dvala.random.item': {
    handler: (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      const array = arg
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
        'perform(@dvala.random.item, ["a", "b", "c"])',
      ],
      seeAlso: ['-effect-dvala.random', '-effect-dvala.random.shuffle', '-effect-dvala.random.int', 'perform', 'effect'],
    },
  },

  'dvala.random.shuffle': {
    handler: (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
      if (!Array.isArray(arg)) {
        throw new DvalaError(`dvala.random.shuffle: argument must be an array, got ${typeof arg}`, sourceCodeInfo)
      }
      const shuffled: Any[] = Array.from(arg) as Any[]
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
        'perform(@dvala.random.shuffle, [1, 2, 3, 4, 5])',
      ],
      seeAlso: ['-effect-dvala.random', '-effect-dvala.random.item', 'perform', 'effect'],
    },
  },

  // ── Time ─────────────────────────────────────────────────────────────────

  'dvala.time.now': {
    handler: (_arg: Any, k: ContinuationStack): Step => {
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
        'perform(@dvala.time.now)',
      ],
      seeAlso: ['-effect-dvala.time.zone', '-effect-dvala.sleep', 'perform', 'effect'],
    },
  },

  'dvala.time.zone': {
    handler: (_arg: Any, k: ContinuationStack): Step => {
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
        'perform(@dvala.time.zone)',
      ],
      seeAlso: ['-effect-dvala.time.now', 'perform', 'effect'],
    },
  },

  // ── Snapshot ──────────────────────────────────────────────────────────────

  'dvala.checkpoint': {
    // The actual snapshot capture is handled as a special case in dispatchPerform
    // (unconditional capture before normal dispatch). No handler here — checkpoint
    // propagates through the normal handler chain (local, host, wildcard).
    // If completely unhandled, dispatchPerform resolves it to null.
    arity: toFixedArity(1),
    docs: {
      category: 'effect',
      description: 'Captures a snapshot of the current program state (continuation stack). The snapshot is stored in an in-memory list accessible via `ctx.snapshots` in host handlers. Takes a mandatory message string. The standard fallback resumes with `null`, but host handlers can override the resume value. The snapshot is always captured regardless of whether a handler intercepts.',
      returns: { type: 'null' },
      args: {
        message: { type: 'string', description: 'A human-readable label for the checkpoint.' },
      },
      variants: [
        { argumentNames: ['message'] },
      ],
      examples: [
        'perform(@dvala.checkpoint, "init")',
        'perform(@dvala.checkpoint, "analysis-done")',
      ],
      seeAlso: ['perform', 'effect'],
    },
  },

  // ── Async ────────────────────────────────────────────────────────────────

  'dvala.sleep': {
    handler: (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Promise<Step> => {
      const ms = arg
      if (typeof ms !== 'number' || ms < 0) {
        throw new DvalaError(`dvala.sleep requires a non-negative number argument, got ${typeof ms === 'number' ? ms : typeof ms}`, sourceCodeInfo)
      }
      return new Promise<Step>(resolve => {
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
        '@dvala.sleep',
      ],
      seeAlso: ['-effect-dvala.time.now', 'perform', 'effect'],
    },
  },

}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type { StandardEffectName }

/** All standard effect names. */
export const standardEffectNames: ReadonlySet<string> = new Set(Object.keys(standardEffects))

/** All standard effect definitions (for reference data generation). */
export const allStandardEffectDefinitions: Readonly<Record<string, StandardEffectDefinition>> = standardEffects

/**
 * Look up a standard effect definition by name.
 * Returns undefined if the effect is not a standard effect.
 */
export function getStandardEffectDefinition(effectName: string): StandardEffectDefinition | undefined {
  return (standardEffects as Record<string, StandardEffectDefinition>)[effectName]
}

/**
 * Look up a standard effect handler by name.
 * Validates arity before calling the handler.
 * Returns undefined if the effect is not a standard effect.
 */
export function getStandardEffectHandler(effectName: string): ((arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo) => Step | Promise<Step>) | undefined {
  const def = (standardEffects as Record<string, StandardEffectDefinition>)[effectName]
  const handler = def?.handler
  if (!handler)
    return undefined

  return (arg: Any, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo) => {
    return handler(arg, k, sourceCodeInfo)
  }
}
