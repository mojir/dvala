// Pure-function support for the "extract function" refactor (LS Q4
// code-actions track). Given the source text + the selected span + the
// list of free variables the selection references, produces:
//   1. A `let extracted = (<free vars>) -> do <selection> end` definition
//      inserted above the line containing the selection.
//   2. A replacement of the selection with `extracted(<free vars>)`.
//
// Free-variable analysis is the caller's job — it lives in the backend
// where the symbol table and scope ranges are available. Keeping the
// helper pure means the edit-shape concerns (indent preservation,
// single-line vs multi-line selection, body wrapping) are testable in
// isolation without dragging in the workspace index.
//
// Same shape convention as the other extract / inline helpers in this
// directory. Promotes to `dvala-core-tooling/src/shared/` once the
// playground LS client lands.

const DEFAULT_NAME = 'extracted'

export interface ExtractFunctionInputs {
  source: string
  // 1-based inclusive start, 1-based exclusive end. The span the user
  // selected. The function body wraps this text as-is.
  selectionStartLine: number
  selectionStartColumn: number
  selectionEndLine: number
  selectionEndColumn: number
  // Names that the selection references but doesn't declare itself — they
  // become the new function's parameters AND the call arguments. Order
  // determines the param order (typically appearance order in the body).
  freeVars: readonly string[]
}

export interface ExtractFunctionEdits {
  letInsertion: TextEditShape
  selectionReplacement: TextEditShape
  defaultName: string
}

interface TextEditShape {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  newText: string
}

/**
 * Compute the two edits that move the selection into a new function.
 * Returns null when the selection is malformed (zero or negative width).
 *
 * v1 limitations:
 *   - Selection must have non-zero width — wrapping an empty range is
 *     meaningless.
 *   - Multi-line selections preserve the original line breaks verbatim
 *     inside the `do … end` body. The caller is responsible for ensuring
 *     the selection covers complete statements; partial-statement
 *     selections produce syntactically broken extractions.
 *   - The new function is inserted directly above the selection's first
 *     line. For a selection nested deep inside a function body, the
 *     extracted function ends up locally scoped — which is fine for v1
 *     but may not match the user's mental model of "module-level helper."
 *     Move-up refinement is a v2 polish.
 */
export function computeExtractFunctionEdit(inputs: ExtractFunctionInputs): ExtractFunctionEdits | null {
  if (
    inputs.selectionEndLine < inputs.selectionStartLine ||
    (inputs.selectionEndLine === inputs.selectionStartLine && inputs.selectionEndColumn <= inputs.selectionStartColumn)
  ) {
    return null
  }
  const lines = inputs.source.split('\n')
  const selectionStartLineIndex = inputs.selectionStartLine - 1
  if (selectionStartLineIndex < 0 || selectionStartLineIndex >= lines.length) return null

  const selectionStartLineText = lines[selectionStartLineIndex]!
  const indentMatch = /^\s*/.exec(selectionStartLineText)
  const indent = indentMatch ? indentMatch[0] : ''

  // Extract the selected text spanning one or more lines.
  const selectionText = sliceSelection(
    lines,
    inputs.selectionStartLine,
    inputs.selectionStartColumn,
    inputs.selectionEndLine,
    inputs.selectionEndColumn,
  )

  const paramList = inputs.freeVars.join(', ')
  const argList = inputs.freeVars.join(', ')

  // The `do …` block makes the selection-as-statements wrapping
  // unambiguous even when the user selects a single expression. The body
  // is indented one level beyond the new let line.
  const bodyIndent = `${indent}  `
  // Re-indent every body line so the wrapped block reads cleanly. The
  // selection's first line has indent stripped (we'll re-add bodyIndent);
  // subsequent lines keep their relative indent if they match the
  // selection's starting indent, else they're left as-is.
  const bodyText = indentBody(selectionText, bodyIndent)

  const letInsertion: TextEditShape = {
    startLine: inputs.selectionStartLine,
    startColumn: 1,
    endLine: inputs.selectionStartLine,
    endColumn: 1,
    newText: `${indent}let ${DEFAULT_NAME} = (${paramList}) -> do\n${bodyText}\n${indent}end;\n`,
  }
  const selectionReplacement: TextEditShape = {
    startLine: inputs.selectionStartLine,
    startColumn: inputs.selectionStartColumn,
    endLine: inputs.selectionEndLine,
    endColumn: inputs.selectionEndColumn,
    newText: `${DEFAULT_NAME}(${argList})`,
  }

  return { letInsertion, selectionReplacement, defaultName: DEFAULT_NAME }
}

function sliceSelection(
  lines: readonly string[],
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): string {
  if (startLine === endLine) {
    return lines[startLine - 1]!.slice(startColumn - 1, endColumn - 1)
  }
  const parts: string[] = []
  parts.push(lines[startLine - 1]!.slice(startColumn - 1))
  for (let i = startLine; i < endLine - 1; i++) {
    parts.push(lines[i]!)
  }
  parts.push(lines[endLine - 1]!.slice(0, endColumn - 1))
  return parts.join('\n')
}

/**
 * Re-indent multi-line body text. Strips the original leading whitespace
 * on the first line (it's about to be prefixed with `bodyIndent`) and
 * applies `bodyIndent` to every line of the body. Internal blank lines
 * are preserved without forced indent.
 */
function indentBody(body: string, bodyIndent: string): string {
  const lines = body.split('\n')
  return lines
    .map(line => {
      const trimmed = line.trimStart()
      if (trimmed === '') return ''
      return `${bodyIndent}${trimmed}`
    })
    .join('\n')
}

export const EXTRACT_FUNCTION_DEFAULT_NAME = DEFAULT_NAME
