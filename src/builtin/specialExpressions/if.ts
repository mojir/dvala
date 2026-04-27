import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'

export type IfNode = [typeof NodeTypes.If, [AstNode, AstNode, AstNode?], number]
