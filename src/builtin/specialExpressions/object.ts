import type { Any, Obj } from '../../interface'
import type { AstNode, SpreadNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'
import { assertString } from '../../typeGuards/string'
import { isSpreadNode } from '../../typeGuards/astNode'
import type { BuiltinSpecialExpression, FunctionDocs } from '../interface'

export type ObjectEntry = [AstNode, AstNode] | SpreadNode
export type ObjectNode = [typeof NodeTypes.Object, ObjectEntry[], number]

const docs: FunctionDocs = {
  category: 'special-expression',
  returns: {
    type: 'object',
  },
  args: {
    kvps: {
      type: 'any',
      rest: true,
      description: 'key - value pairs, where key is a string',
    },
  },
  variants: [
    { argumentNames: ['kvps'] },
  ],
  description: 'Constructs a new object. Object members are created from the `kvps` key-value pairs. Requires an even number of arguments.',
  examples: [
    'object()',
    `
let default = {
  type: "Person",
  name: "John Doe",
  age: 42
};

{
  ...default,
  name: "Lisa"
}`,
    'object("x", 10, "y", true, "z", "A string")',
    '{}',
    '{ a: 1, b: 2 }',
  ],
  hideOperatorForm: true,
}

export const objectSpecialExpression: BuiltinSpecialExpression<Any, ObjectNode> = {
  arity: {},
  docs,
  evaluateAsNormalExpression: (params, sourceCodeInfo) => {
    const result: Obj = {}

    for (let i = 0; i < params.length; i += 2) {
      const key = params[i]
      const value = params[i + 1]
      assertString(key, sourceCodeInfo)
      result[key] = value ?? null
    }

    return result
  },
  getUndefinedSymbols: (node, contextStack, { getUndefinedSymbols, builtin }) => {
    const entries = node[1] as ObjectEntry[]
    const allNodes: AstNode[] = []
    for (const entry of entries) {
      if (isSpreadNode(entry as AstNode)) {
        allNodes.push(entry as SpreadNode)
      } else {
        const [key, value] = entry as [AstNode, AstNode]
        allNodes.push(key, value)
      }
    }
    return getUndefinedSymbols(allNodes, contextStack, builtin)
  },
}
