import { getProperDivisors } from '../divisors'
import type { SequenceDefinition } from '.'

function isDeficient(num: number): boolean {
  const properDivisors = getProperDivisors(num)
  const sum = properDivisors.reduce((acc, curr) => acc + curr, 0)
  return sum < num
}

export const deficientSequence: SequenceDefinition<'deficient'> = {
  'deficient-seq': length => {
    const deficients = []
    let num = 1
    while (deficients.length < length) {
      if (isDeficient(num)) {
        deficients.push(num)
      }
      num += 1
    }
    return deficients
  },
  'deficient?': n => isDeficient(n),
}
