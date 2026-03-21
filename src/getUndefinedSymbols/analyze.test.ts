import { describe, expect, it } from 'vitest'
import { getUndefinedSymbols } from '../tooling'

describe('analyze', () => {
  it('unresolvedIdentifiers', () => {
    expect((getUndefinedSymbols('a + 10'))).toEqual(new Set(['a']))
    expect((getUndefinedSymbols('let a = 10; a + 10'))).toEqual(new Set())
    expect((getUndefinedSymbols('let a = 10; a + b'))).toEqual(new Set(['b']))
    expect((getUndefinedSymbols('do let a = 10; a + 2; end; a'))).toEqual(new Set(['a']))
    expect((getUndefinedSymbols('do let a = 10; a + b; end; a'))).toEqual(new Set(['a', 'b']))
    expect((getUndefinedSymbols('let a = 10; "a" ++ "b"'))).toEqual(new Set())
    expect((getUndefinedSymbols('foo(bar)'))).toEqual(new Set(['foo', 'bar']))
    expect((getUndefinedSymbols('({bar: a + b })'))).toEqual(new Set(['a', 'b']))
    expect((getUndefinedSymbols('{ bar: a + b }.bar'))).toEqual(new Set(['a', 'b']))
    expect((getUndefinedSymbols('foo(d, E)'))).toEqual(new Set(['foo', 'd'])) // E is not reported due to that e is a builtin function: (e) -> 2.718281828459045
    expect((getUndefinedSymbols('foo(d, f)'))).toEqual(new Set(['foo', 'd', 'f']))
    expect(
      getUndefinedSymbols(`
          let foo = [];
          let data1 = 1;
          let data2 = data1 + 1;
          let data3 = data2 + 1;
          data3`),
    ).toEqual(new Set([]))
    expect(getUndefinedSymbols('parallel(a, b, 1)')).toEqual(new Set(['a', 'b']))
    expect(getUndefinedSymbols('parallel(1, 2, 3)')).toEqual(new Set([]))
    expect(getUndefinedSymbols('race(x, y)')).toEqual(new Set(['x', 'y']))
    expect(getUndefinedSymbols('race(1, 2)')).toEqual(new Set([]))
  })

  it('handle...with handlers', () => {
    // handle...with handler: no undefined symbols
    expect(getUndefinedSymbols(`
      handle
        perform(@dvala.io.println, "hello")
      with [(eff, arg, nxt) -> if eff == @dvala.io.println then null else nxt(eff, arg) end]
      end`)).toEqual(new Set([]))

    // undefined symbol in handler function
    expect(getUndefinedSymbols(`
      handle
        1
      with [(eff, arg, nxt) -> if eff == @dvala.io.println then undefinedHandler else nxt(eff, arg) end]
      end`)).toEqual(new Set(['undefinedHandler']))

    // undefined symbol in handler effect expression
    expect(getUndefinedSymbols(`
      handle
        1
      with [(eff, arg, nxt) -> if eff == unknownEffect then null else nxt(eff, arg) end]
      end`)).toEqual(new Set(['unknownEffect']))
  })
})
