// Engine-local structural shapes for reference data passed in by the host.
//
// The host (reference/) defines richer types (FunctionReference, EffectReference,
// Argument, TypedValue, CoreNormalExpressionName) tied to category unions and
// API-name string literals. Engine only reads a narrow subset of fields, so it
// declares minimal interfaces here. Host types are structurally assignable.

export interface TypedValue {
  type: string | string[]
  rest?: true
  array?: true
}

export interface Argument extends TypedValue {
  description?: string
}

export interface FunctionReference {
  title: string
  description: string
  args: Record<string, Argument>
  returns: TypedValue
  variants: { argumentNames: string[] }[]
  examples: (string | { code: string })[]
  _isOperator?: boolean
}

export interface EffectReference extends FunctionReference {
  effect: true
}

export type CoreNormalExpressionName = string
