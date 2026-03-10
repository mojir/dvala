import type { SequenceDefinition } from '.'

function getGolombSeq(n: number): number[] {
  const golomb = [0, 1]
  for (let i = 2; i <= n; i += 1) {
    golomb.push(1 + golomb[i - golomb[golomb[i - 1]!]!]!)
  }
  return golomb.slice(1)
}

export const golombSequence: SequenceDefinition<'golomb'> = {
  'golomb-seq': length => getGolombSeq(length),
  'golomb?': () => true,
}
