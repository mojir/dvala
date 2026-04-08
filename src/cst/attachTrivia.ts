/**
 * Trivia attachment algorithm for CST construction.
 *
 * Takes the full token stream (with whitespace and comments preserved) and
 * wraps each "real" token in a CstToken that carries its leading and trailing
 * trivia. Uses the split convention:
 *
 *   - Same-line trivia (up to and including the first newline) is trailing
 *     trivia of the previous real token.
 *   - Subsequent-line trivia is leading trivia of the next real token.
 *
 * This matches the convention used by Roslyn, swift-syntax, and rust-analyzer.
 */

import type { Token } from '../tokenizer/token'
import type { CstToken, TriviaNode } from './types'

// ---------------------------------------------------------------------------
// Token classification
// ---------------------------------------------------------------------------

function isTrivia(token: Token): boolean {
  const type = token[0]
  return type === 'Whitespace'
    || type === 'SingleLineComment'
    || type === 'MultiLineComment'
    || type === 'Shebang'
}

/**
 * Get the raw source text for a token. Most tokens store raw text in
 * token[1], but a few strip their prefix during tokenization:
 *   - EffectName: value "my.eff" → raw "@my.eff"
 *   - MacroQualified: value "qualified.name" → raw "macro@qualified.name"
 *   - MacroPrefix: value "name" → raw "#name"
 */
function rawTokenText(token: Token): string {
  switch (token[0]) {
    case 'EffectName': return `@${token[1]}`
    case 'MacroQualified': return `macro@${token[1]}`
    case 'MacroPrefix': return `#${token[1]}`
    default: return token[1]
  }
}

function toTriviaNode(token: Token): TriviaNode {
  switch (token[0]) {
    case 'Whitespace': return { kind: 'whitespace', text: token[1] }
    case 'SingleLineComment': return { kind: 'lineComment', text: token[1] }
    case 'MultiLineComment': return { kind: 'blockComment', text: token[1] }
    case 'Shebang': return { kind: 'shebang', text: token[1] }
    default: throw new Error(`Not a trivia token: ${token[0]}`)
  }
}

// ---------------------------------------------------------------------------
// Trivia splitting
// ---------------------------------------------------------------------------

/**
 * Split a trivia sequence at the first newline boundary.
 *
 * Everything up to and including the first `\n` character goes into
 * `trailing`. Everything after goes into `leading`. If a single trivia
 * node spans the boundary (e.g. whitespace "  \n  "), it is split into
 * two nodes at the newline.
 *
 * If no newline exists in the trivia, everything is trailing (same-line).
 */
function splitTriviaAtNewline(trivia: TriviaNode[]): { trailing: TriviaNode[]; leading: TriviaNode[] } {
  for (let i = 0; i < trivia.length; i++) {
    const t = trivia[i]!
    const nlIndex = t.text.indexOf('\n')

    if (nlIndex === -1) continue

    // Found the first newline. Split here.
    const before = t.text.substring(0, nlIndex + 1) // includes the \n
    const after = t.text.substring(nlIndex + 1)

    const trailing = trivia.slice(0, i)
    if (before) trailing.push({ kind: t.kind, text: before })

    const leading: TriviaNode[] = []
    if (after) leading.push({ kind: t.kind, text: after })
    leading.push(...trivia.slice(i + 1))

    return { trailing, leading }
  }

  // No newline: everything is trailing (same line as previous token)
  return { trailing: [...trivia], leading: [] }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AttachTriviaResult {
  /** Real tokens wrapped with their leading/trailing trivia. */
  tokens: CstToken[]
  /** Trivia after the last real token that belongs to subsequent lines
   *  (file-level trailing comments, final newlines). Stored on CstProgram. */
  trailingTrivia: TriviaNode[]
}

/**
 * Attach trivia (whitespace, comments) to real tokens using the split
 * convention.
 *
 * @param fullTokens Token stream from `tokenize(source, true, ...)`.
 *   Must include whitespace and comment tokens (debug mode).
 */
export function attachTrivia(fullTokens: Token[]): AttachTriviaResult {
  const cstTokens: CstToken[] = []
  let triviaBuffer: TriviaNode[] = []
  let hasPrevReal = false

  for (const token of fullTokens) {
    if (isTrivia(token)) {
      triviaBuffer.push(toTriviaNode(token))
      continue
    }

    if (hasPrevReal) {
      // Split trivia between trailing of previous and leading of current
      const { trailing, leading } = splitTriviaAtNewline(triviaBuffer)
      cstTokens[cstTokens.length - 1]!.trailingTrivia = trailing

      cstTokens.push({
        leadingTrivia: leading,
        text: rawTokenText(token),
        trailingTrivia: [],
      })
    } else {
      // First real token: all accumulated trivia is leading
      cstTokens.push({
        leadingTrivia: triviaBuffer,
        text: rawTokenText(token),
        trailingTrivia: [],
      })
    }

    triviaBuffer = []
    hasPrevReal = true
  }

  // Handle remaining trivia after last real token
  let fileTrailingTrivia: TriviaNode[] = []

  if (hasPrevReal && triviaBuffer.length > 0) {
    const { trailing, leading } = splitTriviaAtNewline(triviaBuffer)
    cstTokens[cstTokens.length - 1]!.trailingTrivia = trailing
    fileTrailingTrivia = leading
  } else if (!hasPrevReal) {
    // No real tokens at all — file is all trivia
    fileTrailingTrivia = triviaBuffer
  }

  return { tokens: cstTokens, trailingTrivia: fileTrailingTrivia }
}

// ---------------------------------------------------------------------------
// Utility: print CstToken sequence back to source
// ---------------------------------------------------------------------------

/** Concatenate a single TriviaNode's text. */
function triviaText(trivia: TriviaNode[]): string {
  return trivia.map(t => t.text).join('')
}

/** Concatenate a single CstToken back to its source representation. */
export function cstTokenText(token: CstToken): string {
  return triviaText(token.leadingTrivia) + token.text + triviaText(token.trailingTrivia)
}

/**
 * Reconstruct the full source from CstTokens + trailing trivia.
 * Used for losslessness verification: `printTokens(attachTrivia(tokenize(src))) === src`.
 */
export function printTokens(result: AttachTriviaResult): string {
  let output = ''
  for (const token of result.tokens) {
    output += cstTokenText(token)
  }
  output += triviaText(result.trailingTrivia)
  return output
}
