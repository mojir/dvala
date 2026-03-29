import type { Ast } from '../parser/types'

/**
 * A bundle produced by the bundler. Contains a single self-contained AST
 * with all file modules inlined as let bindings.
 *
 * The bundle is the universal intermediate representation for the AST pipeline:
 * bundle → treeshake → optimize → deduplicate → emit.
 *
 * The bundle is pure JSON — fully serializable and portable
 * (e.g., build on a server, run in a browser).
 */
export interface DvalaBundle {
  /** Format version for forwards compatibility. */
  version: 1
  /** Single self-contained AST — all file modules inlined as let bindings. */
  ast: Ast
}

export function isDvalaBundle(value: unknown): value is DvalaBundle {
  return (
    typeof value === 'object'
    && value !== null
    && (value as DvalaBundle).version === 1
    && typeof (value as DvalaBundle).ast === 'object'
    && Array.isArray((value as DvalaBundle).ast?.body)
  )
}
