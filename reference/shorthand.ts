import type { ShorthandReference } from '.'
import type { ShorthandName } from './api'

export const shorthand: Record<ShorthandName, ShorthandReference> = {
  '-short-regexp': {
    shorthand: true,
    title: '#"pattern"',
    category: 'shorthand',
    description: 'Shorthand for `regexp(pattern)`. Only difference is that escaping is not needed.',
    examples: [
      '#"^\\s*(.*)$"',
      '#"albert"ig',
    ],
    seeAlso: ['regexp', 're-match', 'replace', 'replace-all'],
  },
  '-short-fn': {
    shorthand: true,
    title: '-> expression',
    category: 'shorthand',
    description: `
Shorthand for \`(args, ...) -> expression\`.
\`$\` is the first argument, and \`$2, $3, ...\` are the second, third, ... argument.`,
    examples: [
      '-> $ + $2',
      '(-> $ * $)(9)',
    ],
  },
}
