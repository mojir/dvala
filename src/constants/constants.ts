export const NodeTypes = {
  Number: 'Number',
  String: 'String',
  NormalExpression: 'NormalExpression',
  SpecialExpression: 'SpecialExpression',
  UserDefinedSymbol: 'UserDefinedSymbol',
  NormalBuiltinSymbol: 'NormalBuiltinSymbol',
  SpecialBuiltinSymbol: 'SpecialBuiltinSymbol',
  ReservedSymbol: 'ReservedSymbol',
  Binding: 'Binding',
  Spread: 'Spread',
  TemplateString: 'TemplateString',
  EffectName: 'EffectName',
} as const

const NodeTypesSet = new Set<string>(Object.values(NodeTypes))

export type NodeType = typeof NodeTypes[keyof typeof NodeTypes]

export function getNodeTypeName(type: NodeType): keyof typeof NodeTypes {
  return type as keyof typeof NodeTypes
}

export function isNodeType(type: unknown): type is NodeType {
  return typeof type === 'string' && NodeTypesSet.has(type)
}

const functionTypes = [
  'UserDefined',
  'Partial',
  'Comp',
  'Constantly',
  'Juxt',
  'Complement',
  'EveryPred',
  'SomePred',
  'Fnull',
  'EffectMatcher',
  'Builtin',
  'SpecialBuiltin',
  'Module',
  'HandleNext',
] as const

const functionTypeSet = new Set(functionTypes)

export type FunctionType = typeof functionTypes[number]

export function isFunctionType(type: unknown): type is FunctionType {
  return typeof type === 'string' && functionTypeSet.has(type as FunctionType)
}
