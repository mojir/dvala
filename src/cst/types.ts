/**
 * Concrete Syntax Tree (CST) type definitions for Dvala.
 *
 * The CST is a fully lossless representation of source code: concatenating all
 * leaf tokens (trivia + token text) in tree order reproduces the original
 * source exactly. It preserves comments, whitespace, punctuation, delimiters,
 * and authored syntactic forms (infix, pipe, shorthand).
 *
 * The CST exists alongside the AST. The AST remains the semantic
 * representation used by the evaluator, analysis, and bundling. The CST is
 * used by the formatter and future tooling (LSP, refactoring, code actions).
 *
 * Pipeline: source → tokenize → CST → (lower) → AST
 *
 * Trivia attachment uses the split convention:
 *   - Same-line trivia is trailing trivia of the previous token
 *   - Next-line trivia is leading trivia of the next token
 */

// ---------------------------------------------------------------------------
// Trivia — whitespace and comments attached to tokens
// ---------------------------------------------------------------------------

export interface TriviaNode {
  /** Trivia classification. */
  kind: 'whitespace' | 'lineComment' | 'blockComment' | 'shebang'
  /** Raw source text of this trivia (including delimiters for comments). */
  text: string
}

// ---------------------------------------------------------------------------
// CstToken — a non-trivia token with attached leading/trailing trivia
// ---------------------------------------------------------------------------

/**
 * Wraps a single non-trivia token with the whitespace and comments that
 * belong to it. Concatenating `leadingTrivia texts + text + trailingTrivia
 * texts` for every CstToken in tree order reproduces the original source.
 */
export interface CstToken {
  leadingTrivia: TriviaNode[]
  /** Raw source text of this token (including delimiters, e.g. quotes for strings). */
  text: string
  trailingTrivia: TriviaNode[]
}

// ---------------------------------------------------------------------------
// Source span — positional information on CST nodes
// ---------------------------------------------------------------------------

/** 0-based line/column span in the original source. */
interface SourceSpan {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

// ---------------------------------------------------------------------------
// CST node types — discriminated union on `kind`
// ---------------------------------------------------------------------------

// -- Literals ---------------------------------------------------------------

interface CstNumberLiteral {
  kind: 'NumberLiteral'
  /** The number token (e.g. "42", "3.14", "0xFF", "1_000"). */
  token: CstToken
  span: SourceSpan
}

interface CstStringLiteral {
  kind: 'StringLiteral'
  /** The string token including quotes (e.g. '"hello"'). */
  token: CstToken
  span: SourceSpan
}

interface CstTemplateString {
  kind: 'TemplateString'
  /** The full template string token including backticks and interpolations.
   *  Internal structure (segments, splices) is captured by the token text.
   *  A future refinement may break this into segments for formatting. */
  token: CstToken
  span: SourceSpan
}

interface CstRegexpShorthand {
  kind: 'RegexpShorthand'
  /** The #"pattern"flags token. */
  token: CstToken
  span: SourceSpan
}

// -- Names ------------------------------------------------------------------

interface CstSymbol {
  kind: 'Symbol'
  /** Identifier token. Covers user-defined, builtin, and special expression names. */
  token: CstToken
  span: SourceSpan
}

interface CstEffectName {
  kind: 'EffectName'
  /** The @dotted.name token. */
  token: CstToken
  span: SourceSpan
}

interface CstReservedSymbol {
  kind: 'ReservedSymbol'
  /** Reserved keyword token: true, false, null, PI, E, INF, NAN. */
  token: CstToken
  span: SourceSpan
}

// -- Collections ------------------------------------------------------------

interface CstArray {
  kind: 'Array'
  openBracket: CstToken
  /** Elements: expressions or spreads. */
  elements: CstNode[]
  /** Comma separators between elements. Length is elements.length - 1
   *  (or elements.length if a trailing comma is present). */
  commas: CstToken[]
  closeBracket: CstToken
  span: SourceSpan
}

/** A single key-value entry in an object literal. */
interface CstObjectEntry {
  /** For computed keys: the opening `[`. */
  openBracket?: CstToken
  /** The key expression (CstSymbol, CstStringLiteral, CstTemplateString, or computed expr). */
  key: CstNode
  /** For computed keys: the closing `]`. */
  closeBracket?: CstToken
  /** The `:` separator. Absent for shorthand entries like `{foo}`. */
  colon?: CstToken
  /** The value expression. Absent for shorthand entries. */
  value?: CstNode
}

interface CstObject {
  kind: 'Object'
  openBrace: CstToken
  /** Entries: CstObjectEntry for key-value pairs, CstSpread for spreads. */
  entries: (CstObjectEntry | CstSpread)[]
  /** Comma separators between entries. */
  commas: CstToken[]
  closeBrace: CstToken
  span: SourceSpan
}

// -- Operators --------------------------------------------------------------

interface CstBinaryOp {
  kind: 'BinaryOp'
  left: CstNode
  /** The operator token: +, -, *, /, %, ^, ==, !=, <, <=, >, >=,
   *  <<, >>, >>>, &, |, xor, ++, &&, ||, ??, |>,
   *  or a symbol token for infix function calls (a join b). */
  operator: CstToken
  right: CstNode
  span: SourceSpan
}

interface CstPrefixOp {
  kind: 'PrefixOp'
  /** The prefix operator token (currently only `-` for unary minus). */
  operator: CstToken
  operand: CstNode
  span: SourceSpan
}

// -- Access and call --------------------------------------------------------

interface CstPropertyAccess {
  kind: 'PropertyAccess'
  object: CstNode
  dot: CstToken
  /** The property name token. */
  property: CstToken
  span: SourceSpan
}

interface CstIndexAccess {
  kind: 'IndexAccess'
  object: CstNode
  openBracket: CstToken
  index: CstNode
  closeBracket: CstToken
  span: SourceSpan
}

interface CstCall {
  kind: 'Call'
  /** The function expression (usually a CstSymbol or chained access). */
  fn: CstNode
  openParen: CstToken
  /** Arguments: expressions or spreads. */
  args: CstNode[]
  /** Comma separators between arguments. */
  commas: CstToken[]
  closeParen: CstToken
  span: SourceSpan
}

// -- Grouping ---------------------------------------------------------------

interface CstParenthesized {
  kind: 'Parenthesized'
  openParen: CstToken
  expression: CstNode
  closeParen: CstToken
  span: SourceSpan
}

// -- Spread -----------------------------------------------------------------

interface CstSpread {
  kind: 'Spread'
  /** The `...` operator token. */
  dots: CstToken
  expression: CstNode
  span: SourceSpan
}

// -- Let binding ------------------------------------------------------------

interface CstLet {
  kind: 'Let'
  letKeyword: CstToken
  target: CstBindingTarget
  equals: CstToken
  value: CstNode
  span: SourceSpan
}

// -- If expression ----------------------------------------------------------

/** A single if/else-if branch. */
interface CstIfBranch {
  /** The `else` keyword. Absent for the first (if) branch. */
  elseKeyword?: CstToken
  /** The `if` keyword. */
  ifKeyword: CstToken
  condition: CstNode
  thenKeyword: CstToken
  /** Body statements. */
  body: CstNode[]
  /** Semicolons between body statements. */
  semicolons: CstToken[]
}

/** The final else branch (no condition). */
interface CstElseBranch {
  elseKeyword: CstToken
  body: CstNode[]
  semicolons: CstToken[]
}

interface CstIf {
  kind: 'If'
  /** The if branch followed by zero or more else-if branches. */
  branches: CstIfBranch[]
  /** The final else branch, if present. */
  elseBranch?: CstElseBranch
  endKeyword: CstToken
  span: SourceSpan
}

// -- Block (do...end) -------------------------------------------------------

/** Optional `with handler;` clause inside a do...end block. */
interface CstWithClause {
  withKeyword: CstToken
  handler: CstNode
  semicolon: CstToken
}

interface CstBlock {
  kind: 'Block'
  doKeyword: CstToken
  /** Optional handler installation: `do with handler; body end`. */
  withClause?: CstWithClause
  /** Body statements. */
  body: CstNode[]
  /** Semicolons between body statements. */
  semicolons: CstToken[]
  endKeyword: CstToken
  span: SourceSpan
}

// -- Loop -------------------------------------------------------------------

/** A single binding in a loop expression: `target = value`. */
interface CstLoopBinding {
  target: CstBindingTarget
  equals: CstToken
  value: CstNode
}

interface CstLoop {
  kind: 'Loop'
  loopKeyword: CstToken
  openParen: CstToken
  bindings: CstLoopBinding[]
  /** Commas between bindings. */
  commas: CstToken[]
  closeParen: CstToken
  arrow: CstToken
  body: CstNode
  span: SourceSpan
}

// -- For --------------------------------------------------------------------

/** Optional `let target = value;` clause inside a for binding. */
interface CstForLetClause {
  letKeyword: CstToken
  target: CstNode
  equals: CstToken
  value: CstNode
  semicolon: CstToken
}

/** A single loop binding in a for expression: `target in iterable`. */
interface CstForBinding {
  target: CstNode
  inKeyword: CstToken
  iterable: CstNode
  letClauses: CstForLetClause[]
  whenClause?: { whenKeyword: CstToken; condition: CstNode }
  whileClause?: { whileKeyword: CstToken; condition: CstNode }
}

interface CstFor {
  kind: 'For'
  forKeyword: CstToken
  openParen: CstToken
  bindings: CstForBinding[]
  /** Commas between bindings (if multiple iteration variables). */
  commas: CstToken[]
  closeParen: CstToken
  arrow: CstToken
  body: CstNode
  span: SourceSpan
}

// -- Match ------------------------------------------------------------------

/** A single case in a match expression. */
interface CstMatchCase {
  caseKeyword: CstToken
  pattern: CstBindingTarget
  whenClause?: { whenKeyword: CstToken; guard: CstNode }
  thenKeyword: CstToken
  body: CstNode[]
  semicolons: CstToken[]
}

interface CstMatch {
  kind: 'Match'
  matchKeyword: CstToken
  expression: CstNode
  cases: CstMatchCase[]
  endKeyword: CstToken
  span: SourceSpan
}

// -- Function (lambda) ------------------------------------------------------

interface CstFunction {
  kind: 'Function'
  /** Opening `(` for params. Absent for single-param or shorthand lambdas. */
  openParen?: CstToken
  /** Parameter binding targets. Empty for shorthand `-> $` lambdas. */
  params: CstBindingTarget[]
  /** Commas between parameters. */
  commas: CstToken[]
  /** Closing `)` for params. */
  closeParen?: CstToken
  /** The `->` arrow. */
  arrow: CstToken
  body: CstNode
  /** True for shorthand lambdas using `$`, `$2`, etc. placeholders. */
  isShorthand: boolean
  span: SourceSpan
}

// -- Handler ----------------------------------------------------------------

/** A single effect clause in a handler definition. */
interface CstHandlerClause {
  /** The @effect.name token. */
  effectName: CstToken
  openParen?: CstToken
  params: CstBindingTarget[]
  commas: CstToken[]
  closeParen?: CstToken
  arrow: CstToken
  body: CstNode
}

/** The optional transform clause in a handler. */
interface CstHandlerTransform {
  transformKeyword: CstToken
  param: CstBindingTarget
  arrow: CstToken
  body: CstNode
}

interface CstHandler {
  kind: 'Handler'
  /** The `shallow` keyword, if this is a shallow handler. */
  shallowKeyword?: CstToken
  /** The `linear` keyword, if this is a linear handler (host-style dispatch). */
  linearKeyword?: CstToken
  handlerKeyword: CstToken
  clauses: CstHandlerClause[]
  transform?: CstHandlerTransform
  endKeyword: CstToken
  span: SourceSpan
}

// -- Resume -----------------------------------------------------------------

interface CstResume {
  kind: 'Resume'
  resumeKeyword: CstToken
  /** Present when resume is called with args: `resume(expr)`. */
  openParen?: CstToken
  argument?: CstNode
  closeParen?: CstToken
  span: SourceSpan
}

// -- Macro ------------------------------------------------------------------

interface CstMacro {
  kind: 'Macro'
  /** The `macro` keyword token. */
  macroKeyword: CstToken
  openParen?: CstToken
  params: CstBindingTarget[]
  commas: CstToken[]
  closeParen?: CstToken
  arrow: CstToken
  body: CstNode
  span: SourceSpan
}

interface CstMacroCall {
  kind: 'MacroCall'
  /** The `#name` prefix token. */
  prefix: CstToken
  argument: CstNode
  span: SourceSpan
}

// -- Error (placeholder for future error recovery) -------------------------

/**
 * A bag of tokens the parser couldn't structure. The type exists so tree
 * walkers compile against it from day one; `parseToCst()` throws on parse
 * errors for now — no partial trees are produced.
 *
 * The formatter prints error nodes verbatim (concatenating their tokens).
 */
interface CstErrorNode {
  kind: 'Error'
  /** The tokens the parser couldn't structure into a typed node. */
  tokens: CstToken[]
  span: SourceSpan
}

// -- Quote / Splice ---------------------------------------------------------

interface CstQuote {
  kind: 'Quote'
  quoteKeyword: CstToken
  /** Body statements inside the quote. */
  body: CstNode[]
  /** Semicolons between body statements. */
  semicolons: CstToken[]
  endKeyword: CstToken
  span: SourceSpan
}

// Emitted by parseQuote as a structural child of the Quote CST node.
// In Pass 1, ALL QuoteSplice tokens produce a Splice CST node regardless of
// caret level — this reflects physical token grouping, not semantic ownership.
// (e.g. in `quote quote $^{z} end end`, the $^{z} is a Splice child of the
// outer Quote even though it semantically belongs to the inner quote.)
// The untyped form (kind: 'Splice', children: [marker, ...exprTokens, closeBrace])
// is used by the formatter; this typed interface is used by printCst.
interface CstSplice {
  kind: 'Splice'
  /** The `$^{`, `$^^{`, etc. splice marker token. */
  marker: CstToken
  expression: CstNode
  closeBrace: CstToken
  span: SourceSpan
}

// ---------------------------------------------------------------------------
// Binding targets — patterns used in let, for, function params, match cases
// ---------------------------------------------------------------------------

interface CstSymbolBinding {
  kind: 'SymbolBinding'
  name: CstToken
  defaultClause?: { equals: CstToken; value: CstNode }
  span: SourceSpan
}

interface CstRestBinding {
  kind: 'RestBinding'
  dots: CstToken
  name: CstToken
  span: SourceSpan
}

interface CstArrayBinding {
  kind: 'ArrayBinding'
  openBracket: CstToken
  /** Elements: binding targets or null for holes (e.g. `[, x]`). */
  elements: (CstBindingTarget | null)[]
  commas: CstToken[]
  closeBracket: CstToken
  defaultClause?: { equals: CstToken; value: CstNode }
  span: SourceSpan
}

/** A single entry in an object binding pattern. */
interface CstObjectBindingEntry {
  key: CstToken
  /** Present for `key as alias` syntax. */
  asKeyword?: CstToken
  alias?: CstToken
  /** Present for nested patterns: `key: pattern`. */
  colon?: CstToken
  target?: CstBindingTarget
}

interface CstObjectBinding {
  kind: 'ObjectBinding'
  openBrace: CstToken
  entries: CstObjectBindingEntry[]
  commas: CstToken[]
  closeBrace: CstToken
  defaultClause?: { equals: CstToken; value: CstNode }
  span: SourceSpan
}

interface CstWildcardBinding {
  kind: 'WildcardBinding'
  token: CstToken
  span: SourceSpan
}

interface CstLiteralBinding {
  kind: 'LiteralBinding'
  /** The literal value node (number, string, template, reserved symbol). */
  value: CstNode
  span: SourceSpan
}

type CstBindingTarget =
  | CstSymbolBinding
  | CstRestBinding
  | CstArrayBinding
  | CstObjectBinding
  | CstWildcardBinding
  | CstLiteralBinding

// ---------------------------------------------------------------------------
// CstNode union — all expression-level CST nodes
// ---------------------------------------------------------------------------

type CstNode =
  // Literals
  | CstNumberLiteral
  | CstStringLiteral
  | CstTemplateString
  | CstRegexpShorthand
  // Names
  | CstSymbol
  | CstEffectName
  | CstReservedSymbol
  // Collections
  | CstArray
  | CstObject
  // Operators
  | CstBinaryOp
  | CstPrefixOp
  // Access and call
  | CstPropertyAccess
  | CstIndexAccess
  | CstCall
  // Grouping
  | CstParenthesized
  // Spread
  | CstSpread
  // Let
  | CstLet
  // Control flow
  | CstIf
  | CstBlock
  | CstLoop
  | CstFor
  | CstMatch
  // Functions
  | CstFunction
  // Effects
  | CstHandler
  | CstResume
  // Macros
  | CstMacro
  | CstMacroCall
  // Quotes
  | CstQuote
  | CstSplice
  // Error recovery
  | CstErrorNode
