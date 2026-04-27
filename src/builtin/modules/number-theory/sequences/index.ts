import { RuntimeError } from '../../../../errors'
import type { Any } from '../../../../interface'
import type { SourceCodeInfo } from '../../../../tokenizer/token'
import { assertNumber } from '../../../../typeGuards/number'
import { assertString } from '../../../../typeGuards/string'
import { toFixedArity } from '../../../../utils/arity'
import type { BuiltinNormalExpression, BuiltinNormalExpressions } from '../../../../builtin/interface'
import { abundantSequence } from './abundant'
import { arithmeticNormalExpressions } from './arithmetic'
import { bellNumbers } from './bell'
import { bernoulliNormalExpressions } from './bernoulli'
import { catalanNumbers } from './catalan'
import { collatzSequence } from './collatz'
import { compositeSequence } from './composite'
import { deficientSequence } from './deficient'
import { factorialNumbers } from './factorial'
import { fibonacciNumbers } from './fibonacci'
import { geometricNormalExpressions } from './geometric'
import { golombSequence } from './golomb'
import { happySequence } from './happy'
import { jugglerSequence } from './juggler'
import { lookAndSaySequence } from './lookAndSay'
import { lucasNumbers } from './lucas'
import { luckySequence } from './lucky'
import { mersenneNumbers } from './mersenne'
import { padovanSequence } from './padovan'
import { partitionNumbers } from './partition'
import { pellNumbers } from './pell'
import { perfectNumbers } from './perfect'
import { perfectCubeSequence } from './perfectCube'
import { perfectPowerSequence } from './perfectPower'
import { perfectSquareSequence } from './perfectSquare'
import { poligonalNormalExpressions } from './poligonal'
import { primeSequence } from './prime'
import { recamanSequence } from './recaman'
import { sylvesterNumbers } from './sylvester'
import { thueMorseSequence } from './thueMorse'
import { tribonacciNumbers } from './tribonacci'

type SeqKey<T extends string> = `${T}Seq`
type TakeWhileKey<T extends string> = `${T}TakeWhile`
type NthKey<T extends string> = `${T}Nth`
type PredKey<T extends string> = `is${Capitalize<T>}`

type SeqFunction<Type extends number | string> = (length: number, sourceCodeInfo: SourceCodeInfo | undefined) => Type[]
type PredFunction<Type extends number | string> = (n: Type, sourceCodeInfo: SourceCodeInfo | undefined) => boolean

type SequenceKeys<T extends string> = SeqKey<T> | TakeWhileKey<T> | NthKey<T> | PredKey<T>

export type SequenceDefinition<T extends string, Type extends number | string = number> = {
  [key in Exclude<SequenceKeys<T>, NthKey<T> | TakeWhileKey<T>>]: key extends SeqKey<T>
    ? SeqFunction<Type>
    : PredFunction<Type>
} & {
  maxLength?: number
  noTakeWhile?: true
} & (Type extends string ? {
  string: true
} : {
  string?: never
}) & {
  noNth?: true
}

export type SequenceNormalExpressions<T extends string, Type extends string | number = number> = {
  [key in SequenceKeys<T>]: key extends SeqKey<T>
    ? BuiltinNormalExpression<Type[]>
    : key extends TakeWhileKey<T>
      ? BuiltinNormalExpression<Type[]>
      : key extends NthKey<T>
        ? BuiltinNormalExpression<Type>
        : BuiltinNormalExpression<boolean>
}

export const sequenceNormalExpressions: BuiltinNormalExpressions = {}

addSequence(abundantSequence)
addSequence(collatzSequence)
addSequence(compositeSequence)
addSequence(deficientSequence)
addSequence(golombSequence)
addSequence(happySequence)
addSequence(jugglerSequence)
addSequence(lookAndSaySequence)
addSequence(luckySequence)
addSequence(padovanSequence)
addSequence(perfectSquareSequence)
addSequence(perfectCubeSequence)
addSequence(perfectPowerSequence)
addSequence(primeSequence)
addSequence(recamanSequence)
addSequence(thueMorseSequence)
// SequenceNormalExpressions has evaluate return types like Type[] or number[] which aren't
// directly assignable to BuiltinNormalExpression<Any>. The runtime values are compatible
// because these are annotated plain JS arrays. Cast through unknown to satisfy the type checker.
addNormalExpressions(getFiniteNumberSequence('tribonacci', tribonacciNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('catalan', catalanNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('factorial', factorialNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('fibonacci', fibonacciNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('lucas', lucasNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('mersenne', mersenneNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('partition', partitionNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('pell', pellNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('perfect', perfectNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('sylvester', sylvesterNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(getFiniteNumberSequence('bell', bellNumbers) as unknown as BuiltinNormalExpressions)
addNormalExpressions(arithmeticNormalExpressions as unknown as BuiltinNormalExpressions)
addNormalExpressions(bernoulliNormalExpressions as unknown as BuiltinNormalExpressions)
addNormalExpressions(geometricNormalExpressions as unknown as BuiltinNormalExpressions)
addNormalExpressions(poligonalNormalExpressions as unknown as BuiltinNormalExpressions)

function addNormalExpressions(normalExpressions: BuiltinNormalExpressions) {
  for (const [key, value] of Object.entries(normalExpressions)) {
    /* v8 ignore next 3 */
    if (sequenceNormalExpressions[key]) {
      throw new Error(`Duplicate normal expression key found: ${key}`)
    }
    sequenceNormalExpressions[key] = value
  }
}

function getFiniteNumberSequence<T extends string>(name: T, sequence: number[]): SequenceNormalExpressions<T> {
  return {
    [`${name}Seq`]: createSeqNormalExpression(length => sequence.slice(0, length), sequence.length),
    [`${name}TakeWhile`]: createTakeWhileNormalExpression(sequence.length),
    [`${name}Nth`]: createNthNormalExpression(() => sequence, sequence.length),
    [`is${name.charAt(0).toUpperCase()}${name.slice(1)}`]: createNumberPredNormalExpression(n => sequence.includes(n)),
  } as unknown as SequenceNormalExpressions<T>
}

function addSequence<Type extends number | string>(sequence: SequenceDefinition<string, Type>) {
  for (const [key, value] of Object.entries(sequence)) {
    /* v8 ignore next 3 */
    if (sequenceNormalExpressions[key]) {
      throw new Error(`Duplicate normal expression key found: ${key}`)
    }
    if (key.endsWith('Seq')) {
      sequenceNormalExpressions[key] = createSeqNormalExpression(value as SeqFunction<Type>, sequence.maxLength)
      if (!sequence.noNth) {
        sequenceNormalExpressions[key.replace(/Seq$/, 'Nth')] = createNthNormalExpression(value as SeqFunction<Type>, sequence.maxLength)
      }
      if (!sequence.noTakeWhile) {
        sequenceNormalExpressions[key.replace(/Seq$/, 'TakeWhile')] = createTakeWhileNormalExpression(sequence.maxLength)
      }
    } else if (key.startsWith('is')) {
      if (sequence.string) {
        sequenceNormalExpressions[key] = createStringPredNormalExpression(value as PredFunction<string>)
      } else {
        sequenceNormalExpressions[key] = createNumberPredNormalExpression(value as PredFunction<number>)
      }
    }
  }
}

function createSeqNormalExpression<Type extends number | string>(
  seqFunction: SeqFunction<Type>,
  maxLength: number | undefined,
// Return Any because Type[] (number[] or string[]) are annotated plain arrays not PersistentVector
): BuiltinNormalExpression<Any> {
  return {
    evaluate: (params, sourceCodeInfo) => {
      const length = params.get(0) ?? maxLength
      assertNumber(length, sourceCodeInfo, { integer: true, positive: true, lte: maxLength })
      const result = seqFunction(length, sourceCodeInfo)
      if (typeof result[0] === 'number') {
        /* v8 ignore next 3 */
        if (result.some(n => (n as number) > Number.MAX_SAFE_INTEGER)) {
          throw new RuntimeError('Result exceeds maximum safe integer', sourceCodeInfo)
        }
      }
      return result as unknown as Any
    },
    arity: typeof maxLength === 'number' ? { max: 1 } : toFixedArity(1),
  }
}

function createTakeWhileNormalExpression(
  maxLength: number | undefined,
// Return Any because number[] is annotated plain array not PersistentVector
): BuiltinNormalExpression<Any> {
  return {
    /* v8 ignore next 1 */
    evaluate: () => { throw new Error('unreachable: overridden by dvalaImpl') },
    arity: typeof maxLength === 'number' ? { max: 1 } : toFixedArity(1),
  }
}

function createNthNormalExpression<Type extends number | string>(
  seqFunction: SeqFunction<Type>,
  maxLength: number | undefined,
): BuiltinNormalExpression<Type> {
  return {
    evaluate: (params, sourceCodeInfo) => {
      const n = params.get(0)
      assertNumber(n, sourceCodeInfo, { integer: true, positive: true, lte: maxLength })
      const sequence = seqFunction(n, sourceCodeInfo)
      if (typeof sequence[0] === 'number') {
        /* v8 ignore next 3 */
        if (sequence.some(val => (val as number) > Number.MAX_SAFE_INTEGER)) {
          throw new RuntimeError('Result exceeds maximum safe integer', sourceCodeInfo)
        }
      }
      return sequence[n - 1]!
    },
    arity: toFixedArity(1),
  }
}

function createNumberPredNormalExpression(
  predFunction: PredFunction<number>,
): BuiltinNormalExpression<boolean> {
  return {
    evaluate: (params, sourceCodeInfo) => {
      const value = params.get(0)
      assertNumber(value, sourceCodeInfo)
      return predFunction(value, sourceCodeInfo)
    },
    arity: toFixedArity(1),
  }
}

function createStringPredNormalExpression(
  predFunction: PredFunction<string>,
): BuiltinNormalExpression<boolean> {
  return {
    evaluate: (params, sourceCodeInfo) => {
      const value = params.get(0)
      assertString(value, sourceCodeInfo)
      return predFunction(value, sourceCodeInfo)
    },
    arity: toFixedArity(1),
  }
}
