/**
 * Auto-generated stress tests: Core language subsystem edge cases.
 *
 * These tests target non-effect areas that have thin test coverage or
 * complex interactions that could hide bugs:
 *
 *  1. Round-trip fidelity (tokenize → untokenize)
 *  2. Module system & file module edge cases
 *  3. Type annotations / predicates (isVector, isMatrix, isGrid)
 *  4. Pattern matching + closures / scoping edge cases
 *  5. Scoping, shadowing, closure edge cases
 *  6. Pure mode enforcement
 *  7. getUndefinedSymbols accuracy
 *  8. Error quality & edge cases
 *  9. Destructuring edge cases
 * 10. Parser edge cases
 */

import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import type { RunResult } from '../src/evaluator/effectTypes'
import { allBuiltinModules } from '../src/allModules'
import { getAutoCompleter, getUndefinedSymbols, parseTokenStream, tokenizeSource, transformSymbols, untokenize } from '../src/tooling'

const dvala = createDvala({ modules: allBuiltinModules, disableAutoCheckpoint: true })
const dvalaDebug = createDvala({ modules: allBuiltinModules, debug: true, disableAutoCheckpoint: true })

function runValue(result: RunResult): unknown {
  if (result.type !== 'completed')
    throw new Error(`Expected completed result, got ${result.type}`)
  return result.value
}

// ---------------------------------------------------------------------------
// 1. Round-trip fidelity (tokenize → untokenize)
// ---------------------------------------------------------------------------

describe('round-trip: tokenize → untokenize', () => {
  const programs = [
    // Basics
    '1 + 2',
    '-1 * (2 - 3)',
    '"hello world"',
    'true && false',
    'null',

    // Let / fn
    'let x = 42; x + 1',
    'let add = (a, b) -> a + b; add(1, 2)',
    'let f = -> $ * 2; f(21)',

    // If / else if
    'if true then 1 else 2 end',
    'if true then 1 else if false then 2 end',

    // Loop / for
    'loop(i = 0, acc = 0) -> if i >= 5 then acc else recur(i + 1, acc + i) end',
    'for (x in [1, 2, 3]) -> x * 2',
    'for (x in [1, 2, 3] when isOdd(x)) -> x',

    // Match
    'match x case 1 then "one" case _ then "other" end',
    'match [1, 2] case [a, b] then a + b end',
    'match { name: "alice" } case { name } then name end',

    // do/with handler
    'do with (handler @my.eff() -> resume(42) end); perform(@my.eff) end',

    // Operators
    '1 + 2 * 3',
    'a |> inc |> double',
    'x ?? "default"',

    // Array / object literals
    '[1, 2, 3]',
    '{ a: 1, b: 2 }',
    '{ a: 1, b: [2, 3], c: { d: 4 } }',

    // String interpolation / regex
    '#"\\d+"',

    // Destructuring
    'let [a, b] = [1, 2]; a + b',
    'let { x, y } = { x: 1, y: 2 }; x + y',

    // Complex expressions
    'let fib = (n) -> if n <= 1 then n else fib(n - 1) + fib(n - 2) end; fib(10)',
    'map(filter([1, 2, 3, 4, 5], isOdd), -> $ * 2)',
    'reduce([1, 2, 3], +, 0)',

    // Comments should be stripped but code preserved
    'let x = 1; x + 2',

    // Import
    'import("vector")',
  ]

  for (const program of programs) {
    it(`round-trips: ${program.slice(0, 60)}`, () => {
      const tokenStream = tokenizeSource(program)
      const result = untokenize(tokenStream)
      expect(result).toBe(program)
    })
  }

  it('round-trip preserves semantics — eval(original) === eval(round-tripped)', () => {
    const evalPrograms = [
      '1 + 2 * 3',
      'let x = 10; x * x',
      'if true then "yes" else "no" end',
      'map([1, 2, 3], inc)',
      'reduce([1, 2, 3, 4, 5], +, 0)',
      'let f = (x) -> x * 2; f(21)',
      'loop(i = 0, acc = 0) -> if i >= 5 then acc else recur(i + 1, acc + i) end',
    ]
    for (const program of evalPrograms) {
      const original = dvala.run(program)
      const roundTripped = untokenize(tokenizeSource(program))
      const afterRoundTrip = dvala.run(roundTripped)
      expect(afterRoundTrip).toEqual(original)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Module system & file module edge cases
// ---------------------------------------------------------------------------

describe('module system edge cases', () => {
  it('import same builtin module twice returns same object', () => {
    const result = dvala.run(`
      let v1 = import("vector");
      let v2 = import("vector");
      ==(v1, v2)
    `)
    expect(result).toBe(true)
  })

  it('destructuring import', () => {
    const result = dvala.run('let { stdev } = import("vector"); stdev([2, 4, 4, 4, 5, 5, 7, 9])')
    expect(result).toBe(2)
  })

  it('module function call works', () => {
    const result = dvala.run('let m = import("numberTheory"); m.gcd(12, 8)')
    expect(result).toBe(4)
  })

  it('import unknown module throws', () => {
    expect(() => dvala.run('import("nonexistent")')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 3. Type annotations / predicates (isVector, isMatrix, isGrid)
// ---------------------------------------------------------------------------

describe('type annotations / predicates', () => {
  it('isVector on numeric array is true', () => {
    expect(dvala.run('isVector([1, 2, 3])')).toBe(true)
  })

  it('isVector on empty array is true', () => {
    expect(dvala.run('isVector([])')).toBe(true)
  })

  it('isVector on mixed array is false', () => {
    expect(dvala.run('isVector([1, "two", 3])')).toBe(false)
  })

  it('isVector on non-array is false', () => {
    expect(dvala.run('isVector(42)')).toBe(false)
    expect(dvala.run('isVector("hello")')).toBe(false)
    expect(dvala.run('isVector({ a: 1 })')).toBe(false)
  })

  it('isMatrix on 2d numeric array is true', () => {
    expect(dvala.run('isMatrix([[1, 2], [3, 4]])')).toBe(true)
  })

  it('isMatrix on non-rectangular array is false', () => {
    expect(dvala.run('isMatrix([[1, 2], [3]])')).toBe(false)
  })

  it('isMatrix on 2d non-numeric array is false', () => {
    expect(dvala.run('isMatrix([["a", "b"], ["c", "d"]])')).toBe(false)
  })

  it('isMatrix on 1d array is false', () => {
    expect(dvala.run('isMatrix([1, 2, 3])')).toBe(false)
  })

  it('isGrid on 2d array is true', () => {
    expect(dvala.run('isGrid([["a", "b"], ["c", "d"]])')).toBe(true)
  })

  it('isGrid on 2d numeric array (matrix) is also true', () => {
    expect(dvala.run('isGrid([[1, 2], [3, 4]])')).toBe(true)
  })

  it('isGrid on empty array is false', () => {
    expect(dvala.run('isGrid([])')).toBe(false)
  })

  it('isGrid on 1d array is false', () => {
    expect(dvala.run('isGrid([1, 2, 3])')).toBe(false)
  })

  it('isGrid on non-rectangular 2d array is false', () => {
    expect(dvala.run('isGrid([["a", "b"], ["c"]])')).toBe(false)
  })

  it('type predicates on results of operations', () => {
    expect(dvala.run('isVector(map([1, 2, 3], inc))')).toBe(true)
    expect(dvala.run('isVector(map([1, 2, 3], str))')).toBe(false)
    expect(dvala.run('isMatrix(map([[1, 2], [3, 4]], -> map($, inc)))')).toBe(true)
  })

  it('isGrid on grid module results', () => {
    expect(dvala.run('let g = import("grid"); isGrid(g.transpose([[1, 2], [3, 4]]))')).toBe(true)
  })

  it('isMatrix on grid module results with numeric data', () => {
    expect(dvala.run('let g = import("grid"); isMatrix(g.transpose([[1, 2], [3, 4]]))')).toBe(true)
  })

  it('isVector on vector module results', () => {
    expect(dvala.run('let v = import("vector"); isVector(v.mode([1, 2, 2, 3]))')).toBe(true)
  })

  it('type predicates are consistent between debug and non-debug mode', () => {
    const programs = [
      'isVector([1, 2, 3])',
      'isMatrix([[1, 2], [3, 4]])',
      'isGrid([["a", "b"], ["c", "d"]])',
      'isVector([1, "two", 3])',
      'isMatrix([[1, 2], [3]])',
    ]
    for (const prog of programs) {
      expect(dvalaDebug.run(prog)).toBe(dvala.run(prog))
    }
  })

  it('isArray on various types', () => {
    expect(dvala.run('isArray([1, 2, 3])')).toBe(true)
    expect(dvala.run('isArray([])')).toBe(true)
    expect(dvala.run('isArray("hello")')).toBe(false)
    expect(dvala.run('isArray(42)')).toBe(false)
    expect(dvala.run('isArray(null)')).toBe(false)
    expect(dvala.run('isArray({ a: 1 })')).toBe(false)
  })

  it('type predicate results used in control flow', () => {
    expect(dvala.run(`
      let classify = (x) ->
        if isVector(x) then "vector"
        else if isMatrix(x) then "matrix"
        else if isGrid(x) then "grid"
        else if isArray(x) then "array"
        else "other"
        end;
      [classify([1, 2]), classify([[1, 2], [3, 4]]), classify([["a"], ["b"]]), classify("hello")]
    `)).toEqual(['vector', 'matrix', 'grid', 'other'])
  })

  it('isVector after map-then-filter with numeric pipeline', () => {
    expect(dvala.run('isVector(filter(map([1, 2, 3, 4, 5], -> $ * 2), -> $ > 4))')).toBe(true)
  })

  it('isGrid on array with empty inner arrays is false', () => {
    // Inner arrays must have length > 0
    expect(dvala.run('isGrid([[], []])')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Pattern matching + closures / scoping
// ---------------------------------------------------------------------------

describe('pattern matching edge cases', () => {
  it('match with guard clause accessing outer variable', () => {
    expect(dvala.run(`
      let threshold = 10;
      match 15
        case x when x > threshold then "above"
        case x then "below"
      end
    `)).toBe('above')
  })

  it('match with guard clause using function', () => {
    expect(dvala.run(`
      let isBig = (x) -> x > 100;
      match 42
        case x when isBig(x) then "big"
        case _ then "small"
      end
    `)).toBe('small')
  })

  it('match result used in closure', () => {
    expect(dvala.run(`
      let categorize = (val) ->
        match val
          case [x, ...xs] then { first: x, rest: xs }
          case _ then { first: null, rest: [] }
        end;
      let result = categorize([10, 20, 30]);
      result.first + first(result.rest)
    `)).toBe(30)
  })

  it('nested match expressions', () => {
    expect(dvala.run(`
      let classify = (val) ->
        match val
          case [x, y] then
            match x
              case 0 then "zero-pair"
              case _ then "non-zero pair"
            end
          case _ then "not a pair"
        end;
      [classify([0, 1]), classify([1, 2]), classify([1])]
    `)).toEqual(['zero-pair', 'non-zero pair', 'not a pair'])
  })

  it('match with object rest pattern', () => {
    expect(dvala.run(`
      match { a: 1, b: 2, c: 3 }
        case { a, ...remaining } then remaining
      end
    `)).toEqual({ b: 2, c: 3 })
  })

  it('match with array rest pattern and nested destructure', () => {
    expect(dvala.run('match [[1, 2], [3, 4], [5, 6]] case [[a, b], ...remaining] then a + b + count(remaining) end'))
      .toBe(5) // 1 + 2 + 2
  })

  it('match returns null when no pattern matches', () => {
    expect(dvala.run('match 42 case "hello" then 1 end')).toBeNull()
  })

  it('match with complex guard and destructuring', () => {
    expect(dvala.run(`
      match { status: 503, message: "Service Unavailable" }
        case { status } when status >= 500 then "server error: " ++ str(status)
        case { status } when status >= 400 then "client error"
        case _ then "ok"
      end
    `)).toBe('server error: 503')
  })

  it('match inside loop', () => {
    expect(dvala.run(`
      let classifyAll = (items) ->
        map(items, (item) ->
          match item
            case n when isNumber(n) then "num"
            case s when isString(s) then "str"
            case _ then "other"
          end
        );
      classifyAll([1, "hello", null, 42, "world"])
    `)).toEqual(['num', 'str', 'other', 'num', 'str'])
  })
})

// ---------------------------------------------------------------------------
// 5. Scoping, shadowing, closure edge cases
// ---------------------------------------------------------------------------

describe('scoping edge cases', () => {
  it('let binding does not leak out of scope', () => {
    expect(() => dvala.run('do let x = 1 end; x')).toThrow()
  })

  it('inner let shadows outer let', () => {
    expect(dvala.run(`
      let x = 10;
      let result = do let x = 20; x end;
      [x, result]
    `)).toEqual([10, 20])
  })

  it('closure captures enclosing scope variable', () => {
    expect(dvala.run(`
      let makeCounter = (start) -> (step) -> start + step;
      let from10 = makeCounter(10);
      [from10(1), from10(5), from10(10)]
    `)).toEqual([11, 15, 20])
  })

  it('closure captures final value of let binding', () => {
    expect(dvala.run(`
      let x = 10;
      let f = -> x * 2;
      f()
    `)).toBe(20)
  })

  it('multiple closures over same variable get consistent values', () => {
    expect(dvala.run(`
      let x = 42;
      let f1 = -> x + 1;
      let f2 = -> x + 2;
      [f1(), f2()]
    `)).toEqual([43, 44])
  })

  it('closure inside for captures loop variable correctly', () => {
    expect(dvala.run(`
      let fns = for (i in [1, 2, 3]) -> (x) -> i * x;
      map(fns, (f) -> f(10))
    `)).toEqual([10, 20, 30])
  })

  it('deeply nested closures resolve correctly', () => {
    expect(dvala.run(`
      let a = 1;
      let f1 = -> do
        let b = 2;
        let f2 = -> do
          let c = 3;
          a + b + c
        end;
        f2()
      end;
      f1()
    `)).toBe(6)
  })

  it('host bindings visible in closures', () => {
    expect(dvala.run('let f = -> x * 2; f()', { scope: { x: 21 } })).toBe(42)
  })

  it('host bindings can be shadowed by let', () => {
    expect(dvala.run('let x = 100; x', { scope: { x: 42 } })).toBe(100)
  })

  it('recursive closure works correctly', () => {
    expect(dvala.run(`
      let factorial = (n) -> if n <= 1 then 1 else n * factorial(n - 1) end;
      factorial(6)
    `)).toBe(720)
  })

  it('mutual recursion via lets', () => {
    expect(dvala.run(`
      let myEven = (n) -> if n == 0 then true else myOdd(n - 1) end;
      let myOdd = (n) -> if n == 0 then false else myEven(n - 1) end;
      [myEven(4), myOdd(5), myEven(3)]
    `)).toEqual([true, true, false])
  })

  it('do block creates isolated scope', () => {
    expect(dvala.run(`
      let x = 1;
      let y = do
        let x = 99;
        x + 1
      end;
      [x, y]
    `)).toEqual([1, 100])
  })
})

// ---------------------------------------------------------------------------
// 6. Pure mode enforcement
// ---------------------------------------------------------------------------

describe('pure mode enforcement', () => {
  it('pure math expressions work', () => {
    expect(dvala.run('1 + 2 * 3', { pure: true })).toBe(7)
  })

  it('pure string operations work', () => {
    expect(dvala.run('upperCase("hello")', { pure: true })).toBe('HELLO')
  })

  it('pure array operations work', () => {
    expect(dvala.run('map([1, 2, 3], inc)', { pure: true })).toEqual([2, 3, 4])
    expect(dvala.run('filter([1, 2, 3, 4, 5], isEven)', { pure: true })).toEqual([2, 4])
    expect(dvala.run('reduce([1, 2, 3], +, 0)', { pure: true })).toBe(6)
  })

  it('pure closures work', () => {
    expect(dvala.run('let f = (x) -> x * 2; f(21)', { pure: true })).toBe(42)
  })

  it('pure pattern matching works', () => {
    expect(dvala.run('match [1, 2] case [a, b] then a + b end', { pure: true })).toBe(3)
  })

  it('pure loop/recur works', () => {
    expect(dvala.run(`
      loop(i = 0, acc = 0) ->
        if i >= 10 then acc else recur(i + 1, acc + i) end
    `, { pure: true })).toBe(45)
  })

  it('pure for works', () => {
    expect(dvala.run('for (x in [1, 2, 3, 4, 5] when isOdd(x)) -> x * x', { pure: true }))
      .toEqual([1, 9, 25])
  })

  it('pure destructuring works', () => {
    expect(dvala.run('let [a, b, c] = [10, 20, 12]; a + b + c', { pure: true })).toBe(42)
    expect(dvala.run('let { x, y } = { x: 10, y: 32 }; x + y', { pure: true })).toBe(42)
  })

  it('pure with host bindings works', () => {
    expect(dvala.run('x + y', { pure: true, scope: { x: 10, y: 32 } })).toBe(42)
  })

  it('pure async works', async () => {
    expect(runValue(await dvala.runAsync('1 + 2 * 3', { pure: true }))).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// 7. getUndefinedSymbols accuracy
// ---------------------------------------------------------------------------

describe('getUndefinedSymbols', () => {
  it('simple expression with all defined', () => {
    expect(getUndefinedSymbols('1 + 2')).toEqual(new Set())
  })

  it('simple expression with undefined symbol', () => {
    expect(getUndefinedSymbols('x + 1')).toEqual(new Set(['x']))
  })

  it('let-bound symbols are defined', () => {
    expect(getUndefinedSymbols('let x = 1; x + 1')).toEqual(new Set())
  })

  it('builtins are not undefined', () => {
    expect(getUndefinedSymbols('map([1, 2, 3], inc)')).toEqual(new Set())
  })

  it('host bindings resolve undefined symbols', () => {
    expect(getUndefinedSymbols('x + 1', { scope: { x: 42 } })).toEqual(new Set())
  })

  it('nested function parameters are defined', () => {
    expect(getUndefinedSymbols('let f = (x, y) -> x + y; f(1, 2)')).toEqual(new Set())
  })

  it('closure references to outer scope are defined', () => {
    expect(getUndefinedSymbols(`
      let x = 10;
      let f = (y) -> x + y;
      f(1)
    `)).toEqual(new Set())
  })

  it('match pattern variables are defined within case body', () => {
    expect(getUndefinedSymbols('match val case [x, y] then x + y end'))
      .toEqual(new Set(['val']))
  })

  it('for loop variable is defined within body', () => {
    expect(getUndefinedSymbols('for (x in items) -> x * 2'))
      .toEqual(new Set(['items']))
  })

  it('loop bindings are defined within loop body', () => {
    expect(getUndefinedSymbols(
      'loop(i = 0, acc = start) -> if i >= n then acc else recur(i + 1, acc + i) end',
    )).toEqual(new Set(['start', 'n']))
  })

  it('destructuring lhs variables are defined', () => {
    expect(getUndefinedSymbols('let [a, b] = pair; a + b'))
      .toEqual(new Set(['pair']))
  })

  it('do block variables do not leak', () => {
    expect(getUndefinedSymbols('do let x = 1; x end; x'))
      .toEqual(new Set(['x']))
  })

  it('import symbols are defined', () => {
    expect(getUndefinedSymbols('let v = import("vector"); v.stdev([1, 2, 3])'))
      .toEqual(new Set())
  })

  it('multiple undefined symbols detected', () => {
    const result = getUndefinedSymbols('a + b + c')
    expect(result).toEqual(new Set(['a', 'b', 'c']))
  })
})

// ---------------------------------------------------------------------------
// 8. Error quality & edge cases
// ---------------------------------------------------------------------------

describe('error quality', () => {
  it('division by zero produces not-finite error', () => {
    expect(() => dvala.run('0 / 0')).toThrow('Number is not finite')
  })

  it('division producing Infinity throws not-finite error', () => {
    expect(() => dvala.run('1 / 0')).toThrow('Number is not finite')
  })

  it('undefined symbol error includes symbol name', () => {
    expect(() => dvala.run('undefinedSymbolXyz')).toThrow('undefinedSymbolXyz')
  })

  it('arity error on too few args', () => {
    expect(() => dvala.run('inc()')).toThrow()
  })

  it('arity error on too many args', () => {
    expect(() => dvala.run('inc(1, 2, 3)')).toThrow()
  })

  it('type error on wrong argument type', () => {
    expect(() => dvala.run('inc("hello")')).toThrow()
  })

  it('let redefinition error', () => {
    expect(() => dvala.run('let x = 1; let x = 2; x')).toThrow('redefine')
  })

  it('unknown module error', () => {
    expect(() => dvala.run('import(nonexistent-module-xyz)')).toThrow()
  })

  it('parse error on malformed expression', () => {
    expect(() => dvala.run('1 +')).toThrow()
  })

  it('parse error on unclosed paren', () => {
    expect(() => dvala.run('(1 + 2')).toThrow()
  })

  it('parse error on unclosed string', () => {
    expect(() => dvala.run('"hello')).toThrow()
  })

  it('type error on calling non-function', () => {
    expect(() => dvala.run('let x = 42; x(1)')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 9. Destructuring edge cases
// ---------------------------------------------------------------------------

describe('destructuring edge cases', () => {
  it('array destructuring basic', () => {
    expect(dvala.run('let [a, b, c] = [1, 2, 3]; [c, b, a]')).toEqual([3, 2, 1])
  })

  it('array destructuring with rest', () => {
    expect(dvala.run('let [head, ...tail] = [1, 2, 3, 4]; [head, tail]')).toEqual([1, [2, 3, 4]])
  })

  it('object destructuring basic', () => {
    expect(dvala.run('let { name, age } = { name: "alice", age: 30 }; [name, age]'))
      .toEqual(['alice', 30])
  })

  it('object destructuring with rest', () => {
    expect(dvala.run('let { a, ...remaining } = { a: 1, b: 2, c: 3 }; [a, remaining]'))
      .toEqual([1, { b: 2, c: 3 }])
  })

  it('nested array destructuring', () => {
    expect(dvala.run('let [[a, b], [c, d]] = [[1, 2], [3, 4]]; a + b + c + d')).toBe(10)
  })

  it('nested object destructuring', () => {
    expect(dvala.run('let { a: { b } } = { a: { b: 42 } }; b')).toBe(42)
  })

  it('array destructuring with default values', () => {
    expect(dvala.run('let [a, b = 99] = [1]; [a, b]')).toEqual([1, 99])
  })

  it('object destructuring with default values', () => {
    expect(dvala.run('let { a, b = 42 } = { a: 1 }; [a, b]')).toEqual([1, 42])
  })

  it('destructuring in function parameters', () => {
    expect(dvala.run('let f = ([a, b]) -> a + b; f([10, 32])')).toBe(42)
  })

  it('destructuring in for loop', () => {
    expect(dvala.run('map(entries({ a: 1, b: 2 }), (entry) -> nth(entry, 0) ++ "=" ++ str(nth(entry, 1)))'))
      .toEqual(['a=1', 'b=2'])
  })

  it('destructuring in match pattern', () => {
    expect(dvala.run('match { x: 10, y: 20 } case { x, y } then x + y end')).toBe(30)
  })

  it('skipped positions in array destructuring', () => {
    expect(dvala.run('let [,, third] = [1, 2, 3]; third')).toBe(3)
  })

  it('destructuring result of function call', () => {
    expect(dvala.run('let [minVal, maxVal] = [min(3, 1, 2), max(3, 1, 2)]; [minVal, maxVal]'))
      .toEqual([1, 3])
  })
})

// ---------------------------------------------------------------------------
// 10. Parser / special expression edge cases
// ---------------------------------------------------------------------------

describe('parser edge cases', () => {
  it('deeply nested parentheses', () => {
    expect(dvala.run('(((((1)))))')).toBe(1)
  })

  it('operator precedence: + vs *', () => {
    expect(dvala.run('2 + 3 * 4')).toBe(14)
    expect(dvala.run('(2 + 3) * 4')).toBe(20)
  })

  it('operator precedence: && vs ||', () => {
    // && and || have same precedence, left-to-right
    expect(dvala.run('true || false && false')).toBe(false) // (true || false) && false = false
    expect(dvala.run('false || true && true')).toBe(true) // (false || true) && true = true
  })

  it('pipe operator', () => {
    expect(dvala.run('[1, 2, 3] |> count')).toBe(3)
    expect(dvala.run('42 |> inc |> str')).toBe('43')
  })

  it('nullish coalescing', () => {
    expect(dvala.run('null ?? 42')).toBe(42)
    expect(dvala.run('10 ?? 42')).toBe(10)
    expect(dvala.run('false ?? 42')).toBe(false)
    expect(dvala.run('0 ?? 42')).toBe(0)
  })

  it('unary not', () => {
    expect(dvala.run('not(true)')).toBe(false)
    expect(dvala.run('not(false)')).toBe(true)
    expect(dvala.run('not(null)')).toBe(true)
    expect(dvala.run('not(0)')).toBe(true)
    expect(dvala.run('not(1)')).toBe(false)
  })

  it('string concatenation operator', () => {
    expect(dvala.run('"hello" ++ " " ++ "world"')).toBe('hello world')
  })

  it('comparison operators', () => {
    expect(dvala.run('1 < 2')).toBe(true)
    expect(dvala.run('2 > 1')).toBe(true)
    expect(dvala.run('1 <= 1')).toBe(true)
    expect(dvala.run('1 >= 2')).toBe(false)
    expect(dvala.run('1 == 1')).toBe(true)
    expect(dvala.run('1 != 2')).toBe(true)
  })

  it('negative number literals', () => {
    expect(dvala.run('-42')).toBe(-42)
    expect(dvala.run('-0')).toBe(-0)
  })

  it('multiline expression with semicolons', () => {
    expect(dvala.run(`
      let a = 1;
      let b = 2;
      let c = 3;
      a + b + c
    `)).toBe(6)
  })

  it('accessor on function result', () => {
    expect(dvala.run('first([10, 20, 30])')).toBe(10)
    expect(dvala.run('last([10, 20, 30])')).toBe(30)
  })

  it('chained method-style calls', () => {
    expect(dvala.run('reduce(map(filter([1, 2, 3, 4, 5], isOdd), -> $ * 2), +, 0)'))
      .toBe(18) // (1+3+5)*2 = 18
  })

  it('deeply nested if/else', () => {
    expect(dvala.run(`
      let classify = (n) ->
        if n > 100 then "huge"
        else if n > 50 then "big"
        else if n > 10 then "medium"
        else if n > 0 then "small"
        else "zero-or-negative"
        end;
      [classify(200), classify(75), classify(25), classify(5), classify(-1)]
    `)).toEqual(['huge', 'big', 'medium', 'small', 'zero-or-negative'])
  })

  it('if/else if with multiple branches', () => {
    expect(dvala.run(`
      let x = 3;
      if x == 1 then "one"
      else if x == 2 then "two"
      else if x == 3 then "three"
      else "other"
      end
    `)).toBe('three')
  })

  it('if with no matching branch returns null', () => {
    expect(dvala.run(`
      if false then "nope" end
    `)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 11. Higher-order function edge cases
// ---------------------------------------------------------------------------

describe('higher-order function edge cases', () => {
  it('map with shorthand function', () => {
    expect(dvala.run('map([1, 2, 3], -> $ * 2)')).toEqual([2, 4, 6])
  })

  it('filter with predicate', () => {
    expect(dvala.run('filter([1, 2, 3, 4, 5], isEven)')).toEqual([2, 4])
  })

  it('reduce with operator', () => {
    expect(dvala.run('reduce([1, 2, 3, 4, 5], +, 0)')).toBe(15)
  })

  it('comp composition', () => {
    expect(dvala.run('let f = comp(inc, -> $ * 2); f(5)')).toBe(11)
  })

  it('comp with multiple functions', () => {
    expect(dvala.run('let f = comp(str, inc, -> $ * 3); f(3)')).toBe('10')
  })

  it('apply function', () => {
    expect(dvala.run('apply(+, [1, 2])')).toBe(3)
  })

  it('isEvery with predicate', () => {
    expect(dvala.run('let { isEvery } = import("collection"); isEvery([2, 4, 6], isEven)')).toBe(true)
    expect(dvala.run('let { isEvery } = import("collection"); isEvery([2, 4, 5], isEven)')).toBe(false)
  })

  it('some with predicate returns element', () => {
    expect(dvala.run('some([1, 3, 4], isEven)')).toBe(4)
    expect(dvala.run('some([1, 3, 5], isEven)')).toBeNull()
  })

  it('sortBy with key function', () => {
    expect(dvala.run('let { sortBy } = import("sequence"); sortBy([{ n: 3 }, { n: 1 }, { n: 2 }], -> $.n)'))
      .toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('groupBy', () => {
    expect(dvala.run('let { groupBy } = import("sequence"); groupBy([1, 2, 3, 4, 5], -> if isEven($) then "even" else "odd" end)'))
      .toEqual({ odd: [1, 3, 5], even: [2, 4] })
  })

  it('find with key in object', () => {
    expect(dvala.run('find({ a: 1, b: 2, c: 3 }, "b")')).toEqual(['b', 2])
    expect(dvala.run('find({ a: 1, b: 2, c: 3 }, "z")')).toBeNull()
  })

  it('mapcat (flat-map)', () => {
    expect(dvala.run('let { mapcat } = import("sequence"); mapcat([[1, 2], [3, 4], [5]], identity)')).toEqual([1, 2, 3, 4, 5])
  })

  it('takeWhile / dropWhile', () => {
    expect(dvala.run('takeWhile([1, 2, 3, 4, 5], -> $ < 4)')).toEqual([1, 2, 3])
    expect(dvala.run('dropWhile([1, 2, 3, 4, 5], -> $ < 4)')).toEqual([4, 5])
  })

  it('map-indexed', () => {
    expect(dvala.run('let { mapi } = import("collection"); mapi(["a", "b", "c"], (x, i) -> str(i) ++ ":" ++ x)'))
      .toEqual(['0:a', '1:b', '2:c'])
  })

  it('zip', () => {
    expect(dvala.run('let { interleave } = import("sequence"); interleave([1, 2, 3], ["a", "b", "c"])'))
      .toEqual([1, 'a', 2, 'b', 3, 'c'])
  })

  it('nested HOFs', () => {
    expect(dvala.run(`
      let data = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
      map(data, (row) -> filter(row, isEven))
    `)).toEqual([[2], [4, 6], [8]])
  })

  it('identity function', () => {
    expect(dvala.run('identity(42)')).toBe(42)
    expect(dvala.run('identity("hello")')).toBe('hello')
    expect(dvala.run('identity([1, 2])')).toEqual([1, 2])
  })

  it('constantly function', () => {
    expect(dvala.run('let always42 = constantly(42); [always42(), always42(1), always42("x")]'))
      .toEqual([42, 42, 42])
  })
})

// ---------------------------------------------------------------------------
// 12. Dvala API edge cases
// ---------------------------------------------------------------------------

describe('dvala API edge cases', () => {
  it('tokenize produces a token stream', () => {
    const ts = tokenizeSource('1 + 2')
    expect(ts.tokens.length).toBeGreaterThan(0)
  })

  it('parse produces an AST', () => {
    const ast = parseTokenStream(tokenizeSource('1 + 2'))
    expect(ast.body.length).toBe(1)
  })

  it('transformSymbols transforms user-defined symbols', () => {
    const ts = tokenizeSource('let x = 1; x + y')
    const transformed = transformSymbols(ts, s => s === 'x' ? 'a' : s)
    const result = untokenize(transformed)
    expect(result).toBe('let a = 1; a + y')
  })

  it('getAutoCompleter returns an object', () => {
    const ac = getAutoCompleter('let x = ma', 10)
    expect(ac).toBeDefined()
  })

  it('empty program returns null', () => {
    expect(dvala.run('')).toBeNull()
  })

  it('whitespace-only program returns null', () => {
    expect(dvala.run('   ')).toBeNull()
  })

  it('multiple expressions — last wins', () => {
    expect(dvala.run('1; 2; 3')).toBe(3)
  })

  it('debug mode produces same results as non-debug', () => {
    const programs = [
      '1 + 2',
      'map([1, 2, 3], inc)',
      'let f = (x) -> x * 2; f(21)',
      'if true then "yes" else "no" end',
      'match [1, 2] case [a, b] then a + b end',
    ]
    for (const prog of programs) {
      expect(dvalaDebug.run(prog)).toEqual(dvala.run(prog))
    }
  })
})

// ---------------------------------------------------------------------------
// 13. Regex shorthand edge cases
// ---------------------------------------------------------------------------

describe('regex edge cases', () => {
  it('reMatch basic', () => {
    expect(dvala.run('reMatch("hello 42 world", #"(\\d+)")')).toEqual(['42', '42'])
  })

  it('reMatch no match returns null', () => {
    expect(dvala.run('reMatch("hello world", #"\\d+")')).toBeNull()
  })

  it('replace with regex', () => {
    expect(dvala.run('replace("hello 42", #"\\d+", "XX")')).toBe('hello XX')
  })

  it('replaceAll with regex', () => {
    expect(dvala.run('replaceAll("a1 b2 c3", #"\\d", "X")')).toBe('aX bX cX')
  })

  it('split with regex', () => {
    expect(dvala.run('split("a1b2c3", #"\\d")')).toEqual(['a', 'b', 'c', ''])
  })

  it('reMatch with no match check via isNull', () => {
    expect(dvala.run('isNull(reMatch("hello", #"\\d+"))')).toBe(true)
    expect(dvala.run('isNull(reMatch("hello 42", #"(\\d+)"))')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 14. String operations edge cases
// ---------------------------------------------------------------------------

describe('string operation edge cases', () => {
  it('str converts various types', () => {
    expect(dvala.run('str(42)')).toBe('42')
    expect(dvala.run('str(null)')).toBe('')
    expect(dvala.run('str(true)')).toBe('true')
    expect(dvala.run('str([1, 2, 3])')).toBe('[1,2,3]')
  })

  it('upperCase and lowerCase', () => {
    expect(dvala.run('upperCase("hello")')).toBe('HELLO')
    expect(dvala.run('lowerCase("HELLO")')).toBe('hello')
  })

  it('trim', () => {
    expect(dvala.run('trim("  hello  ")')).toBe('hello')
  })

  it('isStartsWith and isEndsWith', () => {
    expect(dvala.run('let { isStartsWith, isEndsWith } = import("sequence"); isStartsWith("hello world", "hello")')).toBe(true)
    expect(dvala.run('let { isStartsWith, isEndsWith } = import("sequence"); isEndsWith("hello world", "world")')).toBe(true)
  })

  it('contains on string', () => {
    expect(dvala.run('contains("hello world", "lo wo")')).toBe(true)
    expect(dvala.run('contains("hello world", "xyz")')).toBe(false)
  })

  it('split and join', () => {
    expect(dvala.run('split("a,b,c", ",")')).toEqual(['a', 'b', 'c'])
    expect(dvala.run('join(["a", "b", "c"], "-")')).toBe('a-b-c')
  })

  it('stringRepeat', () => {
    expect(dvala.run('let { stringRepeat } = import("string"); stringRepeat("ha", 3)')).toBe('hahaha')
  })

  it('padLeft and padRight', () => {
    expect(dvala.run('let { padLeft, padRight } = import("string"); padLeft("42", 5, "0")')).toBe('00042')
    expect(dvala.run('let { padLeft, padRight } = import("string"); padRight("42", 5, "0")')).toBe('42000')
  })

  it('slice for substring', () => {
    expect(dvala.run('slice("hello world", 0, 5)')).toBe('hello')
  })

  it('nth for char-at', () => {
    expect(dvala.run('nth("hello", 0)')).toBe('h')
    expect(dvala.run('nth("hello", 4)')).toBe('o')
  })
})

// ---------------------------------------------------------------------------
// 15. Collection / object operations
// ---------------------------------------------------------------------------

describe('collection operation edge cases', () => {
  it('count on various collections', () => {
    expect(dvala.run('count([1, 2, 3])')).toBe(3)
    expect(dvala.run('count("hello")')).toBe(5)
    expect(dvala.run('count({ a: 1, b: 2 })')).toBe(2)
    expect(dvala.run('count([])')).toBe(0)
    expect(dvala.run('count("")')).toBe(0)
    expect(dvala.run('count({})')).toBe(0)
  })

  it('keys and vals', () => {
    expect(dvala.run('keys({ a: 1, b: 2 })')).toEqual(['a', 'b'])
    expect(dvala.run('vals({ a: 1, b: 2 })')).toEqual([1, 2])
  })

  it('entries', () => {
    expect(dvala.run('entries({ a: 1, b: 2 })')).toEqual([['a', 1], ['b', 2]])
  })

  it('from-entries via reduce', () => {
    expect(dvala.run('reduce([["a", 1], ["b", 2]], (acc, pair) -> assoc(acc, nth(pair, 0), nth(pair, 1)), {})')).toEqual({ a: 1, b: 2 })
  })

  it('get and getIn', () => {
    expect(dvala.run('get({ a: 1 }, "a")')).toBe(1)
    expect(dvala.run('get({ a: 1 }, "b")')).toBeNull()
    expect(dvala.run('let { getIn } = import("collection"); getIn({ a: { b: { c: 42 } } }, ["a", "b", "c"])')).toBe(42)
  })

  it('assoc and dissoc', () => {
    expect(dvala.run('assoc({ a: 1 }, "b", 2)')).toEqual({ a: 1, b: 2 })
    expect(dvala.run('dissoc({ a: 1, b: 2 }, "a")')).toEqual({ b: 2 })
  })

  it('merge', () => {
    expect(dvala.run('merge({ a: 1 }, { b: 2 }, { c: 3 })')).toEqual({ a: 1, b: 2, c: 3 })
    expect(dvala.run('merge({ a: 1 }, { a: 2 })')).toEqual({ a: 2 })
  })

  it('push and ++', () => {
    expect(dvala.run('push([1, 2], 3)')).toEqual([1, 2, 3])
    expect(dvala.run('[1, 2] ++ [3, 4]')).toEqual([1, 2, 3, 4])
  })

  it('first, second, last, rest, pop', () => {
    expect(dvala.run('first([10, 20, 30])')).toBe(10)
    expect(dvala.run('second([10, 20, 30])')).toBe(20)
    expect(dvala.run('last([10, 20, 30])')).toBe(30)
    expect(dvala.run('rest([10, 20, 30])')).toEqual([20, 30])
    expect(dvala.run('pop([10, 20, 30])')).toEqual([10, 20])
  })

  it('reverse', () => {
    expect(dvala.run('reverse([1, 2, 3])')).toEqual([3, 2, 1])
    expect(dvala.run('reverse("hello")')).toBe('olleh')
  })

  it('flatten', () => {
    expect(dvala.run('flatten([[1, 2], [3, [4, 5]]])')).toEqual([1, 2, 3, 4, 5])
  })

  it('distinct', () => {
    expect(dvala.run('let { distinct } = import("sequence"); distinct([1, 2, 2, 3, 3, 3])')).toEqual([1, 2, 3])
  })

  it('sort', () => {
    expect(dvala.run('sort([3, 1, 4, 1, 5, 9, 2, 6])')).toEqual([1, 1, 2, 3, 4, 5, 6, 9])
  })

  it('range', () => {
    expect(dvala.run('range(5)')).toEqual([0, 1, 2, 3, 4])
    expect(dvala.run('range(1, 5)')).toEqual([1, 2, 3, 4])
    expect(dvala.run('range(0, 10, 3)')).toEqual([0, 3, 6, 9])
  })

  it('contains on array', () => {
    expect(dvala.run('contains([1, 2, 3], 2)')).toBe(true)
    expect(dvala.run('contains([1, 2, 3], 4)')).toBe(false)
  })

  it('indexOf', () => {
    expect(dvala.run('indexOf([10, 20, 30], 20)')).toBe(1)
    expect(dvala.run('indexOf([10, 20, 30], 99)')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 16. Math operations
// ---------------------------------------------------------------------------

describe('math operation edge cases', () => {
  it('basic arithmetic', () => {
    expect(dvala.run('1 + 2')).toBe(3)
    expect(dvala.run('10 - 3')).toBe(7)
    expect(dvala.run('4 * 5')).toBe(20)
    expect(dvala.run('10 / 2')).toBe(5)
    expect(dvala.run('10 % 3')).toBe(1)
  })

  it('integer division', () => {
    expect(dvala.run('7 / 2')).toBe(3.5)
  })

  it('power', () => {
    expect(dvala.run('2 ^ 10')).toBe(1024)
  })

  it('abs', () => {
    expect(dvala.run('abs(-42)')).toBe(42)
    expect(dvala.run('abs(42)')).toBe(42)
  })

  it('min and max', () => {
    expect(dvala.run('min(3, 1, 4, 1, 5)')).toBe(1)
    expect(dvala.run('max(3, 1, 4, 1, 5)')).toBe(5)
  })

  it('floor, ceil, round', () => {
    expect(dvala.run('floor(3.7)')).toBe(3)
    expect(dvala.run('ceil(3.2)')).toBe(4)
    expect(dvala.run('round(3.5)')).toBe(4)
  })

  it('sqrt', () => {
    expect(dvala.run('sqrt(144)')).toBe(12)
  })

  it('number predicates', () => {
    expect(dvala.run('isZero(0)')).toBe(true)
    expect(dvala.run('isZero(1)')).toBe(false)
    expect(dvala.run('isPos(1)')).toBe(true)
    expect(dvala.run('isNeg(-1)')).toBe(true)
    expect(dvala.run('isEven(4)')).toBe(true)
    expect(dvala.run('isOdd(3)')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 17. Complex real-world patterns
// ---------------------------------------------------------------------------

describe('complex real-world patterns', () => {
  it('fibonacci with memoization via closure', () => {
    expect(dvala.run(`
      let fib = (n) ->
        if n <= 1 then n
        else fib(n - 1) + fib(n - 2)
        end;
      map(range(10), fib)
    `)).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21, 34])
  })

  it('quicksort', () => {
    expect(dvala.run(`
      let qsort = (arr) ->
        if count(arr) <= 1 then arr
        else do
          let pivot = first(arr);
          let restArr = rest(arr);
          let lesser = filter(restArr, -> $ < pivot);
          let greater = filter(restArr, -> $ >= pivot);
          qsort(lesser) ++ [pivot] ++ qsort(greater)
        end end;
      qsort([3, 6, 8, 10, 1, 2, 1])
    `)).toEqual([1, 1, 2, 3, 6, 8, 10])
  })

  it('tree traversal via pattern matching', () => {
    expect(dvala.run(`
      let treeSum = (tree) ->
        match tree
          case n when isNumber(n) then n
          case { val, left, right } then val + treeSum(left) + treeSum(right)
          case { val, left } then val + treeSum(left)
          case { val, right } then val + treeSum(right)
          case { val } then val
          case _ then 0
        end;
      treeSum({
        val: 1,
        left: { val: 2, left: 3, right: 4 },
        right: { val: 5, right: 6 }
      })
    `)).toBe(21) // 1+2+3+4+5+6
  })

  it('pipeline processing', () => {
    expect(dvala.run(`
      let data = [
        { name: "alice", score: 85 },
        { name: "bob", score: 92 },
        { name: "charlie", score: 78 },
        { name: "diana", score: 95 },
        { name: "eve", score: 88 }
      ];
      sort(map(filter(data, -> $.score >= 85), -> $.name))
    `)).toEqual(['alice', 'bob', 'diana', 'eve'])
  })

  it('state machine via match', () => {
    expect(dvala.run(`
      let transition = (state, event) ->
        match [state, event]
          case ["idle", "start"] then "running"
          case ["running", "pause"] then "paused"
          case ["paused", "resume"] then "running"
          case ["running", "stop"] then "idle"
          case ["paused", "stop"] then "idle"
          case [s, _] then s
        end;

      let events = ["start", "pause", "resume", "stop"];
      reduce(events, transition, "idle")
    `)).toBe('idle')
  })

  it('compose multiple transformations', () => {
    expect(dvala.run(`
      let { distinct } = import("sequence");
      let process = (data) -> do
        let flat = flatten(data);
        let positive = filter(flat, -> $ > 0);
        let sorted = sort(positive);
        distinct(sorted)
      end;
      process([[3, -1, 2], [2, 4, -3], [1, 3, 5]])
    `)).toEqual([1, 2, 3, 4, 5])
  })

  it('deeply nested data transformation', () => {
    expect(dvala.run(`
      let data = {
        users: [
          { name: "alice", tags: ["admin", "user"] },
          { name: "bob", tags: ["user"] },
          { name: "charlie", tags: ["admin", "moderator"] }
        ]
      };
      let admins = map(filter(data.users, -> contains($.tags, "admin")), -> $.name);
      admins
    `)).toEqual(['alice', 'charlie'])
  })
})
