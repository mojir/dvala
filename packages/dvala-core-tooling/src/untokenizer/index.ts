import type { TokenStream } from '../tokenizer/tokenize'

export function untokenize(tokenStream: TokenStream): string {
  return tokenStream.tokens.reduce((acc: string, token) => {
    const prefix = token[0] === 'EffectName' ? '@' : ''
    return `${acc}${prefix}${token[1]}`
  }, '')
}
