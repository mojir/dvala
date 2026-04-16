import { assertNumber } from '../../../typeGuards/number'
import { assertString } from '../../../typeGuards/string'
import { toFixedArity } from '../../../utils/arity'
import type { BuiltinNormalExpressions } from '../../interface'
import { moduleDocsFromFunctions } from '../interface'
import type { DvalaModule } from '../interface'

const timeFunctions: BuiltinNormalExpressions = {
  'epochToIsoDate': {
    evaluate: ([ms], sourceCodeInfo): string => {
      assertNumber(ms, sourceCodeInfo)
      return new Date(ms).toISOString()
    },
    arity: toFixedArity(1),
    docs: {
      type: '(Number) -> String',
      category: 'time',
      returns: { type: 'string' },
      args: { ms: { type: 'number' } },
      variants: [{ argumentNames: ['ms'] }],
      description: 'Returns IOS date time string from `ms` (milliseconds elapsed since the UNIX epoch).',
      seeAlso: ['time.isoDateToEpoch'],
      examples: [
        'let { epochToIsoDate } = import("time");\nepochToIsoDate(1649756230899)',
        'let { epochToIsoDate } = import("time");\nepochToIsoDate(0)',
      ],
    },
  },
  'isoDateToEpoch': {
    evaluate: ([dateTime], sourceCodeInfo): number => {
      assertString(dateTime, sourceCodeInfo)
      const ms = new Date(dateTime).valueOf()
      assertNumber(ms, sourceCodeInfo, { finite: true })
      return ms
    },
    arity: toFixedArity(1),
    docs: {
      type: '(String) -> Number',
      category: 'time',
      returns: { type: 'number' },
      args: { iso: { type: 'string' } },
      variants: [{ argumentNames: ['iso'] }],
      description: 'Returns milliseconds elapsed since the UNIX epoch to `iso`.',
      seeAlso: ['time.epochToIsoDate'],
      examples: [
        'let { isoDateToEpoch } = import("time");\nisoDateToEpoch("2022-04-12T09:37:10.899Z")',
        'let { isoDateToEpoch } = import("time");\nisoDateToEpoch("1980-01-01")',
      ],
    },
  },
}

export const timeModule: DvalaModule = {
  name: 'time',
  description: 'Date and time formatting, parsing, and calendar utilities.',
  functions: timeFunctions,
  source: '{}',
  docs: moduleDocsFromFunctions(timeFunctions),
}
