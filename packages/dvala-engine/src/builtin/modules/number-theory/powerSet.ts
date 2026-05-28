import type { Any, Arr } from '@mojir/dvala-types'
import { ArithmeticError } from '@mojir/dvala-types'
import { assertArray } from '@mojir/dvala-types'
import { assertNumber } from '@mojir/dvala-types'
import { toFixedArity } from '@mojir/dvala-types'
import type { BuiltinNormalExpressions } from '../../interface'
import { PersistentVector } from '@mojir/dvala-types'

// Generates the power set of the given set (all possible subsets).
// Works with plain arrays internally, wraps each subset in a PersistentVector.
function powerSet(set: Arr): PersistentVector<unknown>[] {
  const result: unknown[][] = [[]]

  for (const value of set) {
    const newSubsets = result.map(subset => [...subset, value])
    result.push(...newSubsets)
  }

  return result.map(subset => PersistentVector.from(subset))
}

export const powerSetNormalExpressions: BuiltinNormalExpressions = {
  powerSet: {
    // Returns a PersistentVector of PersistentVectors (each subset), cast to Any
    evaluate: ([set], sourceCodeInfo): Any => {
      assertArray(set, sourceCodeInfo)
      return PersistentVector.from(powerSet(set))
    },
    arity: toFixedArity(1),
  },
  countPowerSet: {
    evaluate: ([n], sourceCodeInfo): number => {
      assertNumber(n, sourceCodeInfo, { integer: true, nonNegative: true })
      // 2^53 exceeds MAX_SAFE_INTEGER, so cap at 52
      if (n > 52) {
        throw new ArithmeticError(`countPowerSet(${n}) exceeds safe integer range`, sourceCodeInfo)
      }

      return 2 ** n
    },
    arity: toFixedArity(1),
  },
}
