import { TypeError } from '../../errors'
import type { QualifiedMatcherFunction } from '../../parser/types'
import type { SourceCodeInfo } from '../../tokenizer/token'
import { asAny, asEffect, isAtom, isEffect, isRegularExpression } from '../../typeGuards/dvala'
import { isDvalaFunction, isHandlerFunction, isMacroFunction } from '../../typeGuards/dvalaFunction'
import { asStringOrNumber } from '../../typeGuards/string'
import { compare, deepEqual } from '../../utils'
import { toFixedArity } from '../../utils/arity'
import { isPersistentVector } from '../../utils/persistent'
import { FUNCTION_SYMBOL } from '../../utils/symbols'
import type { BuiltinNormalExpressions } from '../interface'

function isEqual(params: Iterable<unknown>, sourceCodeInfo: SourceCodeInfo | undefined) {
  // Destructure by iteration — works for both plain arrays and PersistentVector.
  // arity: { min: 1 } on all callers guarantees at least one element, so
  // firstResult.done is always false here.
  const iter = params[Symbol.iterator]()
  const firstAny = asAny(iter.next().value, sourceCodeInfo)
  for (let next = iter.next(); !next.done; next = iter.next()) {
    if (!deepEqual(firstAny, asAny(next.value, sourceCodeInfo), sourceCodeInfo)) return false
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
      type: '(Unknown, ...Unknown[]) -> Boolean',
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'any' },
        b: { type: 'any' },
        x: { type: 'any' },
        ys: { type: 'any', rest: true },
      },
      variants: [{ argumentNames: ['x'] }, { argumentNames: ['x', 'ys'] }],
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
      type: '(Unknown, ...Unknown[]) -> Boolean',
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: 'any' },
        b: { type: 'any' },
        x: { type: 'any' },
        ys: { type: 'any', rest: true },
      },
      variants: [{ argumentNames: ['x'] }, { argumentNames: ['x', 'ys'] }],
      description:
        'Returns `true` if all `values` are not equal to each other, otherwise result is `false`. `(!= a b c)` is same as `(not (== a b c))`.',
      seeAlso: ['=='],
      examples: ['1 != 2', '3 != 3', '!=(3)', '!=(3, 3, 2)', '!=("3", "2", "1", "0",)', '!=(0, -0)'],
    },
  },
  '>': {
    evaluate: ([first, ...rest], sourceCodeInfo): boolean => {
      let currentValue = asStringOrNumber(first)
      for (const param of rest) {
        if (compare(currentValue, asStringOrNumber(param), sourceCodeInfo) <= 0) return false

        currentValue = asStringOrNumber(param)
      }
      return true
    },
    arity: { min: 1 },
    docs: {
      type: '(Number | String, ...(Number | String)[]) -> Boolean',
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
        x: { type: ['number', 'string'] },
        ys: { type: ['number', 'string'], rest: true },
      },
      variants: [{ argumentNames: ['x'] }, { argumentNames: ['x', 'ys'] }],
      description: 'Returns `true` if `x` and `ys` are in decreasing order, `false` otherwise.',
      seeAlso: ['<', '>=', '<=', 'compare'],
      examples: ['>(1, 0)', '>(1.01, 1)', '>(1, 1)', '>(4, 3, 2, 1)', '>(3, 2, 2, 1)'],
    },
  },

  '<': {
    evaluate: ([first, ...rest], sourceCodeInfo): boolean => {
      let currentValue = asStringOrNumber(first)
      for (const param of rest) {
        if (compare(currentValue, asStringOrNumber(param), sourceCodeInfo) >= 0) return false

        currentValue = asStringOrNumber(param)
      }
      return true
    },
    arity: { min: 1 },
    docs: {
      type: '(Number | String, ...(Number | String)[]) -> Boolean',
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
        x: { type: ['number', 'string'] },
        ys: { type: ['number', 'string'], rest: true },
      },
      variants: [{ argumentNames: ['x'] }, { argumentNames: ['x', 'ys'] }],
      description: 'Returns `true` if `x` and `ys` are in increasing order, `false` otherwise.',
      seeAlso: ['>', '>=', '<=', 'compare'],
      examples: ['<(0, 1)', '<(1, 1.01)', '<(1, 1)', '<(1, 2, 2, 3)', '<("a", "b")'],
    },
  },
  '>=': {
    evaluate: ([first, ...rest], sourceCodeInfo): boolean => {
      let currentValue = asStringOrNumber(first)
      for (const param of rest) {
        if (compare(currentValue, asStringOrNumber(param), sourceCodeInfo) < 0) return false

        currentValue = asStringOrNumber(param)
      }
      return true
    },
    arity: { min: 1 },
    docs: {
      type: '(Number | String, ...(Number | String)[]) -> Boolean',
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
        x: { type: ['number', 'string'] },
        ys: { type: ['number', 'string'], rest: true },
      },
      variants: [{ argumentNames: ['x'] }, { argumentNames: ['x', 'ys'] }],
      description: 'Returns `true` if `x` and `ys` are in non increasing order, `false` otherwise.',
      seeAlso: ['>', '<', '<=', 'compare'],
      examples: ['1 >= 1', '0 >= 1', '>=(1, 0)', '>=(1.01, 1)', '>=(1, 1)', '>=(4, 3, 2, 1)', '>=(3, 2, 2, 1)'],
    },
  },
  '<=': {
    evaluate: ([first, ...rest], sourceCodeInfo): boolean => {
      let currentValue = asStringOrNumber(first)
      for (const param of rest) {
        if (compare(currentValue, asStringOrNumber(param), sourceCodeInfo) > 0) return false

        currentValue = asStringOrNumber(param)
      }
      return true
    },
    arity: { min: 1 },
    docs: {
      type: '(Number | String, ...(Number | String)[]) -> Boolean',
      category: 'misc',
      returns: { type: 'boolean' },
      args: {
        a: { type: ['number', 'string'] },
        b: { type: ['number', 'string'] },
        x: { type: ['number', 'string'] },
        ys: { type: ['number', 'string'], rest: true },
      },
      variants: [{ argumentNames: ['x'] }, { argumentNames: ['x', 'ys'] }],
      description: 'Returns `true` if `x` and `ys` are in non decreasing order, `false` otherwise.',
      seeAlso: ['>', '<', '>=', 'compare'],
      examples: ['1 <= 1', '<=(0, 1)', '<=(1, 1.01)', '<=(1, 1)', '<=(1, 2, 3, 4)', '<=(1, 2, 2, 3)'],
    },
  },
  // Logical negation. Parser emits `!x` as `Call('!', [x])`, and
  // `filter(xs, !)` as a Builtin reference. Signature is strict
  // `(Boolean) -> Boolean` — part of the Boolean-surface cleanup;
  // non-Boolean operands must be rewritten (e.g. `!x` where `x : Number`
  // → `x == 0` or similar).
  '!': {
    evaluate: ([first]): boolean => !first,
    arity: toFixedArity(1),
    docs: {
      type: '(Boolean) -> Boolean',
      category: 'misc',
      returns: { type: 'boolean' },
      args: { x: { type: 'boolean' } },
      variants: [{ argumentNames: ['x'] }],
      description: 'Logical negation. Usable as a first-class function value, e.g. `filter(bs, !)`.',
      seeAlso: ['&&', '||', 'isBoolean'],
      examples: ['!true', '!false', '!(1 == 2)', '!!true'],
    },
  },
  compare: {
    evaluate: ([a, b], sourceCodeInfo): number => {
      return compare(a, b, sourceCodeInfo)
    },
    arity: toFixedArity(2),
    docs: {
      type: '(Number | String | Atom, Number | String | Atom) -> Number',
      category: 'misc',
      returns: { type: 'number' },
      args: {
        a: { type: ['number', 'string', 'atom'] },
        b: { type: ['number', 'string', 'atom'] },
      },
      variants: [{ argumentNames: ['a', 'b'] }],
      description:
        'Compares two values. Returns `-1` if `a` < `b`, `1` if `a` > `b` and `0` if `a` and `b` have the same sort order. Works on numbers, strings, and atoms. Note: the `<`, `>`, `<=`, `>=` operators only accept numbers and strings, not atoms — use `compare` for atom ordering.',
      seeAlso: ['<', '>', '<=', '>=', 'sort', 'sequence.sortBy'],
      examples: [
        'compare(0, 1)',
        'compare(0, 0)',
        'compare(1, 0)',
        'compare("Albert", "Mojir")',
        'compare(:apple, :banana)',
      ],
    },
  },
  effectName: {
    evaluate: ([first], sourceCodeInfo): string => {
      return asEffect(first, sourceCodeInfo).name
    },
    arity: toFixedArity(1),
    docs: {
      type: '(Effect) -> String',
      category: 'meta',
      returns: { type: 'string' },
      args: {
        e: { type: 'any', description: 'An effect reference.' },
      },
      variants: [{ argumentNames: ['e'] }],
      description: 'Returns the name of an effect reference as a string.',
      seeAlso: ['isEffect', 'qualifiedName', 'qualifiedMatcher'],
      examples: ['effectName(@dvala.error)', 'effectName(@llm.complete)'],
    },
  },
  macroexpand: {
    evaluate: (): never => {
      throw new Error('macroexpand is handled by the evaluator')
    },
    arity: { min: 1 },
    docs: {
      type: '(Unknown, Unknown) -> Unknown',
      category: 'meta',
      returns: { type: 'any' },
      args: {
        macroFn: { type: 'any', description: 'A macro function.' },
        args: { type: 'any', description: 'AST node arguments to pass to the macro.' },
      },
      variants: [{ argumentNames: ['macroFn', 'args'] }],
      hideOperatorForm: true,
      description:
        "Calls a macro's body with the given AST arguments and returns the expanded AST as data, without evaluating it. Use quote...end blocks to construct the AST arguments.",
      examples: [
        'let double = macro (ast) -> quote $^{ast} + $^{ast} end; macroexpand(double, quote 21 end)',
        {
          code: 'let { prettyPrint } = import("ast"); let double = macro (ast) -> quote $^{ast} + $^{ast} end; macroexpand(double, quote 21 end) |> prettyPrint',
          noCheck: true,
        },
      ],
    },
  },
  qualifiedName: {
    evaluate: ([first]): string | null => {
      // Effect references have a qualified name
      if (isEffect(first)) {
        return first.name
      }
      // Everything else has no qualified name
      return null
    },
    arity: toFixedArity(1),
    docs: {
      type: '(Unknown) -> String | Null',
      category: 'meta',
      returns: { type: ['string', 'null'] },
      args: {
        entity: { type: 'any', description: 'An effect reference or any other value.' },
      },
      variants: [{ argumentNames: ['entity'] }],
      description:
        'Returns the qualified name (dotted DNS-style identifier) of an entity, or null if it has none. Works on effect references.',
      seeAlso: ['effectName', 'qualifiedMatcher', 'isEffect'],
      examples: ['qualifiedName(@dvala.io.print)', 'qualifiedName(42)'],
    },
  },
  qualifiedMatcher: {
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
      type: '(String | Regex) -> (Unknown) -> Boolean',
      category: 'meta',
      returns: { type: 'function' },
      args: {
        pattern: {
          type: ['string', 'regexp'],
          description: 'A wildcard pattern or regexp to match against qualified names.',
        },
      },
      variants: [{ argumentNames: ['pattern'] }],
      description:
        'Returns a predicate function that matches any entity with a qualified name (effect references). If `pattern` is a string, uses wildcard matching: no wildcard means exact match, `.*` suffix matches the prefix and all descendants (dot boundary enforced), and `*` alone matches everything. If `pattern` is a regexp, tests the qualified name against the regexp. Returns false for entities without a qualified name.',
      seeAlso: ['qualifiedName', 'effectName', 'isEffect'],
      examples: [
        'qualifiedMatcher("dvala.*")(@dvala.error)',
        'qualifiedMatcher("dvala.*")(@custom.foo)',
        'qualifiedMatcher("*")(@dvala.io.print)',
      ],
    },
  },
  typeOf: {
    evaluate: ([value]): string => {
      if (value === null || value === undefined) return 'null'
      if (typeof value === 'boolean') return 'boolean'
      if (typeof value === 'number') return 'number'
      if (typeof value === 'string') return 'string'
      if (isAtom(value)) return 'atom'
      if (isEffect(value)) return 'effect'
      if (isRegularExpression(value)) return 'regexp'
      if (isMacroFunction(value)) return 'macro'
      if (isHandlerFunction(value)) return 'handler'
      if (isDvalaFunction(value)) return 'function'
      if (isPersistentVector(value) || Array.isArray(value)) return 'array'
      return 'object'
    },
    arity: toFixedArity(1),
    docs: {
      type: '(Unknown) -> String',
      category: 'misc',
      returns: { type: 'string' },
      args: {
        x: { type: 'any', description: 'The value to inspect.' },
      },
      variants: [{ argumentNames: ['x'] }],
      description:
        'Returns a string representing the type of `x`. Possible return values are `"number"`, `"string"`, `"boolean"`, `"null"`, `"atom"`, `"array"`, `"object"`, `"function"`, `"macro"`, `"regexp"`, and `"effect"`.',
      seeAlso: [
        'isNumber',
        'isString',
        'isBoolean',
        'isNull',
        'isAtom',
        'isArray',
        'isObject',
        'isFunction',
        'isMacro',
        'isRegexp',
        'isEffect',
      ],
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
  raise: {
    evaluate: () => {
      throw new Error('raise is implemented in Dvala')
    },
    arity: { min: 1, max: 2 },
    docs: {
      type: '((String) -> @{dvala.error} Never) & ((String, Unknown) -> @{dvala.error} Never)',
      category: 'misc',
      returns: { type: 'never' },
      args: {
        message: { type: 'string', description: 'Error message.' },
        data: { type: 'any', description: 'Optional structured data attached to the error.' },
      },
      variants: [{ argumentNames: ['message'] }, { argumentNames: ['message', 'data'] }],
      hideOperatorForm: true,
      description:
        'Raises an error by performing `@dvala.error` with a structured payload `{ type: "UserError", message, data }`. Convenience wrapper — use `perform(@dvala.error, ...)` directly for custom error types or additional fields.',
      seeAlso: ['perform'],
      examples: [
        'do with handler @dvala.error(err) -> resume("caught") end; raise("oops") end',
        'do with handler @dvala.error(err) -> resume(null) end; raise("bad input", { field: "email" }) end',
      ],
    },
  },
}
