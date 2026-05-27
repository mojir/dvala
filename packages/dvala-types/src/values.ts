import type { Atom, DvalaFunction, EffectRef, RegularExpression } from './ast'
import type { PersistentMap, PersistentVector } from './persistent'

// Dvala's two persistent collection types, replacing plain JS arrays/objects.
export type Arr = PersistentVector<unknown>
export type Obj = PersistentMap<unknown>
export type Seq = string | Arr
export type Coll = Seq | Obj
export type Any = Coll | string | number | boolean | null | DvalaFunction | RegularExpression | EffectRef | Atom

export type UnknownRecord = Record<string, unknown>
