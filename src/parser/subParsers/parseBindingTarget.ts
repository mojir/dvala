import { DvalaError } from '../../errors'
import type { AstNode, BindingTarget, SymbolNode, UserDefinedSymbolNode } from '../types'
import { bindingTargetTypes } from '../types'
import { type Token, assertOperatorToken, isBasePrefixedNumberToken, isLBraceToken, isLBracketToken, isNumberToken, isOperatorToken, isRBraceToken, isRBracketToken, isReservedSymbolToken, isStringToken, isSymbolToken, isTemplateStringToken } from '../../tokenizer/token'
import { isSpecialSymbolNode, isUserDefinedSymbolNode } from '../../typeGuards/astNode'
import { getSymbolName, withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { NodeTypes } from '../../constants/constants'
import { parseSymbol } from './parseSymbol'
import { parseString } from './parseString'
import { parseNumber } from './parseNumber'
import { parseTemplateString } from './parseTemplateString'
import type { TokenDebugInfo } from '../../tokenizer/token'

/**
 * Convert any symbol to a UserDefinedSymbol for use in binding targets.
 * Normal builtins (map, filter, etc.) are allowed — they can be shadowed.
 * Special expressions (if, let, for, etc.) cannot be used as variable names.
 */
function toUserDefinedSymbol(symbol: SymbolNode, debugInfo: TokenDebugInfo | undefined, ctx: ParserContext): UserDefinedSymbolNode {
  if (isSpecialSymbolNode(symbol)) {
    throw new DvalaError('Expected user defined symbol', ctx.resolveTokenDebugInfo(debugInfo))
  }
  if (isUserDefinedSymbolNode(symbol)) {
    return symbol
  }
  // Builtin → convert to UserDefinedSymbol using its string name
  const name = getSymbolName(symbol)
  return withSourceCodeInfo([NodeTypes.UserDefinedSymbol, name, 0], debugInfo, ctx) satisfies UserDefinedSymbolNode
}

export interface ParseBindingTargetOptions {
  requireDefaultValue?: true
  noRest?: true
  allowLiteralPatterns?: true
}

export function parseBindingTarget(ctx: ParserContext, { requireDefaultValue, noRest, allowLiteralPatterns }: ParseBindingTargetOptions = {}): BindingTarget {
  const firstToken = ctx.tryPeek()

  // Wildcard _ (only in pattern matching context)
  if (allowLiteralPatterns && isReservedSymbolToken(firstToken, '_')) {
    ctx.advance()
    return withSourceCodeInfo([bindingTargetTypes.wildcard, [], 0], firstToken[2], ctx)
  }

  // Literal patterns: number, string, true, false, null (only in pattern matching context)
  if (allowLiteralPatterns && isLiteralToken(firstToken)) {
    if (isNumberToken(firstToken) || isBasePrefixedNumberToken(firstToken)) {
      const node = parseNumber(ctx)
      return withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
    }
    if (isTemplateStringToken(firstToken)) {
      const node = parseTemplateString(ctx, firstToken)
      return withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
    }
    if (isStringToken(firstToken)) {
      const node = parseString(ctx, firstToken)
      return withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
    }
    if (isReservedSymbolToken(firstToken, 'true')) {
      ctx.advance()
      const node: AstNode = withSourceCodeInfo([NodeTypes.Reserved, 'true', 0], firstToken[2], ctx)
      return withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
    }
    if (isReservedSymbolToken(firstToken, 'false')) {
      ctx.advance()
      const node: AstNode = withSourceCodeInfo([NodeTypes.Reserved, 'false', 0], firstToken[2], ctx)
      return withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
    }
    // Defensive: null literal in binding target is parsed but rarely used
    /* v8 ignore next 5 */
    if (isReservedSymbolToken(firstToken, 'null')) {
      ctx.advance()
      const node: AstNode = withSourceCodeInfo([NodeTypes.Reserved, 'null', 0], firstToken[2], ctx)
      return withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
    }
  }

  // Symbol
  if (isSymbolToken(firstToken)) {
    const symbol = toUserDefinedSymbol(parseSymbol(ctx), firstToken[2], ctx)

    const defaultValue = parseOptionalDefaulValue(ctx)
    if (requireDefaultValue && !defaultValue) {
      throw new DvalaError('Expected assignment', ctx.peekSourceCodeInfo())
    }

    return withSourceCodeInfo([bindingTargetTypes.symbol, [symbol, defaultValue], 0], firstToken[2], ctx)
  }

  // Rest
  if (isOperatorToken(firstToken, '...')) {
    if (noRest) {
      throw new DvalaError('Rest element not allowed', ctx.resolveTokenDebugInfo(firstToken[2] as TokenDebugInfo))
    }
    ctx.advance()
    const symbol = toUserDefinedSymbol(parseSymbol(ctx), firstToken[2], ctx)
    if (isOperatorToken(ctx.tryPeek(), '=')) {
      throw new DvalaError('Rest argument can not have default value', ctx.peekSourceCodeInfo())
    }
    return withSourceCodeInfo([bindingTargetTypes.rest, [symbol[1], undefined], 0], firstToken[2], ctx)
  }

  // Array
  if (isLBracketToken(firstToken)) {
    ctx.advance()
    const elements: (BindingTarget | null)[] = []
    let token = ctx.peek()

    let rest = false
    while (!isRBracketToken(token)) {
      if (rest) {
        throw new DvalaError('Rest argument must be last', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
      }
      if (isOperatorToken(token, ',')) {
        elements.push(null)
        ctx.advance()
        token = ctx.peek()
        continue
      }

      const target = parseBindingTarget(ctx, { allowLiteralPatterns })

      if (target[0] === bindingTargetTypes.rest) {
        rest = true
      }

      elements.push(target)
      token = ctx.peek()

      if (!isRBracketToken(token)) {
        assertOperatorToken(token, ',')
        ctx.advance()
      }
      token = ctx.peek()
    }
    ctx.advance()

    const defaultValue = parseOptionalDefaulValue(ctx)
    if (requireDefaultValue && !defaultValue) {
      throw new DvalaError('Expected assignment', ctx.peekSourceCodeInfo())
    }

    return withSourceCodeInfo([bindingTargetTypes.array, [elements, defaultValue], 0], firstToken[2], ctx)
  }

  // Object
  if (isLBraceToken(firstToken)) {
    ctx.advance()
    const elements: Record<string, BindingTarget> = {}
    let token = ctx.peek()
    let rest = false
    while (!isRBraceToken(token)) {
      if (rest) {
        throw new DvalaError('Rest argument must be last', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
      }
      if (isOperatorToken(token, '...')) {
        rest = true
        ctx.advance()
      }
      // Parse the key symbol - can be any symbol type (including builtins) when using 'as' alias
      const keySymbol = parseSymbol(ctx)
      const keyName = getSymbolName(keySymbol)
      token = ctx.peek()
      if (isReservedSymbolToken(token, 'as')) {
        if (rest) {
          throw new DvalaError('Rest argument can not have alias', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
        }
        ctx.advance()
        const name = toUserDefinedSymbol(parseSymbol(ctx), token[2] as TokenDebugInfo, ctx)
        if (elements[name[1]]) {
          throw new DvalaError(`Duplicate binding name: ${name}`, ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
        }
        elements[keyName] = withSourceCodeInfo([bindingTargetTypes.symbol, [name, parseOptionalDefaulValue(ctx)], 0], firstToken[2], ctx)
      } else if (isRBraceToken(token) || isOperatorToken(token, ',') || isOperatorToken(token, '=')) {
        // Without 'as' alias, the key becomes the binding name
        const key = toUserDefinedSymbol(keySymbol, firstToken[2], ctx)
        if (elements[key[1]]) {
          throw new DvalaError(`Duplicate binding name: ${key}`, ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
        }
        if (rest && isOperatorToken(ctx.tryPeek(), '=')) {
          throw new DvalaError('Rest argument can not have default value', ctx.peekSourceCodeInfo())
        }

        elements[key[1]] = rest
          ? withSourceCodeInfo([bindingTargetTypes.rest, [key[1], parseOptionalDefaulValue(ctx)], 0], firstToken[2], ctx)
          : withSourceCodeInfo([bindingTargetTypes.symbol, [key, parseOptionalDefaulValue(ctx)], 0], firstToken[2], ctx)
      } else if (isOperatorToken(token, ':')) {
        ctx.advance()
        token = ctx.peek()
        if (allowLiteralPatterns) {
          // In pattern matching context, allow literals, nested objects/arrays, and variable bindings after ':'
          if (!isLBraceToken(token) && !isLBracketToken(token) && !isLiteralToken(token)) {
            throw new DvalaError('Expected literal, object or array pattern', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
          }
        } else {
          if (!isLBraceToken(token) && !isLBracketToken(token)) {
            throw new DvalaError('Expected object or array', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
          }
        }
        elements[keyName] = parseBindingTarget(ctx, { allowLiteralPatterns })
      }

      if (!isRBraceToken(ctx.peek())) {
        assertOperatorToken(ctx.peek(), ',')
        ctx.advance()
      }
      token = ctx.peek()
    }
    ctx.advance()
    token = ctx.peek()

    const defaultValue = parseOptionalDefaulValue(ctx)
    if (requireDefaultValue && !defaultValue) {
      throw new DvalaError('Expected assignment', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
    }

    return withSourceCodeInfo([bindingTargetTypes.object, [elements, defaultValue], 0], firstToken[2], ctx)
  }

  throw new DvalaError('Expected symbol', ctx.peekSourceCodeInfo())
}

function parseOptionalDefaulValue(ctx: ParserContext): AstNode | undefined {
  if (isOperatorToken(ctx.tryPeek(), '=')) {
    ctx.advance()
    return ctx.parseExpression()
  }
  return undefined
}

function isLiteralToken(token: Token | undefined): boolean {
  return isNumberToken(token)
    || isBasePrefixedNumberToken(token)
    || isStringToken(token)
    || isTemplateStringToken(token)
    || isReservedSymbolToken(token, 'true')
    || isReservedSymbolToken(token, 'false')
    || isReservedSymbolToken(token, 'null')
}
