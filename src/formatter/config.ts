/**
 * Shared formatting configuration constants.
 *
 * Used by prettyPrint (structural formatting) and reinsertComments (comment
 * reinsertion) to ensure consistent behaviour across both phases.
 */

/** Maximum line width in columns. Lines are wrapped or trailing comments demoted at this limit. */
export const MAX_WIDTH = 80

/** Maximum number of consecutive blank lines allowed between statements. */
export const MAX_BLANK_LINES = 1

/** Maximum number of object entries that may be inlined on a single row. */
export const MAX_INLINE_OBJECT_ENTRIES = 3
