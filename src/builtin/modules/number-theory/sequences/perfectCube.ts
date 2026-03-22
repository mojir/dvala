import type { SequenceDefinition } from '.'

export const perfectCubeSequence: SequenceDefinition<'perfectCube'> = {
  'perfectCubeSeq': length => {
    const perfectcubes = []
    for (let i = 1; i <= length; i++) {
      perfectcubes.push(i ** 3)
    }
    return perfectcubes
  },
  'isPerfectCube': n => n > 0 && Number.isInteger(Math.cbrt(n)),
}
