import { styles } from '../styles'
import type { TextFormatter } from '../../../common/createFormatter'
import { polishSymbolCharacterClass, polishSymbolFirstCharacterClass } from '../../../src/symbolPatterns'
import { Dvala } from '../../../src/Dvala/Dvala'
import { allBuiltinModules } from '../../../src/allModules'
import type { Token } from '../../../src/tokenizer/token'
import { normalExpressionKeys, specialExpressionKeys } from '../../../src/builtin'
import { standardEffectNames } from '../../../src/evaluator/standardEffects'
import { allReference, getLinkName } from '../../../reference'

export type FormatterRule = (text: string, index: number, formatter: TextFormatter) => {
  count: number
  formattedText: string
}

const variableRegExp = new RegExp(`^\\$${polishSymbolFirstCharacterClass}${polishSymbolCharacterClass}*`)

const noMatch = { count: 0, formattedText: '' }

export function createVariableRule(
  formatVariableName: TextFormatter,
  variableNamePredicate: (variableName: string) => boolean,
): FormatterRule {
  return (text, index) => {
    const startMatch = variableRegExp.exec(text.slice(index))
    if (startMatch) {
      const count = startMatch[0].length
      const variableName = startMatch[0].slice(1)
      if (!variableNamePredicate(variableName))
        return noMatch

      const formattedText = formatVariableName(variableName)
      return { count, formattedText }
    }
    return { count: 0, formattedText: '' }
  }
}

const numberRegExp = /^\d+(?:\.\d+)?/
export const numberRule: FormatterRule = (text, index) => {
  const startMatch = numberRegExp.exec(text.slice(index))
  if (startMatch) {
    const count = startMatch[0].length
    const characterBefor = text[index - 1]
    const characterAfter = text[index + count]
    if (characterBefor && new RegExp(polishSymbolCharacterClass).test(characterBefor))
      return noMatch
    if (characterBefor && numberRegExp.test(characterBefor))
      return noMatch
    if (characterAfter && new RegExp(polishSymbolCharacterClass).test(characterAfter))
      return noMatch
    if (characterAfter && numberRegExp.test(characterAfter))
      return noMatch

    const number = startMatch[0]
    const formattedText = `<span ${styles('text-color-Beige')}>${number}</span>`
    return { count, formattedText }
  }
  return { count: 0, formattedText: '' }
}

const inlineCodeRule: FormatterRule = (text, index) => {
  if (text[index] === '`') {
    let count = 1
    let body = ''

    while (index + count < text.length && text[index + count] !== '`') {
      body += text[index + count]
      count += 1
    }
    if (text[index + count] !== '`')
      throw new Error(`No end \` found for rule inlineCodeRule: ${text}`)

    count += 1
    const formattedText = formatDvalaExpression(body)
    return { count, formattedText }
  }
  return { count: 0, formattedText: '' }
}

const dvala = new Dvala({ debug: false, modules: allBuiltinModules })

export type StyleOverride = {
  values: string[]
  style: string
}

const normalExpressionSet = new Set(normalExpressionKeys)
const specialExpressionSet = new Set(specialExpressionKeys)

export function formatDvalaExpression(program: string, styleOverride?: StyleOverride): string {
  try {
    const tokens = dvala.tokenize(program).tokens
    const spans = tokens.map((token, index) => {
      const style = styleOverride?.values.includes(token[1]) ? styleOverride.style : getStylesFromToken(token, tokens, index)
      return `<span ${style}>${token[1]}</span>`
    })

    return `<span ${styles('text-color-gray-200', 'font-mono')}>${
      spans.join('')
    }</span>`
  }
  catch (error) {
    return `<span ${styles('text-color-Crimson')}>${program}</span>`
  }
}

function isEffectName(tokens: Token[], index: number): boolean {
  // Check if this symbol is inside effect(<name>)
  // Pattern: effect ( <name> ) — with possible whitespace tokens between
  let i = index - 1
  // Skip whitespace before current token
  while (i >= 0 && tokens[i]![0] === 'Whitespace') i--
  if (i < 0 || tokens[i]![0] !== 'LParen') return false
  i--
  while (i >= 0 && tokens[i]![0] === 'Whitespace') i--
  if (i < 0 || tokens[i]![0] !== 'Symbol' || tokens[i]![1] !== 'effect') return false
  // Check closing paren after current token
  let j = index + 1
  while (j < tokens.length && tokens[j]![0] === 'Whitespace') j++
  if (j >= tokens.length || tokens[j]![0] !== 'RParen') return false
  return true
}

function getStylesFromToken(token: Token, tokens: Token[], index: number): string {
  const tokenType = token[0]
  switch (tokenType) {
    case 'string':
      return styles('text-color-Pink')
    case 'DocString':
      return styles('text-color-Pink')
    case 'RegexpShorthand':
      return styles('text-color-Pink')
    case 'Symbol':
      if (isEffectName(tokens, index)) {
        return standardEffectNames.has(token[1])
          ? styles('text-color-Blue')
          : styles('text-color-SkyLavender')
      }
      return specialExpressionSet.has(token[1])
        ? styles('text-color-BrightYellow')
        : normalExpressionSet.has(token[1])
          ? styles('text-color-Beige')
          : styles('text-color-Mint')
    case 'BasePrefixedNumber':
    case 'Number':
      return styles('text-color-Viola')
    case 'Shebang':
    case 'SingleLineComment':
    case 'MultiLineComment':
      return styles('text-color-gray-500', 'italic')
    case 'Operator':
      return styles('text-color-gray-300')
    case 'ReservedSymbol':
      return styles('text-color-BrightYellow')
    case 'Whitespace':
      return ''
    case 'Error':
      return styles('text-color-Crimson')
    case 'LBrace':
    case 'RBrace':
    case 'LBracket':
    case 'RBracket':
    case 'LParen':
    case 'RParen':
      return styles('text-color-gray-300')

    default:
      throw new Error(`Unexpected token: ${token satisfies never}`)
  }
}

const italicRule = createRule({
  name: 'italic',
  startPattern: /^\*\*\*/,
  endPattern: /^\*\*\*/,
  startTag: `<span ${styles('italic')}>`,
  endTag: '</span>',
})

const boldRule = createRule({
  name: 'bold',
  startPattern: /^\*\*/,
  endPattern: /^\*\*/,
  startTag: `<span ${styles('text-color-gray-300')}>`,
  endTag: '</span>',
})

const newLineRule = createRule({
  name: 'new-line',
  startPattern: /^ {2}\n/,
  startTag: '',
  endTag: '<br>',
})

const newParagraphRule = createRule({
  name: 'new-line',
  startPattern: /^\n{2}/,
  startTag: '',
  endTag: '<p>',
})

const paragraphRule = createRule({
  name: 'paragraph',
  startPattern: /^\n{2}/,
  startTag: `<div ${styles('mb-2')}>`,
  endTag: '</div>',
})

const internalLinkRule: FormatterRule = (text, index) => {
  const match = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(text.slice(index))
  if (match) {
    const target = match[1]!
    const displayText = match[2]
    const reference = allReference[target]
    if (reference) {
      const linkName = getLinkName(reference)
      const label = displayText ?? target
      const formattedText = `<a onclick="Playground.showPage('${linkName}', 'smooth')">${label}</a>`
      return { count: match[0].length, formattedText }
    }
    else {
      // Treat target as a raw page ID (e.g. tutorial-getting-started, example-page, index)
      const label = displayText ?? target
      const formattedText = `<a onclick="Playground.showPage('${target}', 'smooth')">${label}</a>`
      return { count: match[0].length, formattedText }
    }
  }
  return { count: 0, formattedText: '' }
}

const imageRule: FormatterRule = (text, index) => {
  const match = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(text.slice(index))
  if (match) {
    const alt = match[1]!
    const src = match[2]!
    const formattedText = `<img src="${src}" alt="${alt}" style="max-width: 100%;">`
    return { count: match[0].length, formattedText }
  }
  return { count: 0, formattedText: '' }
}

const externalLinkRule: FormatterRule = (text, index) => {
  const match = /^\[([^\]]+)\]\(([^)]+)\)/.exec(text.slice(index))
  if (match) {
    const linkText = match[1]!
    const url = match[2]!
    const formattedText = `<a class="external-links" href="${url}" target="_blank">${linkText}</a>`
    return { count: match[0].length, formattedText }
  }
  return { count: 0, formattedText: '' }
}

export const mdRules: FormatterRule[] = [
  imageRule,
  internalLinkRule,
  externalLinkRule,
  inlineCodeRule,
  italicRule,
  boldRule,
  newLineRule,
  newParagraphRule,
  paragraphRule,
  numberRule,
]

function createRule({
  name,
  startPattern,
  endPattern,
  startTag,
  endTag,
  keepPatterns,
  formatPatterns,
  stopRecursion,
}: {
  name: string
  startPattern: RegExp
  endPattern?: RegExp
  startTag: string
  endTag: string
  keepPatterns?: boolean
  formatPatterns?: boolean
  stopRecursion?: boolean
}): FormatterRule {
  return (text, index, formatter) => {
    const startMatch = startPattern.exec(text.slice(index))
    if (startMatch) {
      let count = startMatch[0].length
      let body = keepPatterns && formatPatterns ? startMatch[0] : ''
      let endMatch: RegExpExecArray | null = null

      if (endPattern) {
        while (index + count < text.length && !endPattern.test(text.slice(index + count))) {
          body += text[index + count]
          count += 1
        }
        endMatch = endPattern.exec(text.slice(index + count))
        if (!endMatch)
          throw new Error(`No end pattern found for rule ${name},  ${endPattern}`)

        count += endMatch[0].length
        body += keepPatterns && formatPatterns ? endMatch[0] : ''
      }
      const formattedText = `${
        keepPatterns && !formatPatterns ? startMatch[0] : ''
      }${
        startTag
      }${
        body ? (stopRecursion ? body : formatter(body)) : ''
      }${
        endTag
      }${
        endMatch && keepPatterns && !formatPatterns ? endMatch[0] : ''
      }`
      return { count, formattedText }
    }
    return { count: 0, formattedText: '' }
  }
}
