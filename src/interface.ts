import type { DvalaFunction, EffectRef, RegularExpression } from './parser/types'
import type { PersistentMap, PersistentVector } from './utils/persistent'

// Dvala's two persistent collection types, replacing plain JS arrays/objects.
export type Arr = PersistentVector<unknown>
export type Obj = PersistentMap<unknown>
export type Seq = string | Arr
export type Coll = Seq | Obj
export type Any = Coll | string | number | boolean | null | DvalaFunction | RegularExpression | EffectRef

export type UnknownRecord = Record<string, unknown>
