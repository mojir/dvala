import { describe, expect, it } from 'vitest'
import { createDvala } from '../../createDvala'
import type { BuiltinNormalExpressions } from '../../builtin/interface'
import { allBuiltinModules } from '../../allModules'
import { assertModule } from './assertion'
import { gridModule } from './grid'
import type { DvalaModule } from './interface'
import { vectorModule } from './vector'

describe('module registration', () => {
  describe('default modules', () => {
    it('should have no modules by default', () => {
      const dvala = createDvala()
      expect(() => dvala.run('import(vector)')).toThrow('Unknown module')
      expect(() => dvala.run('import(grid)')).toThrow('Unknown module')
      expect(() => dvala.run('import(assertion)')).toThrow('Unknown module')
    })
  })

  describe('all built-in modules', () => {
    it('should include all modules when allBuiltinModules is passed', () => {
      const dvala = createDvala({ modules: allBuiltinModules })
      expect(dvala.run('let v = import(vector); v.stdev([1, 2, 3])')).toBeCloseTo(0.8165, 3)
      expect(dvala.run('let g = import(grid); g.row([[1, 2], [3, 4]], 0)')).toEqual([1, 2])
      expect(dvala.run('let a = import(assertion); a.assert=(1, 1)')).toBe(null)
    })
  })

  describe('custom modules', () => {
    it('should only include specified modules', () => {
      const dvala = createDvala({ modules: [vectorModule] })
      expect(dvala.run('let v = import(vector); v.stdev([1, 2, 3])')).toBeCloseTo(0.8165, 3)
      expect(() => dvala.run('import(grid)')).toThrow('Unknown module')
      expect(() => dvala.run('import(assertion)')).toThrow('Unknown module')
    })

    it('should support empty modules list', () => {
      const dvala = createDvala({ modules: [] })
      expect(() => dvala.run('import(vector)')).toThrow('Unknown module')
      expect(() => dvala.run('import(grid)')).toThrow('Unknown module')
    })

    it('should support multiple selected modules', () => {
      const dvala = createDvala({ modules: [gridModule, assertModule] })
      expect(dvala.run('let g = import(grid); g.row([[1, 2], [3, 4]], 0)')).toEqual([1, 2])
      expect(dvala.run('let a = import(assertion); a.assert=(1, 1)')).toBe(null)
    })
  })

  describe('user-defined module', () => {
    const temperatureFunctions: BuiltinNormalExpressions = {
      'c-to-f': {
        evaluate: ([celsius], sourceCodeInfo): number => {
          if (typeof celsius !== 'number') {
            throw new TypeError(`Expected a number${sourceCodeInfo ? ` at ${sourceCodeInfo}` : ''}`)
          }
          return celsius * 9 / 5 + 32
        },
        arity: { min: 1, max: 1 },
      },
      'f-to-c': {
        evaluate: ([fahrenheit], sourceCodeInfo): number => {
          if (typeof fahrenheit !== 'number') {
            throw new TypeError(`Expected a number${sourceCodeInfo ? ` at ${sourceCodeInfo}` : ''}`)
          }
          return (fahrenheit - 32) * 5 / 9
        },
        arity: { min: 1, max: 1 },
      },
    }

    const temperatureModule: DvalaModule = {
      name: 'temperature',
      functions: temperatureFunctions,
    }

    it('should register and use a custom module', () => {
      const dvala = createDvala({ modules: [temperatureModule] })
      expect(dvala.run('let t = import(temperature); t.c-to-f(0)')).toBe(32)
      expect(dvala.run('let t = import(temperature); t.c-to-f(100)')).toBe(212)
      expect(dvala.run('let t = import(temperature); t.f-to-c(32)')).toBe(0)
      expect(dvala.run('let t = import(temperature); t.f-to-c(212)')).toBe(100)
    })

    it('should work with destructuring import', () => {
      const dvala = createDvala({ modules: [temperatureModule] })
      expect(dvala.run('let { c-to-f, f-to-c } = import(temperature); c-to-f(f-to-c(72))')).toBe(72)
    })

    it('should work alongside built-in modules', () => {
      const dvala = createDvala({ modules: [temperatureModule, vectorModule] })
      expect(dvala.run('let t = import(temperature); t.c-to-f(0)')).toBe(32)
      expect(dvala.run('let v = import(vector); v.stdev([1, 2, 3])')).toBeCloseTo(0.8165, 3)
    })

    it('should not be available when not registered', () => {
      const dvala = createDvala({ modules: [vectorModule] })
      expect(() => dvala.run('import(temperature)')).toThrow('Unknown module')
    })
  })
})
