import type { AstNode } from '../../parser/types'
import type { NodeTypes } from '../../constants/constants'

export type DoNode = [typeof NodeTypes.Block, AstNode[], number]
