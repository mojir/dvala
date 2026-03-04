/**
 * Bundle variant tests — verify that entry points work correctly.
 *
 * - Minimal (src/index.ts): Dvala core, no module definitions, no docs data
 * - Full (src/full.ts): Dvala core + all modules + docs/reference data
 * - Individual module entry points: export the correct module
 */
import { describe, expect, it } from 'vitest'
import { Dvala } from '../src/index'
import { Dvala as DvalaFull, allBuiltinModules, apiReference } from '../src/full'
import { assertModule } from '../src/modules/assertion'
import { gridModule } from '../src/modules/grid'
import { vectorModule } from '../src/modules/vector'
import { linearAlgebraModule } from '../src/modules/linear-algebra'
import { matrixModule } from '../src/modules/matrix'
import { numberTheoryModule } from '../src/modules/number-theory'
import { stringUtilsModule } from '../src/modules/string'
import { collectionUtilsModule } from '../src/modules/collection'
import { sequenceUtilsModule } from '../src/modules/sequence'
import { bitwiseUtilsModule } from '../src/modules/bitwise'
import { functionalUtilsModule } from '../src/modules/functional'
import { mathUtilsModule } from '../src/modules/math'
import { convertModule } from '../src/modules/convert'

describe('minimal entry point (src/index.ts)', () => {
  it('should evaluate core expressions without modules', () => {
    const dvala = new Dvala()
    expect(dvala.run('1 + 2')).toBe(3)
    expect(dvala.run('map([1, 2, 3], inc)')).toEqual([2, 3, 4])
    expect(dvala.run('let x = 10; x * x')).toBe(100)
  })

  it('should default to no modules', () => {
    const dvala = new Dvala()
    expect(() => dvala.run('import(assertion)')).toThrow()
  })

  it('should accept individual modules passed in', () => {
    const dvala = new Dvala({ modules: [vectorModule] })
    expect(dvala.run('let v = import(vector); v.stdev([1, 2, 3])')).toBeCloseTo(0.8165, 3)
  })

  // NOTE: cannot test "doc returns empty" here because importing src/full.ts
  // triggers initReferenceData as a side effect. That behavior is tested
  // indirectly: without the import, doc(+) would return ''.
})

describe('full entry point (src/full.ts)', () => {
  it('should evaluate core expressions', () => {
    const dvala = new DvalaFull({ modules: allBuiltinModules })
    expect(dvala.run('1 + 2')).toBe(3)
  })

  it('should have all modules available via allBuiltinModules', () => {
    const dvala = new DvalaFull({ modules: allBuiltinModules })
    expect(dvala.run('let a = import(assertion); a.assert=(1, 1)')).toBe(null)
    expect(dvala.run('let v = import(vector); v.stdev([1, 2, 3])')).toBeCloseTo(0.8165, 3)
    expect(dvala.run('let g = import(grid); g.row([[1, 2], [3, 4]], 0)')).toEqual([1, 2])
    expect(dvala.run('let nt = import(number-theory); nt.prime?(7)')).toBe(true)
  })

  it('should have reference data loaded (doc returns non-empty)', () => {
    const dvala = new DvalaFull({ modules: allBuiltinModules })
    const docString = dvala.run('doc(+)') as string
    expect(docString.length).toBeGreaterThan(0)
    expect(docString).toContain('+')
  })

  it('should export apiReference', () => {
    expect(apiReference).toBeDefined()
    expect(Object.keys(apiReference).length).toBeGreaterThan(0)
  })

  it('should export allBuiltinModules with 13 modules', () => {
    expect(allBuiltinModules).toHaveLength(13)
  })
})

describe('individual module entry points', () => {
  it('assertion module', () => {
    expect(assertModule.name).toBe('assertion')
    const dvala = new Dvala({ modules: [assertModule] })
    expect(dvala.run('let a = import(assertion); a.assert=(1, 1)')).toBe(null)
    expect(() => dvala.run('import(vector)')).toThrow()
  })

  it('grid module', () => {
    expect(gridModule.name).toBe('grid')
    const dvala = new Dvala({ modules: [gridModule] })
    expect(dvala.run('let g = import(grid); g.row([[1, 2], [3, 4]], 0)')).toEqual([1, 2])
  })

  it('vector module', () => {
    expect(vectorModule.name).toBe('vector')
    const dvala = new Dvala({ modules: [vectorModule] })
    expect(dvala.run('let v = import(vector); v.stdev([1, 2, 3])')).toBeCloseTo(0.8165, 3)
  })

  it('linearAlgebra module', () => {
    expect(linearAlgebraModule.name).toBe('linear-algebra')
    const dvala = new Dvala({ modules: [linearAlgebraModule] })
    expect(dvala.run('let la = import(linear-algebra); la.dot([1, 2, 3], [4, 5, 6])')).toBe(32)
  })

  it('matrix module', () => {
    expect(matrixModule.name).toBe('matrix')
    const dvala = new Dvala({ modules: [matrixModule] })
    expect(dvala.run('let m = import(matrix); m.det([[1, 2], [3, 4]])')).toBe(-2)
  })

  it('numberTheory module', () => {
    expect(numberTheoryModule.name).toBe('number-theory')
    const dvala = new Dvala({ modules: [numberTheoryModule] })
    expect(dvala.run('let nt = import(number-theory); nt.prime?(7)')).toBe(true)
  })

  it('stringUtils module', () => {
    expect(stringUtilsModule.name).toBe('string')
    const dvala = new Dvala({ modules: [stringUtilsModule] })
    expect(dvala.run('let { capitalize } = import(string); capitalize("albert")')).toBe('Albert')
  })

  it('collectionUtils module', () => {
    expect(collectionUtilsModule.name).toBe('collection')
    const dvala = new Dvala({ modules: [collectionUtilsModule] })
    expect(dvala.run('let cu = import(collection); cu.every?([1, 2, 3], number?)')).toBe(true)
  })

  it('sequenceUtils module', () => {
    expect(sequenceUtilsModule.name).toBe('sequence')
    const dvala = new Dvala({ modules: [sequenceUtilsModule] })
    expect(dvala.run('let su = import(sequence); su.distinct([1, 2, 3, 1, 3, 5])')).toEqual([1, 2, 3, 5])
  })

  it('bitwiseUtils module', () => {
    expect(bitwiseUtilsModule.name).toBe('bitwise')
    const dvala = new Dvala({ modules: [bitwiseUtilsModule] })
    expect(dvala.run('let b = import(bitwise); b.bit-not(0)')).toBe(-1)
  })

  it('functionalUtils module', () => {
    expect(functionalUtilsModule.name).toBe('functional')
    const dvala = new Dvala({ modules: [functionalUtilsModule] })
    expect(dvala.run('let f = import(functional); (f.complement(zero?))(1)')).toBe(true)
  })

  it('mathUtils module', () => {
    expect(mathUtilsModule.name).toBe('math')
    const dvala = new Dvala({ modules: [mathUtilsModule] })
    expect(dvala.run('let m = import(math); m.sin(0)')).toBe(0)
    expect(() => dvala.run('let m = import(math); m.sin("hello")')).toThrow()
  })

  it('convert module', () => {
    expect(convertModule.name).toBe('convert')
    const dvala = new Dvala({ modules: [convertModule] })
    expect(dvala.run('let c = import(convert); c.c->f(100)')).toBe(212)
    expect(dvala.run('let c = import(convert); c.kg->lb(1)')).toBeCloseTo(2.20462, 4)
  })

  it('should allow combining multiple modules', () => {
    const dvala = new Dvala({ modules: [vectorModule, matrixModule] })
    expect(dvala.run('let v = import(vector); v.stdev([1, 2, 3])')).toBeCloseTo(0.8165, 3)
    expect(dvala.run('let m = import(matrix); m.det([[1, 2], [3, 4]])')).toBe(-2)
    // Other modules should not be available
    expect(() => dvala.run('import(assertion)')).toThrow()
  })
})
