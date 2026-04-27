import type { SequenceDefinition } from '.'

export const perfectSquareSequence: SequenceDefinition<'perfectSquare'> = {
  perfectSquareSeq: length => {
    const perfectSquares = []
    for (let i = 1; i <= length; i++) {
      perfectSquares.push(i ** 2)
    }
    return perfectSquares
  },
  isPerfectSquare: n => n > 0 && Number.isInteger(Math.sqrt(n)),
}
