import type { Builtin } from './interface'
import { normalExpressions } from './normalExpressions'
import { andSpecialExpression } from './specialExpressions/and'
import { matchSpecialExpression } from './specialExpressions/match'
import { lambdaSpecialExpression } from './specialExpressions/functions'
import { letSpecialExpression } from './specialExpressions/let'
import { loopSpecialExpression } from './specialExpressions/loop'
import { forSpecialExpression } from './specialExpressions/loops'
import { orSpecialExpression } from './specialExpressions/or'
import { qqSpecialExpression } from './specialExpressions/qq'
import { recurSpecialExpression } from './specialExpressions/recur'
import { arraySpecialExpression } from './specialExpressions/array'
import { effectSpecialExpression } from './specialExpressions/effect'
import { objectSpecialExpression } from './specialExpressions/object'
import { importSpecialExpression } from './specialExpressions/import'
import { parallelSpecialExpression } from './specialExpressions/parallel'
import { performSpecialExpression } from './specialExpressions/perform'
import { raceSpecialExpression } from './specialExpressions/race'
import { settledSpecialExpression } from './specialExpressions/settled'
import { specialExpressionTypes } from './specialExpressionTypes'

export const specialExpressions = {
  [specialExpressionTypes['??']]: qqSpecialExpression,
  [specialExpressionTypes['&&']]: andSpecialExpression,
  [specialExpressionTypes['||']]: orSpecialExpression,
  [specialExpressionTypes.array]: arraySpecialExpression,
  [specialExpressionTypes['function']]: lambdaSpecialExpression,
  [specialExpressionTypes.for]: forSpecialExpression,
  [specialExpressionTypes.let]: letSpecialExpression,
  [specialExpressionTypes.loop]: loopSpecialExpression,
  [specialExpressionTypes.object]: objectSpecialExpression,
  [specialExpressionTypes.recur]: recurSpecialExpression,
  [specialExpressionTypes.match]: matchSpecialExpression,
  [specialExpressionTypes.import]: importSpecialExpression,
  [specialExpressionTypes.effect]: effectSpecialExpression,
  [specialExpressionTypes.perform]: performSpecialExpression,
  [specialExpressionTypes.parallel]: parallelSpecialExpression,
  [specialExpressionTypes.race]: raceSpecialExpression,
  [specialExpressionTypes.settled]: settledSpecialExpression,
} as const

export type SpecialExpressions = typeof specialExpressions
export type SpecialExpression = SpecialExpressions[keyof SpecialExpressions]
export type SpecialExpressionName = keyof typeof specialExpressionTypes

export type SpecialExpressionType = (typeof specialExpressionTypes)[SpecialExpressionName]

export const builtin: Builtin = {
  normalExpressions,
  specialExpressions,
}

export const normalExpressionKeys = Object.keys(normalExpressions)
export const specialExpressionKeys = Object.keys(specialExpressionTypes)
