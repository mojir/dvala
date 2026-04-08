import { CstBuilder, type UntypedCstNode } from '../cst/builder'
import type { TriviaNode } from '../cst/types'
import { ParseError } from '../errors'
import { debugInfoToSourceCodeInfo, isOperatorToken } from '../tokenizer/token'
import type { TokenStream } from '../tokenizer/tokenize'
import type { ParserContext } from './ParserContext'
import { createParserContext, createCstParserContext, parseExpression } from './subParsers/parseExpression'
import type { AstNode, Ast, SourceMap } from './types'

export { createParserContext, parseExpression }

// ---------------------------------------------------------------------------
// CST parsing — produces an untyped CST tree with full trivia
// ---------------------------------------------------------------------------

export interface ParseToCstResult {
  /** Untyped CST tree — root node has kind 'Program'. */
  tree: UntypedCstNode
  /** Trailing trivia after the last real token (file-level comments, final newlines). */
  trailingTrivia: TriviaNode[]
}

/**
 * Parse the full token stream into an untyped CST tree.
 *
 * The token stream must include whitespace and comment tokens (debug mode).
 * The parser runs in CST mode: every consumed token is wrapped in a CstToken
 * with attached trivia and fed to the CstBuilder.
 *
 * Throws on parse error — no error recovery (CstErrorNode is a future concern).
 */
export function parseToCst(fullTokenStream: TokenStream): ParseToCstResult {
  // Check for tokenizer errors
  for (const token of fullTokenStream.tokens) {
    if (token[0] === 'Error') {
      throw new ParseError(token[3], debugInfoToSourceCodeInfo(token[2], fullTokenStream.source, fullTokenStream.filePath))
    }
  }

  const builder = new CstBuilder()
  let localCounter = 0
  const ctx = createCstParserContext(fullTokenStream, () => localCounter++, builder)

  builder.startNode('Program')

  while (!ctx.isAtEnd()) {
    parseExpression(ctx, 0)
    if (isOperatorToken(ctx.tryPeek(), ';')) {
      ctx.advance()
    } else if (!ctx.isAtEnd()) {
      throw new ParseError('Expected ;', ctx.peekSourceCodeInfo())
    }
  }

  builder.endNode()
  const tree = builder.finish()
  const trailingTrivia = ctx.getRemainingTrivia()

  return { tree, trailingTrivia }
}

// ---------------------------------------------------------------------------
// AST parsing
// ---------------------------------------------------------------------------

function parseInternal(tokenStream: TokenStream, allocateId?: () => number): { nodes: AstNode[]; sourceMap: SourceMap | undefined } {
  tokenStream.tokens.forEach(token => {
    if (token[0] === 'Error') {
      throw new ParseError(token[3], debugInfoToSourceCodeInfo(token[2], tokenStream.source, tokenStream.filePath))
    }
  })

  const nodes: AstNode[] = []

  // Default to a fresh local counter when no allocator is injected (e.g. standalone bundler use).
  let localCounter = 0
  const ctx = createParserContext(tokenStream, allocateId ?? (() => localCounter++))

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

export function parse(tokenStream: TokenStream, allocateId?: () => number): AstNode[] {
  return parseInternal(tokenStream, allocateId).nodes
}

export function parseToAst(tokenStream: TokenStream, allocateId?: () => number): Ast {
  const { nodes, sourceMap } = parseInternal(tokenStream, allocateId)
  return { body: nodes, sourceMap }
}

/** Result of a recoverable parse — contains successfully parsed nodes and any errors encountered. */
export interface RecoverableParseResult {
  body: AstNode[]
  sourceMap: SourceMap | undefined
  errors: ParseError[]
}

/**
 * Parse with statement-level error recovery.
 * When a statement fails to parse, the error is collected and the parser
 * skips to the next semicolon to continue parsing subsequent statements.
 * This produces a partial AST that the language service can use even when
 * the file has syntax errors.
 */
export function parseRecoverable(tokenStream: TokenStream, allocateId?: () => number): RecoverableParseResult {
  // Collect tokenizer errors as diagnostics instead of throwing
  const errors: ParseError[] = []
  for (const token of tokenStream.tokens) {
    if (token[0] === 'Error') {
      errors.push(new ParseError(token[3], debugInfoToSourceCodeInfo(token[2], tokenStream.source, tokenStream.filePath)))
    }
  }

  const nodes: AstNode[] = []
  let localCounter = 0
  const ctx = createParserContext(tokenStream, allocateId ?? (() => localCounter++))

  while (!ctx.isAtEnd()) {
    try {
      nodes.push(parseExpression(ctx, 0))
      if (isOperatorToken(ctx.tryPeek(), ';')) {
        ctx.advance()
      } else if (!ctx.isAtEnd()) {
        throw new ParseError('Expected ;', ctx.peekSourceCodeInfo())
      }
    } catch (e) {
      // Collect the error and skip to the next statement boundary
      if (e instanceof ParseError) {
        errors.push(e)
      } else {
        errors.push(new ParseError(`${e}`, ctx.peekSourceCodeInfo()))
      }
      skipToNextStatement(ctx)
    }
  }

  return { body: nodes, sourceMap: ctx.sourceMap, errors }
}

/**
 * Advance the parser past the current failed statement by scanning forward
 * through tokens until a semicolon is found (and consumed) or end of input.
 */
function skipToNextStatement(ctx: ParserContext): void {
  // Track nesting depth so we don't stop at semicolons inside
  // parenthesized expressions, e.g. `let x = (a; b)` — though this is
  // unlikely in Dvala, being defensive costs nothing.
  let depth = 0
  while (!ctx.isAtEnd()) {
    const token = ctx.tryPeek()
    if (!token) break
    const type = token[0]
    // Track parenthesis/bracket depth
    if (type === 'LParen' || type === 'LBracket' || type === 'LBrace') {
      depth++
    } else if (type === 'RParen' || type === 'RBracket' || type === 'RBrace') {
      depth = Math.max(0, depth - 1)
    } else if (depth === 0 && isOperatorToken(token, ';')) {
      ctx.advance() // consume the semicolon
      return
    }
    ctx.advance()
  }
}
