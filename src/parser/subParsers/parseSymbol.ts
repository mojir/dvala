import { ParseError } from '../../errors'
import type { BuiltinSymbolNode, SpecialSymbolNode, SymbolNode } from '../types'
import type { TokenDebugInfo } from '../../tokenizer/token'
import { isSymbolToken } from '../../tokenizer/token'
import { stringFromQuotedSymbol, stringToSymbolNode } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseSymbol(ctx: ParserContext): SymbolNode | BuiltinSymbolNode | SpecialSymbolNode {
  const token = ctx.peek()
  ctx.advance()
  if (!isSymbolToken(token)) {
    throw new ParseError(`Expected symbol token, got ${token[0]}`, ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
  }
  if (token[1][0] === '\'') {
    const node = stringToSymbolNode(stringFromQuotedSymbol(token[1]), token[2], ctx)
    ctx.setNodeEnd(node[2])
    return node
  } else {
    const node = stringToSymbolNode(token[1], token[2], ctx)
    ctx.setNodeEnd(node[2])
    return node
  }
}
