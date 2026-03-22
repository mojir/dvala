import { getProperDivisors } from '../divisors'
import type { SequenceDefinition } from '.'

function isAbundant(num: number): boolean {
  const properDivisors = getProperDivisors(num)
  const sum = properDivisors.reduce((acc, curr) => acc + curr, 0)
  return sum > num
}

export const abundantSequence: SequenceDefinition<'abundant'> = {
  'abundantSeq': length => {
    const abundants = []
    let num = 2
    while (abundants.length < length) {
      if (isAbundant(num)) {
        abundants.push(num)
      }
      num += 1
    }
    return abundants
  },
  'isAbundant': n => isAbundant(n),
}
