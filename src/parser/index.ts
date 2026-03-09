import type { TokenStream } from '../tokenizer/tokenize'
import { DvalaError } from '../errors'
import { isOperatorToken } from '../tokenizer/token'
import type { AstNode } from './types'
import { createParserContext, parseExpression } from './subParsers/parseExpression'

export { createParserContext, parseExpression }

export function parse(tokenStream: TokenStream): AstNode[] {
  tokenStream.tokens.forEach(token => {
    if (token[0] === 'Error') {
      throw new DvalaError(token[3], token[2])
    }
  })

  const nodes: AstNode[] = []

  const ctx = createParserContext(tokenStream)

  while (!ctx.isAtEnd()) {
    nodes.push(parseExpression(ctx, 0))
    if (isOperatorToken(ctx.tryPeek(), ';')) {
      ctx.advance()
    } else {
      if (!ctx.isAtEnd()) {
        throw new DvalaError('Expected ;', ctx.peekSourceCodeInfo())
      }
    }
  }

  return nodes
}
