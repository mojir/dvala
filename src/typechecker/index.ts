/**
 * Dvala Type System — Set-Theoretic with Algebraic Subtyping
 *
 * Step 1: Core type algebra (types, subtyping, simplification)
 * Step 2: Simple-sub inference engine (constraint generation, solving)
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
export {
  InferenceContext,
  TypeEnv,
  inferExpr,
  constrain,
  expandType,
  TypeInferenceError,
} from './infer'
export {
  parseTypeAnnotation,
  parseFunctionTypeAnnotation,
  type ParsedFunctionType,
  TypeParseError,
} from './parseType'
export {
  initBuiltinTypes,
  getBuiltinType,
  isTypeGuard,
  type BuiltinTypeInfo,
} from './builtinTypes'
