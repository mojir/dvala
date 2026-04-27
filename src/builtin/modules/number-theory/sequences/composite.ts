import { isPrime } from './prime'
import type { SequenceDefinition } from '.'

function isComposite(num: number): boolean {
  if (num <= 1) {
    return false
  }
  return !isPrime(num)
}

export const compositeSequence: SequenceDefinition<'composite'> = {
  'compositeSeq': length => {
    const composites = []
    let num = 2
    while (composites.length < length) {
      if (isComposite(num)) {
        composites.push(num)
      }
      num += 1
    }
    return composites
  },
  'isComposite': n => isComposite(n),
}
