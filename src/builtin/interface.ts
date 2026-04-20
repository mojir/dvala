import type { ContextStack } from '../evaluator/ContextStack'
import type { EvaluateNode } from '../evaluator/interface'
import type { GetUndefinedSymbols, UndefinedSymbols } from '../getUndefinedSymbols'
import type { Any, Arr } from '../interface'
import type {
  AstNode,
  UserDefinedFunction,
} from '../parser/types'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { MaybePromise } from '../utils/maybePromise'
import type { SpecialExpressions } from '.'

export type Arity = { min?: number; max?: number }

// --- Data types used in documentation ---

const dataTypes = [
  'number',
  'string',
  'object',
  'array',
  'vector',
  'matrix',
  'grid',
  'boolean',
  'atom',
  'function',
  'integer',
  'any',
  'null',
  'collection',
  'sequence',
  'regexp',
  'effect',
  'never',
] as const
export type DataType = typeof dataTypes[number]

export function isDataType(arg: string): arg is DataType {
  return dataTypes.includes(arg as DataType)
}

// --- Category type ---

export const categoryRecord = {
  'special-expression': true,
  'predicate': true,
  'sequence': true,
  'collection': true,
  'array': true,
  'object': true,
  'string': true,
  'math': true,
  'functional': true,
  'regular-expression': true,
  'bitwise': true,
  'misc': true,
  'meta': true,
  'assertion': true,
  'vector': true,
  'linearAlgebra': true,
  'matrix': true,
  'grid': true,
  'numberTheory': true,
  'convert': true,
  'json': true,
  'time': true,
  'effectHandler': true,
  'macros': true,
  'shorthand': true,
  'datatype': true,
  'effect': true,
  'playground-effect': true,
  'ast': true,
  'test': true,
} as const

export type Category = keyof typeof categoryRecord

export const categories = Object.keys(categoryRecord) as Category[]

// Categories that are modules (require import)
export const moduleCategories: Category[] = ['assertion', 'ast', 'bitwise', 'collection', 'convert', 'functional', 'grid', 'effectHandler', 'json', 'linearAlgebra', 'macros', 'math', 'matrix', 'numberTheory', 'sequence', 'string', 'test', 'time', 'vector']

// Core categories (always available) — special-expression first, rest alphabetical
export const coreCategories: Category[] = ['special-expression', 'array', 'assertion', 'bitwise', 'collection', 'datatype', 'functional', 'math', 'meta', 'misc', 'object', 'predicate', 'regular-expression', 'sequence', 'shorthand', 'string']

// Short descriptions for each core category, shown on the reference card grid.
export const coreCategoryDescriptions: Record<string, string> = {
  'special-expression': 'Flow control, binding, functions, effects, and macros.',
  'array': 'Create and transform ordered sequences of values.',
  'assertion': 'Throw errors when conditions are not met.',
  'bitwise': 'Bitwise operations on integers.',
  'collection': 'Operations shared across arrays, objects, and strings.',
  'datatype': 'Inspect and assert value types at runtime.',
  'functional': 'Higher-order functions: compose, curry, and partial application.',
  'math': 'Arithmetic, rounding, and numeric operations.',
  'meta': 'Inspect and manipulate Dvala expressions at runtime.',
  'misc': 'Miscellaneous utilities.',
  'object': 'Create and transform key-value objects.',
  'predicate': 'Test values: equality, comparison, and type checks.',
  'regular-expression': 'Create and match regular expressions.',
  'sequence': 'Operations on arrays and strings as ordered sequences.',
  'shorthand': 'Concise syntax aliases for common operations.',
  'string': 'Create and transform text strings.',
}

// --- FunctionDocs types ---

export interface TypedValue {
  type: DataType[] | DataType
  rest?: true
  array?: true
}

export type Argument = TypedValue & {
  description?: string
}

export interface Variant {
  argumentNames: string[]
}

export type ExampleEntry = string | { code: string; noRun: true } | { code: string; throws: true } | { code: string; noCheck: true } | { code: string; noRun: true; noCheck: true }

export interface FunctionDocs {
  category: Category
  description: string
  returns: TypedValue
  args: Record<string, Argument>
  variants: Variant[]
  examples: ExampleEntry[]
  seeAlso?: string[]
  hideOperatorForm?: true
  tags?: string[]
  /** Type annotation in Dvala syntax, parsed by the typechecker.
   * e.g. "(Number, Number) -> Number" or "(x: Unknown) -> x is Number" */
  type?: string
  /**
   * Handler-wrapper metadata. When set, the declared function is a
   * wrapper that installs a handler over its thunk argument. The
   * typechecker attaches a `HandlerWrapperInfo` to the parsed function
   * type so call sites apply the handler-typing application law:
   * `(thunk_effects \ handled) ∪ introduced`.
   *
   * - `paramIndex`: zero-based index of the thunk parameter.
   * - `handled`: names of effects the wrapper catches.
   * - `introduced`: names of effects the wrapper's inner handler
   *   clauses or transform perform (which become visible in the
   *   outer effect set).
   *
   * Effect names must be declared (either as builtin effects or via
   * `effect @name(T) -> U`) before the module is registered — the
   * typechecker looks up each name's arg/ret signatures in the effect
   * registry.
   *
   * Note: `handled` and `introduced` do not cancel in degenerate
   * cases. `retry` declares both as `[dvala.error]` because on final
   * retry exhaustion it re-performs the error, so calling `retry(n, pureBody)`
   * conservatively surfaces `@dvala.error` in the caller's effect set
   * even when the body never performs it. This is a sound
   * over-approximation — at runtime the effect may or may not occur
   * depending on control flow, and the type system picks the upper
   * bound. Concrete cancellation would require conditional typing
   * that Dvala's effect system does not (and probably shouldn't) model.
   */
  wrapper?: {
    paramIndex: number
    handled: string[]
    introduced: string[]
  }
}

export interface CustomDocs {
  category: Category
  description: string
  customVariants: string[]
  details?: [string, string, string | undefined][]
  returns?: TypedValue
  examples: ExampleEntry[]
  seeAlso?: string[]
  tags?: string[]
}

export type SpecialExpressionDocs = FunctionDocs | CustomDocs

export function isFunctionDocs(docs: SpecialExpressionDocs): docs is FunctionDocs {
  return 'args' in docs && 'variants' in docs
}

type NormalExpressionEvaluator<T> = (
  params: Arr,
  sourceCodeInfo: SourceCodeInfo | undefined,
  contextStack: ContextStack,
) => MaybePromise<T>

export interface BuiltinNormalExpression<T> {
  evaluate: NormalExpressionEvaluator<T>
  pure?: boolean
  name?: string
  arity: Arity
  docs?: FunctionDocs
  dvalaImpl?: UserDefinedFunction
}

export type BuiltinNormalExpressions = Record<string, BuiltinNormalExpression<Any>>
interface EvaluateHelpers {
  evaluateNode: EvaluateNode
  builtin: Builtin
  getUndefinedSymbols: GetUndefinedSymbols
}
export interface BuiltinSpecialExpression<T, N extends AstNode> {
  evaluate?: (node: N, contextStack: ContextStack, helpers: EvaluateHelpers) => MaybePromise<T>
  evaluateAsNormalExpression?: NormalExpressionEvaluator<T>
  arity: Arity
  docs?: SpecialExpressionDocs
  getUndefinedSymbols?: (
    node: N,
    contextStack: ContextStack,
    params: { getUndefinedSymbols: GetUndefinedSymbols; builtin: Builtin },
  ) => UndefinedSymbols
}

export interface Builtin {
  normalExpressions: BuiltinNormalExpressions
  specialExpressions: SpecialExpressions
}
