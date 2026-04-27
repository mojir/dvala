export { PersistentVector } from './PersistentVector'
export { PersistentMap } from './PersistentMap'
export {
  cons,
  listToArray,
  listFromArray,
  listTake,
  listDrop,
  listPrependAll,
  listSize,
} from './PersistentList'

import { PersistentVector } from './PersistentVector'
import { PersistentMap } from './PersistentMap'

/** Returns true if `value` is a PersistentVector (Dvala array). */
export function isPersistentVector(value: unknown): value is PersistentVector {
  return value instanceof PersistentVector
}

/** Returns true if `value` is a PersistentMap (Dvala object). */
export function isPersistentMap(value: unknown): value is PersistentMap {
  return value instanceof PersistentMap
}
