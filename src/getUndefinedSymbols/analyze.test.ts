import { describe, expect, it } from 'vitest'
import { Dvala } from '../Dvala/Dvala'

describe('analyze', () => {
  const dvala = new Dvala()
  it('unresolvedIdentifiers', () => {
    expect((dvala.getUndefinedSymbols('a + 10'))).toEqual(new Set(['a']))
    expect((dvala.getUndefinedSymbols('let a = 10; a + 10'))).toEqual(new Set())
    expect((dvala.getUndefinedSymbols('let a = 10; a + b'))).toEqual(new Set(['b']))
    expect((dvala.getUndefinedSymbols('do let a = 10; a + 2; end; a'))).toEqual(new Set(['a']))
    expect((dvala.getUndefinedSymbols('do let a = 10; a + b; end; a'))).toEqual(new Set(['a', 'b']))
    expect((dvala.getUndefinedSymbols('let a = 10; "a" ++ "b"'))).toEqual(new Set())
    expect((dvala.getUndefinedSymbols('foo(bar)'))).toEqual(new Set(['foo', 'bar']))
    expect((dvala.getUndefinedSymbols('({bar: a + b })'))).toEqual(new Set(['a', 'b']))
    expect((dvala.getUndefinedSymbols('{ bar: a + b }.bar'))).toEqual(new Set(['a', 'b']))
    expect((dvala.getUndefinedSymbols('foo(d, E)'))).toEqual(new Set(['foo', 'd'])) // E is not reported due to that e is a builtin function: (e) -> 2.718281828459045
    expect((dvala.getUndefinedSymbols('foo(d, f)'))).toEqual(new Set(['foo', 'd', 'f']))
    expect(
      dvala.getUndefinedSymbols(`
          let foo = [];
          let data1 = 1;
          let data2 = data1 + 1;
          let data3 = data2 + 1;
          data3`),
    ).toEqual(new Set([]))
    expect(dvala.getUndefinedSymbols('parallel(a, b, 1)')).toEqual(new Set(['a', 'b']))
    expect(dvala.getUndefinedSymbols('parallel(1, 2, 3)')).toEqual(new Set([]))
    expect(dvala.getUndefinedSymbols('race(x, y)')).toEqual(new Set(['x', 'y']))
    expect(dvala.getUndefinedSymbols('race(1, 2)')).toEqual(new Set([]))
  })

  it('do...with handlers', () => {
    // with-handler body: undefined symbols in effect expr and handler fn
    expect(dvala.getUndefinedSymbols(`
      do
        perform(effect(dvala.log), "hello")
      with
        case effect(dvala.log) then (args) -> null
      end`)).toEqual(new Set([]))

    // undefined symbol in handler function
    expect(dvala.getUndefinedSymbols(`
      do
        1
      with
        case effect(dvala.log) then (args) -> undefinedHandler
      end`)).toEqual(new Set(['undefinedHandler']))

    // undefined symbol in effect expression of case
    expect(dvala.getUndefinedSymbols(`
      do
        1
      with
        case unknownEffect then (args) -> null
      end`)).toEqual(new Set(['unknownEffect']))
  })
})
