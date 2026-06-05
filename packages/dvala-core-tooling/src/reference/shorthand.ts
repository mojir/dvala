import type { ShorthandReference } from '.'
import type { ShorthandName } from './api'
import { snippet } from './dvala'

export const shorthand: Record<ShorthandName, ShorthandReference> = {
  '-short-regexp': {
    shorthand: true,
    title: '#"pattern"',
    category: 'shorthand',
    description: 'Shorthand for `regexp(pattern)`. Only difference is that escaping is not needed.',
    examples: [snippet('#"^\\s*(.*)$"'), snippet('#"albert"ig')],
    seeAlso: ['regexp', 'reMatch', 'replace', 'replaceAll'],
  },
  '-short-fn': {
    shorthand: true,
    title: '-> expression',
    category: 'shorthand',
    description: `
Shorthand for \`(args, ...) -> expression\`.
\`$\` is the first argument, and \`$2, $3, ...\` are the second, third, ... argument.`,
    examples: [snippet('-> $ + $2'), snippet('(-> $ * $)(9)')],
  },
  '-short-object': {
    shorthand: true,
    title: '{ foo }',
    category: 'shorthand',
    description: 'Shorthand for `{ foo: foo }`. When a key and variable name are the same, you can omit the value.',
    examples: [snippet('let x = 1; let y = 2; { x, y }'), snippet('let name = "Alice"; let age = 30; { name, age }')],
  },
}
