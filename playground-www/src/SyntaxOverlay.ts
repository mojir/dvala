import { Dvala } from '../../src/Dvala/Dvala'
import { allBuiltinModules } from '../../src/allModules'
import type { Token } from '../../src/tokenizer/token'
import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { standardEffectNames } from '../../src/evaluator/standardEffects'

const dvala = new Dvala({ debug: false, modules: allBuiltinModules })
const normalExpressionSet = new Set(normalExpressionKeys)
const specialExpressionSet = new Set(specialExpressionKeys)

const colors = {
  BrightYellow: '#f0e68c',
  Beige: '#dcdcaa',
  Mint: '#4ec9b0',
  Viola: '#c586c0',
  Pink: '#cc8f77',
  Gray300: 'rgb(212 212 212)',
  Gray500: 'rgb(115 115 115)',
  Crimson: '#dc143c',
  Blue: '#569cd6',
  SkyLavender: '#c5cbe3',
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isEffectName(tokens: Token[], index: number): boolean {
  let i = index - 1
  while (i >= 0 && tokens[i]![0] === 'Whitespace') i--
  if (i < 0 || tokens[i]![0] !== 'LParen')
    return false
  i--
  while (i >= 0 && tokens[i]![0] === 'Whitespace') i--
  if (i < 0 || tokens[i]![0] !== 'Symbol' || tokens[i]![1] !== 'effect')
    return false
  let j = index + 1
  while (j < tokens.length && tokens[j]![0] === 'Whitespace') j++
  if (j >= tokens.length || tokens[j]![0] !== 'RParen')
    return false
  return true
}

function getTokenColor(token: Token, tokens: Token[], index: number): string | null {
  const tokenType = token[0]
  switch (tokenType) {
    case 'string':
    case 'DocString':
    case 'RegexpShorthand':
      return colors.Pink
    case 'Symbol':
      if (isEffectName(tokens, index)) {
        return standardEffectNames.has(token[1])
          ? colors.Blue
          : colors.SkyLavender
      }
      return specialExpressionSet.has(token[1])
        ? colors.BrightYellow
        : normalExpressionSet.has(token[1])
          ? colors.Beige
          : colors.Mint
    case 'BasePrefixedNumber':
    case 'Number':
      return colors.Viola
    case 'Shebang':
    case 'SingleLineComment':
    case 'MultiLineComment':
      return colors.Gray500
    case 'ReservedSymbol':
      return colors.BrightYellow
    case 'Operator':
    case 'LBrace':
    case 'RBrace':
    case 'LBracket':
    case 'RBracket':
    case 'LParen':
    case 'RParen':
      return colors.Gray300
    case 'Error':
      return colors.Crimson
    case 'Whitespace':
      return null
    default:
      return null
  }
}

function isCommentToken(token: Token): boolean {
  return token[0] === 'SingleLineComment' || token[0] === 'MultiLineComment' || token[0] === 'Shebang'
}

function tokenizeToHtml(code: string): string {
  try {
    const tokens = dvala.tokenize(code).tokens
    return tokens.map((token, index) => {
      const escaped = escapeHtml(token[1])
      const color = getTokenColor(token, tokens, index)
      if (!color)
        return escaped
      const italic = isCommentToken(token) ? 'font-style:italic;' : ''
      return `<span style="color:${color};${italic}">${escaped}</span>`
    }).join('')
  }
  catch {
    return escapeHtml(code)
  }
}

export class SyntaxOverlay {
  private textarea: HTMLTextAreaElement
  private highlight: HTMLPreElement
  private container: HTMLDivElement
  private lastCode = ''

  constructor(textareaId: string) {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement
    if (!textarea)
      throw new Error(`Element #${textareaId} not found`)

    this.container = document.createElement('div')
    this.container.className = 'syntax-overlay-container'
    this.container.style.height = textarea.style.height || 'calc(100% - 32px)'

    this.highlight = document.createElement('pre')

    textarea.parentNode!.insertBefore(this.container, textarea)
    this.container.appendChild(this.highlight)
    this.container.appendChild(textarea)

    textarea.style.lineHeight = 'normal'
    textarea.style.tabSize = '2'

    this.textarea = textarea

    textarea.addEventListener('scroll', () => this.syncScroll())

    this.update()
  }

  update(): void {
    const code = this.textarea.value
    if (code === this.lastCode)
      return
    this.lastCode = code

    this.highlight.innerHTML = `${tokenizeToHtml(code)}\n`
    this.syncScroll()
  }

  syncScroll(): void {
    this.highlight.scrollTop = this.textarea.scrollTop
    this.highlight.scrollLeft = this.textarea.scrollLeft
  }
}
