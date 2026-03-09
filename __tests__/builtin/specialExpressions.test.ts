import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, test, vitest } from 'vitest'
import { createDvala } from '../../src/createDvala'
import type { UserDefinedError } from '../../src/errors'
import { DvalaError } from '../../src/errors'
import type { Arr } from '../../src/interface'
import { getUndefinedSymbols } from '../../src/tooling'

const dvala = createDvala()
const dvalaDebug = createDvala({ debug: true })

describe('specialExpressions', () => {
  let logSpy: Mock

  let stdoutSpy: { mockRestore: () => void }
  beforeEach(() => {
    logSpy = vitest.fn()
    stdoutSpy = vitest.spyOn(process.stdout, 'write').mockImplementation(((...args: unknown[]) => {
      logSpy(...args)
      return true
    }) as typeof process.stdout.write)
  })
  afterEach(() => {
    stdoutSpy.mockRestore()
  })
  it('error message', () => {
    const dvalaNoDebug = createDvala()
    let failed = false
    try {
      dvalaNoDebug.run('perform(effect(dvala.error), slice("An error", 3))')
      failed = true
    }
    catch (error) {
      expect((error as UserDefinedError).message).toBe('error')
    }
    if (failed)
      throw new Error('Should have thrown an error')

    try {
      failed = false
      dvalaDebug.run('perform(effect(dvala.error), slice("An error", 3))')
      failed = true
    }
    catch (error) {
      expect((error as UserDefinedError).message).toBe(
        'error\nLocation 1:1\nperform(effect(dvala.error), slice("An error", 3))\n^                                                 ',
      )
    }
    if (failed)
      throw new Error('Should have thrown an error')
  })

  describe('array.', () => {
    test('spread', () => {
      expect(dvala.run('[...[1, 2], 3, ...[4, 5]]')).toEqual([1, 2, 3, 4, 5])
      expect(dvala.run('let x = [1, 2, 3]; [...x, ...x]')).toEqual([1, 2, 3, 1, 2, 3])
      expect(() => dvala.run('[1, ...{}]')).toThrow(DvalaError)
    })
    it('samples', () => {
      expect(dvala.run('[]')).toEqual([])
      expect(dvala.run('array(1)')).toEqual([1])
      expect(dvala.run('array(0, "1", null, true, false, array([]), object())')).toEqual([0, '1', null, true, false, [[]], {}])
    })
    it('shorthand samples', () => {
      expect(dvala.run('[]')).toEqual([])
      expect(dvala.run('[1]')).toEqual([1])
      expect((dvala.run('[null]') as Arr)[0]).toEqual(null)
      expect(dvala.run('[0, "1", null, true, false, [[]], object()]')).toEqual([0, '1', null, true, false, [[]], {}])
    })
    test('findUnresolvedIdentifiers', () => {
      expect(getUndefinedSymbols('array(1, a, b)')).toEqual(new Set(['a', 'b']))
      expect(getUndefinedSymbols('array(1, 2, 3)')).toEqual(new Set())
      expect(getUndefinedSymbols('[1, ...x]')).toEqual(new Set('x'))
      expect(getUndefinedSymbols('[1, ...[...[x], y]]')).toEqual(new Set(['x', 'y']))
      expect(getUndefinedSymbols('let {a = b} = {};')).toEqual(new Set(['b']))
      expect(getUndefinedSymbols('let foo = ({a = b} = {}) -> do a end;')).toEqual(new Set(['b']))
    })
  })

  describe('object.', () => {
    test('spread', () => {
      expect(dvala.run('let x = { x: 10 };{ ...x, b: 20 }')).toEqual({ x: 10, b: 20 })
      expect(dvala.run('{ ...{ a: 10 }, b: 20 }')).toEqual({ a: 10, b: 20 })
      expect(dvala.run('{ ...{ a: 10 }, a: 20 }')).toEqual({ a: 20 })
      expect(dvala.run('{ a: 10, ...{ b: 20 } }')).toEqual({ a: 10, b: 20 })
      expect(dvala.run('{ a: 10, ...{ a: 20 } }')).toEqual({ a: 20 })
      expect(dvala.run('{ a: 10, ...{} }')).toEqual({ a: 10 })
      expect(dvala.run('{ \'a\': 10, ...{} }')).toEqual({ a: 10 })
      expect(() => dvala.run('{ a: 10, ...[] }')).toThrow(DvalaError)
    })
    it('samples', () => {
      expect(dvala.run('let foo = "foo"; { [foo]: "bar" }')).toEqual({ foo: 'bar' })
      expect(dvala.run('object()')).toEqual({})
      expect(dvala.run('object("x", 1)')).toEqual({ x: 1 })
      expect(dvala.run('object("x", null)')).toEqual({ x: null })
      expect(dvala.run('{ a: 10, ...{b: 20}}')).toEqual({ a: 10, b: 20 })
      expect(dvala.run('{ a: 10, ...{a: 20}}')).toEqual({ a: 20 })
      expect(dvala.run('object("x", 1, "x", 2)')).toEqual({ x: 2 })
      expect(dvala.run('object("a", null, "b", true, "c", false, "d", 0, "e", object("x", []))')).toEqual({
        a: null,
        b: true,
        c: false,
        d: 0,
        e: { x: [] },
      })
      expect(dvala.run('let a = "a"; object(a, 1)')).toEqual({ a: 1 })
      expect(() => dvala.run('{ [10]: "bar" }')).toThrow(DvalaError)
      expect(() => dvala.run('{ ["x"]: "bar" }')).not.toThrow(DvalaError)
      expect(() => dvala.run('object("x")')).toThrow(DvalaError)
      expect(() => dvala.run('object("x")')).toThrow(DvalaError)
      expect(() => dvala.run('object("x", 1, "y")')).toThrow(DvalaError)
      expect(() => dvala.run('object(0, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('object(true, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('object(false, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('object(null, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('object([], 1)')).toThrow(DvalaError)
      expect(() => dvala.run('object(object(), 1)')).toThrow(DvalaError)
    })
    test('findUnresolvedIdentifiers', () => {
      expect(getUndefinedSymbols('{ [foo]: bar }')).toEqual(new Set(['foo', 'bar']))
      expect(getUndefinedSymbols('object("x", 1, a, b)')).toEqual(new Set(['a', 'b']))
      expect(getUndefinedSymbols('object("x", 1, 2, 3)')).toEqual(new Set())
      expect(getUndefinedSymbols('{ x: 1, ...y }')).toEqual(new Set('y'))
      expect(getUndefinedSymbols('{ x: 1, ...{ ...{ a: y }, z: z } }')).toEqual(new Set(['y', 'z']))
    })
  })

  describe('let', () => {
    it('samples', () => {
      expect(dvala.run('let a = 10; a')).toBe(10)
      expect(dvala.run('let a = 10; do let a = 20; end; a')).toBe(10)
      expect(() => dvala.run('let true = false;')).toThrow(DvalaError)
      expect(() => dvala.run('let 1 = 10;')).toThrow(DvalaError)
      expect(() => dvala.run('let x:x = 10;')).not.toThrow(DvalaError)
      expect(() => dvala.run('let x: = 10;')).toThrow(DvalaError)
      expect(() => dvala.run('let null = 10;')).toThrow(DvalaError)
      expect(() => dvala.run('let false = 10;')).toThrow(DvalaError)
      expect(() => dvala.run('let true = 10;')).toThrow(DvalaError)
      expect(() => dvala.run('let [] = 10;')).toThrow(DvalaError)
      expect(() => dvala.run('let {} = 10;')).toThrow(DvalaError)
      expect(() => dvala.run('let { a: 10 };')).toThrow(DvalaError)
      expect(() => dvala.run('let "a" = 10;')).toThrow(DvalaError)
    })

    it('local variable', () => {
      const program = `
      let x = "A";
      perform(effect(dvala.io.println), x);       // A
      do
        let x = "B";
        perform(effect(dvala.io.println), x)      // B
      end;
        
      perform(effect(dvala.io.println), x)        // A - global variable x
      `
      dvala.run(program)
      expect(logSpy).toHaveBeenNthCalledWith(1, 'A\n')
      expect(logSpy).toHaveBeenNthCalledWith(2, 'B\n')
      expect(logSpy).toHaveBeenNthCalledWith(3, 'A\n')
    })
    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect(() => getUndefinedSymbols('let recur = a + b;')).toThrow(DvalaError)
        expect(() => getUndefinedSymbols('let + = a + b;')).toThrow(DvalaError)
        expect(getUndefinedSymbols('let [a = b] = [];')).toEqual(new Set(['b']))
        expect(getUndefinedSymbols('let foo = a + b;')).toEqual(new Set(['a', 'b']))
        expect(getUndefinedSymbols('let foo = a + b; foo')).toEqual(new Set(['a', 'b']))
      })
    })
  })

  describe('if', () => {
    it('samples', () => {
      expect(dvalaDebug.run('if true then "A" else "B" end')).toBe('A')
      expect(dvala.run('if false then "A" else "B" end')).toBe('B')
      expect(dvala.run('if null then "A" else "B" end')).toBe('B')
      expect(dvala.run('if true then "A" end')).toBe('A')
      expect(dvala.run('if false then "A" end')).toBeNull()
      expect(dvala.run('if null then "A" end')).toBeNull()
      expect(dvala.run('if "" then "A" else "B" end')).toBe('B')
      expect(dvala.run('if "x" then "A" else "B" end')).toBe('A')
      expect(dvala.run('if 0 then "A" else "B" end')).toBe('B')
      expect(dvala.run('if 1 then "A" else "B" end')).toBe('A')
      expect(dvala.run('if -1 then "A" else "B" end')).toBe('A')
      expect(dvala.run('if [] then "A" else "B" end')).toBe('A')
      expect(dvala.run('if {} then "A" else "B" end')).toBe('A')
      expect(() => dvala.run('if')).toThrow(DvalaError)
      expect(() => dvala.run('if true then end')).toThrow(DvalaError)
    })
    it('that special form \'if\' only evaluate the correct path (true)', () => {
      dvala.run('if true then perform(effect(dvala.io.println), "A") else perform(effect(dvala.io.println), "B") end')
      expect(logSpy).toHaveBeenCalledWith('A\n')
      expect(logSpy).not.toHaveBeenCalledWith('B\n')
    })
    it('that special form \'if\' only evaluate the correct path (false)', () => {
      dvala.run('if false then perform(effect(dvala.io.println), "A") else perform(effect(dvala.io.println), "B") end')
      expect(logSpy).not.toHaveBeenCalledWith('A\n')
      expect(logSpy).toHaveBeenCalledWith('B\n')
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('if a > b then a else b end'))).toEqual(new Set(['a', 'b']))
        expect((getUndefinedSymbols('if a > b then c else d end'))).toEqual(new Set(['a', 'b', 'c', 'd']))
      })
    })
  })

  describe('unless', () => {
    it('samples', () => {
      expect(dvalaDebug.run('unless true then "A" else "B" end')).toBe('B')
      expect(dvalaDebug.run('unless false then "A" else "B" end')).toBe('A')
      expect(dvala.run('unless null then "A" else "B" end')).toBe('A')
      expect(dvala.run('unless true then "A" end')).toBeNull()
      expect(dvala.run('unless false then "A" end')).toBe('A')
      expect(dvala.run('unless null then "A" end')).toBe('A')
      expect(dvala.run('unless "" then "A" else "B" end')).toBe('A')
      expect(dvala.run('unless "x" then "A" else "B" end')).toBe('B')
      expect(dvala.run('unless 0 then "A" else "B" end')).toBe('A')
      expect(dvala.run('unless 1 then "A" else "B" end')).toBe('B')
      expect(dvala.run('unless -1 then "A" else "B" end')).toBe('B')
      expect(dvala.run('unless [] then "A" else "B" end')).toBe('B')
      expect(dvala.run('unless object() then "A" else "B" end')).toBe('B')
      expect(() => dvala.run('unless')).toThrow(DvalaError)
      expect(() => dvala.run('unless true then end')).toThrow(DvalaError)
    })
    it('that special form \'unless\' only evaluate the correct path (true)', () => {
      dvala.run('unless true then perform(effect(dvala.io.println), "A") else perform(effect(dvala.io.println), "B") end')
      expect(logSpy).toHaveBeenCalledWith('B\n')
      expect(logSpy).not.toHaveBeenCalledWith('A\n')
    })
    it('that special form \'unless\' only evaluate the correct path (false)', () => {
      dvala.run('unless false then perform(effect(dvala.io.println), "A") else perform(effect(dvala.io.println), "B") end')
      expect(logSpy).not.toHaveBeenCalledWith('B\n')
      expect(logSpy).toHaveBeenCalledWith('A\n')
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('unless a > b then a else b end'))).toEqual(new Set(['a', 'b']))
        expect((getUndefinedSymbols('unless a > b then c else d end'))).toEqual(new Set(['a', 'b', 'c', 'd']))
      })
    })
  })

  describe('&&', () => {
    it('samples', () => {
      expect(dvala.run('0 && 1')).toBe(0)
      expect(dvala.run('2 && 1')).toBe(1)
      expect(dvala.run('&&()')).toBe(true)
      expect(dvala.run('&&(0)')).toBe(0)
      expect(dvala.run('&&(0, 1)')).toBe(0)
      expect(dvala.run('&&(2, 0)')).toBe(0)
      expect(dvala.run('&&(2, 0, 1)')).toBe(0)
      expect(dvala.run('&&(2, 3, 0)')).toBe(0)
      expect(dvala.run('&&(2, 3, "")')).toBe('')
      expect(dvala.run('&&(2, 3, "x")')).toBe('x')
      expect(dvala.run('&&(false, 1)')).toBe(false)
      expect(dvala.run('&&(1, false)')).toBe(false)
      expect(dvala.run('&&(1, null)')).toBe(null)
      expect(dvala.run('&&(2, 2, false)')).toBe(false)
      expect(dvala.run('&&(3, true, 3)')).toBe(3)
    })
    describe('short circuit', () => {
      it('true, false', () => {
        expect(dvala.run('&&(true, false)')).toBe(false)
      })
      it('true, 1', () => {
        expect(dvala.run('&&(true, 1)')).toBe(1)
      })
      it('false, true', () => {
        // If && doesn't short-circuit, dvala.error would throw
        expect(dvala.run('&&(false, perform(effect(dvala.error), "not short-circuited"))')).toBe(false)
      })
      it('false, 0', () => {
        expect(dvala.run('&&(false, perform(effect(dvala.error), "not short-circuited"))')).toBe(false)
      })
    })
    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('&&(false, b)'))).toEqual(new Set(['b']))
      })
    })
  })

  describe('||', () => {
    it('samples', () => {
      expect(dvala.run('0 || 1')).toBe(1)
      expect(dvala.run('2 || 0')).toBe(2)
      expect(dvala.run('||()')).toBe(false)
      expect(dvala.run('||(0)')).toBe(0)
      expect(dvala.run('||(0, 1)')).toBe(1)
      expect(dvala.run('||(2, 0)')).toBe(2)
      expect(dvala.run('||(null, 0, false)')).toBe(false)
      expect(dvala.run('||(null, 0, 1)')).toBe(1)
    })
    describe('short circuit', () => {
      it('true, false', () => {
        // If || doesn't short-circuit, dvala.error would throw
        expect(dvala.run('||(true, perform(effect(dvala.error), "not short-circuited"))')).toBe(true)
      })
      it('true, 1', () => {
        expect(dvala.run('||(true, perform(effect(dvala.error), "not short-circuited"))')).toBe(true)
      })
      it('false, true', () => {
        expect(dvala.run('||(false, true)')).toBe(true)
      })
      it('false, 0', () => {
        expect(dvala.run('||(false, 0)')).toBe(0)
      })
    })
    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('||(true, b, c + d)'))).toEqual(new Set(['b', 'c', 'd']))
      })
    })
  })

  describe('cond', () => {
    it('samples', () => {
      expect(dvala.run(`
cond
  case true then 10
  case true then 20
end`)).toBe(10)
      expect(dvala.run(`
cond
  case false then 10
  case false then 20
end`)).toBeNull()
      expect(dvala.run('cond case true then 10 end')).toBe(10)
      expect(dvala.run('cond case false then 20 case true then 5 + 5 end')).toBe(10)
      expect(dvala.run(`
cond
  case 5 > 10 then 20
  case 10 > 10 then 5 + 5
  case 10 >= 10 then 5 + 5 + 5
end`)).toBe(15)
    })
    it('middle condition true', () => {
      expect(
        dvala.run(`
cond
  case 5 > 10 then 20
  case 10 >= 10 then 5 + 5
  case 10 > 10 then 5 + 5 + 5
end`),
      ).toBe(10)
      expect(logSpy).not.toHaveBeenCalled()
    })
    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('cond case true then a case false then b case a > 1 then c case true then d end'))).toEqual(
          new Set(['a', 'b', 'c', 'd']),
        )
      })
    })
  })

  describe('match', () => {
    it('samples', () => {
      expect(dvala.run(`
let x = "-";
match x
  case "-" then 5 + 5
  case 2 then 20
end`)).toBe(10)
      expect(dvala.run('match true case true then 10 end')).toBe(10)
      expect(dvala.run('match true case false then 10 end')).toBeNull()
      expect(dvala.run('match true case false then 20 case true then 10 end')).toBe(10)
      expect(
        dvala.run(`
match 2
  case 0 then 20
  case 1 then 10
  case 2 then 15
end`),
      ).toBe(15)
    })
    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('match foo case true then a case false then b case _ then d end'))).toEqual(
          new Set(['foo', 'a', 'b', 'd']),
        )
      })
    })
  })

  describe('function', () => {
    test('accessing property on function', () => {
      expect(() => dvala.run(`
        let foo = () -> do
          10
        end;

        foo.bar
        `)).toThrow()
    })

    test('accessing number on function', () => {
      expect(() => dvala.run(`
        let foo = () -> do
          10
        end;

        foo[1]
        `)).toThrow()
    })

    test('lexical scoping', () => {
      expect(dvala.run(`
      let bar = do
        let x = 10;
        let foo = (a) -> do a * x end;
        foo;
      end;
      
      bar(1)
      `)).toBe(10)
    })

    it('samples', () => {
      expect(dvala.run(`
let add = (a, b) -> do
  a + b
end;
add(1, 2)`)).toBe(3)
      expect(dvala.run('let add = () -> do 10 end; add()')).toBe(10)
      expect(() => dvala.run('let add = (...x = []) -> do x end;')).toThrow(DvalaError)
      expect(() => dvala.run('let \' = 0_lambda\'() -> do 10 end;')).toThrow(DvalaError)
      expect(() => dvala.run('\'0_lambda\'();')).toThrow(DvalaError)
    })

    test('default argument', () => {
      expect(dvala.run(`
let foo = (a, b = 10) -> do
  a + b
end;

foo(1)`)).toBe(11)

      expect(dvala.run(`
  let foo = (a, b = a + 1) -> do
    a + b
  end;
  
  foo(1)`)).toBe(3)

      expect(dvala.run(`
    let foo = (a, b = a + 1) -> do
      a + b
    end;
    
    foo(1, 1)`)).toBe(2)

      expect(dvala.run(`
      let foo = (a, b = a + 1, c = a + b) -> do
        a + b + c
      end;
      
      foo(1)`)).toBe(6)
    })

    it('call function', () => {
      expect(dvala.run(`
let sum-one-to-n = (n) -> do
  if n <= 1 then
    n
  else
    n + sum-one-to-n(n - 1)
  end
end;

sum-one-to-n(10)`)).toBe(55)
      expect(dvala.run(`
let applyWithVal = (fun, val) -> do
  fun(val)
end;

applyWithVal(inc, 10)`)).toBe(11)
    })
    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols(`
let foo = (a) -> do
  if a == 1 then
    1
  else
    a + self(a - 1)
  end
end;`))).toEqual(
          new Set(),
        )
        expect((getUndefinedSymbols('let foo = (a, b) -> do str(a, b, c) end;'))).toEqual(new Set(['c']))
        expect((getUndefinedSymbols('let foo = (a, b) -> do str(a, b, c) end; foo(x, y)'))).toEqual(
          new Set(['c', 'x', 'y']),
        )
        expect((getUndefinedSymbols('let add = (a, b, ...the-rest) -> do a + b; [a](10) end;'))).toEqual(new Set())
      })
    })
  })

  it('shorthand lambda', () => {
    expect(dvala.run('(-> $1 + $2 + $3)(2, 4, 6)')).toBe(12)
    expect(dvala.run('(-> if $1 then $2 else $3 end)(2, 4, 6)')).toBe(4)
    expect(dvala.run('((a, b, c) -> if a then b else c end)(0, 4, 6)')).toBe(6)
  })

  describe('unresolvedIdentifiers', () => {
    it('samples', () => {
      expect((getUndefinedSymbols('(a, b) -> str(a, b, c)'))).toEqual(new Set(['c']))
      expect((getUndefinedSymbols('let foo = (a, b) -> str(a, b, c); foo(1, x)'))).toEqual(
        new Set(['c', 'x']),
      )
      expect((getUndefinedSymbols('(a, b, ...the-rest) -> do a + b; [a](10) end'))).toEqual(new Set())
    })
  })

  describe('block', () => {
    it('samples', () => {
      expect(dvala.run('do [1, 2, 3]; "[1]"; 1 + 2 end')).toBe(3)
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('do [a, 2, 3]; "[1]"; 1 + b end'))).toEqual(new Set(['a', 'b']))
      })
    })
  })

  describe('recur', () => {
    it('should work with function', () => {
      dvala.run(`
let foo = (n) -> do
  perform(effect(dvala.io.println), n);
  if not(zero?(n)) then
    recur(n - 1)
  end
end;
foo(3)`)
      expect(logSpy).toHaveBeenNthCalledWith(1, '3\n')
      expect(logSpy).toHaveBeenNthCalledWith(2, '2\n')
      expect(logSpy).toHaveBeenNthCalledWith(3, '1\n')
      expect(logSpy).toHaveBeenNthCalledWith(4, '0\n')
    })
    it('recur must be called with the right number of parameters', () => {
      expect(() => dvala.run('let foo = (n) -> do if not(zero?(n)) then recur() end end; foo(3)')).toThrow(DvalaError)
      expect(() => dvala.run('let foo = (n) -> do if not(zero?(n)) then recur(n - 1) end end; foo(3)')).not.toThrow()
      // Too many parameters ok
      expect(() => dvala.run('let foo = (n) -> do if not(zero?(n)) then recur(n - 1, 1) end end; foo(3)')).not.toThrow()
      expect(() => dvala.run('((n) -> do if not(zero?(n)) then recur() end end;)(3)')).toThrow(DvalaError)
      expect(() => dvala.run('((n) -> if not(zero?(n)) then recur(n - 1) end)(3)')).not.toThrow()
      expect(() => dvala.run('((n) -> if not(zero?(n)) recur(n - 1 1) then(3) end')).toThrow(DvalaError)
      expect(() => dvala.run('((n) -> if not(zero?(n)) recur(n - 1 1, 2) then(3) end')).toThrow(DvalaError)
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('(-> if not(zero?($)) then recur($ - 1) end)(3)')))
          .toEqual(new Set())
        expect((getUndefinedSymbols('(-> if not(zero?($)) then recur($ - a) end)(3)')))
          .toEqual(new Set('a'))
      })
    })
  })

  describe('loop', () => {
    describe('loop expressions', () => {
      it('supports loop expressions', () => {
        expect(dvala.run(`
          loop(n = 10, acc = 0) -> do
            if n == 0 then
              acc
            else
              recur(n - 1, acc + n)
            end
          end`)).toBe(55)
      })
    })

    it('should work with recur', () => {
      dvala.run('loop (n = 3) -> do perform(effect(dvala.io.println), n); if not(zero?(n)) then recur(n - 1) end end')
      expect(logSpy).toHaveBeenNthCalledWith(1, '3\n')
      expect(logSpy).toHaveBeenNthCalledWith(2, '2\n')
      expect(logSpy).toHaveBeenNthCalledWith(3, '1\n')
      expect(logSpy).toHaveBeenNthCalledWith(4, '0\n')
    })
    it('recur must be called with right number of parameters', () => {
      expect(() => dvalaDebug.run('loop (n = 3) -> if not(zero?(n)) then recur() end')).toThrow(DvalaError)
      expect(() => dvala.run('loop (n = 3) -> if not(zero?(n)) then recur(n - 1) end')).not.toThrow()
      expect(() => dvala.run('loop (n = 3) -> if not(zero?(n)) then recur(n - 1, 2) end')).toThrow(DvalaError)
      expect(() => dvala.run('loop () -> if not(zero?(n)) then recur() end')).toThrow(DvalaError)
      expect(() => dvala.run('loop (n = 3) -> if not(zero?(n)) then recur(perform(effect(dvala.error), 1)) end')).toThrow(DvalaError)
    })
    it('error in loop should propagate', () => {
      expect(() => dvala.run('loop (n = 3) -> if not(zero?(n)) then perform(effect(dvala.error), str(recur(n - 1, 2))) end')).toThrow(DvalaError)
      expect(() => dvala.run('loop (n) -> if not(zero?(n)) then recur(n - 1) end')).toThrow(DvalaError)
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect(
          (getUndefinedSymbols('loop (n = 3) -> do perform(effect(dvala.io.println), str(n)); if not(zero?(n)) then recur(n - 1) end end')),
        ).toEqual(new Set())
        expect(
          (getUndefinedSymbols('loop (n = 3) -> do perform(effect(dvala.io.println), str(x)); if not(zero?(n)) then recur(n - 1) end end')),
        ).toEqual(new Set(['x']))
        expect(getUndefinedSymbols('loop (n = 3 + y) -> do perform(effect(dvala.io.println), str(n)); if not(zero?(x)) then recur(n - 1) end end'))
          .toEqual(new Set(['x', 'y']))
      })
    })
  })

  describe('for', () => {
    it('samples', () => {
      expect(dvalaDebug.run('for (x in []) -> x')).toEqual([])
      expect(dvala.run('for (x in [1, 2, 3], y in []) -> x')).toEqual([])
      expect(dvala.run('for (x in [], y in [1, 2, 3]) -> x')).toEqual([])

      expect(dvala.run('for (x in "Al", y in [1, 2]) -> repeat(x, y)'))
        .toEqual([['A'], ['A', 'A'], ['l'], ['l', 'l']])
      expect(dvala.run('for (x in { a: 10, b: 20 }, y in [1, 2] let z = y) -> do repeat(x, z) end')).toEqual([
        [['a', 10]],
        [
          ['a', 10],
          ['a', 10],
        ],
        [['b', 20]],
        [
          ['b', 20],
          ['b', 20],
        ],
      ])
      expect(() => dvala.run('for (x in { a: 10, b: 20 }, y in [1, 2] let z = y let z = y) -> repeat(x, z)')).toThrow(DvalaError)
      expect(() => dvala.run('for (x in { a: 10, b: 20 }, x in [1, 2]) -> x')).toThrow(DvalaError)
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect(
          (getUndefinedSymbols('for (x in [0, 1, 2, 3, 4, 5] let y = x * 3 when even?(y)) -> y')),
        ).toEqual(new Set())
        expect(
          (getUndefinedSymbols('for (x in [0, 1, 2, 3, 4, 5] let y = x * 3 while even?(y)) -> y')),
        ).toEqual(new Set())
        expect(
          (getUndefinedSymbols('for (x in [0, 1, 2, 3, 4, a] let y = x * b when even?(c)) -> d')),
        ).toEqual(new Set(['a', 'b', 'c', 'd']))
        expect(
          (getUndefinedSymbols('for (x in [0, 1, 2, 3, 4, a] let y = x * b while even?(c)) -> d')),
        ).toEqual(new Set(['a', 'b', 'c', 'd']))
      })
    })
  })

  describe('doseq', () => {
    it('samples', () => {
      expect(dvala.run('doseq (x in []) -> x')).toBeNull()
      expect(dvala.run('doseq (x in [1, 2, 3], y in []) -> x')).toBeNull()
      expect(dvala.run('doseq (x in [], y in [1, 2, 3]) -> x')).toBeNull()

      expect(dvala.run('doseq (x in "Al", y in [1, 2]) -> do repeat(x, y) end'))
        .toBeNull()
      expect(dvala.run('doseq (x in { a: 10, b: 20 }, y in [1, 2]) -> repeat(x, y)')).toBeNull()
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect(
          (getUndefinedSymbols('doseq (x in [0, 1, 2, 3, 4, 5] let y = x * 3 when even?(y)) -> y')),
        ).toEqual(new Set())
        expect(
          (getUndefinedSymbols('doseq (x in [0, 1, 2, 3, 4, 5] let y = x * 3 while even?(y)) -> y')),
        ).toEqual(new Set())
        expect(
          (getUndefinedSymbols('doseq (x in [0, 1, 2, 3, 4, a] let y = x * b when even?(c)) -> d')),
        ).toEqual(new Set(['a', 'b', 'c', 'd']))
      })
    })
  })

  describe('defined?', () => {
    it('samples', () => {
      expect(dvala.run('defined?(foo)')).toBe(false)
      expect(dvala.run('let foo = "foo"; defined?(foo)')).toBe(true)
      expect(dvala.run('defined?(+)')).toBe(true)
      expect(dvala.run('let foo = null; defined?(foo)')).toBe(true)

      expect(() => dvala.run('defined?()')).toThrow(DvalaError)
      expect(() => dvala.run('defined?(foo, bar)')).toThrow(DvalaError)
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect((getUndefinedSymbols('defined?(x)'))).toEqual(new Set(['x']))
      })
    })
  })

  describe('??', () => {
    it('samples', () => {
      expect(dvala.run('??(foo)')).toBe(null)
      expect(dvala.run('??(foo, 0)')).toBe(0)
      expect(dvalaDebug.run('??(foo, 0)')).toBe(0)
      expect(dvalaDebug.run('??(0, 1)')).toBe(0)
      expect(dvala.run('??("")')).toBe('')
      expect(dvala.run('??(null)')).toBe(null)
      expect(dvala.run('??(null, 0)')).toBe(0)
      expect(dvala.run('??(false)')).toBe(false)
      expect(dvala.run('let foo = "foo"; ??(foo)')).toBe('foo')
      expect(dvala.run('??(null, null, 3)')).toBe(3)
      expect(dvala.run('??(foo, bar)')).toBe(null)
      expect(dvala.run('??(foo, bar, 42)')).toBe(42)

      expect(() => dvala.run('??()')).toThrow(DvalaError)
    })

    describe('unresolvedIdentifiers', () => {
      it('samples', () => {
        expect(getUndefinedSymbols('??(x)')).toEqual(new Set(['x']))
        expect(getUndefinedSymbols('??(x, y)')).toEqual(new Set(['x', 'y']))
      })
    })
  })
  describe('passing special expression as arguments', () => {
    test('samples', () => {
      expect(dvala.run(`
let foo = (a, b, c) -> do a(b, c) end;
foo(&&, true, false)`)).toBe(false)
    })
  })
  describe('import', () => {
    it('should throw on wrong number of arguments', () => {
      expect(() => dvala.run('import()')).toThrow(DvalaError)
      expect(() => dvala.run('import(vector, grid)')).toThrow(DvalaError)
    })
    it('should throw on non-symbol argument', () => {
      expect(() => dvala.run('import("vector")')).toThrow(DvalaError)
      expect(() => dvala.run('import(42)')).toThrow(DvalaError)
    })
  })
})
