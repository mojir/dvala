import type { AstNode, BindingTarget } from '../parser/types'

/**
 * Formatting hint stored in Function node payloads.
 * Set at parse time to preserve the shorthand lambda form through formatting.
 */
interface FunctionHints {
  /** True when authored as shorthand: `-> $ + 1` rather than `($) -> $ + 1`. */
  isShorthand?: boolean
}

export type Function = [BindingTarget[], AstNode[], FunctionHints?]
