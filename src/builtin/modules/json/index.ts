import type { Any } from '../../../interface'
import { assertAny } from '../../../typeGuards/dvala'
import { assertNumber } from '../../../typeGuards/number'
import { assertString } from '../../../typeGuards/string'
import { toFixedArity } from '../../../utils/arity'
import type { BuiltinNormalExpressions } from '../../interface'
import { moduleDocsFromFunctions } from '../interface'
import type { DvalaModule } from '../interface'

const jsonFunctions: BuiltinNormalExpressions = {
  'jsonParse': {
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
      seeAlso: ['json.jsonStringify'],
      examples: [
        'let { jsonParse } = import(json);\njsonParse("[1, 2, 3]")',
      ],
    },
  },
  'jsonStringify': {
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
      seeAlso: ['json.jsonParse'],
      examples: [
        'let { jsonStringify } = import(json);\njsonStringify([1, 2, 3])',
        'let { jsonStringify } = import(json);\njsonStringify({ a: { b: 10 }}, 2)',
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
