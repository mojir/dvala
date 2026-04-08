/**
 * Dvala source formatter — CST-based.
 *
 * Parses source into a concrete syntax tree (CST) that preserves all tokens
 * including comments and whitespace, then formats it using a Wadler-Lindig
 * document algebra. Comments are preserved at their logical positions.
 * Structural whitespace is normalized to canonical form.
 *
 * On parse failure the original source is returned unchanged so format-on-save
 * never destroys partially-written code.
 */

import { tokenize } from '../tokenizer/tokenize'
import { parseToCst } from '../parser'
import { formatCst } from './cstFormat'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function format(source: string): string {
  if (source.trim() === '') return ''
  const fullTokenStream = tokenize(source, true, undefined)
  try {
    const { tree, trailingTrivia } = parseToCst(fullTokenStream)
    return formatCst(tree, trailingTrivia)
  } catch {
    return source
  }
}
