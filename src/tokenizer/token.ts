import { TokenizerError } from '../errors'
import type { ReservedSymbol } from './reservedNames'
import { type SymbolicBinaryOperator, type SymbolicOperator, isBinaryOperator } from './operators'

export const tokenTypes = [
  'LBrace',
  'LBracket',
  'RBrace',
  'RBracket',
  'LParen',
  'RParen',
  'BasePrefixedNumber',
  'EffectName',
  'Error',
  'MultiLineComment',
  'Number',
  'Operator',
  'RegexpShorthand',
  'ReservedSymbol',
  'SingleLineComment',
  'Shebang',
  'string',
  'Symbol',
  'TemplateString',
  'QuoteSplice',
  'MacroQualified',
  'MacroPrefix',
  'Whitespace',
] as const

export type TokenType = typeof tokenTypes[number]

/** Debug position carried by tokens in debug mode: [line, column] (0-based). */
export type TokenDebugInfo = [line: number, column: number]

type GenericToken<T extends TokenType, V extends string = string> = [T, V] | [T, V, TokenDebugInfo]

export type ErrorToken = ['Error', string, TokenDebugInfo | undefined, string]

export type LBraceToken = GenericToken<'LBrace', '{'>
export type LBracketToken = GenericToken<'LBracket', '['>
export type LParenToken = GenericToken<'LParen', '('>
export type RBraceToken = GenericToken<'RBrace', '}'>
export type RBracketToken = GenericToken<'RBracket', ']'>
export type RParenToken = GenericToken<'RParen', ')'>

export type EffectNameToken = GenericToken<'EffectName'>
export type BasePrefixedNumberToken = GenericToken<'BasePrefixedNumber'>
export type MultiLineCommentToken = GenericToken<'MultiLineComment'>
export type NumberToken = GenericToken<'Number'>
export type OperatorToken<T extends SymbolicOperator = SymbolicOperator> = GenericToken<'Operator', T>
export type RegexpShorthandToken = GenericToken<'RegexpShorthand'>
export type ReservedSymbolToken<T extends ReservedSymbol = ReservedSymbol> = GenericToken<'ReservedSymbol', T>
export type SingleLineCommentToken = GenericToken<'SingleLineComment'>
export type ShebangToken = GenericToken<'Shebang'>
export type StringToken = GenericToken<'string'>
export type SymbolToken<T extends string = string> = GenericToken<'Symbol', T>
export type TemplateStringToken = GenericToken<'TemplateString'>
/** Token for `$^+{` splice markers inside quote...end blocks. Value is `$^{`, `$^^{`, etc. */
export type QuoteSpliceToken = GenericToken<'QuoteSplice'>
/** Token for `macro@qualified.name` — value is the qualified name (without macro@ prefix). */
export type MacroQualifiedToken = GenericToken<'MacroQualified'>
/** Token for `#name` prefix macro call syntax — value is the macro name (without #). */
export type MacroPrefixToken = GenericToken<'MacroPrefix'>
export type WhitespaceToken = GenericToken<'Whitespace'>

export type Token =
  | LBraceToken
  | LBracketToken
  | LParenToken
  | RBraceToken
  | RBracketToken
  | RParenToken
  | EffectNameToken
  | BasePrefixedNumberToken
  | ErrorToken
  | MultiLineCommentToken
  | NumberToken
  | OperatorToken
  | RegexpShorthandToken
  | ReservedSymbolToken
  | SingleLineCommentToken
  | ShebangToken
  | StringToken
  | SymbolToken
  | TemplateStringToken
  | QuoteSpliceToken
  | MacroQualifiedToken
  | MacroPrefixToken
  | WhitespaceToken

export type TokenDescriptor<T extends Token> = [length: number, token?: T]

export interface SourceCodeInfo {
  position: {
    line: number
    column: number
  }
  code: string
  filePath?: string
}

export function isSymbolToken<T extends string>(token: Token | undefined, symbolName?: T): token is SymbolToken<T> {
  if (token?.[0] !== 'Symbol') {
    return false
  }
  if (symbolName && token[1] !== symbolName) {
    return false
  }
  return true
}

export function assertSymbolToken<T extends string>(token: Token | undefined, symbolName?: T): asserts token is SymbolToken<T> {
  if (!isSymbolToken(token, symbolName)) {
    throwUnexpectedToken('Symbol', undefined, token)
  }
}
export function asSymbolToken<T extends string>(token: Token | undefined, symbolName?: T): SymbolToken<T> {
  assertSymbolToken(token, symbolName)
  return token
}

export function isEffectNameToken(token: Token | undefined): token is EffectNameToken {
  return token?.[0] === 'EffectName'
}
export function assertEffectNameToken(token: Token | undefined): asserts token is EffectNameToken {
  if (!isEffectNameToken(token)) {
    throwUnexpectedToken('EffectName', undefined, token)
  }
}
export function asEffectNameToken(token: Token | undefined): EffectNameToken {
  assertEffectNameToken(token)
  return token
}

export function isReservedSymbolToken<T extends ReservedSymbol>(token: Token | undefined, symbolName?: T): token is ReservedSymbolToken<T> {
  if (token?.[0] !== 'ReservedSymbol') {
    return false
  }
  if (symbolName && token[1] !== symbolName) {
    return false
  }
  return true
}
export function assertReservedSymbolToken<T extends ReservedSymbol>(token: Token | undefined, symbolName?: T): asserts token is ReservedSymbolToken<T> {
  if (!isReservedSymbolToken(token, symbolName)) {
    throwUnexpectedToken('ReservedSymbol', symbolName, token)
  }
}
export function asReservedSymbolToken<T extends ReservedSymbol>(token: Token | undefined, symbolName?: T): ReservedSymbolToken<T> {
  assertReservedSymbolToken(token, symbolName)
  return token
}

export function isShebangToken(token: Token | undefined): token is SingleLineCommentToken {
  return token?.[0] === 'Shebang'
}

export function isSingleLineCommentToken(token: Token | undefined): token is SingleLineCommentToken {
  return token?.[0] === 'SingleLineComment'
}

export function isMultiLineCommentToken(token: Token | undefined): token is MultiLineCommentToken {
  return token?.[0] === 'MultiLineComment'
}

export function isOperatorToken<T extends SymbolicOperator>(token: Token | undefined, operatorName?: T): token is OperatorToken<T> {
  if (token?.[0] !== 'Operator') {
    return false
  }
  if (operatorName && token[1] !== operatorName) {
    return false
  }
  return true
}
export function assertOperatorToken<T extends SymbolicOperator>(token: Token | undefined, operatorName?: T): asserts token is OperatorToken<T> {
  if (!isOperatorToken(token, operatorName)) {
    throwUnexpectedToken('Operator', operatorName, token)
  }
}
export function asOperatorToken<T extends SymbolicOperator>(token: Token | undefined, operatorName?: T): OperatorToken<T> {
  assertOperatorToken(token, operatorName)
  return token
}

export function isWhitespaceToken(token: Token | undefined): token is WhitespaceToken {
  return token?.[0] === 'Whitespace'
}
export function assertWhitespaceToken(token: Token | undefined): asserts token is WhitespaceToken {
  if (!isWhitespaceToken(token)) {
    throwUnexpectedToken('Whitespace', undefined, token)
  }
}
export function asWhitespaceToken(token: Token | undefined): WhitespaceToken {
  assertWhitespaceToken(token)
  return token
}

export function isNumberToken(token: Token | undefined): token is NumberToken {
  return token?.[0] === 'Number'
}
export function assertNumberToken(token: Token | undefined): asserts token is NumberToken {
  if (!isNumberToken(token)) {
    throwUnexpectedToken('Number', undefined, token)
  }
}
export function asNumberToken(token: Token | undefined): NumberToken {
  assertNumberToken(token)
  return token
}

export function isBasePrefixedNumberToken(token: Token | undefined): token is BasePrefixedNumberToken {
  return token?.[0] === 'BasePrefixedNumber'
}
export function assertBasePrefixedNumberToken(token: Token | undefined): asserts token is BasePrefixedNumberToken {
  if (!isBasePrefixedNumberToken(token)) {
    throwUnexpectedToken('BasePrefixedNumber', undefined, token)
  }
}
export function asBasePrefixedNumberToken(token: Token | undefined): BasePrefixedNumberToken {
  assertBasePrefixedNumberToken(token)
  return token
}

export function isLParenToken(token: Token | undefined): token is LParenToken {
  return token?.[0] === 'LParen'
}
export function assertLParenToken(token: Token | undefined): asserts token is LParenToken {
  if (!isLParenToken(token)) {
    throwUnexpectedToken('LParen', undefined, token)
  }
}
export function asLParenToken(token: Token | undefined): LParenToken {
  assertLParenToken(token)
  return token
}

export function isRParenToken(token: Token | undefined): token is RParenToken {
  return token?.[0] === 'RParen'
}
export function assertRParenToken(token: Token | undefined): asserts token is RParenToken {
  if (!isRParenToken(token)) {
    throwUnexpectedToken('RParen', undefined, token)
  }
}
export function asRParenToken(token: Token | undefined): RParenToken {
  assertRParenToken(token)
  return token
}

export function isLBracketToken(token: Token | undefined): token is LBracketToken {
  return token?.[0] === 'LBracket'
}
export function assertLBracketToken(token: Token | undefined): asserts token is LBracketToken {
  if (!isLBracketToken(token)) {
    throwUnexpectedToken('LBracket', undefined, token)
  }
}
export function asLBracketToken(token: Token | undefined): LBracketToken {
  assertLBracketToken(token)
  return token
}

export function isRBracketToken(token: Token | undefined): token is RBracketToken {
  return token?.[0] === 'RBracket'
}
export function assertRBracketToken(token: Token | undefined): asserts token is RBracketToken {
  if (!isRBracketToken(token)) {
    throwUnexpectedToken('RBracket', undefined, token)
  }
}
export function asRBracketToken(token: Token | undefined): RBracketToken {
  assertRBracketToken(token)
  return token
}

export function isLBraceToken(token: Token | undefined): token is LBraceToken {
  return token?.[0] === 'LBrace'
}
export function assertLBraceToken(token: Token | undefined): asserts token is LBraceToken {
  if (!isLBraceToken(token)) {
    throwUnexpectedToken('LBrace', undefined, token)
  }
}
export function asLBraceToken(token: Token | undefined): LBraceToken {
  assertLBraceToken(token)
  return token
}

export function isRBraceToken(token: Token | undefined): token is RBraceToken {
  return token?.[0] === 'RBrace'
}
export function assertRBraceToken(token: Token | undefined): asserts token is RBraceToken {
  if (!isRBraceToken(token)) {
    throwUnexpectedToken('RBrace', undefined, token)
  }
}
export function asRBraceToken(token: Token | undefined): RBraceToken {
  assertRBraceToken(token)
  return token
}

export function isStringToken(token: Token | undefined): token is StringToken {
  return token?.[0] === 'string'
}
export function assertStringToken(token: Token | undefined): asserts token is StringToken {
  if (!isStringToken(token)) {
    throwUnexpectedToken('string', undefined, token)
  }
}
export function asStringToken(token: Token | undefined): StringToken {
  assertStringToken(token)
  return token
}

export function isRegexpShorthandToken(token: Token | undefined): token is RegexpShorthandToken {
  return token?.[0] === 'RegexpShorthand'
}
export function assertRegexpShorthandToken(token: Token | undefined): asserts token is RegexpShorthandToken {
  if (!isRegexpShorthandToken(token)) {
    throwUnexpectedToken('RegexpShorthand', undefined, token)
  }
}
export function asRegexpShorthandToken(token: Token | undefined): RegexpShorthandToken {
  assertRegexpShorthandToken(token)
  return token
}

export function isA_BinaryOperatorToken(token: Token | undefined): token is OperatorToken<SymbolicBinaryOperator> {
  return token?.[0] === 'Operator' && isBinaryOperator(token[1])
}
export function assertA_BinaryOperatorToken(token: Token | undefined): asserts token is OperatorToken<SymbolicBinaryOperator> {
  if (!isA_BinaryOperatorToken(token)) {
    throwUnexpectedToken('Operator', undefined, token)
  }
}
export function asA_BinaryOperatorToken(token: Token | undefined): OperatorToken<SymbolicBinaryOperator> {
  assertA_BinaryOperatorToken(token)
  return token
}

export function isTemplateStringToken(token: Token | undefined): token is TemplateStringToken {
  return token?.[0] === 'TemplateString'
}
export function assertTemplateStringToken(token: Token | undefined): asserts token is TemplateStringToken {
  if (!isTemplateStringToken(token)) {
    throwUnexpectedToken('TemplateString', undefined, token)
  }
}
export function asTemplateStringToken(token: Token | undefined): TemplateStringToken {
  assertTemplateStringToken(token)
  return token
}

export function isMacroQualifiedToken(token: Token | undefined): token is MacroQualifiedToken {
  return token?.[0] === 'MacroQualified'
}

export function isMacroPrefixToken(token: Token | undefined): token is MacroPrefixToken {
  return token?.[0] === 'MacroPrefix'
}

/** Convert lightweight token debug info to SourceCodeInfo for error reporting. */
export function debugInfoToSourceCodeInfo(debugInfo: TokenDebugInfo | undefined, source?: string, filePath?: string): SourceCodeInfo | undefined {
  if (!debugInfo) return undefined
  const [line, column] = debugInfo
  const code = source ? (source.split('\n')[line] ?? '') : ''
  return {
    position: { line: line + 1, column: column + 1 },
    code,
    filePath,
  }
}

/** Extract TokenDebugInfo from SourceCodeInfo (inverse of debugInfoToSourceCodeInfo). */
export function sourceCodeInfoToDebugInfo(sci: SourceCodeInfo | undefined): TokenDebugInfo | undefined {
  if (!sci) return undefined
  return [sci.position.line - 1, sci.position.column - 1]
}

function throwUnexpectedToken(expected: TokenType, expectedValue: string | undefined, actual: Token | undefined): never {
  const actualOutput = actual ? `${actual[0]} '${actual[1]}'` : 'end of input'
  // Minimal location info from token debug info (no source text available here)
  const sourceCodeInfo = actual?.[2] ? debugInfoToSourceCodeInfo(actual[2]) : undefined
  throw new TokenizerError(`Unexpected token: ${actualOutput}, expected ${expected}${expectedValue ? ` '${expectedValue}'` : ''}`, sourceCodeInfo)
}
