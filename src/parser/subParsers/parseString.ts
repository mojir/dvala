import { NodeTypes } from '../../constants/constants'
import type { StringNode } from '../types'
import type { StringToken } from '../../tokenizer/token'
import { withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'

export function parseString(ctx: ParserContext, token: StringToken): StringNode {
  ctx.builder?.startNode('StringLiteral')
  ctx.advance()
  const value = token[1].substring(1, token[1].length - 1)
    .replace(
      /(\\{2})|(\\")|(\\n)|(\\t)|(\\r)|(\\b)|(\\f)|\\(.)/g,
      (
        _,
        backslash: string,
        doubleQuote: string,
        newline: string,
        tab: string,
        carriageReturn: string,
        backspace: string,
        formFeed: string,
        normalChar: string,
      ) => {
        // If it's a double escape (\\x), return \x
        if (backslash) {
          return '\\'
        } else if (newline) {
          // If it's a special character (\n, \t, \r, \b, \f), return the special character
          return '\n'
        } else if (tab) {
          return '\t'
        } else if (carriageReturn) {
          return '\r'
        } else if (backspace) {
          return '\b'
        } else if (formFeed) {
          return '\f'
        } else if (doubleQuote) {
          return '"'
        }
        return normalChar
      },
    )

  const node = withSourceCodeInfo([NodeTypes.Str, value, 0], token[2], ctx)
  ctx.setNodeEnd(node[2])
  ctx.builder?.endNode()
  return node
}
