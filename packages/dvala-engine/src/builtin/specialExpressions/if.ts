import type { AstNode } from '@mojir/dvala-types'
import type { NodeTypes } from '@mojir/dvala-types'

export type IfNode = [typeof NodeTypes.If, [AstNode, AstNode, AstNode?], number]
