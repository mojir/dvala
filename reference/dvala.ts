/**
 * Tagged template literal helper for embedding Dvala code snippets.
 *
 * Usage:
 *   import { dvala } from './dvala'
 *
 *   const code = dvala`
 *     let x = 1;
 *     x + 1
 *   `
 *
 * The helper uses String.raw so backticks inside the Dvala code do not need
 * escaping. The content is trimmed and run through the formatter, so the
 * resulting string always satisfies format(code) === code.
 *
 * Using this helper is the canonical way to write Dvala snippets in TypeScript
 * source files. The round-trip test suite (format.roundtrip.test.ts) enforces
 * that all snippets produced this way remain stable — if the formatter changes,
 * re-running `npm run format-snippets` brings them back into sync.
 */

import { format } from '../src/formatter/format'

export function dvala(strings: TemplateStringsArray, ...values: unknown[]): string {
  // Use String.raw to avoid interpreting escape sequences inside the Dvala code.
  const raw = String.raw({ raw: strings }, ...values)
  return format(raw.trim()).trimEnd()
}

/**
 * Format a single-expression Dvala snippet, stripping the trailing semicolon
 * that the formatter adds. Use this for short inline examples in datatype.ts
 * and shorthand.ts where the reference tests require no trailing semicolon.
 */
export function snippet(code: string): string {
  return format(code.trim()).trimEnd().replace(/;$/, '')
}
