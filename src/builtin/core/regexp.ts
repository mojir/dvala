import { RuntimeError } from '../../errors'
import type { Arr } from '../../interface'
import type { RegularExpression } from '../../parser/types'
import { assertRegularExpression, assertStringOrRegularExpression, isRegularExpression } from '../../typeGuards/dvala'
import { assertString, isString } from '../../typeGuards/string'
import { toFixedArity } from '../../utils/arity'
import { PersistentVector } from '../../utils/persistent'
import { REGEXP_SYMBOL } from '../../utils/symbols'
import type { BuiltinNormalExpressions } from '../interface'

export const regexpNormalExpression: BuiltinNormalExpressions = {
  'regexp': {
    evaluate: ([sourceArg, flagsArg], sourceCodeInfo): RegularExpression => {
      assertString(sourceArg, sourceCodeInfo)
      const source = sourceArg || '(?:)'
      const flags = typeof flagsArg === 'string' ? flagsArg : ''

      try {

        new RegExp(source, flags) // Throws if invalid regexp
      } catch (_e) {
        throw new RuntimeError(`Invalid regular expression: ${source} ${flags}`, sourceCodeInfo)
      }
      return {
        [REGEXP_SYMBOL]: true,
        sourceCodeInfo,
        s: source,
        f: flags,
      }
    },
    arity: { min: 1, max: 2 },
    docs: {
      category: 'regular-expression',
      returns: { type: 'regexp' },
      args: {
        pattern: { type: 'string' },
        flags: { type: 'string', description: 'Optional flags for the regular expression. Possible values are the same as Javascript RegExp takes.' },
      },
      variants: [
        { argumentNames: ['pattern'] },
        { argumentNames: ['pattern', 'flags'] },
      ],
      description: 'Creates a RegExp from `pattern` and `flags`.',
      examples: [
        'regexp("^\\s*(.*)$")',
        '#"^\\s*(.*)$"',
        'regexp("albert", "ig")',
        '#"albert"ig',
      ],
      seeAlso: ['-short-regexp', 'reMatch', 'replace', 'replaceAll', 'isRegexp'],
      hideOperatorForm: true,
    },
  },
  'reMatch': {
    evaluate: ([text, regexp], sourceCodeInfo): Arr | null => {
      assertRegularExpression(regexp, sourceCodeInfo)
      if (!isString(text))
        return null

      const regExp = new RegExp(regexp.s, regexp.f)
      const match = regExp.exec(text)
      if (match)
        return PersistentVector.from([...match])

      return null
    },
    arity: toFixedArity(2),
    docs: {
      category: 'regular-expression',
      returns: { type: 'any' },
      args: {
        a: { type: 'regexp' },
        b: { type: 'string' },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: `Matches \`b\` against regular expression \`a\`.
If \`b\` is a string and matches the regular expression, a \`reMatch\`-array is returned, otherwise \`null\` is returned.`,
      seeAlso: ['regexp', 'replace', 'replaceAll', '-short-regexp', 'isRegexp'],
      examples: [
        'reMatch("  A string", regexp("^\\\\s*(.*)$"))',
        'reMatch("  A string", #"^\\s*(.*)$")',
        'reMatch("My name is Albert", #"albert"i)',
        'reMatch("My name is Ben", #"albert"i)',
        'reMatch(null, #"albert"i)',
        'reMatch(1, #"albert"i)',
        'reMatch({}, #"albert"i)',
      ],
    },
  },
  'replace': {
    evaluate: ([str, regexp, value], sourceCodeInfo): string => {
      assertString(str, sourceCodeInfo)
      assertStringOrRegularExpression(regexp, sourceCodeInfo)
      assertString(value, sourceCodeInfo)

      const matcher = isRegularExpression(regexp) ? new RegExp(regexp.s, `${regexp.f}`) : regexp
      return str.replace(matcher, value)
    },
    arity: toFixedArity(3),
    docs: {
      category: 'regular-expression',
      returns: { type: 'string' },
      args: {
        a: { type: 'string' },
        b: { type: ['regexp', 'string'] },
        x: { type: 'string' },
      },
      variants: [{ argumentNames: ['a', 'b', 'x'] }],
      description: 'Returns a new string with first match of regular expression `b` replaced by `x`.',
      seeAlso: ['replaceAll', 'regexp', 'reMatch', '-short-regexp'],
      examples: [
        'replace("Duck duck", "u", "i")',
        'replace("Duck duck", #"u", "i")',
        'replace("abcABC", regexp("a", "i"), "-")',
        'replace("abcABC", regexp("a", "gi"), "-")',
        'replace("abcABC", #"a"i, "-")',
        'replace("abcABC", #"a"gi, "-")',
      ],
    },
  },
  'replaceAll': {
    evaluate: ([str, regexp, value], sourceCodeInfo): string => {
      assertString(str, sourceCodeInfo)
      assertStringOrRegularExpression(regexp, sourceCodeInfo)
      assertString(value, sourceCodeInfo)
      const matcher = isRegularExpression(regexp) ? new RegExp(regexp.s, `${regexp.f.includes('g') ? regexp.f : `${regexp.f}g`}`) : regexp
      return str.replaceAll(matcher, value)
    },
    arity: toFixedArity(3),
    docs: {
      category: 'regular-expression',
      returns: { type: 'string' },
      args: {
        a: { type: 'string' },
        b: { type: ['regexp', 'string'] },
        x: { type: 'string' },
      },
      variants: [{ argumentNames: ['a', 'b', 'x'] }],
      description: 'Returns a new string with all matches of regular expression `b` replaced by `x`.',
      seeAlso: ['replace', 'regexp', 'reMatch', '-short-regexp'],
      examples: [
        'replaceAll("Duck duck", "u", "i")',
        'replaceAll("Duck duck", regexp("u"), "i")',
        'replaceAll("abcABC", regexp("a", "i"), "-")',
        'replaceAll("abcABC", regexp("a", "gi"), "-")',
        'replaceAll("abcABC", #"a"i, "-")',
        'replaceAll("abcABC", #"a"gi, "-")',
      ],
    },
  },
}
