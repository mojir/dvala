// Reference type family — the documentation/metadata shape that wraps engine
// builtins (FunctionReference, EffectReference, etc.). Originally lived in
// reference/index.ts at the host level; relocated to engine so the boundary
// runs reference → engine (single direction).
//
// The host's reference/ directory still owns the *data* (the runtime
// dictionaries like normalExpressionReference, allReference) — these are
// derived from engine's builtin registry and don't belong here.
//
// The primitive doc-value types (TypedValue, Argument, Variant, ExampleEntry)
// live in ../builtin/interface — co-located with FunctionDocs which shares
// them.

import type { Argument, Category, ExampleEntry, TypedValue, Variant } from '../builtin/interface'

export interface CommonReference<T extends Category> {
  title: string
  category: T
  examples: ExampleEntry[]
  description: string
  seeAlso?: string[]
}

export type FunctionReference<T extends Category = Category> = CommonReference<T> & {
  returns: TypedValue
  args: Record<string, Argument>
  variants: Variant[]
  noOperatorDocumentation?: true
  _isOperator?: boolean
  _prefereOperator?: boolean
}

export type CustomReference<T extends Category = Category> = CommonReference<T> & {
  customVariants: string[]
  details?: [string, string, string | undefined][]
}

export interface ShorthandReference extends CommonReference<'shorthand'> {
  shorthand: true
}

export interface DatatypeReference extends CommonReference<'datatype'> {
  datatype: true
}

// Prelude aliases (refined types declared in src/prelude.dvala). Carry a
// `definition` string so `dvala doc Positive` can show the alias body
// alongside the description.
export interface PreludeReference extends CommonReference<'prelude'> {
  prelude: true
  definition: string
}

export interface EffectReference extends CommonReference<'effect' | 'playground-effect'> {
  effect: true
  args: Record<string, Argument>
  returns: TypedValue
  variants: Variant[]
}

export type Reference<T extends Category = Category> =
  | FunctionReference<T>
  | CustomReference<T>
  | ShorthandReference
  | DatatypeReference
  | PreludeReference
  | EffectReference

export function isFunctionReference<T extends Category>(ref: Reference<T>): ref is FunctionReference<T> {
  return 'returns' in ref && 'args' in ref && 'variants' in ref && !('effect' in ref)
}

export function isCustomReference<T extends Category>(ref: Reference<T>): ref is CustomReference<T> {
  return 'customVariants' in ref
}

export function isShorthandReference<T extends Category>(ref: Reference<T>): ref is ShorthandReference {
  return 'shorthand' in ref
}

export function isDatatypeReference<T extends Category>(ref: Reference<T>): ref is DatatypeReference {
  return 'datatype' in ref
}

export function isPreludeReference<T extends Category>(ref: Reference<T>): ref is PreludeReference {
  return 'prelude' in ref
}

export function isEffectReference<T extends Category>(ref: Reference<T>): ref is EffectReference {
  return 'effect' in ref
}
