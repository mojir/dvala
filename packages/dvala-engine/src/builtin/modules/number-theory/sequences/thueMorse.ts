import type { SequenceDefinition } from '.'

export const thueMorseSequence: SequenceDefinition<'thueMorse'> = {
  thueMorseSeq: length => {
    const thueMorse = []
    for (let i = 0; i < length; i += 1) {
      thueMorse[i] = countSetBits(i) % 2
    }
    return thueMorse
  },
  isThueMorse: n => n === 1 || n === 0,
}

function countSetBits(num: number): number {
  let count = 0
  while (num) {
    count += num & 1
    num >>= 1
  }
  return count
}
