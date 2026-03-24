import type { SpecialExpressionType } from '../builtin'
import type { Arity } from '../builtin/interface'
import type { specialExpressionTypes } from '../builtin/specialExpressionTypes'
import type { FunctionType, NodeType, NodeTypes } from '../constants/constants'
import type { Context } from '../evaluator/interface'
import type { Any, Arr, Coll } from '../interface'
import type { ReservedSymbol } from '../tokenizer/reservedNames'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { EFFECT_SYMBOL, FUNCTION_SYMBOL, REGEXP_SYMBOL } from '../utils/symbols'

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

export interface EffectRef {
  [EFFECT_SYMBOL]: true
  name: string // e.g. 'llm.complete'
}

export interface UserDefinedFunction extends GenericDvalaFunction {
  functionType: 'UserDefined'
  name: string | undefined // name
  evaluatedfunction: EvaluatedFunction
  docString: string // documentation string
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

export interface EffectMatcherFunction extends GenericDvalaFunction {
  functionType: 'EffectMatcher'
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
 * The `next` function passed to handle...with handler functions.
 * When called with (eff, arg), dispatches to the next handler in the chain
 * or propagates to the outer scope if no more handlers.
 */
export interface HandleNextFunction extends GenericDvalaFunction {
  functionType: 'HandleNext'
  handlers: Any[] // handler functions in the chain
  handlerIndex: number // next handler to try
  resumeK: unknown // ContinuationStack — stored as unknown to avoid circular import
}

export type DvalaFunction =
  | UserDefinedFunction
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
  | EffectMatcherFunction
  | HandleNextFunction

export type DvalaFunctionType = DvalaFunction['functionType']

export type FunctionLike = DvalaFunction | Coll | number

export type AstNode<T extends NodeType = NodeType, Payload = unknown> = [T, Payload, number]

export type SpreadNode = AstNode<typeof NodeTypes.Spread, AstNode> // Payload should be array or object depending on context
export type NumberNode = AstNode<typeof NodeTypes.Number, number>
export type StringNode = AstNode<typeof NodeTypes.String, string>
export type TemplateStringNode = AstNode<typeof NodeTypes.TemplateString, (StringNode | AstNode)[]>

export type ExpressionNode = NormalExpressionNode | SpecialExpressionNode | NumberNode | StringNode | TemplateStringNode
export type UserDefinedSymbolNode = AstNode<typeof NodeTypes.Sym, string>
export type BuiltinSymbolNode = AstNode<typeof NodeTypes.Builtin, string>
export type SpecialSymbolNode = AstNode<typeof NodeTypes.Special, SpecialExpressionType>
export type SymbolNode = UserDefinedSymbolNode | BuiltinSymbolNode | SpecialSymbolNode
export type ReservedNode = AstNode<typeof NodeTypes.Reserved, ReservedSymbol>
export type EffectNameNode = AstNode<typeof NodeTypes.EffectName, string>
export type SpecialExpressionNode<T extends [SpecialExpressionType, ...unknown[]] = [SpecialExpressionType, ...unknown[]]> = AstNode<typeof NodeTypes.SpecialExpression, T> // [name, params]

export type NormalExpressionNodeWithName = AstNode<typeof NodeTypes.Call, [BuiltinSymbolNode | UserDefinedSymbolNode, AstNode[]]> // [params, name]
export type NormalExpressionNodeExpression = AstNode<typeof NodeTypes.Call, [AstNode, AstNode[]]> // [name, node as function] node can be string number object or array
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
}

export interface SourceMap {
  sources: { path: string; content: string }[]
  positions: (SourceMapPosition | undefined)[] // indexed by node ID
}

export function resolveSourceCodeInfo(nodeId: number, sourceMap: SourceMap | undefined): SourceCodeInfo | undefined {
  if (!sourceMap) return undefined
  const pos = sourceMap.positions[nodeId]
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
}
