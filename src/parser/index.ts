import type { TokenStream } from '../tokenizer/tokenize'
import { ParseError } from '../errors'
import { debugInfoToSourceCodeInfo, isOperatorToken } from '../tokenizer/token'
import type { AstNode, Ast, SourceMap } from './types'
import { createParserContext, parseExpression } from './subParsers/parseExpression'

export { createParserContext, parseExpression }

function parseInternal(tokenStream: TokenStream): { nodes: AstNode[]; sourceMap: SourceMap | undefined } {
  tokenStream.tokens.forEach(token => {
    if (token[0] === 'Error') {
      throw new ParseError(token[3], debugInfoToSourceCodeInfo(token[2], tokenStream.source, tokenStream.filePath))
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
        throw new ParseError('Expected ;', ctx.peekSourceCodeInfo())
      }
    }
  }

  return { nodes, sourceMap: ctx.sourceMap }
}

export function parse(tokenStream: TokenStream): AstNode[] {
  return parseInternal(tokenStream).nodes
}

export function parseToAst(tokenStream: TokenStream): Ast {
  const { nodes, sourceMap } = parseInternal(tokenStream)
  return { body: nodes, sourceMap }
}
