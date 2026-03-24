import { describe, it } from 'vitest'
import { testTypeGuars } from '../../__tests__/testUtils'
import type { QqNode } from '../builtin/specialExpressions/qq'
import type {
  AstNode,
  ExpressionNode,
  NormalExpressionNodeExpression,
  NormalExpressionNodeWithName,
  NumberNode,
  StringNode,
  SymbolNode,
} from '../parser/types'
import { NodeTypes } from '../constants/constants'
import {
  asExpressionNode,
  asNormalExpressionNode,
  asNormalExpressionNodeWithName,
  asSymbolNode,
  assertExpressionNode,
  assertNormalExpressionNode,
  assertNormalExpressionNodeWithName,
  assertSymbolNode,
  isExpressionNode,
  isNormalExpressionNode,
  isNormalExpressionNodeWithName,
  isSymbolNode,
} from './astNode'

describe('node type guards', () => {
  const specialExpressionNode: QqNode = [NodeTypes.Qq, [[NodeTypes.Reserved, null, 0], [NodeTypes.Reserved, null, 0]], 0]
  const symbolNode: SymbolNode = [NodeTypes.Sym, 'A name', 0]
  const numberNode: NumberNode = [NodeTypes.Number, 12, 0]
  const stringNode: StringNode = [NodeTypes.String, 'foo', 0]
  const normalExpressionNodeWithName: NormalExpressionNodeWithName = [NodeTypes.Call, [[NodeTypes.Builtin, '+', 0], []], 0]
  const normalExpressionNodeWithoutName: NormalExpressionNodeExpression = [NodeTypes.Call, [stringNode, [numberNode]], 0]

  const expressionNodes: ExpressionNode[] = [
    normalExpressionNodeWithName,
    normalExpressionNodeWithoutName,
    numberNode,
    stringNode,
  ]

  const validNodes: AstNode[] = [symbolNode, specialExpressionNode, ...expressionNodes]

  it('nameNode', () => {
    testTypeGuars(
      {
        valid: [symbolNode],
        invalid: [...validNodes.filter(node => node !== symbolNode)],
      },
      { is: isSymbolNode, as: asSymbolNode, assert: assertSymbolNode },
    )
  })

  it('isNormalExpressionNodeWithName', () => {
    testTypeGuars(
      {
        valid: [normalExpressionNodeWithName],
        invalid: [...validNodes.filter(node => node !== normalExpressionNodeWithName)],
      },
      {
        is: isNormalExpressionNodeWithName,
        as: asNormalExpressionNodeWithName,
        assert: assertNormalExpressionNodeWithName,
      },
    )
  })

  it('isNormalExpressionNode', () => {
    testTypeGuars(
      {
        valid: [normalExpressionNodeWithName, normalExpressionNodeWithoutName],
        invalid: [
          ...validNodes.filter(
            node => node !== normalExpressionNodeWithName && node !== normalExpressionNodeWithoutName,
          ),
        ],
      },
      { is: isNormalExpressionNode, as: asNormalExpressionNode, assert: assertNormalExpressionNode },
    )
  })

  it('expressionNode', () => {
    testTypeGuars(
      {
        valid: [...expressionNodes],
        invalid: [...validNodes.filter(node => !(expressionNodes as unknown[]).includes(node))],
      },
      { is: isExpressionNode, as: asExpressionNode, assert: assertExpressionNode },
    )
  })
})
