import type { EffectReference } from '.'

export type EffectName =
  | '-effect-dvala.log'
  | '-effect-dvala.now'
  | '-effect-dvala.random'
  | '-effect-dvala.sleep'

export const effect: Record<EffectName, EffectReference> = {
  '-effect-dvala.log': {
    effect: true,
    title: 'dvala.log',
    category: 'effect',
    description: 'Logs arguments to the console. Resumes with the logged value.',
    args: {
      value: {
        type: 'any',
        description: 'Value to log.',
      },
    },
    returns: { type: 'any' },
    examples: [
      'perform(effect(dvala.log), "hello")',
      'perform(effect(dvala.log), 1, 2, 3)',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
  '-effect-dvala.now': {
    effect: true,
    title: 'dvala.now',
    category: 'effect',
    description: 'Returns the current timestamp in milliseconds since the Unix epoch. Equivalent to `Date.now()` in JavaScript.',
    args: {},
    returns: { type: 'number' },
    examples: [
      'perform(effect(dvala.now))',
    ],
    seeAlso: ['perform', 'effect', 'block'],
  },
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
