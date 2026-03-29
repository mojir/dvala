import { DvalaError } from '../../../errors'
import { asNonUndefined } from '../../../typeGuards'
import { assertArray } from '../../../typeGuards/array'
import { assertNumber } from '../../../typeGuards/number'
import { asStringOrNumber, assertString } from '../../../typeGuards/string'
import { toNonNegativeInteger } from '../../../utils'
import { toFixedArity } from '../../../utils/arity'
import type { BuiltinNormalExpressions } from '../../interface'
import type { DvalaModule } from '../interface'
import { moduleDocsFromFunctions } from '../interface'
import type { SourceCodeInfo } from '../../../tokenizer/token'
import stringModuleSource from './string.dvala'

const stringUtilsFunctions: BuiltinNormalExpressions = {
  'stringRepeat': {
    evaluate: ([str, count], sourceCodeInfo): string => {
      assertString(str, sourceCodeInfo)
      assertNumber(count, sourceCodeInfo, { integer: true, nonNegative: true })

      return str.repeat(count)
    },
    arity: toFixedArity(2),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: {
        a: { type: 'string' },
        b: { type: 'integer' },
        s: { type: 'string' },
        n: { type: 'integer' },
      },
      variants: [{ argumentNames: ['s', 'n'] }],
      description: 'Repeates `s` `n` times.',
      seeAlso: ['str', 'repeat'],
      examples: [
        `let { stringRepeat } = import("string");
"*" stringRepeat 10`,
        `let { stringRepeat } = import("string");
stringRepeat("*", 10)`,
        `let { stringRepeat } = import("string");
stringRepeat("***", 0)`,
      ],
    },
  },

  'fromCharCode': {
    evaluate: ([num], sourceCodeInfo): string => {
      assertNumber(num, sourceCodeInfo, { finite: true })
      const int = toNonNegativeInteger(num)
      try {
        return String.fromCodePoint(int)
      } catch (error) {
        throw new DvalaError(error, sourceCodeInfo)
      }
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: { code: { type: 'number' } },
      variants: [{ argumentNames: ['code'] }],
      description: 'Return character for code point `code`.',
      seeAlso: ['string.toCharCode'],
      examples: [
        `let { fromCharCode } = import("string");
fromCharCode(65)`,
        `let { fromCharCode } = import("string");
fromCharCode(0)`,
      ],
    },
  },

  'toCharCode': {
    evaluate: ([str], sourceCodeInfo): number => {
      assertString(str, sourceCodeInfo, { nonEmpty: true })
      return asNonUndefined(str.codePointAt(0), sourceCodeInfo)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'number' },
      args: { c: { type: 'string' } },
      variants: [{ argumentNames: ['c'] }],
      description: 'Return code point for first character in `c`.',
      seeAlso: ['string.fromCharCode'],
      examples: [
        `let { toCharCode } = import("string");
toCharCode("A")`,
        `let { toCharCode } = import("string");
toCharCode("Albert")`,
      ],
    },
  },

  'trimLeft': {
    evaluate: ([str], sourceCodeInfo): string => {
      assertString(str, sourceCodeInfo)
      return str.replace(/^\s+/, '')
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: { s: { type: 'string' } },
      variants: [{ argumentNames: ['s'] }],
      description: 'Returns a new string with leading whitespaces removed.',
      seeAlso: ['trim', 'string.trimRight'],
      examples: [
        `let { trimLeft } = import("string");
trimLeft("  Albert  ")`,
        `let { trimLeft } = import("string");
trimLeft("   ")`,
        `let { trimLeft } = import("string");
trimLeft("")`,
      ],
    },
  },

  'trimRight': {
    evaluate: ([str], sourceCodeInfo): string => {
      assertString(str, sourceCodeInfo)
      return str.replace(/\s+$/, '')
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: { s: { type: 'string' } },
      variants: [{ argumentNames: ['s'] }],
      description: 'Returns a new string with trailing whitespaces removed.',
      seeAlso: ['trim', 'string.trimLeft'],
      examples: [
        `let { trimRight } = import("string");
trimRight("  Albert  ")`,
        `let { trimRight } = import("string");
trimRight("   ")`,
        `let { trimRight } = import("string");
trimRight("")`,
      ],
    },
  },

  'splitLines': {
    evaluate: ([str], sourceCodeInfo): string[] => {
      assertString(str, sourceCodeInfo)
      return str.split((/\r\n|\n|\r/)).filter(line => line !== '')
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string', array: true },
      args: { s: { type: 'string' } },
      variants: [{ argumentNames: ['s'] }],
      description: 'Divides `s` into an array of substrings, each representing a line.',
      seeAlso: ['split'],
      examples: [
        `let { splitLines } = import("string");
splitLines("Albert\nMojir\n")`,
        `let { splitLines } = import("string");
splitLines("Albert\n\nMojir")`,
        `let { splitLines } = import("string");
splitLines("Albert\nMojir\n\n")`,
        `let { splitLines } = import("string");
splitLines("")`,
      ],
    },
  },

  'padLeft': {
    evaluate: ([str, length, padString], sourceCodeInfo): string => {
      assertString(str, sourceCodeInfo)
      assertNumber(length, sourceCodeInfo, { integer: true })

      if (padString !== undefined)
        assertString(padString, sourceCodeInfo)

      return str.padStart(length, padString)
    },
    arity: { min: 2, max: 3 },
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: {
        a: { type: 'string' },
        b: { type: 'integer' },
        s: { type: 'string' },
        length: { type: 'integer' },
        padString: { type: 'string' },
      },
      variants: [
        { argumentNames: ['s', 'length'] },
        { argumentNames: ['s', 'length', 'padString'] },
      ],
      description: 'Pads from the start of `s` with `padString` (multiple times, if needed) until the resulting string reaches the given `length`.',
      seeAlso: ['string.padRight'],
      examples: [
        `let { padLeft } = import("string");
"Albert" padLeft 20`,
        `let { padLeft } = import("string");
padLeft("Albert", 20)`,
        `let { padLeft } = import("string");
padLeft("Albert", 20, "-*-")`,
        `let { padLeft } = import("string");
padLeft("Albert", 5)`,
        `let { padLeft } = import("string");
padLeft("Albert", -1)`,
      ],
    },
  },

  'padRight': {
    evaluate: ([str, length, padString], sourceCodeInfo): string => {
      assertString(str, sourceCodeInfo)
      assertNumber(length, sourceCodeInfo, { integer: true })

      if (padString !== undefined)
        assertString(padString, sourceCodeInfo)

      return str.padEnd(length, padString)
    },
    arity: { min: 2, max: 3 },
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: {
        a: { type: 'string' },
        b: { type: 'integer' },
        s: { type: 'string' },
        length: { type: 'integer' },
        padString: { type: 'string' },
      },
      variants: [
        { argumentNames: ['s', 'length'] },
        { argumentNames: ['s', 'length', 'padString'] },
      ],
      description: 'Pads from the start of `s` with `padString` (multiple times, if needed) until the resulting string reaches the given `length`.',
      seeAlso: ['string.padLeft'],
      examples: [
        `let { padRight } = import("string");
"Albert" padRight 20`,
        `let { padRight } = import("string");
padRight("Albert", 20)`,
        `let { padRight } = import("string");
padRight("Albert", 20, "-*-")`,
        `let { padRight } = import("string");
padRight("Albert", 5)`,
        `let { padRight } = import("string");
padRight("Albert", -1)`,
      ],
    },
  },

  'template': {
    evaluate: ([templateString, ...placeholders], sourceCodeInfo): string => {
      assertString(templateString, sourceCodeInfo)
      assertArray(placeholders, sourceCodeInfo)
      const templateStrings = templateString.split('||||')
      if (templateStrings.length <= 1) {
        return applyPlaceholders(templateStrings[0] as string, placeholders, sourceCodeInfo)
      } else {
        // Pluralisation
        const count = placeholders[0]
        assertNumber(count, sourceCodeInfo, { integer: true, nonNegative: true })
        const stringPlaceholders = [`${count}`, ...placeholders.slice(1)] as string[]
        if (templateStrings.length === 2) {
          // Exactly two valiants.
          // First variant (singular) for count = 1, Second variant (plural) for count = 0 or count > 1

          const placehoder = templateStrings[count === 1 ? 0 : 1] as string
          return applyPlaceholders(placehoder, stringPlaceholders, sourceCodeInfo)
        } else {
          // More than two variant:
          // Use count as index
          // If count >= number of variants, use last variant

          const placehoder = templateStrings[Math.min(count, templateStrings.length - 1)] as string
          return applyPlaceholders(placehoder, stringPlaceholders, sourceCodeInfo)
        }
      }
    },
    arity: { min: 1, max: 10 },
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: {
        s: { type: 'string' },
        params: { type: 'any', rest: true },
      },
      variants: [{ argumentNames: ['s', 'params'] }],
      description: 'Applies placeholders to a string. Support for basic pluralization - see examples. If pluralization is used, first placeholder must be a number.',
      seeAlso: ['str'],
      examples: [
        `let { template } = import("string");
template("Hi, $1 and $2", "Carl", "Larry")`,
        `let { template } = import("string");
template("Hi $1, $2, $3, $4, $5, $6, $7, $8 and $9", "A", "B", "C", "D", "E", "F", "G", "H", "I")`,
        `let { template } = import("string");
template("$1 book||||$1 books", 0)`,
        `let { template } = import("string");
template("$1 book||||$1 books", 1)`,
        `let { template } = import("string");
template("$1 book||||$1 books", 2)`,
        `let { template } = import("string");
template("No book||||$1 book||||$1 books", 0)`,
        `let { template } = import("string");
template("No book||||$1 book||||$1 books", 1)`,
        `let { template } = import("string");
template("No book||||$1 book||||$1 books", 10)`,
        `let { template } = import("string");
template("No book||||One book||||Two books||||Three books||||$1 books", 0)`,
        `let { template } = import("string");
template("No book||||One book||||Two books||||Three books||||$1 books", 1)`,
        `let { template } = import("string");
template("No book||||One book||||Two books||||Three books||||$1 books", 2)`,
        `let { template } = import("string");
template("No book||||One book||||Two books||||Three books||||$1 books", 3)`,
        `let { template } = import("string");
template("No book||||One book||||Two books||||Three books||||$1 books", 4)`,
      ],
      hideOperatorForm: true,
    },
  },

  'encodeBase64': {
    evaluate: ([value], sourceCodeInfo): string => {
      assertString(value, sourceCodeInfo)
      return btoa(
        encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_match, p1) => {

          return String.fromCharCode(Number.parseInt(p1, 16))
        }),
      )
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: { s: { type: 'string' } },
      variants: [{ argumentNames: ['s'] }],
      description: 'Returns a Base64 encoded string from `s`.',
      seeAlso: ['string.decodeBase64'],
      examples: [
        `let { encodeBase64 } = import("string");
encodeBase64("Albert")`,
      ],
    },
  },

  'decodeBase64': {
    evaluate: ([value], sourceCodeInfo): string => {
      assertString(value, sourceCodeInfo)
      try {
        return decodeURIComponent(
          Array.prototype.map
            .call(atob(value), c => {

              return `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`
            })
            .join(''),
        )
      } catch (error) {
        throw new DvalaError(error, sourceCodeInfo)
      }
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: { base64string: { type: 'string' } },
      variants: [{ argumentNames: ['base64string'] }],
      description: 'Returns a Base64 decoded string from `base64string`.',
      seeAlso: ['string.encodeBase64'],
      examples: [
        `let { decodeBase64 } = import("string");
decodeBase64("QWxiZXJ0IPCfkLs=")`,
      ],
    },
  },

  'encodeUriComponent': {
    evaluate: ([value], sourceCodeInfo): string => {
      assertString(value, sourceCodeInfo)
      return encodeURIComponent(value)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: { s: { type: 'string' } },
      variants: [{ argumentNames: ['s'] }],
      description: 'Returns an escaped `URI` string.',
      seeAlso: ['string.decodeUriComponent'],
      examples: [
        `let { encodeUriComponent } = import("string");
encodeUriComponent("Hi everyone!?")`,
      ],
    },
  },

  'decodeUriComponent': {
    evaluate: ([value], sourceCodeInfo): string => {
      assertString(value, sourceCodeInfo)
      try {
        return decodeURIComponent(value)
      } catch (error) {
        throw new DvalaError(error, sourceCodeInfo)
      }
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: { s: { type: 'string' } },
      variants: [{ argumentNames: ['s'] }],
      description: 'Returns an un-escaped `URI` string.',
      seeAlso: ['string.encodeUriComponent'],
      examples: [
        `let { decodeUriComponent } = import("string");
decodeUriComponent("Hi%20everyone!%3F%20%F0%9F%91%8D")`,
      ],
    },
  },

  'capitalize': {
    evaluate: ([str], sourceCodeInfo): string => {
      assertString(str, sourceCodeInfo)
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
    },
    arity: toFixedArity(1),
    docs: {
      category: 'string',
      returns: { type: 'string' },
      args: { s: { type: 'string' } },
      variants: [{ argumentNames: ['s'] }],
      description: 'Returns `s` with the first character converted to uppercase and the rest to lowercase.',
      seeAlso: ['lowerCase', 'upperCase'],
      examples: [
        `let { capitalize } = import("string");
capitalize("albert")`,
        `let { capitalize } = import("string");
capitalize("ALBERT")`,
        `let { capitalize } = import("string");
capitalize("aLBERT")`,
        `let { capitalize } = import("string");
capitalize("")`,
      ],
    },
  },
}

const doubleDollarRegexp = /\$\$/g
function applyPlaceholders(templateString: string, placeholders: unknown[], sourceCodeInfo?: SourceCodeInfo): string {
  for (let i = 0; i < 9; i += 1) {
    // Matches $1, $2, ..., $9
    // Does not match $$1
    // But does match $$$1, (since the two first '$' will later be raplaced with a single '$'
    const re = new RegExp(`(\\$\\$|[^$]|^)\\$${i + 1}`, 'g')
    if (re.test(templateString)) {
      const placeHolder = asStringOrNumber(placeholders[i], sourceCodeInfo)
      templateString = templateString.replace(re, `$1${placeHolder}`)
    }
  }
  templateString = templateString.replace(doubleDollarRegexp, '$')
  return templateString
}

export const stringUtilsModule: DvalaModule = {
  name: 'string',
  functions: stringUtilsFunctions,
  source: stringModuleSource,
  docs: moduleDocsFromFunctions(stringUtilsFunctions),
}
