// Static Dvala syntax-highlighter — renders source as styled HTML for
// non-editable contexts (book chapters, feature cards, example pages, doc
// modals). The interactive editor uses Monaco; this is a no-runtime fallback
// for places that just need to display code.

import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { standardEffectNames } from '../../src/evaluator/standardEffects'
import { splitSegments } from '../../src/parser/subParsers/parseTemplateString'
import type { Token } from '../../src/tokenizer/token'
import { tokenizeSource } from '../../src/tooling'
import { playgroundEffectReference } from './playgroundEffects'

const normalExpressionSet = new Set(normalExpressionKeys)
const specialExpressionSet = new Set(specialExpressionKeys)
const playgroundEffectNames = new Set(Object.values(playgroundEffectReference).map(r => r.title))
// Internal effects handled by the engine but not in the standardEffects registry.
const internalEffectNames = new Set(['dvala.error', 'dvala.macro.expand'])
const effectConstructs = new Set(['perform', 'effectName', 'qualifiedName', 'qualifiedMatcher'])

const colors = {
  keyword: 'var(--syntax-keyword)',
  builtin: 'var(--syntax-builtin)',
  symbol: 'var(--syntax-symbol)',
  number: 'var(--syntax-number)',
  string: 'var(--syntax-string)',
  punctuation: 'var(--syntax-punctuation)',
  comment: 'var(--syntax-comment)',
  error: 'var(--syntax-error)',
  effect: 'var(--syntax-effect)',
  effectConstruct: 'var(--syntax-effect-construct)',
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getEffectNameStyle(name: string): string {
  if (playgroundEffectNames.has(name)) return 'font-style:italic;'
  if (!standardEffectNames.has(name) && !internalEffectNames.has(name)) return 'text-decoration:underline;'
  return 'font-weight:bold;'
}

function getTokenColor(token: Token): string | null {
  const tokenType = token[0]
  switch (tokenType) {
    case 'string':
    case 'TemplateString':
    case 'RegexpShorthand':
      return colors.string
    case 'EffectName':
      return colors.effect
    case 'Atom':
      return colors.number
    case 'MacroPrefix':
      return colors.keyword
    case 'Symbol': {
      if (effectConstructs.has(token[1])) return colors.effectConstruct
      return specialExpressionSet.has(token[1])
        ? colors.keyword
        : normalExpressionSet.has(token[1])
          ? colors.builtin
          : colors.symbol
    }
    case 'BasePrefixedNumber':
    case 'Number':
      return colors.number
    case 'Shebang':
    case 'SingleLineComment':
    case 'MultiLineComment':
      return colors.comment
    case 'ReservedSymbol':
      return colors.keyword
    case 'Operator':
      return colors.punctuation
    case 'LBrace':
    case 'RBrace':
    case 'LBracket':
    case 'RBracket':
    case 'LParen':
    case 'RParen':
      return colors.punctuation
    case 'Error':
      return colors.error
    case 'Whitespace':
      return null
    default:
      return null
  }
}

function isCommentToken(token: Token): boolean {
  return token[0] === 'SingleLineComment' || token[0] === 'MultiLineComment' || token[0] === 'Shebang'
}

function renderTemplateStringToken(rawValue: string): string {
  const content = rawValue.slice(1, -1) // strip surrounding backticks
  const segments = splitSegments(content)
  const backtick = `<span style="color:${colors.string}">\`</span>`
  let result = backtick
  for (const seg of segments) {
    if (seg.type === 'literal') {
      result += `<span style="color:${colors.string}">${escapeHtml(seg.value)}</span>`
    } else if (seg.type === 'deferred') {
      const dollars = '$'.repeat(seg.dollarCount)
      result += `<span style="color:${colors.string}">${dollars}{${escapeHtml(seg.value)}}</span>`
    } else {
      result += `<span style="color:${colors.punctuation}">\${</span>`
      result += tokenizeToHtml(seg.value)
      result += `<span style="color:${colors.punctuation}">}</span>`
    }
  }
  return result + backtick
}

export function tokenizeToHtml(code: string): string {
  try {
    const tokens = tokenizeSource(code).tokens
    return tokens
      .map(token => {
        if (token[0] === 'TemplateString') return renderTemplateStringToken(token[1])
        // QuoteSplice tokens ($^{, $^^{, etc.) are rendered as punctuation
        if (token[0] === 'QuoteSplice')
          return `<span style="color:${colors.punctuation}">${escapeHtml(token[1])}</span>`
        const prefix =
          token[0] === 'Atom' ? ':' : token[0] === 'EffectName' ? '@' : token[0] === 'MacroPrefix' ? '#' : ''
        const escaped = escapeHtml(token[1])
        const color = getTokenColor(token)
        if (!color) return prefix + escaped
        const extraStyle = isCommentToken(token)
          ? 'font-style:italic;'
          : token[0] === 'EffectName'
            ? getEffectNameStyle(token[1])
            : ''
        return `<span style="color:${color};${extraStyle}">${prefix}${escaped}</span>`
      })
      .join('')
  } catch {
    return escapeHtml(code)
  }
}
