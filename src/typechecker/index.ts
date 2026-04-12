/**
 * Dvala Type System — Set-Theoretic with Algebraic Subtyping
 *
 * Step 1: Core type algebra
 * - Type representation
 * - Subtyping checker
 * - Simplification
 */

export {
  // Type representation
  type Type,
  type PrimitiveName,

  // Constructors
  NumberType,
  StringType,
  BooleanType,
  NullType,
  Unknown,
  Never,
  RegexType,
  atom,
  literal,
  fn,
  tuple,
  record,
  array,
  union,
  inter,
  neg,

  // Utilities
  typeToString,
  typeEquals,
} from './types'

export { isSubtype } from './subtype'
export { simplify } from './simplify'
