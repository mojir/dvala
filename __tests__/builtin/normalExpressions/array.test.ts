import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TestData } from '../../testUtils'
import { checkTestData, createTestData } from '../../testUtils'
import { Dvala } from '../../../src/Dvala/Dvala'
import { vectorModule } from '../../../src/builtin/modules/vector'
import { DvalaError } from '../../../src/errors'

let testData: TestData
const dvala = new Dvala({ modules: [vectorModule] })

beforeEach(() => {
  testData = createTestData()
})

afterEach(() => {
  checkTestData()
})

describe('array functions', () => {
  describe('range', () => {
    it('samples', () => {
      expect(dvala.run('range(0)')).toEqual([])
      expect(dvala.run('range(5)')).toEqual([0, 1, 2, 3, 4])
      expect(dvala.run('range(-5)')).toEqual([0, -1, -2, -3, -4])
      expect(dvala.run('range(5, 1)')).toEqual([5, 4, 3, 2])
      expect(dvala.run('range(1, 5)')).toEqual([1, 2, 3, 4])
      expect(dvala.run('1 range 5')).toEqual([1, 2, 3, 4])
      expect(dvala.run('range(5, 1, -2)')).toEqual([5, 3])
      expect(dvala.run('range(0, 0.5, 0.125)')).toEqual([0, 0.125, 0.25, 0.375])
      expect(() => dvala.run('range()')).toThrow(DvalaError)
      expect(() => dvala.run('range(0, 2, 1, 1)')).toThrow(DvalaError)
      expect(() => dvala.run('range(0, 2, 0)')).toThrow(DvalaError)
      expect(() => dvala.run('range(0, 0, 0)')).toThrow(DvalaError)
      expect(() => dvala.run('range(1, "x")')).toThrow(DvalaError)
      expect(() => dvala.run('range(false, 1, 2)')).toThrow(DvalaError)
      expect(() => dvala.run('range(0, 2, "y")')).toThrow(DvalaError)
      expect(() => dvala.run('range({}, "x", "y")')).toThrow(DvalaError)
    })
  })

  describe('repeat', () => {
    it('samples', () => {
      expect(dvala.run('repeat(5, 3)')).toEqual([5, 5, 5])
      expect(dvala.run('repeat("5", 3)')).toEqual(['5', '5', '5'])
      expect(dvala.run('"5" repeat 3')).toEqual(['5', '5', '5'])
      expect(dvala.run('repeat("5", 1)')).toEqual(['5'])
      expect(dvala.run('repeat("5", 0)')).toEqual([])
      expect(() => dvala.run('repeat("5", 1.3)')).toThrow(DvalaError)
      expect(() => dvala.run('repeat("5", -10)')).toThrow(DvalaError)
      expect(() => dvala.run('repeat(10)')).toThrow(DvalaError)
      expect(() => dvala.run('repeat("5")')).toThrow(DvalaError)
      expect(() => dvala.run('repeat()')).toThrow(DvalaError)
    })
  })

  describe('flatten', () => {
    it('samples', () => {
      expect(dvala.run('flatten([1, 2, [3, 4], 5])')).toEqual([1, 2, 3, 4, 5])
      expect(dvala.run('flatten([1, 2, [3, [4, [5]]], 6])')).toEqual([1, 2, 3, 4, 5, 6])
      expect(dvala.run('flatten([1, 2, [3, [4, [5]]], 6], 1)')).toEqual([1, 2, 3, [4, [5]], 6])
      expect(() => dvala.run('flatten({})')).toThrow(DvalaError)
      expect(() => dvala.run('flatten(12)')).toThrow(DvalaError)
      expect(() => dvala.run('flatten(true)')).toThrow(DvalaError)
      expect(() => dvala.run('flatten(false)')).toThrow(DvalaError)
      expect(() => dvala.run('flatten(null)')).toThrow(DvalaError)
      expect(() => dvala.run('flatten(#"abc")')).toThrow(DvalaError)
      expect(() => dvala.run('flatten([], [])')).toThrow(DvalaError)
      expect(() => dvala.run('flatten()')).toThrow(DvalaError)
    })
    it('immutability', () => {
      dvala.run('flatten(nestedArray)', { bindings: testData })
    })
  })

  describe('mapcat', () => {
    it('samples', () => {
      expect(dvala.run('mapcat([[3, 2, 1, 0], [6, 5, 4], [9, 8, 7]], reverse)')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
      expect(dvala.run('mapcat([[3, 2, 1, 0], [6, [5], 4], [9, 8, 7]], reverse)')).toEqual([0, 1, 2, 3, 4, [5], 6, 7, 8, 9])
      expect(dvala.run('let foo = (n) -> do [-(n, 1), n, +(n, 1)] end; mapcat([1, 2, 3], foo)')).toEqual([0, 1, 2, 1, 2, 3, 2, 3, 4])
      expect(dvala.run('mapcat([[1, 2], [2, 2], [2, 3]], -> $ filter odd?)')).toEqual([1, 3])
    })
  })

  describe('running-fn', () => {
    it('samples', () => {
      expect(dvala.run('running-fn([1, 2, 3], sum)')).toEqual([1, 3, 6])
      expect(() => dvala.run('running-fn(1)')).toThrow(DvalaError)
      expect(() => dvala.run('running-fn(1, sum)')).toThrow(DvalaError)
      expect(() => dvala.run('running-fn(1, sum, null)')).toThrow(DvalaError)
    })
  })
  describe('moving-fn', () => {
    it('samples', () => {
      expect(dvala.run('moving-fn([1, 2, 3], 2, sum)')).toEqual([3, 5])
      expect(dvala.run('moving-fn([1, 2, 3], 1, sum)')).toEqual([1, 2, 3])
      expect(dvala.run('moving-fn([1, 2, 3], 3, sum)')).toEqual([6])
      expect(() => dvala.run('moving-fn([1, 2, 3], 4, sum)')).toThrow(DvalaError)
      expect(() => dvala.run('moving-fn(1)')).toThrow(DvalaError)
      expect(() => dvala.run('moving-fn(1, 2)')).toThrow(DvalaError)
      expect(() => dvala.run('moving-fn(1, 2, null)')).toThrow(DvalaError)
    })
  })
})
