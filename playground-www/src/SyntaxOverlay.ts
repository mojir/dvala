import type { Token } from '../../src/tokenizer/token'
import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { standardEffectNames } from '../../src/evaluator/standardEffects'
import { splitSegments } from '../../src/parser/subParsers/parseTemplateString'
import { tokenizeSource } from '../../src/tooling'

const normalExpressionSet = new Set(normalExpressionKeys)
const specialExpressionSet = new Set(specialExpressionKeys)

const colors = {
  BrightYellow: 'var(--syntax-keyword)',
  Beige: 'var(--syntax-builtin)',
  Mint: 'var(--syntax-symbol)',
  Viola: 'var(--syntax-number)',
  Pink: 'var(--syntax-string)',
  Gray300: 'var(--syntax-punctuation)',
  Gray500: 'var(--syntax-comment-dim)',
  Crimson: 'var(--syntax-error)',
  Blue: 'var(--syntax-effect)',
  SkyLavender: 'var(--syntax-effect-custom)',
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
    case 'TemplateString':
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

function renderTemplateStringToken(rawValue: string): string {
  const content = rawValue.slice(1, -1) // strip surrounding backticks
  const segments = splitSegments(content)
  const backtick = `<span style="color:${colors.Pink}">\`</span>`
  let result = backtick
  for (const seg of segments) {
    if (seg.type === 'literal') {
      result += `<span style="color:${colors.Pink}">${escapeHtml(seg.value)}</span>`
    } else {
      result += `<span style="color:${colors.Gray300}">\${</span>`
      result += tokenizeToHtml(seg.value)
      result += `<span style="color:${colors.Gray300}">}</span>`
    }
  }
  return result + backtick
}

export function tokenizeToHtml(code: string): string {
  try {
    const tokens = tokenizeSource(code).tokens
    return tokens.map((token, index) => {
      if (token[0] === 'TemplateString')
        return renderTemplateStringToken(token[1])
      const escaped = escapeHtml(token[1])
      const color = getTokenColor(token, tokens, index)
      if (!color)
        return escaped
      const italic = isCommentToken(token) ? 'font-style:italic;' : ''
      return `<span style="color:${color};${italic}">${escaped}</span>`
    }).join('')
  } catch {
    return escapeHtml(code)
  }
}

export class SyntaxOverlay {
  private textarea: HTMLTextAreaElement
  private highlight: HTMLPreElement
  private lineNumbers: HTMLDivElement
  readonly scrollContainer: HTMLDivElement
  private lastCode: string | null = null
  private lastLineCount = 0

  constructor(textareaId: string) {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement
    if (!textarea)
      throw new Error(`Element #${textareaId} not found`)

    this.scrollContainer = document.createElement('div')
    this.scrollContainer.className = 'syntax-overlay-container fancy-scroll'
    this.scrollContainer.style.height = textarea.style.height || 'calc(100% - 32px)'

    this.lineNumbers = document.createElement('div')
    this.lineNumbers.className = 'syntax-overlay-line-numbers'

    this.highlight = document.createElement('pre')

    textarea.parentNode!.insertBefore(this.scrollContainer, textarea)
    this.scrollContainer.appendChild(this.lineNumbers)
    this.scrollContainer.appendChild(this.highlight)
    this.scrollContainer.appendChild(textarea)

    textarea.style.height = ''

    this.textarea = textarea

    // Keep textarea sized to match the pre content area
    const resizeObserver = new ResizeObserver(() => this.syncSize())
    resizeObserver.observe(this.highlight)

    this.update()
  }

  private syncSize(): void {
    const style = getComputedStyle(this.highlight)
    this.textarea.style.width = style.width
    this.textarea.style.height = style.height
  }

  private updateLineNumbers(code: string): void {
    const lineCount = code === '' ? 1 : code.split('\n').length
    if (lineCount === this.lastLineCount)
      return
    this.lastLineCount = lineCount
    const digits = Math.max(2, String(lineCount).length)
    const lines: string[] = []
    for (let i = 1; i <= lineCount; i++)
      lines.push(String(i).padStart(digits))
    this.lineNumbers.textContent = lines.join('\n')
  }

  update(): void {
    const code = this.textarea.value
    if (code === this.lastCode)
      return
    this.lastCode = code

    this.highlight.innerHTML = `${tokenizeToHtml(code)}\n`
    this.updateLineNumbers(code)
    this.syncSize()
  }
}
