import { describe, expect, it } from 'vitest'
import { Dvala } from '../src/Dvala/Dvala'

describe('jsFunctions integration', () => {
  const syncJsFunctions = {
    jsAdd: (a: number, b: number) => a + b,
    jsGreet: (name: string) => `Hello, ${name}!`,
    jsDouble: (x: number) => x * 2,
    jsAddAll: (...args: number[]) => args.reduce((a, b) => a + b, 0),
    jsId: (x: unknown) => x,
  }

  const asyncJsFunctions = {
    fetchValue: async (x: number) => x * 10,
    asyncAdd: async (a: number, b: number) => a + b,
    asyncGreet: async (name: string) => `Hi, ${name}!`,
    asyncFail: async () => { throw new Error('async failure') },
  }

  const allJsFunctions = { ...syncJsFunctions, ...asyncJsFunctions }

  describe('dvala.run with sync JS functions', () => {
    const dvala = new Dvala()

    it('should call a simple sync JS function', () => {
      expect(dvala.run('jsAdd(3, 4)', { bindings: syncJsFunctions })).toBe(7)
    })

    it('should call a string-returning JS function', () => {
      expect(dvala.run('jsGreet("World")', { bindings: syncJsFunctions })).toBe('Hello, World!')
    })

    it('should use JS function in arithmetic expression', () => {
      expect(dvala.run('jsDouble(5) + 3', { bindings: syncJsFunctions })).toBe(13)
    })

    it('should compose multiple JS function calls', () => {
      expect(dvala.run('jsDouble(jsAdd(3, 4))', { bindings: syncJsFunctions })).toBe(14)
    })

    it('should use JS function with variadic args', () => {
      expect(dvala.run('jsAddAll(1, 2, 3, 4, 5)', { bindings: syncJsFunctions })).toBe(15)
    })

    it('should use JS function in let binding', () => {
      expect(dvala.run('let x = jsAdd(10, 20); jsDouble(x)', { bindings: syncJsFunctions })).toBe(60)
    })

    it('should use JS function in conditional', () => {
      expect(dvala.run('if jsAdd(1, 1) == 2 then jsGreet("Yes") else jsGreet("No") end', { bindings: syncJsFunctions })).toBe('Hello, Yes!')
    })

    it('should pass JS function as higher-order argument', () => {
      expect(dvala.run('map([1, 2, 3], jsDouble)', { bindings: syncJsFunctions })).toEqual([2, 4, 6])
    })

    it('should use JS function with filter', () => {
      const jsFunctions = {
        ...syncJsFunctions,
        isEven: (x: number) => x % 2 === 0,
      }
      expect(dvala.run('filter([1, 2, 3, 4, 5, 6], isEven)', { bindings: jsFunctions })).toEqual([2, 4, 6])
    })

    it('should use JS function with reduce', () => {
      expect(dvala.run('reduce([1, 2, 3, 4], jsAdd, 0)', { bindings: syncJsFunctions })).toBe(10)
    })

    it('should use JS function in pipe', () => {
      expect(dvala.run('3 |> jsDouble |> jsDouble', { bindings: syncJsFunctions })).toBe(12)
    })

    it('should assign JS function to variable and call it', () => {
      expect(dvala.run('let f = jsDouble; f(7)', { bindings: syncJsFunctions })).toBe(14)
    })

    it('should handle JS function returning various types', () => {
      expect(dvala.run('jsId(null)', { bindings: syncJsFunctions })).toBeNull()
      expect(dvala.run('jsId(true)', { bindings: syncJsFunctions })).toBe(true)
      expect(dvala.run('jsId(42)', { bindings: syncJsFunctions })).toBe(42)
      expect(dvala.run('jsId("hi")', { bindings: syncJsFunctions })).toBe('hi')
      expect(dvala.run('jsId([1, 2])', { bindings: syncJsFunctions })).toEqual([1, 2])
    })

    it('should mix JS functions with built-in functions', () => {
      expect(dvala.run('inc(jsDouble(10))', { bindings: syncJsFunctions })).toBe(21)
      expect(dvala.run('str(jsGreet("Dvala"), " ", "Welcome!")', { bindings: syncJsFunctions })).toBe('Hello, Dvala! Welcome!')
    })

    it('should use JS function inside user-defined function', () => {
      const program = 'let quadruple = x -> jsDouble(jsDouble(x)); quadruple(5)'
      expect(dvala.run(program, { bindings: syncJsFunctions })).toBe(20)
    })
  })

  describe('dvala.async.run with sync JS functions', () => {
    const dvala = new Dvala()

    it('should work with sync JS functions through async.run', async () => {
      expect(await dvala.async.run('jsAdd(3, 4)', { bindings: syncJsFunctions })).toBe(7)
    })

    it('should compose sync JS functions through async.run', async () => {
      expect(await dvala.async.run('jsDouble(jsAdd(10, 5))', { bindings: syncJsFunctions })).toBe(30)
    })

    it('should use sync JS functions with HOFs through async.run', async () => {
      expect(await dvala.async.run('map([1, 2, 3], jsDouble)', { bindings: syncJsFunctions })).toEqual([2, 4, 6])
    })
  })

  describe('dvala.async.run with async JS functions', () => {
    const dvala = new Dvala()

    it('should call a simple async JS function', async () => {
      expect(await dvala.async.run('fetchValue(5)', { bindings: allJsFunctions })).toBe(50)
    })

    it('should call an async JS function returning a string', async () => {
      expect(await dvala.async.run('asyncGreet("World")', { bindings: allJsFunctions })).toBe('Hi, World!')
    })

    it('should use async JS function in arithmetic', async () => {
      expect(await dvala.async.run('fetchValue(3) + 5', { bindings: allJsFunctions })).toBe(35)
    })

    it('should compose async and sync JS functions', async () => {
      expect(await dvala.async.run('jsDouble(fetchValue(4))', { bindings: allJsFunctions })).toBe(80)
    })

    it('should use async JS function in let binding', async () => {
      expect(await dvala.async.run('let x = asyncAdd(10, 20); x * 2', { bindings: allJsFunctions })).toBe(60)
    })

    it('should use async JS function in conditional', async () => {
      expect(await dvala.async.run('if asyncAdd(1, 1) == 2 then "yes" else "no" end', { bindings: allJsFunctions })).toBe('yes')
    })

    it('should use async JS function with map', async () => {
      expect(await dvala.async.run('map([1, 2, 3], fetchValue)', { bindings: allJsFunctions })).toEqual([10, 20, 30])
    })

    it('should use async JS function with filter', async () => {
      const jsFunctions = {
        ...allJsFunctions,
        asyncIsPositive: async (x: number) => x > 0,
      }
      expect(await dvala.async.run('filter([-2, -1, 0, 1, 2], asyncIsPositive)', { bindings: jsFunctions })).toEqual([1, 2])
    })

    it('should use async JS function with reduce', async () => {
      expect(await dvala.async.run('reduce([1, 2, 3, 4], asyncAdd, 0)', { bindings: allJsFunctions })).toBe(10)
    })

    it('should use async JS function in a pipe', async () => {
      expect(await dvala.async.run('5 |> fetchValue |> jsDouble', { bindings: allJsFunctions })).toBe(100)
    })

    it('should handle async failure in try/catch', async () => {
      expect(await dvala.async.run('try asyncFail() catch "caught" end', { bindings: allJsFunctions })).toBe('caught')
    })

    it('should use async JS functions in do block', async () => {
      const result = await dvala.async.run('do fetchValue(1); fetchValue(2); asyncAdd(3, 4) end', { bindings: allJsFunctions })
      expect(result).toBe(7)
    })

    it('should handle multiple async calls in sequence', async () => {
      const program = `
        let a = fetchValue(1);
        let b = fetchValue(2);
        asyncAdd(a, b)
      `
      expect(await dvala.async.run(program, { bindings: allJsFunctions })).toBe(30)
    })

    it('should mix async JS functions with built-in functions', async () => {
      expect(await dvala.async.run('inc(fetchValue(5))', { bindings: allJsFunctions })).toBe(51)
      expect(await dvala.async.run('str("Value: ", fetchValue(3))', { bindings: allJsFunctions })).toBe('Value: 30')
    })

    it('should use async JS function inside user-defined function', async () => {
      const program = 'let compute = x -> asyncAdd(fetchValue(x), jsDouble(x)); compute(5)'
      expect(await dvala.async.run(program, { bindings: allJsFunctions })).toBe(60)
    })
  })

  describe('dvala.run throws on async JS functions', () => {
    const dvala = new Dvala()

    it('should throw when sync run encounters an async JS function', () => {
      expect(() => dvala.run('fetchValue(5)', { bindings: asyncJsFunctions })).toThrow('Unexpected async result')
    })
  })
})
