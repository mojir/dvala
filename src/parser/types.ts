import type { SpecialExpressionType } from '../builtin'
import type { Arity } from '../builtin/interface'
import type { specialExpressionTypes } from '../builtin/specialExpressionTypes'
import type { FunctionType, NodeType, NodeTypes } from '../constants/constants'
import type { Context } from '../evaluator/interface'
import type { Any, Arr, Coll } from '../interface'
import type { ReservedSymbol } from '../tokenizer/reservedNames'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { ATOM_SYMBOL, EFFECT_SYMBOL, FUNCTION_SYMBOL, REGEXP_SYMBOL } from '../utils/symbols'

export type EvaluatedFunction = [BindingTarget[], AstNode[], Context]

interface GenericDvalaFunction {
  [FUNCTION_SYMBOL]: true
  sourceCodeInfo?: SourceCodeInfo
  functionType: FunctionType
  arity: Arity
}

export interface RegularExpression {
  [REGEXP_SYMBOL]: true
  sourceCodeInfo?: SourceCodeInfo
  s: string
  f: string
}

/** Dotted DNS-style identifier for entities with public identity (effects, macros, modules). */
export type QualifiedName = string

export interface EffectRef {
  [EFFECT_SYMBOL]: true
  name: QualifiedName // e.g. 'llm.complete'
}

/** Atom: a self-evaluating named constant, e.g. :ok, :error */
export interface Atom {
  [ATOM_SYMBOL]: true
  name: string // e.g. 'ok', 'error'
}

export interface UserDefinedFunction extends GenericDvalaFunction {
  functionType: 'UserDefined'
  name: string | undefined // name
  evaluatedfunction: EvaluatedFunction
  docString: string // documentation string
}

export interface MacroFunction extends GenericDvalaFunction {
  functionType: 'Macro'
  name: string | undefined
  evaluatedfunction: EvaluatedFunction
  docString: string
}

export interface PartialFunction extends GenericDvalaFunction {
  functionType: 'Partial'
  function: FunctionLike
  params: Arr
  placeholders: number[] // indexes of the placeholders
}

export interface CompFunction extends GenericDvalaFunction {
  functionType: 'Comp'
  params: Arr
}

export interface ConstantlyFunction extends GenericDvalaFunction {
  functionType: 'Constantly'
  value: Any
}

export interface JuxtFunction extends GenericDvalaFunction {
  functionType: 'Juxt'
  params: Arr
}

export interface ComplementFunction extends GenericDvalaFunction {
  functionType: 'Complement'
  function: FunctionLike
}

export interface EveryPredFunction extends GenericDvalaFunction {
  functionType: 'EveryPred'
  params: Arr
}

export interface SomePredFunction extends GenericDvalaFunction {
  functionType: 'SomePred'
  params: Arr
}

export interface FNullFunction extends GenericDvalaFunction {
  functionType: 'Fnull'
  function: FunctionLike
  params: Arr
}

export interface QualifiedMatcherFunction extends GenericDvalaFunction {
  functionType: 'QualifiedMatcher'
  matchType: 'string' | 'regexp'
  pattern: string // For string: the pattern string; for regexp: the source
  flags: string // For regexp: the flags; for string: empty string
}

export interface NormalBuiltinFunction extends GenericDvalaFunction {
  functionType: 'Builtin'
  normalBuiltinSymbolType: string
  name: string
}

export interface SpecialBuiltinFunction extends GenericDvalaFunction {
  functionType: 'SpecialBuiltin'
  specialBuiltinSymbolType:
    | typeof specialExpressionTypes['&&']
    | typeof specialExpressionTypes['||']
    | typeof specialExpressionTypes['array']
    | typeof specialExpressionTypes['object']
    | typeof specialExpressionTypes['recur']
    | typeof specialExpressionTypes['??']
}

export interface ModuleFunction extends GenericDvalaFunction {
  functionType: 'Module'
  moduleName: string
  functionName: string
}

/**
 * A handler clause: maps an effect name to a body expression.
 * params are the binding targets for the effect's arguments.
 */
export interface HandlerClause {
  effectName: string // e.g. 'dvala.error', 'my.eff'
  params: BindingTarget[] // clause parameter bindings (from the effect args)
  body: AstNode[] // clause body expressions
}

/**
 * First-class handler value created by `handler...end`.
 * Contains named effect clauses and an optional transform clause.
 * When installed (via `h(-> body)` or `with h;`), provides algebraic effect handling
 * with resume/abort semantics.
 */
export interface HandlerFunction extends GenericDvalaFunction {
  functionType: 'Handler'
  clauses: HandlerClause[] // effect clauses (dispatched by exact name match)
  clauseMap: Map<string, HandlerClause> // effect name → clause (for O(1) dispatch)
  /** Transform clause: [paramBindingTarget, bodyExprs]. Defaults to identity. */
  transform: [BindingTarget, AstNode[]] | null
  /** If true, shallow handler — resume does NOT reinstall the handler around the continuation. */
  shallow: boolean
  /** Closure environment captured at handler creation. */
  closureEnv: unknown // ContextStack — stored as unknown to avoid circular import
}

/**
 * First-class resume function created when a handler clause is entered.
 * When called with a value, it resumes the continuation at the perform site
 * with the handler reinstalled (deep semantics).
 */
export interface ResumeFunction extends GenericDvalaFunction {
  functionType: 'Resume'
  /** Reference to the HandlerClauseFrame that owns this resume.
   *  Used to check one-shot guard and set resumed flag. */
  clauseFrame: unknown // HandlerClauseFrame — unknown to avoid circular import
  /** The handler to reinstall on resume (deep semantics). */
  handler: HandlerFunction
  /** Continuation from perform site up to the AlgebraicHandleFrame. */
  performK: unknown // ContinuationStack
  /** Handler environment for reinstallation. */
  handlerEnv: unknown // ContextStack
}

export type DvalaFunction =
  | UserDefinedFunction
  | MacroFunction
  | NormalBuiltinFunction
  | SpecialBuiltinFunction
  | ModuleFunction
  | PartialFunction
  | CompFunction
  | ConstantlyFunction
  | JuxtFunction
  | ComplementFunction
  | EveryPredFunction
  | SomePredFunction
  | FNullFunction
  | QualifiedMatcherFunction
  | HandlerFunction
  | ResumeFunction

export type DvalaFunctionType = DvalaFunction['functionType']

export type FunctionLike = DvalaFunction | Coll | number

export type AstNode<T extends NodeType = NodeType, Payload = unknown> = [T, Payload, number]

export type SpreadNode = AstNode<typeof NodeTypes.Spread, AstNode> // Payload should be array or object depending on context
export type NumberNode = AstNode<typeof NodeTypes.Num, number>
export type StringNode = AstNode<typeof NodeTypes.Str, string>
export type AtomNode = AstNode<typeof NodeTypes.Atom, string>
export type TemplateStringNode = AstNode<typeof NodeTypes.TmplStr, (StringNode | AstNode)[]>

export type ExpressionNode = NormalExpressionNode | SpecialExpressionNode | NumberNode | StringNode | AtomNode | TemplateStringNode
export type UserDefinedSymbolNode = AstNode<typeof NodeTypes.Sym, string>
export type BuiltinSymbolNode = AstNode<typeof NodeTypes.Builtin, string>
export type SpecialSymbolNode = AstNode<typeof NodeTypes.Special, SpecialExpressionType>
export type SymbolNode = UserDefinedSymbolNode | BuiltinSymbolNode | SpecialSymbolNode
export type ReservedNode = AstNode<typeof NodeTypes.Reserved, ReservedSymbol>
export type EffectNameNode = AstNode<typeof NodeTypes.Effect, string>
export type SpecialExpressionNode<T extends [SpecialExpressionType, ...unknown[]] = [SpecialExpressionType, ...unknown[]]> = AstNode<typeof NodeTypes.SpecialExpression, T> // [name, params]

/**
 * Formatting hints stored in Call node payloads.
 * Set at parse time to preserve authored syntactic form through formatting.
 */
export interface CallHints {
  /** True when authored as infix: `a foo b` rather than `foo(a, b)`. */
  isInfix?: boolean
  /** True when authored as pipe: `a |> b` rather than `b(a)`. */
  isPipe?: boolean
}

export type NormalExpressionNodeWithName = AstNode<typeof NodeTypes.Call, [BuiltinSymbolNode | UserDefinedSymbolNode, AstNode[], CallHints?]> // [fn, args, hints?]
export type NormalExpressionNodeExpression = AstNode<typeof NodeTypes.Call, [AstNode, AstNode[], CallHints?]> // [fn, args, hints?]
export type NormalExpressionNode = NormalExpressionNodeWithName | NormalExpressionNodeExpression
export const bindingTargetTypes = {
  symbol: 'symbol',
  rest: 'rest',
  object: 'object',
  array: 'array',
  literal: 'literal',
  wildcard: 'wildcard',
} as const

export type BindingTargetType = typeof bindingTargetTypes[keyof typeof bindingTargetTypes]

type GenericTarget<T extends BindingTargetType, Payload extends unknown[]> = [T, Payload, number]

export type SymbolBindingTarget = GenericTarget<typeof bindingTargetTypes.symbol, [SymbolNode, AstNode | undefined /* default value */]>
export type RestBindingTarget = GenericTarget<typeof bindingTargetTypes.rest, [string, AstNode | undefined /* default value */]>
export type ObjectBindingTarget = GenericTarget<typeof bindingTargetTypes.object, [Record<string, BindingTarget>, AstNode | undefined /* default value */]>
export type ArrayBindingTarget = GenericTarget<typeof bindingTargetTypes.array, [(BindingTarget | null)[], AstNode | undefined /* default value */]>
export type LiteralBindingTarget = GenericTarget<typeof bindingTargetTypes.literal, [AstNode /* literal expression */]>
export type WildcardBindingTarget = GenericTarget<typeof bindingTargetTypes.wildcard, []>

export type BindingTarget = SymbolBindingTarget | RestBindingTarget | ObjectBindingTarget | ArrayBindingTarget | LiteralBindingTarget | WildcardBindingTarget

export type BindingNode = AstNode<typeof NodeTypes.Binding, [BindingTarget, AstNode]> // [target, value]

export interface SourceMapPosition {
  source: number // index into sources[]
  start: [number, number] // [line, column], 0-based
  end: [number, number] // [line, column], 0-based
  /** True for Sym/Builtin/Special/Reserved/Effect — never tracked by the evaluator's onNodeEval hook */
  structuralLeaf?: boolean
}

export interface SourceMap {
  sources: { path: string; content: string }[]
  positions: Map<number, SourceMapPosition>
}

export function resolveSourceCodeInfo(nodeId: number, sourceMap: SourceMap | undefined): SourceCodeInfo | undefined {
  if (!sourceMap) return undefined
  const pos = sourceMap.positions.get(nodeId)
  if (!pos) return undefined
  const source = sourceMap.sources[pos.source]
  if (!source) return undefined
  const line = pos.start[0]
  const lines = source.content.split('\n')
  return {
    position: { line: line + 1, column: pos.start[1] + 1 }, // convert back to 1-based
    code: lines[line] ?? '',
    filePath: source.path === '<anonymous>' ? undefined : source.path,
  }
}

type AstBody = AstNode[]
export interface Ast {
  body: AstBody // body
  sourceMap?: SourceMap // present when debug mode is on
  /** Type annotations from source code, keyed by nodeId. Erased before evaluation. */
  typeAnnotations?: Map<number, string>
}
