import type { Builtin } from './interface'
import { allNormalExpressions, normalExpressions } from './normalExpressions'
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

export const specialExpressions = [
  qqSpecialExpression,
  andSpecialExpression,
  orSpecialExpression,
  arraySpecialExpression,
  doSpecialExpression,
  lambdaSpecialExpression,
  forSpecialExpression,
  ifSpecialExpression,
  letSpecialExpression,
  loopSpecialExpression,
  objectSpecialExpression,
  recurSpecialExpression,
  matchSpecialExpression,
  importSpecialExpression,
  effectSpecialExpression,
  performSpecialExpression,
  parallelSpecialExpression,
  raceSpecialExpression,
  handleSpecialExpression,
] as const

export type SpecialExpressions = typeof specialExpressions
export type SpecialExpression = SpecialExpressions[number]
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
  allNormalExpressions,
}

export const normalExpressionKeys = Object.keys(normalExpressions)
export const specialExpressionKeys = Object.keys(specialExpressionTypes)
