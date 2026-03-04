/**
 * Standard effects — built-in effects with default implementations.
 *
 * These effects are always available without requiring explicit host handlers.
 * Host handlers can override them (host handlers take priority in the lookup order).
 *
 * Lookup order: local try/with → host handlers → standard effects → unhandled error
 *
 * Standard effects:
 *
 * I/O:
 * - `dvala.io.print`     — sync: stdout write (no newline); browser: console.log
 * - `dvala.io.println`   — sync: stdout write + newline; browser: console.log
 * - `dvala.io.error`     — sync: stderr write + newline; browser: console.error
 * - `dvala.io.read-line` — sync (browser) / async (node): reads one line of user input
 * - `dvala.io.read-stdin` — async (node only): reads all of stdin until EOF
 *
 * Random:
 * - `dvala.random`      — sync: Math.random(), float in [0, 1)
 * - `dvala.random.uuid` — sync: UUID v4 string
 * - `dvala.random.int`  — sync: random integer in [min, max)
 * - `dvala.random.item`    — sync: random element from array
 * - `dvala.random.shuffle` — sync: Fisher-Yates shuffle of array
 *
 * Time:
 * - `dvala.time.now`  — sync: Date.now(), ms since epoch
 * - `dvala.time.zone` — sync: IANA timezone string
 *
 * Async:
 * - `dvala.sleep`     — async: setTimeout(resolve, ms), resumes with null
 *
 * Sync effects work in both `runSync` and `run`.
 * Async effects (`dvala.sleep`, `dvala.io.read-line` in Node, `dvala.io.read-stdin`) only work in `run` —
 * `runSync` will throw when a Promise surfaces.
 */

import { DvalaError } from '../errors'
import type { Any, Arr, UnknownRecord } from '../interface'
import { isEffect, isRegularExpression } from '../typeGuards/dvala'
import { isDvalaFunction } from '../typeGuards/dvalaFunction'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { ContinuationStack } from './frames'
import type { Step } from './step'

/* eslint-disable node/prefer-global/process -- isomorphic module: uses `typeof process` for Node/browser feature detection */

// ---------------------------------------------------------------------------
// Standard effect handler type
// ---------------------------------------------------------------------------

/**
 * A standard effect handler returns the next step directly.
 * Sync effects return `Step`, async effects return `Promise<Step>`.
 */
type StandardEffectHandler = (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo) => Step | Promise<Step>

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

function stdoutHandler(newline: boolean) {
  const name = newline ? 'dvala.io.println' : 'dvala.io.print'
  return (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
    if (args.length !== 1) {
      throw new DvalaError(`${name} expects exactly 1 argument, got ${args.length}`, sourceCodeInfo)
    }
    const value = args[0] as Any
    const str = formatForOutput(value)
    if (isNode()) {
      process.stdout.write(newline ? `${str}\n` : str)
    }
    else {
      // eslint-disable-next-line no-console
      console.log(str)
    }
    return { type: 'Value', value, k }
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0
    const value = char === 'x' ? random : (random & 0x3 | 0x8)
    return value.toString(16)
  })
}

// ---------------------------------------------------------------------------
// Standard effect implementations
// ---------------------------------------------------------------------------

const standardEffectHandlers: Record<string, StandardEffectHandler> = {

  // ── I/O ──────────────────────────────────────────────────────────────────

  /**
   * `dvala.io.print` — Write a value to stdout without a trailing newline.
   * In Node.js: `process.stdout.write(str)`.
   * In browsers: `console.log(str)`.
   * Resumes with the original value (identity).
   */
  'dvala.io.print': stdoutHandler(false),

  /**
   * `dvala.io.println` — Write a value to stdout followed by a newline.
   * In Node.js: `process.stdout.write(str + "\n")`.
   * In browsers: `console.log(str)`.
   * Resumes with the original value (identity).
   */
  'dvala.io.println': stdoutHandler(true),

  /**
   * `dvala.io.error` — Write a value to stderr followed by a newline.
   * In Node.js: `process.stderr.write(str + "\n")`.
   * In browsers: `console.error(str)`.
   * Resumes with the original value (identity).
   */
  'dvala.io.error': (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
    if (args.length !== 1) {
      throw new DvalaError(`dvala.io.error expects exactly 1 argument, got ${args.length}`, sourceCodeInfo)
    }
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

  /**
   * `dvala.io.read-line` — Read one line of user input.
   * Browser: uses window.prompt() (sync). Resumes with the input string or null on cancel.
   * Node.js: register a 'dvala.io.read-line' host handler (e.g. via readline).
   * Throws if not in a browser and no host handler is registered.
   */
  'dvala.io.read-line': (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
    const message = typeof args[0] === 'string' ? args[0] : ''

    // Browser: window.prompt (synchronous)
    if (typeof globalThis.prompt === 'function') {
      // eslint-disable-next-line no-alert
      const result = globalThis.prompt(message)
      return { type: 'Value', value: result ?? null, k }
    }

    throw new DvalaError('dvala.io.read-line is not supported in this environment. In Node.js, register a "dvala.io.read-line" host handler.', sourceCodeInfo)
  },

  /**
   * `dvala.io.read-stdin` — Read all of stdin until EOF.
   * Node.js only — throws in browsers.
   * Resumes with the full stdin content as a string.
   * Only works in `run()` (async).
   */
  'dvala.io.read-stdin': (_args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Promise<Step> => {
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

  // ── Random ───────────────────────────────────────────────────────────────

  /**
   * `dvala.random` — Random float in [0, 1).
   * Equivalent to `Math.random()`.
   */
  'dvala.random': (_args: Arr, k: ContinuationStack): Step => {
    return { type: 'Value', value: Math.random(), k }
  },

  /**
   * `dvala.random.uuid` — Generate a UUID v4 string.
   */
  'dvala.random.uuid': (_args: Arr, k: ContinuationStack): Step => {
    return { type: 'Value', value: generateUUID(), k }
  },

  /**
   * `dvala.random.int` — Random integer in [min, max).
   * Args: min (integer), max (integer, > min).
   */
  'dvala.random.int': (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
    if (args.length !== 2) {
      throw new DvalaError(`dvala.random.int expects exactly 2 arguments (min, max), got ${args.length}`, sourceCodeInfo)
    }
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

  /**
   * `dvala.random.item` — Pick a random element from an array.
   * Args: array (non-empty).
   */
  'dvala.random.item': (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
    if (args.length !== 1) {
      throw new DvalaError(`dvala.random.item expects exactly 1 argument (array), got ${args.length}`, sourceCodeInfo)
    }
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

  /**
   * `dvala.random.shuffle` — Return a new array with elements in random order.
   * Uses the Fisher-Yates shuffle algorithm.
   * Args: array.
   */
  'dvala.random.shuffle': (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Step => {
    if (args.length !== 1) {
      throw new DvalaError(`dvala.random.shuffle expects exactly 1 argument (array), got ${args.length}`, sourceCodeInfo)
    }
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

  // ── Time ─────────────────────────────────────────────────────────────────

  /**
   * `dvala.time.now` — Current timestamp in milliseconds since epoch.
   * Equivalent to `Date.now()`.
   */
  'dvala.time.now': (_args: Arr, k: ContinuationStack): Step => {
    return { type: 'Value', value: Date.now(), k }
  },

  /**
   * `dvala.time.zone` — Current IANA timezone string.
   * E.g. "Europe/Stockholm", "America/New_York".
   */
  'dvala.time.zone': (_args: Arr, k: ContinuationStack): Step => {
    return { type: 'Value', value: Intl.DateTimeFormat().resolvedOptions().timeZone, k }
  },

  // ── Async ────────────────────────────────────────────────────────────────

  /**
   * `dvala.sleep` — Wait for a specified number of milliseconds.
   * Resumes with null after the delay.
   * Only works in `run()` (async) — `runSync()` will throw.
   */
  'dvala.sleep': (args: Arr, k: ContinuationStack, sourceCodeInfo?: SourceCodeInfo): Promise<Step> => {
    const ms = args[0]
    if (typeof ms !== 'number' || ms < 0) {
      throw new DvalaError(`dvala.sleep requires a non-negative number argument, got ${typeof ms === 'number' ? ms : typeof ms}`, sourceCodeInfo)
    }
    return new Promise<Step>((resolve) => {
      setTimeout(() => resolve({ type: 'Value', value: null, k }), ms)
    })
  },

}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All standard effect names. */
export const standardEffectNames: ReadonlySet<string> = new Set(Object.keys(standardEffectHandlers))

/**
 * Look up a standard effect handler by name.
 * Returns undefined if the effect is not a standard effect.
 */
export function getStandardEffectHandler(effectName: string): StandardEffectHandler | undefined {
  return standardEffectHandlers[effectName]
}
