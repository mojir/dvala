import type { Any, Obj } from '../../interface'
import type { NodeTypes } from '../../constants/constants'
import type { AstNode, SpreadNode } from '../../parser/types'
import { assertString } from '../../typeGuards/string'
import { PersistentMap } from '../../utils/persistent'
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
  variants: [{ argumentNames: ['kvps'] }],
  description:
    'Constructs a new object. Object members are created from the `kvps` key-value pairs. Requires an even number of arguments.',
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
    'let x = 10; let y = 20; { x, y }',
  ],
  hideOperatorForm: true,
}

export const objectSpecialExpression: BuiltinSpecialExpression<Any, ObjectNode> = {
  arity: {},
  docs,
  evaluateAsNormalExpression: (params, sourceCodeInfo) => {
    let result: Obj = PersistentMap.empty()

    for (let i = 0; i < params.size; i += 2) {
      const key = params.get(i)
      const value = params.get(i + 1)
      assertString(key, sourceCodeInfo)
      result = result.assoc(key, value ?? null)
    }

    return result
  },
}
