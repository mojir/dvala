import type { AstNode } from '@mojir/dvala-types'
import type { NodeTypes } from '@mojir/dvala-types'

export type DoNode = [typeof NodeTypes.Block, AstNode[], number]
