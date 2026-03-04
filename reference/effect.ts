import type { EffectReference } from '.'

export type EffectName =
  | '-effect-dvala.io.print'
  | '-effect-dvala.io.println'
  | '-effect-dvala.io.error'
  | '-effect-dvala.io.read-line'
  | '-effect-dvala.io.read-stdin'
  | '-effect-dvala.random'
  | '-effect-dvala.random.uuid'
  | '-effect-dvala.random.int'
  | '-effect-dvala.random.item'
  | '-effect-dvala.random.shuffle'
  | '-effect-dvala.time.now'
  | '-effect-dvala.time.zone'
  | '-effect-dvala.sleep'

export const effect: Record<EffectName, EffectReference> = {
  // ── I/O ──────────────────────────────────────────────────────────────────

  '-effect-dvala.io.print': {
    effect: true,
    title: 'dvala.io.print',
    category: 'effect',
    description: 'Writes a value to stdout without a trailing newline. Accepts any value — strings are printed as-is, other values are auto-formatted. In Node.js uses `process.stdout.write(str)`, in browsers uses `console.log(str)`. Resumes with the original value (identity).',
    args: {
      value: { type: 'any', description: 'Value to print.' },
    },
    returns: { type: 'any' },
    examples: [
      'perform(effect(dvala.io.print), "hello")',
      'perform(effect(dvala.io.print), 42)',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.io.println': {
    effect: true,
    title: 'dvala.io.println',
    category: 'effect',
    description: 'Writes a value to stdout followed by a newline. Accepts any value — strings are printed as-is, other values are auto-formatted. In Node.js uses `process.stdout.write(str + "\\n")`, in browsers uses `console.log(str)`. Resumes with the original value (identity).',
    args: {
      value: { type: 'any', description: 'Value to print.' },
    },
    returns: { type: 'any' },
    examples: [
      'perform(effect(dvala.io.println), "hello")',
      'perform(effect(dvala.io.println), [1, 2, 3])',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.io.error': {
    effect: true,
    title: 'dvala.io.error',
    category: 'effect',
    description: 'Writes a value to stderr followed by a newline. Accepts any value — strings are printed as-is, other values are auto-formatted. In Node.js uses `process.stderr.write(str + "\\n")`, in browsers uses `console.error(str)`. Resumes with the original value (identity).',
    args: {
      value: { type: 'any', description: 'Value to write to stderr.' },
    },
    returns: { type: 'any' },
    examples: [
      'perform(effect(dvala.io.error), "something went wrong")',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.io.read-line': {
    effect: true,
    title: 'dvala.io.read-line',
    category: 'effect',
    description: 'Reads one line of user input. In browsers uses `window.prompt()`. In Node.js uses `readline`. Resumes with the user\'s input string, or `null` on cancel.',
    args: {
      message: { type: 'string', description: 'Prompt message to display.' },
    },
    returns: { type: 'string' },
    examples: [
      'effect(dvala.io.read-line)',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.io.read-stdin': {
    effect: true,
    title: 'dvala.io.read-stdin',
    category: 'effect',
    description: 'Reads all of stdin until EOF (Node.js only). Resumes with the full stdin content as a string.',
    args: {},
    returns: { type: 'string' },
    examples: [
      'effect(dvala.io.read-stdin)',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },

  // ── Random ───────────────────────────────────────────────────────────────

  '-effect-dvala.random': {
    effect: true,
    title: 'dvala.random',
    category: 'effect',
    description: 'Returns a random floating-point number in the range [0, 1). Equivalent to `Math.random()` in JavaScript.',
    args: {},
    returns: { type: 'number' },
    examples: [
      'perform(effect(dvala.random))',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.random.uuid': {
    effect: true,
    title: 'dvala.random.uuid',
    category: 'effect',
    description: 'Generates a UUID v4 string.',
    args: {},
    returns: { type: 'string' },
    examples: [
      'perform(effect(dvala.random.uuid))',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.random.int': {
    effect: true,
    title: 'dvala.random.int',
    category: 'effect',
    description: 'Returns a random integer in the range [min, max).',
    args: {
      min: { type: 'integer', description: 'Minimum value (inclusive).' },
      max: { type: 'integer', description: 'Maximum value (exclusive). Must be greater than min.' },
    },
    returns: { type: 'integer' },
    examples: [
      'perform(effect(dvala.random.int), 1, 100)',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.random.item': {
    effect: true,
    title: 'dvala.random.item',
    category: 'effect',
    description: 'Picks a random element from a non-empty array.',
    args: {
      array: { type: 'array', description: 'Non-empty array to pick from.' },
    },
    returns: { type: 'any' },
    examples: [
      'perform(effect(dvala.random.item), ["a", "b", "c"])',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.random.shuffle': {
    effect: true,
    title: 'dvala.random.shuffle',
    category: 'effect',
    description: 'Returns a new array with the elements of the input array in random order. Uses the Fisher-Yates shuffle algorithm.',
    args: {
      array: { type: 'array', description: 'Array to shuffle.' },
    },
    returns: { type: 'array' },
    examples: [
      'perform(effect(dvala.random.shuffle), [1, 2, 3, 4, 5])',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },

  // ── Time ─────────────────────────────────────────────────────────────────

  '-effect-dvala.time.now': {
    effect: true,
    title: 'dvala.time.now',
    category: 'effect',
    description: 'Returns the current timestamp in milliseconds since the Unix epoch. Equivalent to `Date.now()` in JavaScript.',
    args: {},
    returns: { type: 'number' },
    examples: [
      'perform(effect(dvala.time.now))',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.time.zone': {
    effect: true,
    title: 'dvala.time.zone',
    category: 'effect',
    description: 'Returns the current IANA timezone string, e.g. `"Europe/Stockholm"` or `"America/New_York"`.',
    args: {},
    returns: { type: 'string' },
    examples: [
      'perform(effect(dvala.time.zone))',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },

  // ── Async ────────────────────────────────────────────────────────────────

  '-effect-dvala.sleep': {
    effect: true,
    title: 'dvala.sleep',
    category: 'effect',
    description: 'Waits for the specified number of milliseconds before resuming. Resumes with `null`. Only works in async execution (`run`) — `runSync` will throw when a Promise surfaces.',
    args: {
      ms: {
        type: 'number',
        description: 'The number of milliseconds to sleep. Must be a non-negative number.',
      },
    },
    returns: { type: 'null' },
    examples: [
      'effect(dvala.sleep)',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },

}
