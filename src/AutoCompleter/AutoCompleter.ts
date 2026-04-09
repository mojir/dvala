import { normalExpressionKeys, specialExpressionKeys } from '../builtin'
import { tokenize } from '../tokenizer/tokenize'
import { reservedSymbolRecord } from '../tokenizer/reservedNames'

export interface AutoCompleterParams {
  effectNames?: readonly string[]
  scope?: Record<string, unknown>
}

type AutoCompleteSuggestion = {
  program: string
  position: number
}

const dvalaCommands = new Set([...normalExpressionKeys, ...specialExpressionKeys, ...Object.keys(reservedSymbolRecord)])

// Matches a trailing dotted-symbol prefix like "dvala.io." or "foo.bar."
const DOT_PREFIX_RE = /((?:[a-zA-Z][a-zA-Z0-9_-]*\.)+)$/

// TODO: replace with get suggestions function
export class AutoCompleter {
  private prefixProgram: string = ''
  private suffixProgram: string = ''
  private searchString: string = ''
  private dotPrefix: string = ''
  private suggestions: string[] = []
  private suggestionIndex: null | number = null

  constructor(public readonly originalProgram: string, public readonly originalPosition: number, params: AutoCompleterParams = {}) {
    const partialProgram = this.originalProgram.slice(0, this.originalPosition)
    const tokenStream = tokenize(partialProgram, false, undefined)

    const lastToken = tokenStream.tokens.at(-1)
    if (!lastToken) {
      return
    }

    if (lastToken[0] === 'Error') {
      return
    }

    this.searchString = lastToken[1]
    this.prefixProgram = this.originalProgram.slice(0, this.originalPosition - this.searchString.length)
    this.suffixProgram = this.originalProgram.slice(this.prefixProgram.length + this.searchString.length)
    this.originalProgram.slice(this.prefixProgram.length + this.searchString.length)

    // When cursor is immediately after '.', fold the dot into prefixProgram
    // so dotPrefix detection and completion work correctly
    if (lastToken[0] === 'Operator' && this.searchString === '.') {
      this.prefixProgram = this.originalProgram.slice(0, this.originalPosition)
      this.suffixProgram = this.originalProgram.slice(this.originalPosition)
      this.searchString = ''
    }

    const dotPrefixMatch = DOT_PREFIX_RE.exec(this.prefixProgram)
    this.dotPrefix = dotPrefixMatch?.[1] ?? ''

    this.suggestions = this.generateSuggestions(params)
  }

  public getNextSuggestion(): AutoCompleteSuggestion | null {
    return this.getAutoCompleteSuggestionResult(this.getNextSuggestionSymbol())
  }

  public getPreviousSuggestion(): AutoCompleteSuggestion | null {
    return this.getAutoCompleteSuggestionResult(this.getPreviousSuggestionSymbol())
  }

  private getAutoCompleteSuggestionResult(suggestion: string | null): AutoCompleteSuggestion | null {
    if (suggestion === null) {
      return null
    }

    return {
      program: this.prefixProgram + suggestion + this.suffixProgram,
      position: this.prefixProgram.length + suggestion.length,
    }
  }

  private getNextSuggestionSymbol(): string | null {
    if (this.suggestions.length === 0) {
      return null
    }

    if (this.suggestionIndex === null) {
      this.suggestionIndex = 0
    } else {
      this.suggestionIndex += 1
      if (this.suggestionIndex >= this.suggestions.length) {
        this.suggestionIndex = 0
      }
    }

    return this.suggestions[this.suggestionIndex]!
  }

  private getPreviousSuggestionSymbol(): string | null {
    if (this.suggestions.length === 0) {
      return null
    }

    if (this.suggestionIndex === null) {
      this.suggestionIndex = this.suggestions.length - 1
    } else {
      this.suggestionIndex -= 1
      if (this.suggestionIndex < 0) {
        this.suggestionIndex = this.suggestions.length - 1
      }
    }

    return this.suggestions[this.suggestionIndex]!
  }

  public getSuggestions(): string[] {
    return [...this.suggestions]
  }

  public getSearchString(): string {
    return this.searchString
  }

  private generateSuggestions(params: AutoCompleterParams): string[] {
    const blacklist = new Set<string>(['0_defn', 'function'])
    const fullSearch = this.dotPrefix + this.searchString

    if (this.dotPrefix) {
      // Inside a dotted-symbol context (e.g. "dvala.io.") — only complete effect names
      /* v8 ignore next -- both ?? branches tested, v8 misreports nullish coalescing */
      return this.generateDottedEffectSuggestions(params.effectNames ?? [], fullSearch)
    }

    const startsWithCaseSensitive = this.generateWithPredicate(params, suggestion =>
      !blacklist.has(suggestion) && suggestion.startsWith(this.searchString))
    startsWithCaseSensitive.forEach(suggestion => blacklist.add(suggestion))

    const startsWithCaseInsensitive = this.generateWithPredicate(params, suggestion =>
      !blacklist.has(suggestion) && suggestion.toLowerCase().startsWith(this.searchString.toLowerCase()))
    startsWithCaseInsensitive.forEach(suggestion => blacklist.add(suggestion))

    const includesCaseSensitive = this.generateWithPredicate(params, suggestion =>
      !blacklist.has(suggestion) && suggestion.includes(this.searchString))
    includesCaseSensitive.forEach(suggestion => blacklist.add(suggestion))

    const includesCaseInsensitive = this.generateWithPredicate(params, suggestion =>
      !blacklist.has(suggestion) && suggestion.includes(this.searchString.toLowerCase()))
    includesCaseInsensitive.forEach(suggestion => blacklist.add(suggestion))

    return [...startsWithCaseSensitive, ...startsWithCaseInsensitive, ...includesCaseSensitive, ...includesCaseInsensitive]
  }

  private generateDottedEffectSuggestions(effectNames: readonly string[], fullSearch: string): string[] {
    const seen = new Set<string>()
    const results: string[] = []

    const predicates = [
      (name: string) => name.startsWith(fullSearch),
      (name: string) => name.toLowerCase().startsWith(fullSearch.toLowerCase()),
      (name: string) => name.includes(fullSearch),
      (name: string) => name.toLowerCase().includes(fullSearch.toLowerCase()),
    ]

    for (const pred of predicates) {
      for (const name of effectNames) {
        const insertText = name.slice(this.dotPrefix.length)
        if (insertText && !seen.has(insertText) && pred(name)) {
          results.push(insertText)
          seen.add(insertText)
        }
      }
    }

    return results
  }

  private generateWithPredicate(params: AutoCompleterParams, shouldInclude: (suggestion: string) => boolean): string[] {
    const suggestions = new Set<string>()

    dvalaCommands.forEach(suggestion => {
      if (shouldInclude(suggestion)) {
        suggestions.add(suggestion)
      }
    })

    params.effectNames?.forEach(name => {
      if (shouldInclude(name)) {
        suggestions.add(name)
      }
    })

    Object.keys(params.scope ?? {}).forEach(name => {
      if (shouldInclude(name)) {
        suggestions.add(name)
      }
    })

    return [...suggestions].sort((a, b) => a.localeCompare(b))
  }
}
