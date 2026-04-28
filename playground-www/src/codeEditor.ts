// Monaco-backed code editor for the Dvala playground.
//
// This is the playground's only editor abstraction. It wraps the Monaco
// `IStandaloneCodeEditor` and exposes the small surface that the rest of the
// playground actually uses (offset-based selection, raw scroll position,
// focus + readonly toggles, change/scroll listeners).
//
// Side note on tokenization: the Dvala tokenizer is whole-source today. We
// use Monaco's per-line `TokensProvider` and tokenize each line independently
// — fast and accurate for almost all code, but loses the color on
// continuation lines of multi-line `/* */` comments and backtick template
// strings spanning lines. Phase 2 will replace this with a stateful tokens
// provider (or move to `DocumentSemanticTokensProvider`) — tracked in the
// Phase 1 design doc.

import * as monaco from 'monaco-editor'
// eslint-disable-next-line import/default -- Vite resolves `?worker` to a worker-constructor default export; the import plugin can't see through the suffix.
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { normalExpressionKeys, specialExpressionKeys } from '../../src/builtin'
import { standardEffectNames } from '../../src/evaluator/standardEffects'
import type { Token } from '../../src/tokenizer/token'
import { tokenizeSource } from '../../src/tooling'
import { playgroundEffectReference } from './playgroundEffects'

// ------------------------------------------------------------------
// Monaco worker setup (Vite handles `?worker` URL → worker constructor).
// Dvala registers no extra languages with Monaco, so the base editor worker
// is the only one we need.
// ------------------------------------------------------------------
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
}

// ------------------------------------------------------------------
// Token classification — same rules as the old SyntaxOverlay so the visual
// result matches the previous editor pixel-for-pixel (modulo Monaco chrome).
// ------------------------------------------------------------------

const SCOPES = [
  'keyword',
  'builtin',
  'symbol',
  'number',
  'string',
  'punctuation',
  'comment',
  'error',
  'effect',
  'effect-bold',
  'effect-italic',
  'effect-underline',
  'effect-construct',
] as const

type Scope = (typeof SCOPES)[number]

const normalExpressionSet = new Set(normalExpressionKeys)
const specialExpressionSet = new Set(specialExpressionKeys)
const playgroundEffectNames = new Set(Object.values(playgroundEffectReference).map(r => r.title))
// Internal effects handled by the engine but not in the standardEffects registry.
const internalEffectNames = new Set(['dvala.error', 'dvala.macro.expand'])
const effectConstructSymbols = new Set(['perform', 'effectName', 'qualifiedName', 'qualifiedMatcher'])

function effectScope(name: string): Scope {
  if (playgroundEffectNames.has(name)) return 'effect-italic'
  if (!standardEffectNames.has(name) && !internalEffectNames.has(name)) return 'effect-underline'
  return 'effect-bold'
}

function classifyToken(t: Token): Scope | null {
  switch (t[0]) {
    case 'string':
    case 'TemplateString':
    case 'RegexpShorthand':
      return 'string'
    case 'EffectName':
      return effectScope(t[1])
    case 'Atom':
    case 'BasePrefixedNumber':
    case 'Number':
      return 'number'
    case 'MacroPrefix':
    case 'ReservedSymbol':
      return 'keyword'
    case 'Symbol':
      if (effectConstructSymbols.has(t[1])) return 'effect-construct'
      if (specialExpressionSet.has(t[1])) return 'keyword'
      if (normalExpressionSet.has(t[1])) return 'builtin'
      return 'symbol'
    case 'Shebang':
    case 'SingleLineComment':
    case 'MultiLineComment':
      return 'comment'
    case 'Operator':
    case 'LBrace':
    case 'RBrace':
    case 'LBracket':
    case 'RBracket':
    case 'LParen':
    case 'RParen':
      return 'punctuation'
    case 'Error':
      return 'error'
    case 'Whitespace':
      return null
    case 'QuoteSplice':
      return 'punctuation'
    default:
      return null
  }
}

// Some token kinds carry only the unprefixed value (e.g. `:foo` → `["Atom", "foo"]`).
// Re-add the prefix character so on-screen length matches the source.
function tokenLength(t: Token): number {
  switch (t[0]) {
    case 'Atom':
    case 'EffectName':
    case 'MacroPrefix':
      return 1 + t[1].length
    default:
      return t[1].length
  }
}

// ------------------------------------------------------------------
// Per-line TokensProvider for Monaco. State is currently ignored — fixes for
// multi-line comment / template-string continuations are tracked separately.
// ------------------------------------------------------------------

const noopState: monaco.languages.IState = {
  clone() {
    return this
  },
  equals() {
    return true
  },
}

const dvalaTokensProvider: monaco.languages.TokensProvider = {
  getInitialState: () => noopState,
  tokenize(line) {
    const out: monaco.languages.IToken[] = []
    try {
      const tokens = tokenizeSource(line).tokens
      let pos = 0
      for (const t of tokens) {
        const scope = classifyToken(t)
        const len = tokenLength(t)
        if (scope) out.push({ startIndex: pos, scopes: scope })
        pos += len
      }
    } catch {
      // Tokenizer errored on this line — fall back to a single error token so
      // Monaco still renders something rather than throwing.
      out.push({ startIndex: 0, scopes: 'error' })
    }
    return { tokens: out, endState: noopState }
  },
}

// ------------------------------------------------------------------
// Themes — match the dark/light hex values from playground-www/public/styles.css.
// Theme rules use Monaco's space-prefixed scope path (`token: 'string.dvala'`)
// scoped to the language id so unrelated languages aren't repainted.
// ------------------------------------------------------------------

type SyntaxColors = Record<Scope, string>

const darkSyntax: SyntaxColors = {
  keyword: '569cd6',
  builtin: 'dcdcaa',
  symbol: '9cdcfe',
  number: 'b5cea8',
  string: 'ce9178',
  punctuation: 'd4d4d4',
  comment: '6a9955',
  error: 'f44747',
  effect: 'e6b455',
  'effect-bold': 'e6b455',
  'effect-italic': 'e6b455',
  'effect-underline': 'e6b455',
  'effect-construct': 'e06c9f',
}

const lightSyntax: SyntaxColors = {
  keyword: '0000ff',
  builtin: '795e26',
  symbol: '001080',
  number: '098658',
  string: 'a31515',
  punctuation: '333333',
  comment: '008000',
  error: 'cc2222',
  effect: 'b07800',
  'effect-bold': 'b07800',
  'effect-italic': 'b07800',
  'effect-underline': 'b07800',
  'effect-construct': 'af00db',
}

function buildRules(colors: SyntaxColors): monaco.editor.ITokenThemeRule[] {
  return SCOPES.map(scope => {
    const rule: monaco.editor.ITokenThemeRule = { token: `${scope}.dvala`, foreground: colors[scope] }
    if (scope === 'comment') rule.fontStyle = 'italic'
    if (scope === 'effect-bold') rule.fontStyle = 'bold'
    if (scope === 'effect-italic') rule.fontStyle = 'italic'
    if (scope === 'effect-underline') rule.fontStyle = 'underline'
    return rule
  })
}

const DARK_THEME = 'dvala-dark'
const LIGHT_THEME = 'dvala-light'

let registered = false

function registerLanguage(): void {
  if (registered) return
  registered = true
  monaco.languages.register({ id: 'dvala' })
  monaco.languages.setTokensProvider('dvala', dvalaTokensProvider)
  monaco.languages.setLanguageConfiguration('dvala', {
    comments: { lineComment: ';', blockComment: ['/*', '*/'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
    ],
  })

  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: buildRules(darkSyntax),
    colors: {
      'editor.background': '#0d0d0d',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#555',
      'editorLineNumber.activeForeground': '#999',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#1a1a1a',
      'editorCursor.foreground': '#d4d4d4',
    },
  })
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: buildRules(lightSyntax),
    colors: {
      'editor.background': '#f5f5f5',
      'editor.foreground': '#333333',
    },
  })
}

function currentThemeId(): string {
  return document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT_THEME : DARK_THEME
}

// ------------------------------------------------------------------
// CodeEditor — the only public surface this module exposes.
// ------------------------------------------------------------------

export class CodeEditor {
  private readonly editor: monaco.editor.IStandaloneCodeEditor
  private readonly model: monaco.editor.ITextModel

  constructor(host: HTMLElement, opts: { initialValue?: string } = {}) {
    registerLanguage()
    this.editor = monaco.editor.create(host, {
      value: opts.initialValue ?? '',
      language: 'dvala',
      theme: currentThemeId(),
      automaticLayout: true,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      minimap: { enabled: false },
      renderLineHighlight: 'line',
      scrollBeyondLastLine: false,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'off',
      // Strip Monaco's ambient features that don't fit the playground:
      // suggestion popups (Phase 2 will provide its own LSP completions),
      // light bulb actions, parameter hints, and inline suggestions.
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
      parameterHints: { enabled: false },
      inlineSuggest: { enabled: false },
    })
    this.model = this.editor.getModel()!
  }

  // --- value ---
  getValue(): string {
    return this.model.getValue()
  }
  setValue(value: string): void {
    if (this.model.getValue() === value) return
    this.model.setValue(value)
  }

  // --- selection / cursor (offset-based, matching the old textarea API) ---
  getCursor(): number {
    const pos = this.editor.getPosition()
    return pos ? this.model.getOffsetAt(pos) : 0
  }
  setCursor(offset: number): void {
    const pos = this.model.getPositionAt(offset)
    this.editor.setPosition(pos)
  }
  getSelectionRange(): { start: number; end: number } {
    const sel = this.editor.getSelection()
    if (!sel) return { start: 0, end: 0 }
    const start = this.model.getOffsetAt(sel.getStartPosition())
    const end = this.model.getOffsetAt(sel.getEndPosition())
    return { start, end }
  }
  getSelectedText(): string {
    const { start, end } = this.getSelectionRange()
    return this.model.getValue().substring(start, end)
  }
  setSelection(start: number, end: number): void {
    const startPos = this.model.getPositionAt(start)
    const endPos = this.model.getPositionAt(end)
    this.editor.setSelection(monaco.Range.fromPositions(startPos, endPos))
  }

  // --- editing ---
  insertAt(text: string, offset: number): void {
    const pos = this.model.getPositionAt(offset)
    const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
    this.editor.executeEdits('playground.insertAt', [{ range, text, forceMoveMarkers: true }])
  }

  // --- focus ---
  focus(): void {
    this.editor.focus()
  }
  hasFocus(): boolean {
    return this.editor.hasTextFocus()
  }

  // --- read-only ---
  isReadOnly(): boolean {
    return this.editor.getRawOptions().readOnly === true
  }
  setReadOnly(readOnly: boolean): void {
    this.editor.updateOptions({ readOnly })
  }

  // --- scroll (caller works in pixels, matching the previous SyntaxOverlay API) ---
  getScrollTop(): number {
    return this.editor.getScrollTop()
  }
  setScrollTop(top: number): void {
    this.editor.setScrollTop(top)
  }
  getScrollLeft(): number {
    return this.editor.getScrollLeft()
  }
  setScrollLeft(left: number): void {
    this.editor.setScrollLeft(left)
  }
  scrollToTop(): void {
    this.editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 })
  }
  scrollToBottom(): void {
    const top = this.editor.getScrollHeight()
    this.editor.setScrollTop(top)
  }

  // --- listeners ---
  onChange(cb: (value: string) => void): monaco.IDisposable {
    return this.model.onDidChangeContent(() => cb(this.model.getValue()))
  }
  onCursorOrSelectionChange(cb: () => void): monaco.IDisposable {
    return this.editor.onDidChangeCursorSelection(() => cb())
  }
  onScroll(cb: (top: number, left: number) => void): monaco.IDisposable {
    return this.editor.onDidScrollChange(e => cb(e.scrollTop, e.scrollLeft))
  }
  onFocus(cb: () => void): monaco.IDisposable {
    return this.editor.onDidFocusEditorWidget(() => cb())
  }
  onBlur(cb: () => void): monaco.IDisposable {
    return this.editor.onDidBlurEditorWidget(() => cb())
  }

  // --- commands (host-defined keyboard shortcuts, mirroring the old textarea handlers) ---
  addCommand(keyCode: number, handler: () => void): void {
    this.editor.addCommand(keyCode, handler)
  }

  // --- theme ---
  setTheme(themeId: 'dark' | 'light'): void {
    monaco.editor.setTheme(themeId === 'light' ? LIGHT_THEME : DARK_THEME)
  }

  layout(): void {
    this.editor.layout()
  }

  dispose(): void {
    this.editor.dispose()
  }
}

// Re-export Monaco's KeyCode/KeyMod so callers can build keybindings without
// importing monaco-editor directly.
export { monaco }
