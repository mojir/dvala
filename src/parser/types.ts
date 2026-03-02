import type { JsFunction } from '../Dvala/Dvala'
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

export interface NativeJsFunction extends GenericDvalaFunction {
  functionType: 'NativeJsFunction'
  name: string | undefined // name
  nativeFn: JsFunction
  docString: string // documentation string
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

export interface NormalBuiltinFunction extends GenericDvalaFunction {
  functionType: 'Builtin'
  normalBuiltinSymbolType: number
  name: string
}

export interface SpecialBuiltinFunction extends GenericDvalaFunction {
  functionType: 'SpecialBuiltin'
  specialBuiltinSymbolType:
    | typeof specialExpressionTypes['&&']
    | typeof specialExpressionTypes['||']
    | typeof specialExpressionTypes['array']
    | typeof specialExpressionTypes['object']
    | typeof specialExpressionTypes['defined?']
    | typeof specialExpressionTypes['recur']
    | typeof specialExpressionTypes['throw']
    | typeof specialExpressionTypes['??']
}

export interface ModuleFunction extends GenericDvalaFunction {
  functionType: 'Module'
  moduleName: string
  functionName: string
}

export type DvalaFunction =
  | NativeJsFunction
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

export type DvalaFunctionType = DvalaFunction['functionType']

export type FunctionLike = DvalaFunction | Coll | number

export type AstNode<T extends NodeType = NodeType, Payload = unknown> = [T, Payload] | [T, Payload, SourceCodeInfo]

export type ExpressionNode = NormalExpressionNode | SpecialExpressionNode | NumberNode | StringNode

export type SpreadNode = AstNode<typeof NodeTypes.Spread, AstNode> // Payload should be array or object depending on context
export type NumberNode = AstNode<typeof NodeTypes.Number, number>
export type StringNode = AstNode<typeof NodeTypes.String, string>
export type UserDefinedSymbolNode = AstNode<typeof NodeTypes.UserDefinedSymbol, string>
export type NormalBuiltinSymbolNode = AstNode<typeof NodeTypes.NormalBuiltinSymbol, number>
export type SpecialBuiltinSymbolNode = AstNode<typeof NodeTypes.SpecialBuiltinSymbol, SpecialExpressionType>
export type SymbolNode = UserDefinedSymbolNode | NormalBuiltinSymbolNode | SpecialBuiltinSymbolNode
export type ReservedSymbolNode = AstNode<typeof NodeTypes.ReservedSymbol, ReservedSymbol>
export type SpecialExpressionNode<T extends [SpecialExpressionType, ...unknown[]] = [SpecialExpressionType, ...unknown[]]> = AstNode<typeof NodeTypes.SpecialExpression, T> // [name, params]

export type NormalExpressionNodeWithName = AstNode<typeof NodeTypes.NormalExpression, [NormalBuiltinSymbolNode | UserDefinedSymbolNode, AstNode[]]> // [params, name]
export type NormalExpressionNodeExpression = AstNode<typeof NodeTypes.NormalExpression, [AstNode, AstNode[]]> // [name, node as function] node can be string number object or array
export type NormalExpressionNode = NormalExpressionNodeWithName | NormalExpressionNodeExpression
export const bindingTargetTypes = {
  symbol: 11,
  rest: 12,
  object: 13,
  array: 14,
  literal: 15,
  wildcard: 16,
} as const

export type BindingTargetType = typeof bindingTargetTypes[keyof typeof bindingTargetTypes]

type GenericTarget<T extends BindingTargetType, Payload extends unknown[]> = [T, Payload] | [T, Payload, SourceCodeInfo]

export type SymbolBindingTarget = GenericTarget<typeof bindingTargetTypes.symbol, [SymbolNode, AstNode | undefined /* default value */]>
export type RestBindingTarget = GenericTarget<typeof bindingTargetTypes.rest, [string, AstNode | undefined /* default value */]>
export type ObjectBindingTarget = GenericTarget<typeof bindingTargetTypes.object, [Record<string, BindingTarget>, AstNode | undefined /* default value */]>
export type ArrayBindingTarget = GenericTarget<typeof bindingTargetTypes.array, [(BindingTarget | null)[], AstNode | undefined /* default value */]>
export type LiteralBindingTarget = GenericTarget<typeof bindingTargetTypes.literal, [AstNode /* literal expression */]>
export type WildcardBindingTarget = GenericTarget<typeof bindingTargetTypes.wildcard, []>

export type BindingTarget = SymbolBindingTarget | RestBindingTarget | ObjectBindingTarget | ArrayBindingTarget | LiteralBindingTarget | WildcardBindingTarget

export type BindingNode = AstNode<typeof NodeTypes.Binding, [BindingTarget, AstNode]> // [target, value]

type AstBody = AstNode[]
export interface Ast {
  body: AstBody // body
  hasDebugData: boolean
}
