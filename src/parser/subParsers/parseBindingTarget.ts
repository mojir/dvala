import { ParseError } from '../../errors'
import type { AliasParam, AstNode, BindingTarget, ObjectBindingEntry, SymbolNode, UserDefinedSymbolNode } from '../types'
import { bindingTargetTypes } from '../types'
import { type Token, assertOperatorToken, isAtomToken, isBasePrefixedNumberToken, isLBraceToken, isLBracketToken, isNumberToken, isOperatorToken, isRBraceToken, isRBracketToken, isReservedSymbolToken, isStringToken, isSymbolToken, isTemplateStringToken } from '../../tokenizer/token'
import { isSpecialSymbolNode, isUserDefinedSymbolNode } from '../../typeGuards/astNode'
import { getSymbolName, withSourceCodeInfo } from '../helpers'
import type { ParserContext } from '../ParserContext'
import { NodeTypes } from '../../constants/constants'
import { parseSymbol } from './parseSymbol'
import { parseString } from './parseString'
import { parseNumber } from './parseNumber'
import { parseTemplateString } from './parseTemplateString'
import { collectTypeAnnotation, isTypeAnnotationColon } from './parseTypeAnnotationTokens'
import type { TokenDebugInfo } from '../../tokenizer/token'

/**
 * Convert any symbol to a Sym for use in binding targets.
 * Normal builtins (map, filter, etc.) are allowed — they can be shadowed.
 * Special expressions (if, let, for, etc.) cannot be used as variable names.
 */
function toUserDefinedSymbol(symbol: SymbolNode, debugInfo: TokenDebugInfo | undefined, ctx: ParserContext): UserDefinedSymbolNode {
  if (isSpecialSymbolNode(symbol)) {
    throw new ParseError('Expected user defined symbol', ctx.resolveTokenDebugInfo(debugInfo))
  }
  if (isUserDefinedSymbolNode(symbol)) {
    return symbol
  }
  // Builtin → convert to Sym using its string name
  const name = getSymbolName(symbol)
  return withSourceCodeInfo([NodeTypes.Sym, name, 0], debugInfo, ctx) satisfies UserDefinedSymbolNode
}

export interface ParseBindingTargetOptions {
  requireDefaultValue?: true
  noRest?: true
  allowLiteralPatterns?: true
  stopTypeAnnotationAtRParen?: true
  /**
   * Phase 0b — `let f<T: U> = ...`. When true, the symbol-binding path
   * accepts an optional `<T, U: Bound, ...>` generic-param list between
   * the symbol and its type annotation / default value. The parsed
   * params are stored in `ctx.typeParams` keyed by the binding-target
   * nodeId. The typechecker reads them to create binding-scoped
   * TypeVars whose bounds propagate through any annotation in the RHS.
   */
  allowTypeParams?: true
}

export function parseBindingTarget(ctx: ParserContext, { requireDefaultValue, noRest, allowLiteralPatterns, stopTypeAnnotationAtRParen, allowTypeParams }: ParseBindingTargetOptions = {}): BindingTarget {
  const firstToken = ctx.tryPeek()

  // Wildcard _ (only in pattern matching context)
  if (allowLiteralPatterns && isReservedSymbolToken(firstToken, '_')) {
    ctx.advance()
    const target = withSourceCodeInfo([bindingTargetTypes.wildcard, [], 0], firstToken[2], ctx)
    ctx.setNodeEnd(target[2])
    return target
  }

  // Literal patterns: number, string, true, false, null (only in pattern matching context)
  if (allowLiteralPatterns && isLiteralToken(firstToken)) {
    if (isNumberToken(firstToken) || isBasePrefixedNumberToken(firstToken)) {
      const node = parseNumber(ctx)
      const target = withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
      ctx.setNodeEnd(target[2])
      return target
    }
    if (isTemplateStringToken(firstToken)) {
      const node = parseTemplateString(ctx, firstToken)
      const target = withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
      ctx.setNodeEnd(target[2])
      return target
    }
    if (isStringToken(firstToken)) {
      const node = parseString(ctx, firstToken)
      const target = withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
      ctx.setNodeEnd(target[2])
      return target
    }
    if (isAtomToken(firstToken)) {
      ctx.advance()
      const node: AstNode = withSourceCodeInfo([NodeTypes.Atom, firstToken[1], 0], firstToken[2], ctx)
      const target = withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
      ctx.setNodeEnd(target[2])
      return target
    }
    if (isReservedSymbolToken(firstToken, 'true')) {
      ctx.advance()
      const node: AstNode = withSourceCodeInfo([NodeTypes.Reserved, 'true', 0], firstToken[2], ctx)
      const target = withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
      ctx.setNodeEnd(target[2])
      return target
    }
    if (isReservedSymbolToken(firstToken, 'false')) {
      ctx.advance()
      const node: AstNode = withSourceCodeInfo([NodeTypes.Reserved, 'false', 0], firstToken[2], ctx)
      const target = withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
      ctx.setNodeEnd(target[2])
      return target
    }
    // Defensive: null literal in binding target is parsed but rarely used
    /* v8 ignore next 7 */
    if (isReservedSymbolToken(firstToken, 'null')) {
      ctx.advance()
      const node: AstNode = withSourceCodeInfo([NodeTypes.Reserved, 'null', 0], firstToken[2], ctx)
      const target = withSourceCodeInfo([bindingTargetTypes.literal, [node], 0], firstToken[2], ctx)
      ctx.setNodeEnd(target[2])
      return target
    }
  }

  // Symbol
  if (isSymbolToken(firstToken)) {
    const symbol = toUserDefinedSymbol(parseSymbol(ctx), firstToken[2], ctx)

    // Phase 0b — optional binding-scoped type-parameter list: `let f<T: U> = ...`.
    // Parsed here (before the type annotation / default value) when the caller
    // opted in via `allowTypeParams` (only `let` today). Stored in `ctx.typeParams`
    // keyed by the binding-target nodeId so the typechecker can register the
    // bounded type vars for the whole RHS.
    let typeParams: AliasParam[] | undefined
    if (allowTypeParams && isOperatorToken(ctx.tryPeek(), '<')) {
      typeParams = parseBindingTypeParams(ctx)
    }

    // Type annotation: x: Type — stored in side-table, not in the binding target
    let typeAnnotation: string | undefined
    if (isTypeAnnotationColon(ctx)) {
      ctx.advance() // consume ':'
      typeAnnotation = collectTypeAnnotation(ctx, { stopAtRParen: stopTypeAnnotationAtRParen ?? false })
      if (!typeAnnotation) {
        throw new ParseError('Expected type after ":"', ctx.peekSourceCodeInfo())
      }
    }

    const defaultValue = parseOptionalDefaulValue(ctx)
    if (requireDefaultValue && !defaultValue) {
      throw new ParseError('Expected assignment', ctx.peekSourceCodeInfo())
    }

    const target = withSourceCodeInfo([bindingTargetTypes.symbol, [symbol, defaultValue], 0], firstToken[2], ctx)
    ctx.setNodeEnd(target[2])

    // Store annotation keyed by the binding target's allocated nodeId
    if (typeAnnotation) {
      ctx.typeAnnotations.set(target[2], typeAnnotation)
    }
    if (typeParams) {
      ctx.typeParams.set(target[2], typeParams)
    }

    return target
  }

  // Rest
  if (isOperatorToken(firstToken, '...')) {
    if (noRest) {
      throw new ParseError('Rest element not allowed', ctx.resolveTokenDebugInfo(firstToken[2] as TokenDebugInfo))
    }
    ctx.advance()
    const symbol = toUserDefinedSymbol(parseSymbol(ctx), firstToken[2], ctx)
    if (isOperatorToken(ctx.tryPeek(), '=')) {
      throw new ParseError('Rest argument can not have default value', ctx.peekSourceCodeInfo())
    }
    const target = withSourceCodeInfo([bindingTargetTypes.rest, [symbol[1], undefined], 0], firstToken[2], ctx)
    ctx.setNodeEnd(target[2])
    return target
  }

  // Array
  if (isLBracketToken(firstToken)) {
    ctx.advance()
    const elements: (BindingTarget | null)[] = []
    let token = ctx.peek()

    let rest = false
    while (!isRBracketToken(token)) {
      if (rest) {
        throw new ParseError('Rest argument must be last', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
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
    ctx.advance() // consume ']'

    // Create node now so setNodeEnd captures ']' as the end
    const target = withSourceCodeInfo([bindingTargetTypes.array, [elements, undefined], 0], firstToken[2], ctx)
    ctx.setNodeEnd(target[2])

    const defaultValue = parseOptionalDefaulValue(ctx)
    if (requireDefaultValue && !defaultValue) {
      throw new ParseError('Expected assignment', ctx.peekSourceCodeInfo())
    }
    ;(target[1] as unknown[])[1] = defaultValue
    return target
  }

  // Object
  if (isLBraceToken(firstToken)) {
    ctx.advance()
    const elements: ObjectBindingEntry[] = []
    const seenKeys = new Set<string>()
    let token = ctx.peek()
    let rest = false
    while (!isRBraceToken(token)) {
      if (rest) {
        throw new ParseError('Rest argument must be last', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
      }
      if (isOperatorToken(token, '...')) {
        rest = true
        ctx.advance()
      }
      // Parse the key symbol - can be any symbol type (including builtins) when using 'as' alias
      const keySymbol = parseSymbol(ctx)
      const keyName = getSymbolName(keySymbol)
      const keyNodeId = keySymbol[2] ?? 0
      // keyDebugInfo / keyTokenDebug used for bind-target source info when there is
      // no 'as' alias — in that case the key token IS the binding token
      const keyDebugInfo = keySymbol[2] !== undefined ? ctx.sourceMap?.positions.get(keySymbol[2]) : undefined
      const keyTokenDebug: TokenDebugInfo | undefined = keyDebugInfo ? [keyDebugInfo.start[0], keyDebugInfo.start[1]] : undefined
      token = ctx.peek()

      // Duplicate detection by external key (the exported/destructured name)
      const assertUniqueKey = (errToken: TokenDebugInfo | undefined) => {
        if (seenKeys.has(keyName)) {
          throw new ParseError(`Duplicate binding name: ${keyName}`, ctx.resolveTokenDebugInfo(errToken))
        }
        seenKeys.add(keyName)
      }

      if (isReservedSymbolToken(token, 'as')) {
        if (rest) {
          throw new ParseError('Rest argument can not have alias', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
        }
        ctx.advance()
        const name = toUserDefinedSymbol(parseSymbol(ctx), token[2] as TokenDebugInfo, ctx)
        assertUniqueKey(token[2] as TokenDebugInfo)
        const symTarget = withSourceCodeInfo([bindingTargetTypes.symbol, [name, parseOptionalDefaulValue(ctx)], 0], token[2] as TokenDebugInfo, ctx)
        ctx.setNodeEnd(symTarget[2])
        elements.push({ key: keyName, keyNodeId, target: symTarget })
      } else if (isRBraceToken(token) || isOperatorToken(token, ',') || isOperatorToken(token, '=')) {
        // Without 'as' alias, the key token becomes the binding name (shorthand)
        const key = toUserDefinedSymbol(keySymbol, keyTokenDebug, ctx)
        assertUniqueKey(token[2] as TokenDebugInfo)
        if (rest && isOperatorToken(ctx.tryPeek(), '=')) {
          throw new ParseError('Rest argument can not have default value', ctx.peekSourceCodeInfo())
        }

        if (rest) {
          const restTarget = withSourceCodeInfo([bindingTargetTypes.rest, [key[1], parseOptionalDefaulValue(ctx)], 0], keyTokenDebug, ctx)
          ctx.setNodeEnd(restTarget[2])
          elements.push({ key: key[1], keyNodeId, target: restTarget })
        } else {
          const symTarget = withSourceCodeInfo([bindingTargetTypes.symbol, [key, parseOptionalDefaulValue(ctx)], 0], keyTokenDebug, ctx)
          ctx.setNodeEnd(symTarget[2])
          elements.push({ key: key[1], keyNodeId, target: symTarget })
        }
      } else if (isOperatorToken(token, ':')) {
        ctx.advance()
        token = ctx.peek()
        if (allowLiteralPatterns) {
          // In pattern matching context, allow literals, nested objects/arrays, and variable bindings after ':'
          if (!isLBraceToken(token) && !isLBracketToken(token) && !isLiteralToken(token)) {
            throw new ParseError('Expected literal, object or array pattern', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
          }
        } else {
          if (!isLBraceToken(token) && !isLBracketToken(token)) {
            throw new ParseError('Expected object or array', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
          }
        }
        // Use the key token for the duplicate-name error site — the `{`/`[`
        // at `token` is the start of the nested pattern, not the duplicated key.
        assertUniqueKey(keyTokenDebug)
        elements.push({ key: keyName, keyNodeId, target: parseBindingTarget(ctx, { allowLiteralPatterns }) })
      }

      if (!isRBraceToken(ctx.peek())) {
        assertOperatorToken(ctx.peek(), ',')
        ctx.advance()
      }
      token = ctx.peek()
    }
    ctx.advance() // consume '}'

    // Create node now so setNodeEnd captures '}' as the end
    const target = withSourceCodeInfo([bindingTargetTypes.object, [elements, undefined], 0], firstToken[2] as TokenDebugInfo, ctx)
    ctx.setNodeEnd(target[2])

    token = ctx.peek()

    const defaultValue = parseOptionalDefaulValue(ctx)
    if (requireDefaultValue && !defaultValue) {
      throw new ParseError('Expected assignment', ctx.resolveTokenDebugInfo(token[2] as TokenDebugInfo))
    }

    // Patch in the default value (parsed after end position was recorded)
    ;(target[1] as unknown[])[1] = defaultValue
    return target
  }

  throw new ParseError('Expected symbol', ctx.peekSourceCodeInfo())
}

function parseOptionalDefaulValue(ctx: ParserContext): AstNode | undefined {
  if (isOperatorToken(ctx.tryPeek(), '=')) {
    ctx.advance()
    return ctx.parseExpression()
  }
  return undefined
}

/**
 * Parse a binding-scoped type-parameter list `<T, U: Bound, ...>` after
 * the symbol in a `let f<T> = ...` binding. Shares the shape with the
 * type-alias generic-param parser in `parseTypeDeclaration.ts` — both
 * emit `AliasParam[]` where each entry has a name and optional bound
 * source text. The bound source is parsed lazily by the typechecker
 * (same rationale as for alias bounds: avoid circular-parse dependencies
 * when a bound references a name defined later in the same file).
 *
 * Duplicates (`<T, T>` or `<T: A, T: B>`) are rejected here so the
 * typechecker downstream never sees an ambiguous type-var map.
 */
function parseBindingTypeParams(ctx: ParserContext): AliasParam[] {
  ctx.advance() // consume '<'
  const params: AliasParam[] = []
  const seen = new Set<string>()

  while (!ctx.isAtEnd()) {
    const paramToken = ctx.peek()
    if (!isSymbolToken(paramToken) && !isReservedSymbolToken(paramToken)) {
      throw new ParseError('Expected type parameter name', ctx.peekSourceCodeInfo())
    }
    const paramName = paramToken[1]
    if (seen.has(paramName)) {
      throw new ParseError(`Duplicate type parameter '${paramName}' in generic parameter list`, ctx.peekSourceCodeInfo())
    }
    seen.add(paramName)
    ctx.advance()

    // Optional upper bound: `: BoundType` — stored as source text, parsed lazily.
    let bound: string | undefined
    if (isOperatorToken(ctx.tryPeek(), ':')) {
      ctx.advance() // consume ':'
      const boundExpr = collectTypeAnnotation(ctx, { stopAtGt: true })
      if (!boundExpr) {
        throw new ParseError(`Expected bound type after ":" for parameter "${paramName}"`, ctx.peekSourceCodeInfo())
      }
      bound = boundExpr
    }
    params.push(bound === undefined ? { name: paramName } : { name: paramName, bound })

    if (isOperatorToken(ctx.tryPeek(), ',')) {
      ctx.advance()
      continue
    }
    break
  }

  if (!isOperatorToken(ctx.tryPeek(), '>')) {
    throw new ParseError('Expected ">" after type parameters', ctx.peekSourceCodeInfo())
  }
  ctx.advance() // consume '>'
  return params
}

function isLiteralToken(token: Token | undefined): boolean {
  return isNumberToken(token)
    || isBasePrefixedNumberToken(token)
    || isStringToken(token)
    || isTemplateStringToken(token)
    || isAtomToken(token)
    || isReservedSymbolToken(token, 'true')
    || isReservedSymbolToken(token, 'false')
    || isReservedSymbolToken(token, 'null')
}

