import { ParseError } from '../errors'
import type { SourceCodeInfo, Token, TokenDebugInfo } from '../tokenizer/token'
import { debugInfoToSourceCodeInfo } from '../tokenizer/token'
import type { TokenStream } from '../tokenizer/tokenize'
import type { AstNode, SourceMap, SourceMapPosition } from './types'
import type { CstBuilder } from '../cst/builder'
import type { CstToken, TriviaNode } from '../cst/types'
import { isTrivia, rawTokenText, splitTriviaAtNewline, toTriviaNode } from '../cst/attachTrivia'

export class ParserContext {
  private readonly tokens: Token[]
  private position: number
  public parseExpression!: (precedence?: number) => AstNode

  public readonly sourceMap: SourceMap | undefined
  /** Full source text (available in debug mode). */
  private readonly source: string | undefined
  /** File path of the source (available in debug mode). */
  private readonly filePath: string | undefined
  /** Allocates a unique node ID — provided by the caller to scope uniqueness per instance. */
  readonly allocateId: () => number

  // -- CST mode fields --
  /** When present, the parser operates in CST mode on the full token stream. */
  readonly builder: CstBuilder | undefined
  /** Leading trivia accumulated for the next token to be consumed. */
  private pendingLeadingTrivia: TriviaNode[] = []
  /** Position of the last consumed non-trivia token (for setNodeEnd in CST mode). */
  private lastNonTriviaPosition = -1

  constructor(tokenStream: TokenStream, allocateId: () => number, builder?: CstBuilder) {
    this.allocateId = allocateId
    this.tokens = tokenStream.tokens
    this.position = 0
    this.source = tokenStream.source
    this.filePath = tokenStream.filePath
    this.builder = builder

    if (tokenStream.source !== undefined) {
      this.sourceMap = {
        sources: [{ path: tokenStream.filePath ?? '<anonymous>', content: tokenStream.source }],
        positions: new Map(),
      }
    }

    // In CST mode, skip any initial trivia so position points at the first
    // non-trivia token. Collected trivia becomes leading trivia of the first
    // real token.
    if (builder) {
      this.skipTrivia()
    }
  }

  public allocateNodeId(debugInfo?: TokenDebugInfo, structuralLeaf?: boolean): number {
    const id = this.allocateId()
    if (this.sourceMap && debugInfo) {
      const position: SourceMapPosition = {
        source: 0, // single source for now
        start: [debugInfo[0], debugInfo[1]], // already 0-based
        end: [debugInfo[0], debugInfo[1]], // placeholder — updated by setNodeEnd()
        ...(structuralLeaf ? { structuralLeaf: true } : {}),
      }
      this.sourceMap.positions.set(id, position)
    }
    return id
  }

  /**
   * Update the end position of a node after it has been fully parsed.
   * Uses the debug info of the last consumed token (i.e. the token
   * just before the current position).
   */
  public setNodeEnd(nodeId: number): void {
    if (!this.sourceMap) return
    const pos = this.sourceMap.positions.get(nodeId)
    if (!pos) return

    // In CST mode, use the tracked last non-trivia position
    // instead of position - 1 (which might be a trivia token).
    const lastPos = this.builder ? this.lastNonTriviaPosition : this.position - 1
    const lastToken = this.tokens[lastPos]
    const debugInfo = lastToken?.[2]
    if (debugInfo) {
      // End is after the last token: same line, column + token value length
      const tokenLen = lastToken[1].length
      pos.end = [debugInfo[0], debugInfo[1] + tokenLen]
    }
  }

  public advance(): void {
    if (this.builder) {
      this.advanceCst()
    } else {
      this.position += 1
    }
  }

  /**
   * CST-mode advance: consume the current non-trivia token, collect trivia,
   * create a CstToken, and feed it to the builder.
   */
  private advanceCst(): void {
    const token = this.tokens[this.position]!
    const cstToken: CstToken = {
      leadingTrivia: this.pendingLeadingTrivia,
      text: rawTokenText(token),
      trailingTrivia: [],
    }
    this.lastNonTriviaPosition = this.position
    this.position += 1

    // Collect trivia after the consumed token and split it:
    // same-line trivia → trailing of this token, next-line → pending for next
    this.skipTrivia()
    cstToken.trailingTrivia = this.pendingLeadingTrivia.length > 0
      ? [] // will be filled by the split below
      : []

    // If there's accumulated trivia, split at newline boundary
    const collected = this.pendingLeadingTrivia
    if (collected.length > 0) {
      const { trailing, leading } = splitTriviaAtNewline(collected)
      cstToken.trailingTrivia = trailing
      this.pendingLeadingTrivia = leading
    } else {
      this.pendingLeadingTrivia = []
    }

    this.builder!.token(cstToken)
  }

  /**
   * Skip trivia tokens from current position, accumulating them in
   * pendingLeadingTrivia. After this call, position points at the
   * next non-trivia token (or past end).
   */
  private skipTrivia(): void {
    const trivia: TriviaNode[] = []
    while (this.position < this.tokens.length && isTrivia(this.tokens[this.position]!)) {
      trivia.push(toTriviaNode(this.tokens[this.position]!))
      this.position += 1
    }
    this.pendingLeadingTrivia = trivia
  }

  public tryPeek(): Token | undefined {
    return this.tokens[this.position]
  }

  public peek(): Token {
    const token = this.tokens[this.position]
    // Defensive: peek is only called when tokens remain
    /* v8 ignore next 4 */
    if (!token) {
      const lastToken = this.tokens.at(-1)
      throw new ParseError('Unexpected end of input', this.resolveTokenDebugInfo(lastToken?.[2]))
    }
    return token
  }

  public isAtEnd(): boolean {
    return this.position >= this.tokens.length
  }

  /**
   * Get the raw token debug info [line, column] for the current (or last) token.
   * Use this when passing to withSourceCodeInfo / allocateNodeId.
   */
  public peekDebugInfo(): TokenDebugInfo | undefined {
    const currentToken = this.tryPeek()
    return (currentToken ? currentToken[2] : this.tokens.at(-1)?.[2])
  }

  /**
   * Get SourceCodeInfo for the current (or last) token position.
   * Constructs a full SourceCodeInfo from the token's [line, column] + source text.
   * Use this for error reporting (DvalaError).
   */
  public peekSourceCodeInfo(): SourceCodeInfo | undefined {
    return this.resolveTokenDebugInfo(this.peekDebugInfo())
  }

  /** Convert token debug info to SourceCodeInfo using stored source text. */
  public resolveTokenDebugInfo(debugInfo: TokenDebugInfo | undefined): SourceCodeInfo | undefined {
    return debugInfoToSourceCodeInfo(debugInfo, this.source, this.filePath)
  }

  public peekAhead(count: number): Token | undefined {
    if (this.builder) {
      // In CST mode, skip trivia tokens when counting ahead
      let skipped = 0
      let offset = 1
      while (this.position + offset < this.tokens.length) {
        const token = this.tokens[this.position + offset]!
        if (!isTrivia(token)) {
          skipped += 1
          if (skipped === count) return token
        }
        offset += 1
      }
      return undefined
    }
    return this.tokens[this.position + count]
  }

  public getPosition(): number {
    return this.position
  }

  public getTokenAt(pos: number): Token | undefined {
    return this.tokens[pos]
  }

  /**
   * Get any remaining trivia that hasn't been attached to a token yet.
   * Called after parsing is complete to get file-trailing trivia.
   * Only meaningful in CST mode.
   */
  public getRemainingTrivia(): TriviaNode[] {
    return this.pendingLeadingTrivia
  }
}
