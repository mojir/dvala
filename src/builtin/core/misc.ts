import { TypeError } from '../../errors'
import type { EffectMatcherFunction, QualifiedMatcherFunction } from '../../parser/types'
import type { SourceCodeInfo } from '../../tokenizer/token'
import { asAny, asEffect, isEffect, isRegularExpression } from '../../typeGuards/dvala'
import { isDvalaFunction, isMacroFunction } from '../../typeGuards/dvalaFunction'
import { asStringOrNumber, assertStringOrNumber } from '../../typeGuards/string'
import { compare, deepEqual } from '../../utils'
import { toFixedArity } from '../../utils/arity'
import { FUNCTION_SYMBOL } from '../../utils/symbols'
import type { BuiltinNormalExpressions } from '../interface'

function isEqual([first, ...rest]: unknown[], sourceCodeInfo: SourceCodeInfo | undefined) {
  const firstAny = asAny(first, sourceCodeInfo)
  for (const param of rest) {
    if (!deepEqual(firstAny, asAny(param, sourceCodeInfo), sourceCodeInfo))
      return false
  }
  return true
}

export const miscNormalExpression: BuiltinNormalExpressions = {
  '==': {
    evaluate: (params, sourceCodeInfo): boolean => {
      return isEqual(params, sourceCodeInfo)
    },
    arity: { min: 1 },
    docs: {
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'any' },
        b: { type: 'any' },
        x: { type: 'any' },
        ys: { type: 'any', rest: true },
      },
      variants: [
        { argumentNames: ['x'] },
        { argumentNames: ['x', 'ys'] },
      ],
      description: 'Returns `true` if all `values` are structaul equal to each other, otherwise result is `false`.',
      seeAlso: ['!='],
      examples: [
        '1 == 1',
        '[1, 2] == [1, 2]',
        `
{
 a: 1,
 b: 2,
} == {
 b: 2,
 a: 1,
}`,
        '==(1, 1)',
        '==(1.01, 1)',
        '==("1", 1)',
        '==("2", "2", "2", "2")',
        '==(2, 2, 1, 2)',
        '==([1, 2], [1, 2])',
        '==({ a: 1, b: 2 }, { b: 2, a: 1 })',
      ],
    },
  },
  '!=': {
    evaluate: (params, sourceCodeInfo): boolean => {
      return !isEqual(params, sourceCodeInfo)
    },
    arity: { min: 1 },
    docs: {
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'any' },
        b: { type: 'any' },
        x: { type: 'any' },
        ys: { type: 'any', rest: true },
      },
      variants: [
        { argumentNames: ['x'] },
        { argumentNames: ['x', 'ys'] },
      ],
      description: 'Returns `true` if all `values` are not equal to each other, otherwise result is `false`. `(!= a b c)` is same as `(not (== a b c))`.',
      seeAlso: ['=='],
      examples: [
        '1 != 2',
        '3 != 3',
        '!=(3)',
        '!=(3, 3, 2)',
        '!=("3", "2", "1", "0",)',
        '!=(0, -0)',
      ],
    },
  },
  '>': {
    evaluate: ([first, ...rest], sourceCodeInfo): boolean => {
      let currentValue = asStringOrNumber(first)
      for (const param of rest) {
        if (compare(currentValue, asStringOrNumber(param), sourceCodeInfo) <= 0)
          return false

        currentValue = asStringOrNumber(param)
      }
      return true
    },
    arity: { min: 1 },
    docs: {
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
        x: { type: ['number', 'string'] },
        ys: { type: ['number', 'string'], rest: true },
      },
      variants: [
        { argumentNames: ['x'] },
        { argumentNames: ['x', 'ys'] },
      ],
      description: 'Returns `true` if `x` and `ys` are in decreasing order, `false` otherwise.',
      seeAlso: ['<', '>=', '<=', 'compare'],
      examples: [
        '>(1, 0)',
        '>(1.01, 1)',
        '>(1, 1)',
        '>(4, 3, 2, 1)',
        '>(3, 2, 2, 1)',
      ],
    },
  },

  '<': {
    evaluate: ([first, ...rest], sourceCodeInfo): boolean => {
      let currentValue = asStringOrNumber(first)
      for (const param of rest) {
        if (compare(currentValue, asStringOrNumber(param), sourceCodeInfo) >= 0)
          return false

        currentValue = asStringOrNumber(param)
      }
      return true
    },
    arity: { min: 1 },
    docs: {
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
        x: { type: ['number', 'string'] },
        ys: { type: ['number', 'string'], rest: true },
      },
      variants: [
        { argumentNames: ['x'] },
        { argumentNames: ['x', 'ys'] },
      ],
      description: 'Returns `true` if `x` and `ys` are in increasing order, `false` otherwise.',
      seeAlso: ['>', '>=', '<=', 'compare'],
      examples: [
        '<(0, 1)',
        '<(1, 1.01)',
        '<(1, 1)',
        '<(1, 2, 2, 3)',
        '<("a", "b")',
      ],
    },
  },
  '>=': {
    evaluate: ([first, ...rest], sourceCodeInfo): boolean => {
      let currentValue = asStringOrNumber(first)
      for (const param of rest) {
        if (compare(currentValue, asStringOrNumber(param), sourceCodeInfo) < 0)
          return false

        currentValue = asStringOrNumber(param)
      }
      return true
    },
    arity: { min: 1 },
    docs: {
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
        x: { type: ['number', 'string'] },
        ys: { type: ['number', 'string'], rest: true },
      },
      variants: [
        { argumentNames: ['x'] },
        { argumentNames: ['x', 'ys'] },
      ],
      description: 'Returns `true` if `x` and `ys` are in non increasing order, `false` otherwise.',
      seeAlso: ['>', '<', '<=', 'compare'],
      examples: [
        '1 >= 1',
        '0 >= 1',
        '>=(1, 0)',
        '>=(1.01, 1)',
        '>=(1, 1)',
        '>=(4, 3, 2, 1)',
        '>=(3, 2, 2, 1)',
      ],
    },
  },
  '<=': {
    evaluate: ([first, ...rest], sourceCodeInfo): boolean => {
      let currentValue = asStringOrNumber(first)
      for (const param of rest) {
        if (compare(currentValue, asStringOrNumber(param), sourceCodeInfo) > 0)
          return false

        currentValue = asStringOrNumber(param)
      }
      return true
    },
    arity: { min: 1 },
    docs: {
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
        x: { type: ['number', 'string'] },
        ys: { type: ['number', 'string'], rest: true },
      },
      variants: [
        { argumentNames: ['x'] },
        { argumentNames: ['x', 'ys'] },
      ],
      description: 'Returns `true` if `x` and `ys` are in non decreasing order, `false` otherwise.',
      seeAlso: ['>', '<', '>=', 'compare'],
      examples: [
        '1 <= 1',
        '<=(0, 1)',
        '<=(1, 1.01)',
        '<=(1, 1)',
        '<=(1, 2, 3, 4)',
        '<=(1, 2, 2, 3)',
      ],
    },
  },
  'not': {
    evaluate: ([first]): boolean => !first,
    arity: toFixedArity(1),
    docs: {
      category: 'misc',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Computes logical negation. Note that any other `x` than `false`, `0`, `null` and `\'\'` is truthy.',
      seeAlso: ['boolean'],
      examples: [
        'not(3)',
        'not(true)',
        'not("A string")',
        'not(0)',
        'not(false)',
        'not(null)',
        'not("")',
      ],
    },
  },
  'boolean': {
    evaluate: ([value]): boolean => {
      return !!value
    },
    arity: toFixedArity(1),
    docs: {
      category: 'misc',
      returns: { type: 'boolean' },
      args: { x: { type: 'any' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Coerces `x` to boolean.',
      seeAlso: ['not', 'isBoolean', 'isTrue', 'isFalse'],
      examples: [
        'boolean(0)',
        'boolean(1)',
        'boolean(null)',
        'boolean("Albert")',
      ],
    },
  },
  'compare': {
    evaluate: ([a, b], sourceCodeInfo): number => {
      assertStringOrNumber(a, sourceCodeInfo)
      assertStringOrNumber(b, sourceCodeInfo)
      return compare(a, b, sourceCodeInfo)
    },
    arity: toFixedArity(2),
    docs: {
      category: 'misc',
      returns: { type: 'number' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description: 'Compares two values. Returns `-1` if `a` < `b`, `1` if `a` > `b` and `0` if `a` and `b` have the same sort order.',
      seeAlso: ['<', '>', '<=', '>=', 'sort', 'sequence.sortBy'],
      examples: [
        'compare(0, 1)',
        'compare(0, 0)',
        'compare(1, 0)',
        'compare("Albert", "Mojir")',
      ],
    },
  },
  'effectName': {
    evaluate: ([first], sourceCodeInfo): string => {
      return asEffect(first, sourceCodeInfo).name
    },
    arity: toFixedArity(1),
    docs: {
      category: 'meta',
      returns: { type: 'string' },
      args: {
        e: { type: 'any', description: 'An effect reference.' },
      },
      variants: [{ argumentNames: ['e'] }],
      description: 'Returns the name of an effect reference as a string.',
      seeAlso: ['effectMatcher', 'isEffect', 'qualifiedName'],
      examples: [
        'effectName(@dvala.error)',
        'effectName(@llm.complete)',
      ],
    },
  },
  'effectMatcher': {
    evaluate: ([pattern], sourceCodeInfo): EffectMatcherFunction => {
      if (typeof pattern === 'string') {
        return {
          [FUNCTION_SYMBOL]: true,
          sourceCodeInfo,
          functionType: 'EffectMatcher',
          matchType: 'string',
          pattern,
          flags: '',
          arity: toFixedArity(1),
        }
      }
      if (isRegularExpression(pattern)) {
        return {
          [FUNCTION_SYMBOL]: true,
          sourceCodeInfo,
          functionType: 'EffectMatcher',
          matchType: 'regexp',
          pattern: pattern.s,
          flags: pattern.f,
          arity: toFixedArity(1),
        }
      }
      throw new TypeError('effectMatcher expects a string or regexp pattern', sourceCodeInfo)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'meta',
      returns: { type: 'function' },
      args: {
        pattern: { type: ['string', 'regexp'], description: 'A wildcard pattern or regexp to match against effect names.' },
      },
      variants: [{ argumentNames: ['pattern'] }],
      description: 'Returns a predicate function that matches effects by name. If `pattern` is a string, uses wildcard matching: no wildcard means exact match, `.*` suffix matches the prefix and all descendants (dot boundary enforced), and `*` alone matches everything. If `pattern` is a regexp, tests the effect name against the regexp.',
      seeAlso: ['effectName', 'isEffect', 'qualifiedName', 'qualifiedMatcher'],
      examples: [
        'let pred = effectMatcher("dvala.*"); pred(@dvala.error)',
        'let pred = effectMatcher("dvala.*"); pred(@custom.foo)',
        'let pred = effectMatcher("*"); pred(@anything)',
      ],
    },
  },
  'macroexpand': {
    evaluate: (): never => { throw new Error('macroexpand is handled by the evaluator') },
    arity: { min: 1 },
    docs: {
      category: 'meta',
      returns: { type: 'any' },
      args: {
        macroFn: { type: 'any', description: 'A macro function.' },
        args: { type: 'any', description: 'AST node arguments to pass to the macro.' },
      },
      variants: [{ argumentNames: ['macroFn', 'args'] }],
      hideOperatorForm: true,
      description: 'Calls a macro\'s body with the given AST arguments and returns the expanded AST as data, without evaluating it. Use quote...end blocks to construct the AST arguments.',
      examples: [
        'let double = macro (ast) -> quote $^{ast} + $^{ast} end; macroexpand(double, quote 21 end)',
        'let { prettyPrint } = import(ast); let double = macro (ast) -> quote $^{ast} + $^{ast} end; macroexpand(double, quote 21 end) |> prettyPrint',
      ],
    },
  },
  'qualifiedName': {
    evaluate: ([first]): string | null => {
      // Effect references have a qualified name
      if (isEffect(first)) {
        return first.name
      }
      // Macros may have an optional qualified name
      if (isMacroFunction(first)) {
        return first.qualifiedName
      }
      // Everything else has no qualified name
      return null
    },
    arity: toFixedArity(1),
    docs: {
      category: 'meta',
      returns: { type: ['string', 'null'] },
      args: {
        entity: { type: 'any', description: 'An effect reference, macro, or any other value.' },
      },
      variants: [{ argumentNames: ['entity'] }],
      description: 'Returns the qualified name (dotted DNS-style identifier) of an entity, or null if it has none. Works on effect references and named macros.',
      seeAlso: ['effectName', 'effectMatcher', 'qualifiedMatcher', 'isMacro', 'isEffect'],
      examples: [
        'qualifiedName(@dvala.io.print)',
        'qualifiedName(macro@my.lib (ast) -> ast)',
        'qualifiedName(macro (ast) -> ast)',
        'qualifiedName(42)',
      ],
    },
  },
  'qualifiedMatcher': {
    evaluate: ([pattern], sourceCodeInfo): QualifiedMatcherFunction => {
      if (typeof pattern === 'string') {
        return {
          [FUNCTION_SYMBOL]: true,
          sourceCodeInfo,
          functionType: 'QualifiedMatcher',
          matchType: 'string',
          pattern,
          flags: '',
          arity: toFixedArity(1),
        }
      }
      if (isRegularExpression(pattern)) {
        return {
          [FUNCTION_SYMBOL]: true,
          sourceCodeInfo,
          functionType: 'QualifiedMatcher',
          matchType: 'regexp',
          pattern: pattern.s,
          flags: pattern.f,
          arity: toFixedArity(1),
        }
      }
      throw new TypeError('qualifiedMatcher expects a string or regexp pattern', sourceCodeInfo)
    },
    arity: toFixedArity(1),
    docs: {
      category: 'meta',
      returns: { type: 'function' },
      args: {
        pattern: { type: ['string', 'regexp'], description: 'A wildcard pattern or regexp to match against qualified names.' },
      },
      variants: [{ argumentNames: ['pattern'] }],
      description: 'Returns a predicate function that matches any entity with a qualified name (effects, named macros). If `pattern` is a string, uses wildcard matching: no wildcard means exact match, `.*` suffix matches the prefix and all descendants (dot boundary enforced), and `*` alone matches everything. If `pattern` is a regexp, tests the qualified name against the regexp. Returns false for entities without a qualified name.',
      seeAlso: ['qualifiedName', 'effectMatcher', 'isEffect', 'isMacro'],
      examples: [
        'qualifiedMatcher("dvala.*")(@dvala.error)',
        'qualifiedMatcher("dvala.*")(@custom.foo)',
        'qualifiedMatcher("*")(macro@my.lib (ast) -> ast)',
        'qualifiedMatcher("my.*")(macro@my.lib (ast) -> ast)',
      ],
    },
  },
  'typeOf': {
    evaluate: ([value]): string => {
      if (value === null || value === undefined)
        return 'null'
      if (typeof value === 'boolean')
        return 'boolean'
      if (typeof value === 'number')
        return 'number'
      if (typeof value === 'string')
        return 'string'
      if (isEffect(value))
        return 'effect'
      if (isRegularExpression(value))
        return 'regexp'
      if (isMacroFunction(value))
        return 'macro'
      if (isDvalaFunction(value))
        return 'function'
      if (Array.isArray(value))
        return 'array'
      return 'object'
    },
    arity: toFixedArity(1),
    docs: {
      category: 'misc',
      returns: { type: 'string' },
      args: {
        x: { type: 'any', description: 'The value to inspect.' },
      },
      variants: [{ argumentNames: ['x'] }],
      description: 'Returns a string representing the type of `x`. Possible return values are `"number"`, `"string"`, `"boolean"`, `"null"`, `"array"`, `"object"`, `"function"`, `"macro"`, `"regexp"`, and `"effect"`.',
      seeAlso: ['isNumber', 'isString', 'isBoolean', 'isNull', 'isArray', 'isObject', 'isFunction', 'isMacro', 'isRegexp', 'isEffect'],
      examples: [
        'typeOf(42)',
        'typeOf("hello")',
        'typeOf(true)',
        'typeOf(null)',
        'typeOf([1, 2, 3])',
        'typeOf({ a: 1 })',
        'typeOf((x) -> x + 1)',
        'typeOf(regexp("^start"))',
        'typeOf(@dvala.io.print)',
      ],
    },
  },
  'raise': {
    evaluate: () => { throw new Error('raise is implemented in Dvala') },
    arity: { min: 1, max: 2 },
    docs: {
      category: 'misc',
      returns: { type: 'never' },
      args: {
        message: { type: 'string', description: 'Error message.' },
        data: { type: 'any', description: 'Optional structured data attached to the error.' },
      },
      variants: [{ argumentNames: ['message'] }, { argumentNames: ['message', 'data'] }],
      hideOperatorForm: true,
      description: 'Raises an error by performing `@dvala.error` with a structured payload `{ type: "UserError", message, data }`. Convenience wrapper — use `perform(@dvala.error, ...)` directly for custom error types or additional fields.',
      seeAlso: ['perform'],
      examples: [
        'handle raise("oops") with @dvala.error(err) -> err.message end',
        'handle raise("bad input", { field: "email" }) with @dvala.error(err) -> err.data.field end',
        'let { fallback } = import(effectHandler); raise("oops") ||> fallback("recovered")',
      ],
    },
  },
}
