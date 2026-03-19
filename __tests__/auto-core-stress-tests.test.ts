/**
 * Auto-generated stress tests: Core language subsystem edge cases.
 *
 * These tests target non-effect areas that have thin test coverage or
 * complex interactions that could hide bugs:
 *
 *  1. Round-trip fidelity (tokenize → untokenize)
 *  2. Module system & file module edge cases
 *  3. Type annotations / predicates (vector?, matrix?, grid?)
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

    // If / cond
    'if true then 1 else 2 end',
    'cond case true then 1 case false then 2 end',

    // Loop / for
    'loop(i = 0, acc = 0) -> if i >= 5 then acc else recur(i + 1, acc + i) end',
    'for (x in [1, 2, 3]) -> x * 2',
    'for (x in [1, 2, 3] when odd?(x)) -> x',

    // Match
    'match x case 1 then "one" case _ then "other" end',
    'match [1, 2] case [a, b] then a + b end',
    'match { name: "alice" } case { name } then name end',

    // do/with
    'do perform(@my.eff) with case @my.eff then (args) -> 42 end',

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
    'map(filter([1, 2, 3, 4, 5], odd?), -> $ * 2)',
    'reduce([1, 2, 3], +, 0)',

    // Comments should be stripped but code preserved
    'let x = 1; x + 2',

    // Import
    'import(vector)',
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
      let v1 = import(vector);
      let v2 = import(vector);
      identical?(v1, v2)
    `)
    expect(result).toBe(true)
  })

  it('destructuring import', () => {
    const result = dvala.run('let { stdev } = import(vector); stdev([2, 4, 4, 4, 5, 5, 7, 9])')
    expect(result).toBe(2)
  })

  it('module function call works', () => {
    const result = dvala.run('let m = import(number-theory); m.gcd(12, 8)')
    expect(result).toBe(4)
  })

  it('import unknown module throws', () => {
    expect(() => dvala.run('import(nonexistent)')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 3. Type annotations / predicates (vector?, matrix?, grid?)
// ---------------------------------------------------------------------------

describe('type annotations / predicates', () => {
  it('vector? on numeric array is true', () => {
    expect(dvala.run('vector?([1, 2, 3])')).toBe(true)
  })

  it('vector? on empty array is true', () => {
    expect(dvala.run('vector?([])')).toBe(true)
  })

  it('vector? on mixed array is false', () => {
    expect(dvala.run('vector?([1, "two", 3])')).toBe(false)
  })

  it('vector? on non-array is false', () => {
    expect(dvala.run('vector?(42)')).toBe(false)
    expect(dvala.run('vector?("hello")')).toBe(false)
    expect(dvala.run('vector?({ a: 1 })')).toBe(false)
  })

  it('matrix? on 2d numeric array is true', () => {
    expect(dvala.run('matrix?([[1, 2], [3, 4]])')).toBe(true)
  })

  it('matrix? on non-rectangular array is false', () => {
    expect(dvala.run('matrix?([[1, 2], [3]])')).toBe(false)
  })

  it('matrix? on 2d non-numeric array is false', () => {
    expect(dvala.run('matrix?([["a", "b"], ["c", "d"]])')).toBe(false)
  })

  it('matrix? on 1d array is false', () => {
    expect(dvala.run('matrix?([1, 2, 3])')).toBe(false)
  })

  it('grid? on 2d array is true', () => {
    expect(dvala.run('grid?([["a", "b"], ["c", "d"]])')).toBe(true)
  })

  it('grid? on 2d numeric array (matrix) is also true', () => {
    expect(dvala.run('grid?([[1, 2], [3, 4]])')).toBe(true)
  })

  it('grid? on empty array is false', () => {
    expect(dvala.run('grid?([])')).toBe(false)
  })

  it('grid? on 1d array is false', () => {
    expect(dvala.run('grid?([1, 2, 3])')).toBe(false)
  })

  it('grid? on non-rectangular 2d array is false', () => {
    expect(dvala.run('grid?([["a", "b"], ["c"]])')).toBe(false)
  })

  it('type predicates on results of operations', () => {
    expect(dvala.run('vector?(map([1, 2, 3], inc))')).toBe(true)
    expect(dvala.run('vector?(map([1, 2, 3], str))')).toBe(false)
    expect(dvala.run('matrix?(map([[1, 2], [3, 4]], -> map($, inc)))')).toBe(true)
  })

  it('grid? on grid module results', () => {
    expect(dvala.run('let g = import(grid); grid?(g.transpose([[1, 2], [3, 4]]))')).toBe(true)
  })

  it('matrix? on grid module results with numeric data', () => {
    expect(dvala.run('let g = import(grid); matrix?(g.transpose([[1, 2], [3, 4]]))')).toBe(true)
  })

  it('vector? on vector module results', () => {
    expect(dvala.run('let v = import(vector); vector?(v.mode([1, 2, 2, 3]))')).toBe(true)
  })

  it('type predicates are consistent between debug and non-debug mode', () => {
    const programs = [
      'vector?([1, 2, 3])',
      'matrix?([[1, 2], [3, 4]])',
      'grid?([["a", "b"], ["c", "d"]])',
      'vector?([1, "two", 3])',
      'matrix?([[1, 2], [3]])',
    ]
    for (const prog of programs) {
      expect(dvalaDebug.run(prog)).toBe(dvala.run(prog))
    }
  })

  it('array? on various types', () => {
    expect(dvala.run('array?([1, 2, 3])')).toBe(true)
    expect(dvala.run('array?([])')).toBe(true)
    expect(dvala.run('array?("hello")')).toBe(false)
    expect(dvala.run('array?(42)')).toBe(false)
    expect(dvala.run('array?(null)')).toBe(false)
    expect(dvala.run('array?({ a: 1 })')).toBe(false)
  })

  it('type predicate results used in control flow', () => {
    expect(dvala.run(`
      let classify = (x) ->
        cond
          case vector?(x) then "vector"
          case matrix?(x) then "matrix" 
          case grid?(x) then "grid"
          case array?(x) then "array"
          case true then "other"
        end;
      [classify([1, 2]), classify([[1, 2], [3, 4]]), classify([["a"], ["b"]]), classify("hello")]
    `)).toEqual(['vector', 'matrix', 'grid', 'other'])
  })

  it('vector? after map-then-filter with numeric pipeline', () => {
    expect(dvala.run('vector?(filter(map([1, 2, 3, 4, 5], -> $ * 2), -> $ > 4))')).toBe(true)
  })

  it('grid? on array with empty inner arrays is false', () => {
    // Inner arrays must have length > 0
    expect(dvala.run('grid?([[], []])')).toBe(false)
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
      let is-big = (x) -> x > 100;
      match 42
        case x when is-big(x) then "big"
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
      let classify-all = (items) ->
        map(items, (item) ->
          match item
            case n when number?(n) then "num"
            case s when string?(s) then "str"
            case _ then "other"
          end
        );
      classify-all([1, "hello", null, 42, "world"])
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
      let make-counter = (start) -> (step) -> start + step;
      let from10 = make-counter(10);
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
    expect(dvala.run('let f = -> x * 2; f()', { bindings: { x: 21 } })).toBe(42)
  })

  it('host bindings can be shadowed by let', () => {
    expect(dvala.run('let x = 100; x', { bindings: { x: 42 } })).toBe(100)
  })

  it('recursive closure works correctly', () => {
    expect(dvala.run(`
      let factorial = (n) -> if n <= 1 then 1 else n * factorial(n - 1) end;
      factorial(6)
    `)).toBe(720)
  })

  it('mutual recursion via lets', () => {
    expect(dvala.run(`
      let is-even = (n) -> if n == 0 then true else is-odd(n - 1) end;
      let is-odd = (n) -> if n == 0 then false else is-even(n - 1) end;
      [is-even(4), is-odd(5), is-even(3)]
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
    expect(dvala.run('upper-case("hello")', { pure: true })).toBe('HELLO')
  })

  it('pure array operations work', () => {
    expect(dvala.run('map([1, 2, 3], inc)', { pure: true })).toEqual([2, 3, 4])
    expect(dvala.run('filter([1, 2, 3, 4, 5], even?)', { pure: true })).toEqual([2, 4])
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
    expect(dvala.run('for (x in [1, 2, 3, 4, 5] when odd?(x)) -> x * x', { pure: true }))
      .toEqual([1, 9, 25])
  })

  it('pure destructuring works', () => {
    expect(dvala.run('let [a, b, c] = [10, 20, 12]; a + b + c', { pure: true })).toBe(42)
    expect(dvala.run('let { x, y } = { x: 10, y: 32 }; x + y', { pure: true })).toBe(42)
  })

  it('pure with host bindings works', () => {
    expect(dvala.run('x + y', { pure: true, bindings: { x: 10, y: 32 } })).toBe(42)
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
    expect(getUndefinedSymbols('x + 1', { bindings: { x: 42 } })).toEqual(new Set())
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
    expect(getUndefinedSymbols('let v = import(vector); v.stdev([1, 2, 3])'))
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
  it('division by zero produces NaN error', () => {
    expect(() => dvala.run('0 / 0')).toThrow('NaN')
  })

  it('undefined symbol error includes symbol name', () => {
    expect(() => dvala.run('undefined-symbol-xyz')).toThrow('undefined-symbol-xyz')
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
    expect(dvala.run('let [min-val, max-val] = [min(3, 1, 2), max(3, 1, 2)]; [min-val, max-val]'))
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
    expect(dvala.run('reduce(map(filter([1, 2, 3, 4, 5], odd?), -> $ * 2), +, 0)'))
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
        end end end end;
      [classify(200), classify(75), classify(25), classify(5), classify(-1)]
    `)).toEqual(['huge', 'big', 'medium', 'small', 'zero-or-negative'])
  })

  it('cond with multiple cases', () => {
    expect(dvala.run(`
      let x = 3;
      cond
        case x == 1 then "one"
        case x == 2 then "two"
        case x == 3 then "three"
        case true then "other"
      end
    `)).toBe('three')
  })

  it('cond with no matching case returns null', () => {
    expect(dvala.run(`
      cond
        case false then "nope"
      end
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
    expect(dvala.run('filter([1, 2, 3, 4, 5], even?)')).toEqual([2, 4])
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

  it('every? with predicate', () => {
    expect(dvala.run('let { every? } = import(collection); every?([2, 4, 6], even?)')).toBe(true)
    expect(dvala.run('let { every? } = import(collection); every?([2, 4, 5], even?)')).toBe(false)
  })

  it('some with predicate returns element', () => {
    expect(dvala.run('some([1, 3, 4], even?)')).toBe(4)
    expect(dvala.run('some([1, 3, 5], even?)')).toBeNull()
  })

  it('sort-by with key function', () => {
    expect(dvala.run('let { sort-by } = import(sequence); sort-by([{ n: 3 }, { n: 1 }, { n: 2 }], -> $.n)'))
      .toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('group-by', () => {
    expect(dvala.run('let { group-by } = import(sequence); group-by([1, 2, 3, 4, 5], -> if even?($) then "even" else "odd" end)'))
      .toEqual({ odd: [1, 3, 5], even: [2, 4] })
  })

  it('find with key in object', () => {
    expect(dvala.run('find({ a: 1, b: 2, c: 3 }, "b")')).toEqual(['b', 2])
    expect(dvala.run('find({ a: 1, b: 2, c: 3 }, "z")')).toBeNull()
  })

  it('mapcat (flat-map)', () => {
    expect(dvala.run('mapcat([[1, 2], [3, 4], [5]], identity)')).toEqual([1, 2, 3, 4, 5])
  })

  it('take-while / drop-while', () => {
    expect(dvala.run('take-while([1, 2, 3, 4, 5], -> $ < 4)')).toEqual([1, 2, 3])
    expect(dvala.run('drop-while([1, 2, 3, 4, 5], -> $ < 4)')).toEqual([4, 5])
  })

  it('map-indexed', () => {
    expect(dvala.run('let { mapi } = import(collection); mapi(["a", "b", "c"], (x, i) -> str(i) ++ ":" ++ x)'))
      .toEqual(['0:a', '1:b', '2:c'])
  })

  it('zip', () => {
    expect(dvala.run('let { interleave } = import(sequence); interleave([1, 2, 3], ["a", "b", "c"])'))
      .toEqual([1, 'a', 2, 'b', 3, 'c'])
  })

  it('nested HOFs', () => {
    expect(dvala.run(`
      let data = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
      map(data, (row) -> filter(row, even?))
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
  it('re-match basic', () => {
    expect(dvala.run('re-match("hello 42 world", #"(\\d+)")')).toEqual(['42', '42'])
  })

  it('re-match no match returns null', () => {
    expect(dvala.run('re-match("hello world", #"\\d+")')).toBeNull()
  })

  it('replace with regex', () => {
    expect(dvala.run('replace("hello 42", #"\\d+", "XX")')).toBe('hello XX')
  })

  it('replace-all with regex', () => {
    expect(dvala.run('replace-all("a1 b2 c3", #"\\d", "X")')).toBe('aX bX cX')
  })

  it('split with regex', () => {
    expect(dvala.run('split("a1b2c3", #"\\d")')).toEqual(['a', 'b', 'c', ''])
  })

  it('re-match with no match check via null?', () => {
    expect(dvala.run('null?(re-match("hello", #"\\d+"))')).toBe(true)
    expect(dvala.run('null?(re-match("hello 42", #"(\\d+)"))')).toBe(false)
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

  it('upper-case and lower-case', () => {
    expect(dvala.run('upper-case("hello")')).toBe('HELLO')
    expect(dvala.run('lower-case("HELLO")')).toBe('hello')
  })

  it('trim', () => {
    expect(dvala.run('trim("  hello  ")')).toBe('hello')
  })

  it('starts-with? and ends-with?', () => {
    expect(dvala.run('let { starts-with?, ends-with? } = import(sequence); starts-with?("hello world", "hello")')).toBe(true)
    expect(dvala.run('let { starts-with?, ends-with? } = import(sequence); ends-with?("hello world", "world")')).toBe(true)
  })

  it('contains? on string', () => {
    expect(dvala.run('contains?("hello world", "lo wo")')).toBe(true)
    expect(dvala.run('contains?("hello world", "xyz")')).toBe(false)
  })

  it('split and join', () => {
    expect(dvala.run('split("a,b,c", ",")')).toEqual(['a', 'b', 'c'])
    expect(dvala.run('join(["a", "b", "c"], "-")')).toBe('a-b-c')
  })

  it('string-repeat', () => {
    expect(dvala.run('let { string-repeat } = import(string); string-repeat("ha", 3)')).toBe('hahaha')
  })

  it('pad-left and pad-right', () => {
    expect(dvala.run('let { pad-left, pad-right } = import(string); pad-left("42", 5, "0")')).toBe('00042')
    expect(dvala.run('let { pad-left, pad-right } = import(string); pad-right("42", 5, "0")')).toBe('42000')
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

  it('get and get-in', () => {
    expect(dvala.run('get({ a: 1 }, "a")')).toBe(1)
    expect(dvala.run('get({ a: 1 }, "b")')).toBeNull()
    expect(dvala.run('let { get-in } = import(collection); get-in({ a: { b: { c: 42 } } }, ["a", "b", "c"])')).toBe(42)
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
    expect(dvala.run('let { distinct } = import(sequence); distinct([1, 2, 2, 3, 3, 3])')).toEqual([1, 2, 3])
  })

  it('sort', () => {
    expect(dvala.run('sort([3, 1, 4, 1, 5, 9, 2, 6])')).toEqual([1, 1, 2, 3, 4, 5, 6, 9])
  })

  it('range', () => {
    expect(dvala.run('range(5)')).toEqual([0, 1, 2, 3, 4])
    expect(dvala.run('range(1, 5)')).toEqual([1, 2, 3, 4])
    expect(dvala.run('range(0, 10, 3)')).toEqual([0, 3, 6, 9])
  })

  it('contains? on array', () => {
    expect(dvala.run('contains?([1, 2, 3], 2)')).toBe(true)
    expect(dvala.run('contains?([1, 2, 3], 4)')).toBe(false)
  })

  it('index-of', () => {
    expect(dvala.run('index-of([10, 20, 30], 20)')).toBe(1)
    expect(dvala.run('index-of([10, 20, 30], 99)')).toBeNull()
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
    expect(dvala.run('zero?(0)')).toBe(true)
    expect(dvala.run('zero?(1)')).toBe(false)
    expect(dvala.run('pos?(1)')).toBe(true)
    expect(dvala.run('neg?(-1)')).toBe(true)
    expect(dvala.run('even?(4)')).toBe(true)
    expect(dvala.run('odd?(3)')).toBe(true)
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
          let rest-arr = rest(arr);
          let lesser = filter(rest-arr, -> $ < pivot);
          let greater = filter(rest-arr, -> $ >= pivot);
          qsort(lesser) ++ [pivot] ++ qsort(greater)
        end end;
      qsort([3, 6, 8, 10, 1, 2, 1])
    `)).toEqual([1, 1, 2, 3, 6, 8, 10])
  })

  it('tree traversal via pattern matching', () => {
    expect(dvala.run(`
      let tree-sum = (tree) ->
        match tree
          case n when number?(n) then n
          case { val, left, right } then val + tree-sum(left) + tree-sum(right)
          case { val, left } then val + tree-sum(left)
          case { val, right } then val + tree-sum(right)
          case { val } then val
          case _ then 0
        end;
      tree-sum({
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
      let { distinct } = import(sequence);
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
      let admins = map(filter(data.users, -> contains?($.tags, "admin")), -> $.name);
      admins
    `)).toEqual(['alice', 'charlie'])
  })
})
