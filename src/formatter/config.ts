/**
 * Shared formatting configuration constants.
 *
 * Used by the CST formatter (cstFormat.ts) and prettyPrint (runtime display).
 */

/** Maximum line width in columns. Lines are wrapped or trailing comments demoted at this limit. */
export const MAX_WIDTH = 80

/** Maximum number of consecutive blank lines allowed between statements. */
export const MAX_BLANK_LINES = 1

/** Maximum number of entries/elements that may be inlined on a single row (objects and arrays). */
export const MAX_INLINE_ENTRIES = 3
