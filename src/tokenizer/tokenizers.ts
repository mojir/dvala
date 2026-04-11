import { isSymbolicOperator } from './operators'
import type { AtomToken, BasePrefixedNumberToken, EffectNameToken, ErrorToken, LBraceToken, LBracketToken, LParenToken, MacroPrefixToken, MacroQualifiedToken, MultiLineCommentToken, NumberToken, OperatorToken, QuoteSpliceToken, RBraceToken, RBracketToken, RParenToken, RegexpShorthandToken, ReservedSymbolToken, ShebangToken, SingleLineCommentToken, StringToken, SymbolToken, TemplateStringToken, Token, TokenDescriptor, WhitespaceToken } from './token'
import type { ReservedSymbol } from './reservedNames'
import { reservedSymbolRecord } from './reservedNames'

type Tokenizer<T extends Token> = (input: string, position: number, prevToken?: Token) => TokenDescriptor<T | ErrorToken>

const jsIdentifierFirstCharRegExp = /[a-zA-Z_$]/
const jsIdentifierCharRegExp = /[a-zA-Z0-9_$]/
const whitespaceRegExp = /\s/

export const NO_MATCH: TokenDescriptor<never> = [0]

const tokenizeLParen: Tokenizer<LParenToken> = (input, position) =>
  tokenizeToken('LParen', '(', input, position)
const tokenizeRParen: Tokenizer<RParenToken> = (input, position) =>
  tokenizeToken('RParen', ')', input, position)
const tokenizeLBracket: Tokenizer<LBracketToken> = (input, position) =>
  tokenizeToken('LBracket', '[', input, position)
const tokenizeRBracket: Tokenizer<RBracketToken> = (input, position) =>
  tokenizeToken('RBracket', ']', input, position)
const tokenizeLBrace: Tokenizer<LBraceToken> = (input, position) =>
  tokenizeToken('LBrace', '{', input, position)
const tokenizeRBrace: Tokenizer<RBraceToken> = (input, position) =>
  tokenizeToken('RBrace', '}', input, position)

const tokenizeString: Tokenizer<StringToken> = (input, position) => {
  if (input[position] !== '"')
    return NO_MATCH

  let value = '"'
  let length = 1
  let char = input[position + length]
  let escaping = false
  while (char && (char !== '"' || escaping)) {
    length += 1
    if (escaping) {
      escaping = false
      value += char
    } else {
      if (char === '\\') {
        escaping = true
      }
      value += char
    }
    char = input[position + length]
  }
  if (!char) {
    return [length, ['Error', value, undefined, `Unclosed string at position ${position}`]]
  }
  value += '"' // closing quote
  return [length + 1, ['string', value]]
}

const tokenizeRegexpShorthand: Tokenizer<RegexpShorthandToken> = (input, position) => {
  if (input[position] !== '#')
    return NO_MATCH

  const [stringLength, token] = tokenizeString(input, position + 1)
  if (!token)
    return NO_MATCH

  if (token[0] === 'Error') {
    const errorToken: ErrorToken = ['Error', `#${token[1]}`, undefined, `Unclosed regexp at position ${position}`]
    return [stringLength + 1, errorToken]
  }

  position += stringLength + 1
  let length = stringLength + 1

  let options = ''
  while (input[position] === 'g' || input[position] === 'i') {
    options += input[position]!
    length += 1
    position += 1
    if (options.includes(input[position]!)) {
      return [length, ['Error', `#${token[1]}${options}`, undefined, `Duplicated regexp option "${input[position]}"`]]
    }
  }

  return [length, ['RegexpShorthand', `#${token[1]}${options}`]]
}

// Tokenize `#name` prefix macro call syntax. Value is the name without `#`.
// Must run after tokenizeRegexpShorthand (#"...") and tokenizeShebang (#!) to avoid conflicts.
const tokenizeMacroPrefix: Tokenizer<MacroPrefixToken> = (input, position) => {
  if (input[position] !== '#') return NO_MATCH
  const nextChar = input[position + 1]
  if (!nextChar || !jsIdentifierFirstCharRegExp.test(nextChar)) return NO_MATCH

  let i = position + 2
  while (i < input.length && jsIdentifierCharRegExp.test(input[i]!)) i++
  const name = input.slice(position + 1, i)
  return [i - position, ['MacroPrefix', name]]
}

// Tokenize atom literal: :name where name starts with a letter and contains letters/digits.
// Only matches when ':' is NOT immediately preceded by an identifier character — this prevents
// `{x:x}` (object key-value colon) from being parsed as `x` followed by atom `:x`.
// `match :ok` works because there's whitespace between `match` and `:ok`.
const tokenizeAtom: Tokenizer<AtomToken> = (input, position) => {
  if (input[position] !== ':') return NO_MATCH

  // If the character immediately before ':' is an identifier character, treat ':' as
  // a key-value separator (e.g. `{x:y}`), not the start of an atom.
  if (position > 0 && jsIdentifierCharRegExp.test(input[position - 1]!)) return NO_MATCH

  const nextChar = input[position + 1]
  if (!nextChar || !jsIdentifierFirstCharRegExp.test(nextChar)) return NO_MATCH

  let i = position + 2
  while (i < input.length && jsIdentifierCharRegExp.test(input[i]!)) i++

  // Atom name is the part after ':'
  const name = input.slice(position + 1, i)
  return [i - position, ['Atom', name]]
}

function tokenizeToken<T extends Token>(
  type: T[0],
  value: string,
  input: string,
  position: number,
): TokenDescriptor<T> {
  if (value === input.slice(position, position + value.length))
    return [value.length, [type, value] as T]
  else
    return NO_MATCH
}

const tokenizeWhitespace: Tokenizer<WhitespaceToken> = (input, position) => {
  let char = input[position]
  if (!char || !whitespaceRegExp.test(char)) {
    return NO_MATCH
  }
  let value = char
  position += 1
  char = input[position]
  while (char && whitespaceRegExp.test(char)) {
    value += char
    position += 1
    char = input[position]
  }
  return [value.length, ['Whitespace', value]]
}

const decimalNumberRegExp = /\d/
const octalNumberRegExp = /[0-7]/
const hexNumberRegExp = /[0-9a-f]/i
const binaryNumberRegExp = /[01]/
const postNumberRegExp = /[\s)\]}(,;+\-*/%^<>=!&|.?~:#]/

export const tokenizeNumber: Tokenizer<NumberToken> = (input, position, prevToken) => {
  let i: number
  const negate = input[position] === '-'
  const plusPrefix = input[position] === '+'
  // Only allow -/+ prefix when NOT after an expression (number, symbol, closing bracket)
  if ((negate || plusPrefix) && prevToken) {
    const prevType = prevToken[0]
    if (prevType === 'Number' || prevType === 'BasePrefixedNumber' || prevType === 'Symbol' || prevType === 'Atom'
      || prevType === 'ReservedSymbol' || prevType === 'RParen' || prevType === 'RBracket' || prevType === 'RBrace') {
      return NO_MATCH
    }
  }
  const start = negate || plusPrefix ? position + 1 : position
  let hasDecimalPoint = false
  let hasExponent = false
  for (i = start; i < input.length; i += 1) {
    const char = input[i] as string

    if (char === '_') {
      if (!decimalNumberRegExp.test(input[i - 1]!) || !decimalNumberRegExp.test(input[i + 1]!)) {
        if (i === start) {
          return NO_MATCH
        }
        return [i - position + 1, ['Error', input.substring(position, i + 1), undefined, `Invalid number format at position ${i + 1}`]]
      }
    } else if (char === '.') {
      if (i === start) {
        return NO_MATCH
      }
      if (hasDecimalPoint || hasExponent) {
        return [i - position + 1, ['Error', input.substring(position, i + 1), undefined, `Invalid number format at position ${i + 1}`]]
      }
      hasDecimalPoint = true
    } else if (char === 'e' || char === 'E') {
      if (i === start) {
        return NO_MATCH
      }

      if (hasExponent) {
        return [i - position + 1, ['Error', input.substring(position, i + 1), undefined, `Invalid number format at position ${i + 1}`]]
      }

      if (input[i - 1] === '.' || input[i - 1] === '+' || input[i - 1] === '-') {
        return [i - position + 1, ['Error', input.substring(position, i + 1), undefined, `Invalid number format at position ${i + 1}`]]
      }

      if (input[i + 1] === '+' || input[i + 1] === '-') {
        i += 1
      }

      hasExponent = true
    } else if (!decimalNumberRegExp.test(char)) {
      break
    }
  }

  if ((negate || plusPrefix) && i === start) {
    return NO_MATCH
  }

  const length = i - position
  if (length === 0) {
    return NO_MATCH
  }

  const nextChar = input[i]
  if (nextChar && nextChar !== ':' && !postNumberRegExp.test(nextChar)) {
    return [i - position + 1, ['Error', input.substring(position, i + 1), undefined, `Invalid number format at position ${i + 1}`]]
  }

  return [length, ['Number', input.substring(position, i)]]
}

export const tokenizeBasePrefixedNumber: Tokenizer<BasePrefixedNumberToken> = (input, position) => {
  if (input[position] !== '0') {
    return NO_MATCH
  }

  const baseChar = input[position + 1]

  const type = baseChar === 'b' || baseChar === 'B'
    ? 'binary'
    : baseChar === 'o' || baseChar === 'O'
      ? 'octal'
      : baseChar === 'x' || baseChar === 'X'
        ? 'hex'
        : null

  if (type === null) {
    return NO_MATCH
  }

  let i: number
  for (i = position + 2; i < input.length; i += 1) {
    const char = input[i] as string
    if (type === 'binary' && !binaryNumberRegExp.test(char)) {
      break
    }
    if (type === 'octal' && !octalNumberRegExp.test(char)) {
      break
    }
    if (type === 'hex' && !hexNumberRegExp.test(char)) {
      break
    }
  }

  const length = i - position
  if (length <= 2) {
    return NO_MATCH
  }

  const nextChar = input[i]
  if (nextChar && !postNumberRegExp.test(nextChar)) {
    return NO_MATCH
  }

  return [length, ['BasePrefixedNumber', input.substring(position, i)]]
}

/**
 * Tokenize effect name literal: @segment.segment.segment
 * Each segment follows symbol naming rules. Dots separate segments.
 * The token value is the name without the @ prefix.
 */
export const tokenizeEffectName: Tokenizer<EffectNameToken> = (input, position) => {
  if (input[position] !== '@') return NO_MATCH

  let i = position + 1

  // Parse first segment (JS identifier rules, plus * for wildcards)
  const firstChar = input[i]
  if (!firstChar || (!jsIdentifierFirstCharRegExp.test(firstChar) && firstChar !== '*')) return NO_MATCH

  let name = ''
  while (i < input.length && (jsIdentifierCharRegExp.test(input[i]!) || input[i] === '*')) {
    name += input[i]
    i++
  }

  // Parse optional .segment pairs
  while (i < input.length && input[i] === '.') {
    const dotPos = i
    i++ // skip dot
    if (i >= input.length || (!jsIdentifierFirstCharRegExp.test(input[i]!) && input[i] !== '*')) {
      i = dotPos
      break
    }
    const segStart = i
    while (i < input.length && (jsIdentifierCharRegExp.test(input[i]!) || input[i] === '*')) {
      i++
    }
    name += `.${input.slice(segStart, i)}`
  }

  return [i - position, ['EffectName', name]]
}

export const tokenizeSymbol: Tokenizer<SymbolToken> = (input, position) => {
  let value = input[position]!

  if (value === '\'') {
    let length = 1
    let char = input[position + length]
    let escaping = false
    while (char !== '\'' || escaping) {
      if (char === undefined)
        return [length, ['Error', value, undefined, `Unclosed quoted symbol at position ${position}`]]

      length += 1
      if (escaping) {
        escaping = false
        value += char
      } else {
        if (char === '\\') {
          escaping = true
        }
        value += char
      }
      char = input[position + length]
    }
    value += '\'' // closing quote
    return [length + 1, ['Symbol', value]]
  }

  if (jsIdentifierFirstCharRegExp.test(value)) {
    const initialPosition = position
    position += 1
    let char = input[position]

    while (char && jsIdentifierCharRegExp.test(char)) {
      value += char
      position += 1
      char = input[position]
    }

    return [position - initialPosition, ['Symbol', value]]
  }

  return NO_MATCH
}

export const tokenizeReservedSymbolToken: Tokenizer<ReservedSymbolToken> = (input, position) => {
  const symbolMeta = tokenizeSymbol(input, position)
  if (symbolMeta[0] === 0 || !symbolMeta[1]) {
    return NO_MATCH
  }
  let symbolName = symbolMeta[1][1]
  symbolName = symbolName.startsWith('\'') ? symbolName.slice(1, symbolName.length - 1) : symbolName

  const info = reservedSymbolRecord[symbolName as ReservedSymbol]
  if (info === undefined) {
    return NO_MATCH
  }
  return [symbolMeta[0], ['ReservedSymbol', symbolName as ReservedSymbol]]
}

/**
 * Tokenize `macro@qualified.name` as a single compound token.
 * The `@` must immediately follow `macro` with no whitespace.
 * Value is the qualified name (without the `macro@` prefix).
 */
export const tokenizeMacroQualified: Tokenizer<MacroQualifiedToken> = (input, position) => {
  // Must start with 'macro' followed immediately by '@'
  if (input.slice(position, position + 6) !== 'macro@') return NO_MATCH
  // Char before 'macro' must not be an identifier char (word boundary)
  if (position > 0 && jsIdentifierCharRegExp.test(input[position - 1]!)) return NO_MATCH

  // Parse the effect name part starting at the '@'
  const effectResult = tokenizeEffectName(input, position + 5)
  if (effectResult[0] === 0 || !effectResult[1] || effectResult[1][0] === 'Error') {
    return NO_MATCH
  }
  const qualifiedName = effectResult[1][1]
  return [5 + effectResult[0], ['MacroQualified', qualifiedName]]
}

export const tokenizeOperator: Tokenizer<OperatorToken> = (input, position) => {
  const threeChars = input.slice(position, position + 3)
  if (position + 2 < input.length && isSymbolicOperator(threeChars)) {
    return [3, ['Operator', threeChars]]
  }

  const twoChars = input.slice(position, position + 2)
  if (position + 1 < input.length && isSymbolicOperator(twoChars)) {
    return [2, ['Operator', twoChars]]
  }

  const oneChar = input[position] ?? ''
  if (isSymbolicOperator(oneChar)) {
    return [1, ['Operator', oneChar]]
  }
  return NO_MATCH
}

export const tokenizeMultiLineComment: Tokenizer<MultiLineCommentToken> = (input, position) => {
  if (input[position] === '/' && input[position + 1] === '*') {
    let length = 2
    let value = '/*'
    while ((input[position + length] !== '*' || input[position + length + 1] !== '/') && position + length + 1 < input.length) {
      value += input[position + length]
      length += 1
    }
    if (position + length + 1 >= input.length) {
      return [length, ['Error', value, undefined, `Unclosed multi-line comment at position ${position}`]]
    }
    value += '*/'
    length += 2

    return [length, ['MultiLineComment', value]]
  }
  return NO_MATCH
}

export const tokenizeShebang: Tokenizer<ShebangToken> = (input, position) => {
  if (input[position] === '#' && input[position + 1] === '!') {
    let length = 2
    let value = '#!'
    while (input[position + length] !== '\n' && position + length < input.length) {
      value += input[position + length]
      length += 1
    }

    return [length, ['Shebang', value]]
  }
  return NO_MATCH
}

/**
 * Tokenize a quote splice marker: $^+{
 * Matches $ followed by one or more ^ followed by {.
 * The value includes the full marker (e.g. "$^{", "$^^{").
 * The opening { is consumed — the parser finds the matching } via RBrace tokens.
 */
export const tokenizeQuoteSplice: Tokenizer<QuoteSpliceToken> = (input, position) => {
  if (input[position] !== '$')
    return NO_MATCH

  let caretCount = 0
  while (input[position + 1 + caretCount] === '^') {
    caretCount++
  }
  if (caretCount === 0 || input[position + 1 + caretCount] !== '{')
    return NO_MATCH

  // Consumed: $ + N carets + {
  const length = 1 + caretCount + 1
  const value = input.slice(position, position + length)
  return [length, ['QuoteSplice', value]]
}

export const tokenizeTemplateString: Tokenizer<TemplateStringToken> = (input, position) => {
  if (input[position] !== '`')
    return NO_MATCH

  let value = '`'
  let length = 1

  while (position + length < input.length) {
    const char = input[position + length]!

    if (char === '`') {
      value += '`'
      length += 1
      return [length, ['TemplateString', value]]
    }

    if (char === '$' && input[position + length + 1] === '{') {
      value += '${'
      length += 2
      let braceDepth = 1

      while (position + length < input.length && braceDepth > 0) {
        const c = input[position + length]!

        if (c === '{') {
          braceDepth += 1
          value += c
          length += 1
        } else if (c === '}') {
          braceDepth -= 1
          value += c
          length += 1
        } else if (c === '"') {
          // String literal inside interpolation — scan to matching closing "
          value += c
          length += 1
          let escaping = false
          while (position + length < input.length) {
            const sc = input[position + length]!
            value += sc
            length += 1
            if (escaping) {
              escaping = false
            } else if (sc === '\\') {
              escaping = true
            } else if (sc === '"') {
              break
            }
          }
        } else if (c === '\'') {
          // Quoted symbol inside interpolation — scan to matching closing '
          value += c
          length += 1
          let escaping = false
          while (position + length < input.length) {
            const sc = input[position + length]!
            value += sc
            length += 1
            if (escaping) {
              escaping = false
            } else if (sc === '\\') {
              escaping = true
            } else if (sc === '\'') {
              break
            }
          }
        } else if (c === '`') {
          // Nested template string — delegate recursively
          const [nestedLength, nestedToken] = tokenizeTemplateString(input, position + length)
          if (nestedLength === 0 || !nestedToken) {
            return [length, ['Error', value, undefined, `Unclosed nested template string at position ${position + length}`]]
          }
          if (nestedToken[0] === 'Error') {
            return [length + nestedLength, ['Error', value + nestedToken[1], undefined, nestedToken[3]]]
          }
          value += nestedToken[1]
          length += nestedLength
        } else {
          value += c
          length += 1
        }
      }

      if (braceDepth > 0) {
        return [length, ['Error', value, undefined, `Unclosed interpolation in template string at position ${position}`]]
      }
    } else {
      value += char
      length += 1
    }
  }

  return [length, ['Error', value, undefined, `Unclosed template string at position ${position}`]]
}

export const tokenizeSingleLineComment: Tokenizer<SingleLineCommentToken> = (input, position) => {
  if (input[position] === '/' && input[position + 1] === '/') {
    let length = 2
    let value = '//'
    while (input[position + length] !== '\n' && position + length < input.length) {
      value += input[position + length]
      length += 1
    }

    return [length, ['SingleLineComment', value]]
  }
  return NO_MATCH
}

// All tokenizers, order matters!
export const tokenizers = [
  tokenizeWhitespace,
  tokenizeMultiLineComment,
  tokenizeSingleLineComment,
  tokenizeReservedSymbolToken,
  tokenizeLParen,
  tokenizeRParen,
  tokenizeLBracket,
  tokenizeRBracket,
  tokenizeLBrace,
  tokenizeRBrace,
  tokenizeString,
  tokenizeQuoteSplice,
  tokenizeTemplateString,
  tokenizeRegexpShorthand,
  tokenizeMacroPrefix,
  tokenizeAtom,
  tokenizeBasePrefixedNumber,
  tokenizeNumber,
  tokenizeOperator,
  tokenizeMacroQualified,
  tokenizeEffectName,
  tokenizeSymbol,
] as const satisfies Tokenizer<Token>[]
