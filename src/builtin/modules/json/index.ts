import type { Any } from '../../../interface'
import { assertAny } from '../../../typeGuards/dvala'
import { assertNumber } from '../../../typeGuards/number'
import { assertString } from '../../../typeGuards/string'
import { toFixedArity } from '../../../utils/arity'
import type { BuiltinNormalExpressions } from '../../interface'
import { moduleDocsFromFunctions } from '../interface'
import type { DvalaModule } from '../interface'

const jsonFunctions: BuiltinNormalExpressions = {
  'json-parse': {
    evaluate: ([first], sourceCodeInfo): Any => {
      assertString(first, sourceCodeInfo)

      return JSON.parse(first)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'json',
      returns: { type: 'any' },
      args: { x: { type: 'string' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns `JSON.parse(`$x`)`.',
      seeAlso: ['json.json-stringify'],
      examples: [
        'let { json-parse } = import(json);\njson-parse("[1, 2, 3]")',
      ],
    },
  },
  'json-stringify': {
    evaluate: ([first, second], sourceCodeInfo): string => {
      assertAny(first, sourceCodeInfo)
      if (second === undefined)
        return JSON.stringify(first)

      assertNumber(second, sourceCodeInfo)
      return JSON.stringify(first, null, second)
    },
    arity: { min: 1, max: 2 },
    docs: {
      category: 'json',
      returns: { type: 'string' },
      args: {
        x: { type: 'any' },
        indent: { type: 'integer', description: 'Number of spaces to use for indentation.' },
      },
      variants: [
        { argumentNames: ['x'] },
        { argumentNames: ['x', 'indent'] },
      ],
      description: 'Returns `JSON.stringify(`$x`)`. If second argument is provided, returns `JSON.stringify(`$x`, null, `$indent`)`.',
      seeAlso: ['json.json-parse'],
      examples: [
        'let { json-stringify } = import(json);\njson-stringify([1, 2, 3])',
        'let { json-stringify } = import(json);\njson-stringify({ a: { b: 10 }}, 2)',
      ],
      hideOperatorForm: true,
    },
  },
}

export const jsonModule: DvalaModule = {
  name: 'json',
  functions: jsonFunctions,
  source: '{}',
  docs: moduleDocsFromFunctions(jsonFunctions),
}
