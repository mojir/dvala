import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '@mojir/dvala-types'

export type IfNode = [typeof NodeTypes.If, [AstNode, AstNode, AstNode?], number]
