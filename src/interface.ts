import type { DvalaFunction, EffectRef, RegularExpression } from './parser/types'

export type Arr = unknown[]
export type Seq = string | Arr
export type Obj = Record<string, unknown>
export type Coll = Seq | Obj
export type Any = Coll | string | number | boolean | null | DvalaFunction | RegularExpression | EffectRef

export type UnknownRecord = Record<string, unknown>
