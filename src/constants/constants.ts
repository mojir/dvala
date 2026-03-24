export const NodeTypes = {
  Num: 'Num',
  Str: 'Str',
  Call: 'Call',
  SpecialExpression: 'SpecialExpression',
  Sym: 'Sym',
  Builtin: 'Builtin',
  Special: 'Special',
  Reserved: 'Reserved',
  Binding: 'Binding',
  Spread: 'Spread',
  TemplateString: 'TemplateString',
  If: 'If',
  Block: 'Block',
  Effect: 'Effect',
  Recur: 'Recur',
  Array: 'Array',
  Parallel: 'Parallel',
  Race: 'Race',
  Perform: 'Perform',
  Handle: 'Handle',
  Object: 'Object',
  Function: 'Function',
  Let: 'Let',
  And: 'And',
  Or: 'Or',
  Qq: 'Qq',
  Loop: 'Loop',
  For: 'For',
  Match: 'Match',
  Import: 'Import',
} as const

const NodeTypesSet = new Set<string>(Object.values(NodeTypes))

export type NodeType = typeof NodeTypes[keyof typeof NodeTypes]

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
