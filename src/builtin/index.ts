import type { Builtin } from './interface'
import { normalExpressions } from './normalExpressions'
import { andSpecialExpression } from './specialExpressions/and'
import { matchSpecialExpression } from './specialExpressions/match'
import { doSpecialExpression } from './specialExpressions/block'
import { lambdaSpecialExpression } from './specialExpressions/functions'
import { ifSpecialExpression } from './specialExpressions/if'
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
import { handleSpecialExpression } from './specialExpressions/handle'
import { raceSpecialExpression } from './specialExpressions/race'
import { specialExpressionTypes } from './specialExpressionTypes'

export const specialExpressions = {
  [specialExpressionTypes['??']]: qqSpecialExpression,
  [specialExpressionTypes['&&']]: andSpecialExpression,
  [specialExpressionTypes['||']]: orSpecialExpression,
  [specialExpressionTypes.array]: arraySpecialExpression,
  [specialExpressionTypes.block]: doSpecialExpression,
  [specialExpressionTypes['0_lambda']]: lambdaSpecialExpression,
  [specialExpressionTypes.for]: forSpecialExpression,
  [specialExpressionTypes.if]: ifSpecialExpression,
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
  [specialExpressionTypes.handle]: handleSpecialExpression,
} as const

export type SpecialExpressions = typeof specialExpressions
export type SpecialExpression = SpecialExpressions[keyof SpecialExpressions]
export type SpecialExpressionName = keyof typeof specialExpressionTypes
export type CommonSpecialExpressionType = [
  | typeof specialExpressionTypes['??']
  | typeof specialExpressionTypes['&&']
  | typeof specialExpressionTypes['match']
  | typeof specialExpressionTypes['block']
  | typeof specialExpressionTypes['if']
  | typeof specialExpressionTypes['||']
  | typeof specialExpressionTypes['array']
  | typeof specialExpressionTypes['object']
  | typeof specialExpressionTypes['effect']
  | typeof specialExpressionTypes['perform']
  | typeof specialExpressionTypes['parallel']
  | typeof specialExpressionTypes['race'],
]

export type SpecialExpressionType = typeof specialExpressionTypes[SpecialExpressionName]

export const builtin: Builtin = {
  normalExpressions,
  specialExpressions,
}

export const normalExpressionKeys = Object.keys(normalExpressions)
export const specialExpressionKeys = Object.keys(specialExpressionTypes)
