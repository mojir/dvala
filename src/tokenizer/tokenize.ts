import { tokenizeShebang, tokenizers } from './tokenizers'
import type { Token, TokenDebugInfo, TokenDescriptor } from './token'

export interface TokenStream {
  tokens: Token[]
  filePath?: string
  /** Full source text — present when debug mode is enabled. Its presence
   *  replaces the old `hasDebugData` flag. */
  source?: string
}

export function tokenize(input: string, debug: boolean, filePath: string | undefined): TokenStream {
  let position = 0
  const tokenStream: TokenStream = {
    tokens: [],
    filePath,
    source: debug ? input : undefined,
  }

  let prevToken: Token | undefined

  while (position < input.length) {
    const debugInfo: TokenDebugInfo | undefined = debug
      ? createDebugInfo(input, position)
      : undefined

    const tokenDescriptor = getCurrentToken(input, position, prevToken)

    const [count, token] = tokenDescriptor

    position += count
    if (token) {
      // Defensive: debugInfo is always created when debug is enabled
      /* v8 ignore next 3 */
      if (debugInfo) {
        token[2] = debugInfo
      }

      tokenStream.tokens.push(token)
      if (token[0] !== 'Whitespace') {
        prevToken = token
      }
    }
  }

  return tokenStream
}

/** Create a 0-based [line, column] debug position from a character offset. */
function createDebugInfo(input: string, position: number): TokenDebugInfo {
  const lines = input.substring(0, position + 1).split(/\r\n|\r|\n/)
  const lastLine = lines[lines.length - 1] as string
  const line = lines.length - 1 // 0-based
  const column = lastLine.length - 1 // 0-based
  return [line, column]
}

function getCurrentToken(input: string, position: number, prevToken: Token | undefined): TokenDescriptor<Token> {
  const initialPosition = position

  if (position === 0) {
    const [nbrOfCharacters, token] = tokenizeShebang(input, position)
    position += nbrOfCharacters
    if (nbrOfCharacters > 0) {
      return [position - initialPosition, token]
    }
  }

  for (const tokenizer of tokenizers) {
    const [nbrOfCharacters, token] = tokenizer(input, position, prevToken)
    position += nbrOfCharacters
    if (nbrOfCharacters === 0) {
      continue
    }

    return [position - initialPosition, token]
  }
  return [1, ['Error', input[initialPosition], undefined, 'Unrecognized character']] as TokenDescriptor<Token>
}
