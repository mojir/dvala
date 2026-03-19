import type { Token } from '../../src/tokenizer/token'
import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { standardEffectNames } from '../../src/evaluator/standardEffects'
import { playgroundEffectReference } from './playgroundEffects'
import { splitSegments } from '../../src/parser/subParsers/parseTemplateString'
import { tokenizeSource } from '../../src/tooling'

const normalExpressionSet = new Set(normalExpressionKeys)
const specialExpressionSet = new Set(specialExpressionKeys)
const playgroundEffectNames = new Set(Object.values(playgroundEffectReference).map(r => r.title))

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
  Teal: 'var(--syntax-effect-playground)',
  SkyLavender: 'var(--syntax-effect-custom)',
  EffectConstruct: 'var(--syntax-effect-construct)',
}

const effectConstructs = new Set(['effect', 'perform', 'effect-matcher', 'effect-name'])

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * If the token at `index` is part of a dotted name inside `effect(...)`,
 * return the effect color. Otherwise return null.
 * Handles: @dvala.io.println — tokens: effect ( dvala . io . println )
 */
function getEffectColor(tokens: Token[], index: number): string | null {
  const token = tokens[index]!
  // Only Symbol and Operator '.' can be part of an effect name
  if (token[0] !== 'Symbol' && !(token[0] === 'Operator' && token[1] === '.'))
    return null

  // Walk backward past Symbol/dot pairs to find the start of the dotted name
  let start = index
  while (start > 0) {
    const prev = tokens[start - 1]!
    if (prev[0] === 'Operator' && prev[1] === '.') {
      if (start >= 2 && tokens[start - 2]![0] === 'Symbol') {
        start -= 2
      } else break
    } else if (prev[0] === 'Symbol' && start < tokens.length - 1) {
      const next = tokens[start]!
      if (next[0] === 'Operator' && next[1] === '.') {
        start--
      } else break
    } else break
  }

  // Walk forward past Symbol/dot pairs to find the end
  let end = index
  while (end < tokens.length - 1) {
    const next = tokens[end + 1]!
    if (next[0] === 'Operator' && next[1] === '.') {
      if (end + 2 < tokens.length && tokens[end + 2]![0] === 'Symbol') {
        end += 2
      } else break
    } else if (next[0] === 'Symbol' && end > 0) {
      const prev = tokens[end]!
      if (prev[0] === 'Operator' && prev[1] === '.') {
        end++
      } else break
    } else break
  }

  // Check that we're preceded by effect( and followed by )
  let before = start - 1
  while (before >= 0 && tokens[before]![0] === 'Whitespace') before--
  if (before < 0 || tokens[before]![0] !== 'LParen') return null
  before--
  while (before >= 0 && tokens[before]![0] === 'Whitespace') before--
  if (before < 0 || tokens[before]![0] !== 'Symbol' || tokens[before]![1] !== 'effect') return null

  let after = end + 1
  while (after < tokens.length && tokens[after]![0] === 'Whitespace') after++
  if (after >= tokens.length || tokens[after]![0] !== 'RParen') return null

  // Build the full dotted name
  const fullName = tokens.slice(start, end + 1).map(t => t[1]).join('')

  if (standardEffectNames.has(fullName)) return colors.Blue
  if (playgroundEffectNames.has(fullName)) return colors.Teal
  return colors.SkyLavender
}

function getTokenColor(token: Token, tokens: Token[], index: number): string | null {
  const tokenType = token[0]
  switch (tokenType) {
    case 'string':
    case 'TemplateString':
    case 'RegexpShorthand':
      return colors.Pink
    case 'Symbol': {
      const effectColor = getEffectColor(tokens, index)
      if (effectColor) return effectColor
      if (effectConstructs.has(token[1])) return colors.EffectConstruct
      return specialExpressionSet.has(token[1])
        ? colors.BrightYellow
        : normalExpressionSet.has(token[1])
          ? colors.Beige
          : colors.Mint
    }
    case 'BasePrefixedNumber':
    case 'Number':
      return colors.Viola
    case 'Shebang':
    case 'SingleLineComment':
    case 'MultiLineComment':
      return colors.Gray500
    case 'ReservedSymbol':
      return colors.BrightYellow
    case 'Operator': {
      if (token[1] === '.') {
        const effectColor = getEffectColor(tokens, index)
        if (effectColor) return effectColor
      }
      return colors.Gray300
    }
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

    // Reset textarea size so the grid cell can shrink when content gets smaller
    this.textarea.style.height = ''
    this.textarea.style.width = ''

    this.highlight.innerHTML = `${tokenizeToHtml(code)}\n`
    this.updateLineNumbers(code)
    this.syncSize()
  }
}
