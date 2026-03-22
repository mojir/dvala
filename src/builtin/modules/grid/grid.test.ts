import { describe, expect, it } from 'vitest'
import { createDvala } from '../../../createDvala'
import { DvalaError } from '../../../errors'
import { gridModule } from './'

const exampleGrid1 = `[
  ["Albert", "father", 10],
  ["Nina", "mother", 20],
  ["Kian", "son", 30],
]`

const exampleGrid2 = `[
  ["Albert", "father"],
  ["Nina", "mother"],
  ["Kian", "son"],
]`

const exampleGrid3 = `[
  [1, 2],
  [3, 4],
]`

const dvala = createDvala({ modules: [gridModule] })

// Helper to run grid module functions with the new import syntax
function runGrid(code: string): unknown {
  // Replace 'grid:functionName(' with 'let g = import(grid); g.functionName('
  const modifiedCode = code.replace(/grid:(\S+?)\(/g, 'let g = import(grid); g.$1(')
  return dvala.run(modifiedCode)
}

describe('grid', () => {
  describe('grid:isCellEvery', () => {
    it('should check if every element in the grid satisfies the predicate', () => {
      expect(runGrid(`grid:isCellEvery(${exampleGrid1}, isString)`)).toBe(false)
      expect(runGrid(`grid:isCellEvery(${exampleGrid2}, isString)`)).toBe(true)
      expect(runGrid(`grid:isCellEvery(${exampleGrid3}, isString)`)).toBe(false)
    })
  })
  describe('grid:isSome', () => {
    it('should check if some element in the grid satisfies the predicate', () => {
      expect(runGrid(`grid:isSome(${exampleGrid1}, isString)`)).toBe(true)
      expect(runGrid(`grid:isSome(${exampleGrid2}, isString)`)).toBe(true)
      expect(runGrid(`grid:isSome(${exampleGrid3}, isString)`)).toBe(false)
    })
  })
  describe('grid:isEveryRow', () => {
    it('should check if every row in the grid satisfies the predicate', () => {
      expect(runGrid(`grid:isEveryRow(${exampleGrid1}, -> isString($[0]))`)).toBe(true)
      expect(runGrid(`grid:isEveryRow(${exampleGrid2}, -> isString($[0]))`)).toBe(true)
      expect(runGrid(`grid:isEveryRow(${exampleGrid3}, -> isString($[0]))`)).toBe(false)
    })
  })
  describe('grid:isSomeRow', () => {
    it('should check if some row in the grid satisfies the predicate', () => {
      expect(runGrid(`grid:isSomeRow(${exampleGrid1}, -> $ contains "Albert")`)).toBe(true)
      expect(runGrid(`grid:isSomeRow(${exampleGrid2}, -> $ contains "Albert")`)).toBe(true)
      expect(runGrid(`grid:isSomeRow(${exampleGrid3}, -> $ contains "Albert")`)).toBe(false)
    })
  })
  describe('grid:isEveryCol', () => {
    it('should check if every column in the grid satisfies the predicate', () => {
      expect(runGrid(`grid:isEveryCol(${exampleGrid1}, -> isString($[0]))`)).toBe(false)
      expect(runGrid(`grid:isEveryCol(${exampleGrid2}, -> isString($[0]))`)).toBe(true)
      expect(runGrid(`grid:isEveryCol(${exampleGrid3}, -> isString($[0]))`)).toBe(false)
    })
  })
  describe('grid:isSomeCol', () => {
    it('should check if some column in the grid satisfies the predicate', () => {
      expect(runGrid(`grid:isSomeCol(${exampleGrid1}, -> $ contains "Albert")`)).toBe(true)
      expect(runGrid(`grid:isSomeCol(${exampleGrid2}, -> $ contains "Albert")`)).toBe(true)
      expect(runGrid(`grid:isSomeCol(${exampleGrid3}, -> $ contains "Albert")`)).toBe(false)
    })
  })
  describe('grid:row', () => {
    it('should return the row at the given index', () => {
      expect(runGrid(`grid:row(${exampleGrid1}, 0)`)).toEqual(['Albert', 'father', 10])
      expect(runGrid(`grid:row(${exampleGrid1}, 1)`)).toEqual(['Nina', 'mother', 20])
      expect(runGrid(`grid:row(${exampleGrid1}, 2)`)).toEqual(['Kian', 'son', 30])
    })
    it('should throw an error if the index is out of bounds', () => {
      expect(() => runGrid(`grid:row(${exampleGrid1}, 3)`)).toThrow(DvalaError)
      expect(() => runGrid(`grid:row(${exampleGrid1}, -1)`)).toThrow(DvalaError)
    })
  })
  describe('grid:col', () => {
    it('should return the column at the given index', () => {
      expect(runGrid(`grid:col(${exampleGrid1}, 0)`)).toEqual(['Albert', 'Nina', 'Kian'])
      expect(runGrid(`grid:col(${exampleGrid1}, 1)`)).toEqual(['father', 'mother', 'son'])
      expect(runGrid(`grid:col(${exampleGrid1}, 2)`)).toEqual([10, 20, 30])
    })
    it('should throw an error if the index is out of bounds', () => {
      expect(() => runGrid(`grid:col(${exampleGrid1}, 3)`)).toThrow(DvalaError)
      expect(() => runGrid(`grid:col(${exampleGrid1}, -1)`)).toThrow(DvalaError)
    })
  })
  describe('grid:shape', () => {
    it('should return the shape of the grid', () => {
      expect(runGrid(`grid:shape(${exampleGrid1})`)).toEqual([3, 3])
      expect(runGrid(`grid:shape(${exampleGrid2})`)).toEqual([3, 2])
      expect(runGrid(`grid:shape(${exampleGrid3})`)).toEqual([2, 2])
    })
  })
  describe('grid:fill', () => {
    it('should fill the grid with the given value', () => {
      expect(runGrid('grid:fill(3, 3, 0)')).toEqual([
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ])
    })
  })
  describe('grid:generate', () => {
    it('should generate a grid of the given shape', () => {
      expect(runGrid('grid:generate(3, 3, -> 0)')).toEqual([
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ])
      expect(runGrid('grid:generate(2, 4, -> $ + $2)')).toEqual([
        [0, 1, 2, 3],
        [1, 2, 3, 4],
      ])
    })
  })
  describe('grid:reshape', () => {
    it('should reshape the grid to the given shape', () => {
      expect(runGrid(`grid:reshape(${exampleGrid2}, 2)`)).toEqual([
        ['Albert', 'father', 'Nina'],
        ['mother', 'Kian', 'son'],
      ])
      expect(() => runGrid(`grid:reshape(${exampleGrid2}, 5)`)).toThrow(DvalaError)
    })
  })
  describe('grid:transpose', () => {
    it('should transpose the grid', () => {
      expect(runGrid(`grid:transpose(${exampleGrid1})`)).toEqual([
        ['Albert', 'Nina', 'Kian'],
        ['father', 'mother', 'son'],
        [10, 20, 30],
      ])
      expect(runGrid(`grid:transpose(${exampleGrid2})`)).toEqual([
        ['Albert', 'Nina', 'Kian'],
        ['father', 'mother', 'son'],
      ])
    })
  })
  describe('grid:crop', () => {
    it('should crop the grid', () => {
      expect(runGrid(`grid:crop(${exampleGrid1}, [1, 1], [2, 2])`)).toEqual([
        ['mother'],
      ])
      expect(runGrid(`grid:crop(${exampleGrid1}, [1, 1])`)).toEqual([
        ['mother', 20],
        ['son', 30],
      ])
      expect(() => runGrid(`grid:crop(${exampleGrid1}, [1, 1, 1], [2, 2])`)).toThrow(DvalaError)
      expect(() => runGrid(`grid:crop(${exampleGrid1}, [1, 1], [2, 2, 2])`)).toThrow(DvalaError)
    })
  })
  describe('grid:sliceRows', () => {
    it('should slice the rows of the grid', () => {
      expect(runGrid(`grid:sliceRows(${exampleGrid1}, 1, 2)`)).toEqual([
        ['Nina', 'mother', 20],
      ])
      expect(runGrid(`grid:sliceRows(${exampleGrid1}, 1)`)).toEqual([
        ['Nina', 'mother', 20],
        ['Kian', 'son', 30],
      ])
      expect(runGrid(`grid:sliceRows(${exampleGrid1}, 1, -1)`)).toEqual([
        ['Nina', 'mother', 20],
      ])
      expect(runGrid(`grid:sliceRows(${exampleGrid1}, -2)`)).toEqual([
        ['Nina', 'mother', 20],
        ['Kian', 'son', 30],
      ])
    })
  })
  describe('grid:sliceCols', () => {
    it('should slice the columns of the grid', () => {
      expect(runGrid(`grid:sliceCols(${exampleGrid1}, 1, 2)`)).toEqual([
        ['father'],
        ['mother'],
        ['son'],
      ])
      expect(runGrid(`grid:sliceCols(${exampleGrid1}, 1)`)).toEqual([
        ['father', 10],
        ['mother', 20],
        ['son', 30],
      ])
      expect(runGrid(`grid:sliceCols(${exampleGrid1}, 1, -1)`)).toEqual([
        ['father'],
        ['mother'],
        ['son'],
      ])
      expect(runGrid(`grid:sliceCols(${exampleGrid1}, -1)`)).toEqual([
        [10],
        [20],
        [30],
      ])
    })
  })
  describe('grid:spliceRows', () => {
    it('should splice the rows of the grid', () => {
      expect(runGrid(`grid:spliceRows(${exampleGrid1}, 1, 2)`)).toEqual([
        ['Albert', 'father', 10],
      ])
      expect(runGrid(`grid:spliceRows(${exampleGrid1}, 1, 1, ["Nazanin", "mother", 40])`)).toEqual([
        ['Albert', 'father', 10],
        ['Nazanin', 'mother', 40],
        ['Kian', 'son', 30],
      ])
      expect(() => runGrid(`grid:spliceRows(${exampleGrid1}, 1, 1, ["Nazanin", "mother"])`)).toThrow(DvalaError)
    })
  })
  describe('grid:spliceCols', () => {
    it('should splice the columns of the grid', () => {
      expect(runGrid(`grid:spliceCols(${exampleGrid1}, 1, 2)`)).toEqual([
        ['Albert'],
        ['Nina'],
        ['Kian'],
      ])
      expect(runGrid(`grid:spliceCols(${exampleGrid1}, 1, 1, ["f", "m", "s"])`)).toEqual([
        ['Albert', 'f', 10],
        ['Nina', 'm', 20],
        ['Kian', 's', 30],
      ])
      expect(() => runGrid(`grid:spliceCols(${exampleGrid1}, 1, 1, ["f", "m"])`)).toThrow(DvalaError)
    })
  })
  describe('grid:concatRows', () => {
    it('should concatenate the rows of the grid', () => {
      expect(runGrid(`grid:concatRows(${exampleGrid2}, ${exampleGrid3})`)).toEqual([
        ['Albert', 'father'],
        ['Nina', 'mother'],
        ['Kian', 'son'],
        [1, 2],
        [3, 4],
      ])
      expect(() => runGrid(`grid:concatRows(${exampleGrid1}, ${exampleGrid2})`)).toThrow(DvalaError)
    })
  })
  describe('grid:concatCols', () => {
    it('should concatenate the columns of the grid', () => {
      expect(runGrid(`grid:concatCols(${exampleGrid1}, ${exampleGrid2})`)).toEqual([
        ['Albert', 'father', 10, 'Albert', 'father'],
        ['Nina', 'mother', 20, 'Nina', 'mother'],
        ['Kian', 'son', 30, 'Kian', 'son'],
      ])
      expect(() => runGrid(`grid:concatCols(${exampleGrid2}, ${exampleGrid3})`)).toThrow(DvalaError)
    })
  })
  describe('grid:cellMap', () => {
    it('should map the grid', () => {
      expect(runGrid(`grid:cellMap(${exampleGrid1}, str)`)).toEqual([
        ['Albert', 'father', '10'],
        ['Nina', 'mother', '20'],
        ['Kian', 'son', '30'],
      ])
    })
    it('should map multiple grids', () => {
      expect(runGrid(`grid:cellMap(${exampleGrid3}, ${exampleGrid3}, +)`)).toEqual([[2, 4], [6, 8]])
    })
    it('should throw on different dimensions', () => {
      expect(() => runGrid(`grid:cellMap(${exampleGrid3}, [[1], [2]], +)`)).toThrow(DvalaError)
      expect(() => runGrid(`grid:cellMap(${exampleGrid3}, [[1, 2]], +)`)).toThrow(DvalaError)
    })
  })
  describe('grid:cellMapi', () => {
    it('should map the grid with index', () => {
      expect(runGrid(`grid:cellMapi(${exampleGrid1}, -> $ ++ "(" ++ $2 ++ ", " ++ $3 ++ ")")`)).toEqual([
        ['Albert(0, 0)', 'father(0, 1)', '10(0, 2)'],
        ['Nina(1, 0)', 'mother(1, 1)', '20(1, 2)'],
        ['Kian(2, 0)', 'son(2, 1)', '30(2, 2)'],
      ])
    })
  })
  describe('grid:cellReduce', () => {
    it('should reduce the grid', () => {
      expect(runGrid(`grid:cellReduce(${exampleGrid1}, ++, "")`)).toEqual('Albertfather10Ninamother20Kianson30')
    })
  })
  describe('grid:cellReducei', () => {
    it('should reduce the grid with index', () => {
      expect(runGrid(`grid:cellReducei(${exampleGrid1}, -> $ + $3, 0)`)).toBe(9)
    })
  })
  describe('grid:pushRows', () => {
    it('should push rows to the grid', () => {
      expect(runGrid(`grid:pushRows(${exampleGrid1}, ["Nazanin", "mother", 40])`)).toEqual([
        ['Albert', 'father', 10],
        ['Nina', 'mother', 20],
        ['Kian', 'son', 30],
        ['Nazanin', 'mother', 40],
      ])
      expect(() => runGrid(`grid:pushRows(${exampleGrid1}, ["Nazanin", 40])`)).toThrowError(DvalaError)
    })
  })
  describe('grid:pushCols', () => {
    it('should push columns to the grid', () => {
      expect(runGrid(`grid:pushCols(${exampleGrid1}, ["f", "m", "s"])`)).toEqual([
        ['Albert', 'father', 10, 'f'],
        ['Nina', 'mother', 20, 'm'],
        ['Kian', 'son', 30, 's'],
      ])
    })
    it('should throw an error if the number of rows does not match', () => {
      expect(() => runGrid(`grid:pushCols(${exampleGrid1}, ["f", "m"])`)).toThrowError(DvalaError)
    })
  })
  describe('grid:unshiftRows', () => {
    it('should unshift rows to the grid', () => {
      expect(runGrid(`grid:unshiftRows(${exampleGrid1}, ["Nazanin", "mother", 40])`)).toEqual([
        ['Nazanin', 'mother', 40],
        ['Albert', 'father', 10],
        ['Nina', 'mother', 20],
        ['Kian', 'son', 30],
      ])
      expect(() => runGrid(`grid:unshiftRows(${exampleGrid1}, ["Nazanin", 40])`)).toThrowError(DvalaError)
    })
    it('should throw an error if the number of columns does not match', () => {
      expect(() => runGrid(`grid:unshiftRows(${exampleGrid1}, ["Nazanin", "mother"])`)).toThrowError(DvalaError)
    })
  })
  describe('grid:unshiftCols', () => {
    it('should unshift columns to the grid', () => {
      expect(runGrid(`grid:unshiftCols(${exampleGrid1}, ["f", "m", "s"])`)).toEqual([
        ['f', 'Albert', 'father', 10],
        ['m', 'Nina', 'mother', 20],
        ['s', 'Kian', 'son', 30],
      ])
    })
    it('should throw an error if the number of rows does not match', () => {
      expect(() => runGrid(`grid:unshiftCols(${exampleGrid1}, ["f", "m"])`)).toThrowError(DvalaError)
    })
  })
  describe('grid:popRow', () => {
    it('should pop rows from the grid', () => {
      expect(runGrid(`grid:popRow(${exampleGrid1})`)).toEqual([
        ['Albert', 'father', 10],
        ['Nina', 'mother', 20],
      ])
      expect(runGrid('grid:popRow([[1, 2]])')).toEqual(null)
    })
  })
  describe('grid:popCol', () => {
    it('should pop columns from the grid', () => {
      expect(runGrid(`grid:popCol(${exampleGrid1})`)).toEqual([
        ['Albert', 'father'],
        ['Nina', 'mother'],
        ['Kian', 'son'],
      ])
      expect(runGrid('grid:popCol([[1], [2]])')).toEqual(null)
    })
  })
  describe('grid:shiftRow', () => {
    it('should shift rows from the grid', () => {
      expect(runGrid(`grid:shiftRow(${exampleGrid1})`)).toEqual([
        ['Nina', 'mother', 20],
        ['Kian', 'son', 30],
      ])
    })
    it('should return null for single row grid', () => {
      expect(runGrid('grid:shiftRow([[1, 2]])')).toEqual(null)
    })
  })
  describe('grid:shiftCol', () => {
    it('should shift columns from the grid', () => {
      expect(runGrid(`grid:shiftCol(${exampleGrid1})`)).toEqual([
        ['father', 10],
        ['mother', 20],
        ['son', 30],
      ])
    })
    it('should return null for single column grid', () => {
      expect(runGrid('grid:shiftCol([[1], [2]])')).toEqual(null)
    })
  })
  describe('grid:fromArray', () => {
    it('should convert an array to a grid', () => {
      expect(runGrid('grid:fromArray([1, 2, 3, 4], 2)')).toEqual([
        [1, 2],
        [3, 4],
      ])
      expect(() => runGrid('grid:fromArray([1, 2, 3], 2)')).toThrowError(DvalaError)
    })
  })
  describe('grid:rotate', () => {
    it('should rotate the grid', () => {
      expect(runGrid(`grid:rotate(${exampleGrid1}, 1)`)).toEqual([
        ['Kian', 'Nina', 'Albert'],
        ['son', 'mother', 'father'],
        [30, 20, 10],
      ])
      expect(runGrid(`grid:rotate(${exampleGrid1}, 2)`)).toEqual([
        [30, 'son', 'Kian'],
        [20, 'mother', 'Nina'],
        [10, 'father', 'Albert'],
      ])
      expect(runGrid(`grid:rotate(${exampleGrid1}, 3)`)).toEqual([
        [10, 20, 30],
        ['father', 'mother', 'son'],
        ['Albert', 'Nina', 'Kian'],
      ])
      expect(runGrid(`grid:rotate(${exampleGrid1}, 4)`)).toEqual([
        ['Albert', 'father', 10],
        ['Nina', 'mother', 20],
        ['Kian', 'son', 30],
      ])
    })
  })
  describe('grid:flipH', () => {
    it('should flip the grid horizontally', () => {
      expect(runGrid(`grid:flipH(${exampleGrid1})`)).toEqual([
        [10, 'father', 'Albert'],
        [20, 'mother', 'Nina'],
        [30, 'son', 'Kian'],
      ])
    })
  })
  describe('grid:flipV', () => {
    it('should flip the grid vertically', () => {
      expect(runGrid(`grid:flipV(${exampleGrid1})`)).toEqual([
        ['Kian', 'son', 30],
        ['Nina', 'mother', 20],
        ['Albert', 'father', 10],
      ])
    })
  })
})

describe('import with destructuring', () => {
  it('should import a single function via destructuring', () => {
    expect(dvala.run('let { row } = import(grid); row([[1, 2], [3, 4]], 0)')).toEqual([1, 2])
  })

  it('should work with function composition', () => {
    expect(dvala.run(`
      let { transpose, row } = import(grid);
      row(transpose([[1, 2], [3, 4]]), 1)
    `)).toEqual([2, 4])
  })
})
