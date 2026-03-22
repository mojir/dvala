import { assertNumber } from '../../../../typeGuards/number'
import { binomialCoefficient } from '../binomialCefficient'
import { toFixedArity } from '../../../../utils/arity'
import type { SequenceNormalExpressions } from '.'

function getBernoulliSeq(length: number): number[] {
  const bernoulli = [1]
  for (let n = 1; n < length; n += 1) {
    let sum = 0
    for (let k = 0; k < n; k += 1) {
      sum += binomialCoefficient(n + 1, k) * bernoulli[k]!
    }
    bernoulli[n] = n > 1 && n % 2 === 1 ? 0 : -sum / (n + 1)
  }
  return bernoulli
}

export const bernoulliNormalExpressions: Omit<SequenceNormalExpressions<'bernoulli'>, 'isBernoulli'> = {
  'bernoulliSeq': {
    evaluate: ([length], sourceCodeInfo): number[] => {
      assertNumber(length, sourceCodeInfo, { integer: true, positive: true })
      return getBernoulliSeq(length)
    },
    arity: toFixedArity(1),
  },
  'bernoulliNth': {
    evaluate: ([n], sourceCodeInfo): number => {
      assertNumber(n, sourceCodeInfo, { integer: true, positive: true })
      const bernoulli = getBernoulliSeq(n)
      return bernoulli[n - 1]!
    },
    arity: toFixedArity(1),
  },
  'bernoulliTakeWhile': {
    /* v8 ignore next 1 */
    evaluate: () => { throw new Error('unreachable: overridden by dvalaImpl') },
    arity: toFixedArity(1),
  },
}
