import { describe, expect, it } from 'vitest'
import { createDvala } from '../../src/createDvala'
import { collectionUtilsModule } from '../../src/builtin/modules/collection'

const dvala = createDvala({ debug: true, modules: [collectionUtilsModule] })
describe('determinant.', () => {
  it('should compile', () => {
    expect(
      dvala.run(`
let { isEvery } = import("collection");
// Matrix multiplication with correct syntax
let matrixMultiply = (matrixA, matrixB) -> do
  // Check if inputs are arrays
  if !(isArray(matrixA)) then perform(@dvala.error, "First input must be an array") else null end;
  if !(isArray(matrixB)) then perform(@dvala.error, "Second input must be an array") else null end;

  // Check if matrices are not empty
  if isEmpty(matrixA) || isEmpty(matrixB) then perform(@dvala.error, "Matrices cannot be empty") else null end;

  // Check if matrices are 2D arrays
  if !(isArray(first(matrixA))) then perform(@dvala.error, "First input must be a 2D array") else null end;
  if !(isArray(first(matrixB))) then perform(@dvala.error, "Second input must be a 2D array") else null end;

  // Get dimensions
  let rowsA = count(matrixA);
  let colsA = count(first(matrixA));
  let rowsB = count(matrixB);
  let colsB = count(first(matrixB));

  // Check if all rows have consistent length
  if !(isEvery(matrixA, row -> isArray(row) && count(row) == colsA)) then perform(@dvala.error, "First matrix has inconsistent row lengths") else null end;
  if !(isEvery(matrixB, row -> isArray(row) && count(row) == colsB)) then perform(@dvala.error, "Second matrix has inconsistent row lengths") else null end;

  // Check if matrices can be multiplied
  if !(colsA == rowsB) then perform(@dvala.error, "Matrix dimensions mismatch: first matrix columns must equal second matrix rows") else null end;

  // Create a row of the result matrix
  let createRow = (rowIndex) -> do
    for (j in range(colsB)) -> do
      reduce(
        range(colsA),
        (acc, k) -> do
          let aValue = matrixA[rowIndex][k];
          let bValue = matrixB[k][j];
          acc + (aValue * bValue);
        end,
        0
      )
    end
  end;

  // Create the result matrix row by row
  for (i in range(rowsA)) -> createRow(i);
end;

let matrixA = [
  [1, 2, 3],
  [4, 5, 6]
];

let matrixB = [
  [7, 8],
  [9, 10],
  [11, 12]
];

matrixMultiply(matrixA, matrixB);
`),
    ).toEqual([
      [58, 64],
      [139, 154],
    ])
  })
})
