import type { Token } from '../../src/tokenizer/token'
import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { standardEffectNames } from '../../src/evaluator/standardEffects'
import { playgroundEffectReference } from './playgroundEffects'
import { splitSegments } from '../../src/parser/subParsers/parseTemplateString'
import { tokenizeSource } from '../../src/tooling'

const normalExpressionSet = new Set(normalExpressionKeys)
const specialExpressionSet = new Set(specialExpressionKeys)
const playgroundEffectNames = new Set(Object.values(playgroundEffectReference).map(r => r.title))
// Internal effects handled by the engine but not in the standardEffects registry
const internalEffectNames = new Set(['dvala.error', 'dvala.macro.expand'])

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

const effectConstructs = new Set(['perform', 'effectMatcher', 'effectName'])

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
    case 'MacroQualified':
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

function renderCodeTemplateToken(rawValue: string): string {
  // Count opening backticks to find delimiter length
  let backtickCount = 0
  while (rawValue[backtickCount] === '`') {
    backtickCount++
  }
  const delimiter = '`'.repeat(backtickCount)
  const content = rawValue.slice(backtickCount, -backtickCount)
  const segments = splitSegments(content)

  // Render opening delimiter
  const delimSpan = `<span style="color:${colors.punctuation}">${delimiter}</span>`
  let result = delimSpan

  for (const seg of segments) {
    if (seg.type === 'literal') {
      // Tokenize and highlight inner Dvala code normally
      result += tokenizeToHtml(seg.value)
    } else if (seg.type === 'deferred') {
      // Deferred splice: $${expr} or $$${expr} — render all $ signs
      const dollars = '$'.repeat(seg.dollarCount)
      result += `<span style="color:${colors.punctuation}">${dollars}{</span>`
      result += tokenizeToHtml(seg.value)
      result += `<span style="color:${colors.punctuation}">}</span>`
    } else {
      // Splice interpolation: ${expr}
      result += `<span style="color:${colors.punctuation}">\${</span>`
      result += tokenizeToHtml(seg.value)
      result += `<span style="color:${colors.punctuation}">}</span>`
    }
  }

  // Render closing delimiter
  result += delimSpan

  // Wrap entire template in underline to visually distinguish from runtime code
  return `<span style="font-style:italic">${result}</span>`
}

export function tokenizeToHtml(code: string): string {
  try {
    const tokens = tokenizeSource(code).tokens
    return tokens.map(token => {
      if (token[0] === 'TemplateString')
        return renderTemplateStringToken(token[1])
      if (token[0] === 'CodeTemplate')
        return renderCodeTemplateToken(token[1])
      const prefix = token[0] === 'EffectName' ? '@' : token[0] === 'MacroQualified' ? 'macro@' : ''
      const escaped = escapeHtml(token[1])
      const color = getTokenColor(token)
      if (!color)
        return prefix + escaped
      const extraStyle = isCommentToken(token)
        ? 'font-style:italic;'
        : token[0] === 'EffectName'
          ? getEffectNameStyle(token[1])
          : ''
      return `<span style="color:${color};${extraStyle}">${prefix}${escaped}</span>`
    }).join('')
  } catch {
    return escapeHtml(code)
  }
}

export class SyntaxOverlay {
  private textarea: HTMLTextAreaElement
  private highlight: HTMLPreElement
  private selectionLayer: HTMLPreElement
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

    this.selectionLayer = document.createElement('pre')
    this.selectionLayer.className = 'syntax-overlay-selection'

    this.highlight = document.createElement('pre')
    this.highlight.className = 'syntax-overlay-highlight'

    textarea.parentNode!.insertBefore(this.scrollContainer, textarea)
    this.scrollContainer.appendChild(this.lineNumbers)
    this.scrollContainer.appendChild(this.selectionLayer)
    this.scrollContainer.appendChild(this.highlight)
    this.scrollContainer.appendChild(textarea)

    textarea.style.height = ''

    this.textarea = textarea
    textarea.addEventListener('mousedown', () => { this.selectionLayer.innerHTML = '' })
    textarea.addEventListener('keydown', () => { this.selectionLayer.innerHTML = '' })

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
    this.selectionLayer.innerHTML = ''
    this.updateLineNumbers(code)
    this.syncSize()
  }

  /** Render a selection background for a character range. */
  setSelection(start: number, end: number): void {
    const code = this.textarea.value
    if (start < 0 || end <= start || start >= code.length) {
      this.selectionLayer.innerHTML = ''
      return
    }
    const before = escapeHtml(code.slice(0, start))
    const selected = escapeHtml(code.slice(start, end))
    const after = escapeHtml(code.slice(end))
    this.selectionLayer.innerHTML = `${before}<span class="syntax-highlight-range">${selected}</span>${after}\n`
  }
}
