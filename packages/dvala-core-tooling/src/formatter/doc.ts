/**
 * Wadler-Lindig document algebra for the CST formatter.
 *
 * A Doc is a tree of formatting instructions that the renderer converts to
 * a string given a target line width. The key abstraction is `Group`: in a
 * Group, the renderer first tries to print everything flat (on one line).
 * If that doesn't fit within the target width, it breaks the Group and
 * renders each `Line` inside it as a newline + indentation.
 *
 * Doc types:
 *   Text(s)          — literal text, never broken
 *   Line             — in flat mode: space; in break mode: newline + indent
 *   SoftLine         — in flat mode: nothing; in break mode: newline + indent
 *   HardLine         — always newline + indent (forces enclosing Group to break)
 *   LineComment(s)   — text followed by a mandatory hard break
 *   Concat(docs)     — concatenation of multiple docs
 *   Nest(n, doc)     — increase indent by n for the inner doc
 *   Group(doc)       — try flat first, break if it doesn't fit
 *   IfBreak(b, f)    — `b` when enclosing Group breaks, `f` when flat
 */

// ---------------------------------------------------------------------------
// Doc types
// ---------------------------------------------------------------------------

interface TextDoc {
  type: 'text'
  text: string
}

interface LineDoc {
  type: 'line'
}

interface SoftLineDoc {
  type: 'softline'
}

interface HardLineDoc {
  type: 'hardline'
}

interface LineCommentDoc {
  type: 'lineComment'
  text: string
}

interface ConcatDoc {
  type: 'concat'
  parts: Doc[]
}

interface NestDoc {
  type: 'nest'
  indent: number
  doc: Doc
}

interface GroupDoc {
  type: 'group'
  doc: Doc
}

interface IfBreakDoc {
  type: 'ifBreak'
  broken: Doc
  flat: Doc
}

export type Doc =
  | TextDoc
  | LineDoc
  | SoftLineDoc
  | HardLineDoc
  | LineCommentDoc
  | ConcatDoc
  | NestDoc
  | GroupDoc
  | IfBreakDoc

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** Literal text — never broken. */
export function text(s: string): Doc {
  return { type: 'text', text: s }
}

/** In flat mode: space. In break mode: newline + indent. */
export const line: Doc = { type: 'line' }

/** In flat mode: nothing. In break mode: newline + indent. */
export const softLine: Doc = { type: 'softline' }

/** Always a newline + indent. Forces enclosing Group to break. */
export const hardLine: Doc = { type: 'hardline' }

/** A line comment — text followed by a mandatory hard break. */
export function lineComment(s: string): Doc {
  return { type: 'lineComment', text: s }
}

/** Concatenate multiple docs. Flattens nested concats. */
export function concat(...parts: Doc[]): Doc {
  // Flatten nested concats and filter empty texts
  const flat: Doc[] = []
  for (const part of parts) {
    if (part.type === 'concat') {
      flat.push(...part.parts)
    } else if (part.type === 'text' && part.text === '') {
      continue
    } else {
      flat.push(part)
    }
  }
  if (flat.length === 0) return text('')
  if (flat.length === 1) return flat[0]!
  return { type: 'concat', parts: flat }
}

/** Increase indent by `n` for the inner doc. */
export function nest(n: number, doc: Doc): Doc {
  return { type: 'nest', indent: n, doc }
}

/** Try to render `doc` flat (on one line). If it doesn't fit, break. */
export function group(doc: Doc): Doc {
  return { type: 'group', doc }
}

/** Render `broken` when the enclosing Group breaks, `flat` when it fits. */
export function ifBreak(broken: Doc, flat: Doc): Doc {
  return { type: 'ifBreak', broken, flat }
}

// ---------------------------------------------------------------------------
// Convenience combinators
// ---------------------------------------------------------------------------

/** Join docs with a separator between each pair. */
export function join(sep: Doc, docs: Doc[]): Doc {
  if (docs.length === 0) return text('')
  const parts: Doc[] = [docs[0]!]
  for (let i = 1; i < docs.length; i++) {
    parts.push(sep, docs[i]!)
  }
  return concat(...parts)
}

/** Trailing comma when the enclosing group breaks, nothing when flat. */
export const trailingComma: Doc = ifBreak(text(','), text(''))

// ---------------------------------------------------------------------------
// Renderer — Wadler-Lindig "best fit"
// ---------------------------------------------------------------------------

/** Mode of a command on the rendering stack. */
const FLAT = 0
const BREAK = 1
type Mode = typeof FLAT | typeof BREAK

/** A command on the rendering stack: [indent, mode, doc]. */
type Cmd = [number, Mode, Doc]

/**
 * Render a Doc tree to a string.
 *
 * Uses the Wadler-Lindig "best fit" algorithm: a stack-based traversal
 * that decides, for each Group, whether to print it flat or broken.
 *
 * @param doc The document tree to render.
 * @param width Target line width (default 80).
 */
export function render(doc: Doc, width = 80): string {
  const output: string[] = []
  let pos = 0 // current column position
  const stack: Cmd[] = [[0, BREAK, doc]]

  while (stack.length > 0) {
    const cmd = stack.pop()!
    const [indent, mode, d] = cmd

    switch (d.type) {
      case 'text':
        output.push(d.text)
        pos += d.text.length
        break

      case 'line':
        if (mode === FLAT) {
          output.push(' ')
          pos += 1
        } else {
          output.push(`\n${' '.repeat(indent)}`)
          pos = indent
        }
        break

      case 'softline':
        if (mode === FLAT) {
          // nothing
        } else {
          output.push(`\n${' '.repeat(indent)}`)
          pos = indent
        }
        break

      case 'hardline':
        output.push(`\n${' '.repeat(indent)}`)
        pos = indent
        break

      case 'lineComment':
        output.push(d.text)
        output.push(`\n${' '.repeat(indent)}`)
        pos = indent
        break

      case 'concat':
        // Push in reverse order so the first part is processed first
        for (let i = d.parts.length - 1; i >= 0; i--) {
          stack.push([indent, mode, d.parts[i]!])
        }
        break

      case 'nest':
        stack.push([indent + d.indent, mode, d.doc])
        break

      case 'group':
        if (fits(width - pos, [[indent, FLAT, d.doc]])) {
          stack.push([indent, FLAT, d.doc])
        } else {
          stack.push([indent, BREAK, d.doc])
        }
        break

      case 'ifBreak':
        if (mode === BREAK) {
          stack.push([indent, mode, d.broken])
        } else {
          stack.push([indent, mode, d.flat])
        }
        break
    }
  }

  return output.join('')
}

/**
 * Check if a document fits within `remaining` columns when rendered flat.
 * Stops early on encountering a HardLine or LineComment (never fits flat).
 */
function fits(remaining: number, stack: Cmd[]): boolean {
  let rem = remaining
  while (stack.length > 0 && rem >= 0) {
    const [indent, mode, d] = stack.pop()!

    switch (d.type) {
      case 'text':
        rem -= d.text.length
        break

      case 'line':
        if (mode === FLAT) {
          rem -= 1 // space
        } else {
          return true // line break → fits
        }
        break

      case 'softline':
        // In flat mode: nothing (0 width). In break mode: newline → fits.
        if (mode === BREAK) return true
        break

      case 'hardline':
        return false // hard breaks never fit flat

      case 'lineComment':
        return false // line comments force a break

      case 'concat':
        for (let i = d.parts.length - 1; i >= 0; i--) {
          stack.push([indent, mode, d.parts[i]!])
        }
        break

      case 'nest':
        stack.push([indent + d.indent, mode, d.doc])
        break

      case 'group':
        // In fits(), groups are always tried flat
        stack.push([indent, FLAT, d.doc])
        break

      case 'ifBreak':
        if (mode === BREAK) {
          stack.push([indent, mode, d.broken])
        } else {
          stack.push([indent, mode, d.flat])
        }
        break
    }
  }

  return rem >= 0
}
