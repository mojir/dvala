import type { Any, Arr } from '../../../interface'
import { assertArray } from '../../../typeGuards/array'
import { assertNumber } from '../../../typeGuards/number'
import { toFixedArity } from '../../../utils/arity'
import type { BuiltinNormalExpressions } from '../../../builtin/interface'
import { PersistentVector } from '../../../utils/persistent'

// Generates all derangements of the given array (no element stays in original position).
// Works with plain arrays internally for efficiency, wraps results in PersistentVector.
function getAllDerangements(arr: Arr): PersistentVector<unknown>[] {
  const n = arr.size
  const result: PersistentVector<unknown>[] = []
  const used = Array.from({ length: n }, () => false)
  // Use plain JS array for temp during generation, then wrap at the end
  const temp: unknown[] = new Array(n)

  function generateDerangements(pos: number): void {
    if (pos === n) {
      result.push(PersistentVector.from(temp))
      return
    }

    for (let i = 0; i < n; i++) {
      // Skip if element is already used or would be in its original position
      if (used[i] || i === pos) {
        continue
      }

      used[i] = true
      temp[pos] = arr.get(i)
      generateDerangements(pos + 1)
      used[i] = false
    }
  }

  generateDerangements(0)
  return result
}

function countDerangements(n: number): number {
  if (n === 1)
    return 0

  let a = 1 // !0
  let b = 0 // !1
  let result = 0

  for (let i = 2; i <= n; i++) {
    result = (i - 1) * (a + b)
    a = b
    b = result
  }

  return result
}

export const derangementsNormalExpressions: BuiltinNormalExpressions = {
  'derangements': {
    // Returns a PersistentVector of PersistentVectors (each derangement), cast to Any
    evaluate: ([set], sourceCodeInfo): Any => {
      assertArray(set, sourceCodeInfo)
      return PersistentVector.from(getAllDerangements(set)) as unknown as Any
    },
    arity: toFixedArity(1),
  },
  'countDerangements': {
    evaluate: ([n], sourceCodeInfo): number => {
      assertNumber(n, sourceCodeInfo, { finite: true, integer: true, positive: true })
      return countDerangements(n)
    },
    arity: toFixedArity(1),
  },
}
