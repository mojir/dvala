import { ParseError } from '../errors'
import type { SourceCodeInfo, Token, TokenDebugInfo } from '../tokenizer/token'
import { debugInfoToSourceCodeInfo } from '../tokenizer/token'
import type { TokenStream } from '../tokenizer/tokenize'
import type { AstNode, SourceMap, SourceMapPosition } from './types'

// Global node ID counter — ensures unique IDs across all parsed files
let globalNodeIdCounter = 0

/** Reset the global node ID counter (for testing only). */
export function resetNodeIdCounter(): void {
  globalNodeIdCounter = 0
}

export class ParserContext {
  private readonly tokens: Token[]
  private position: number
  private storedPosition: number = 0
  public parseExpression!: (precedence?: number) => AstNode

  public readonly sourceMap: SourceMap | undefined
  /** Full source text (available in debug mode). */
  private readonly source: string | undefined
  /** File path of the source (available in debug mode). */
  private readonly filePath: string | undefined

  constructor(tokenStream: TokenStream) {
    this.tokens = tokenStream.tokens
    this.position = 0
    this.source = tokenStream.source
    this.filePath = tokenStream.filePath
    if (tokenStream.source !== undefined) {
      this.sourceMap = {
        sources: [{ path: tokenStream.filePath ?? '<anonymous>', content: tokenStream.source ?? '' }],
        positions: [],
      }
    }
  }

  public nextNodeId(): number {
    return globalNodeIdCounter++
  }

  public allocateNodeId(debugInfo?: TokenDebugInfo): number {
    const id = globalNodeIdCounter++
    if (this.sourceMap && debugInfo) {
      const position: SourceMapPosition = {
        source: 0, // single source for now
        start: [debugInfo[0], debugInfo[1]], // already 0-based
        end: [debugInfo[0], debugInfo[1]], // placeholder — updated by setNodeEnd()
      }
      this.sourceMap.positions[id] = position
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
    const pos = this.sourceMap.positions[nodeId]
    if (!pos) return
    // The last consumed token is at position - 1
    const lastToken = this.tokens[this.position - 1]
    const debugInfo = lastToken?.[2]
    if (debugInfo) {
      // End is after the last token: same line, column + token value length
      const tokenLen = lastToken[1].length
      pos.end = [debugInfo[0], debugInfo[1] + tokenLen]
    }
  }

  public advance(): void {
    this.position += 1
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

  public storePosition(): number {
    return this.storedPosition = this.position
  }

  public restorePosition(): void {
    this.position = this.storedPosition
  }

  public peekAhead(count: number): Token | undefined {
    return this.tokens[this.position + count]
  }

  public getPosition(): number {
    return this.position
  }

  public getTokenAt(pos: number): Token | undefined {
    return this.tokens[pos]
  }
}
