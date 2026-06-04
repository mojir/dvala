// Pure-function support for the "extract variable" refactor (LS Q4
// code-actions track). Given the source text + the expression to extract
// (described by its range and the enclosing statement's range), produces
// the two text edits that:
//   1. Insert `let <name> = <expr>` on a new line before the statement,
//      indented to match the statement.
//   2. Replace the selected expression with `<name>`.
//
// The new variable name is a fixed default; VS Code's after-action rename
// flow lets the user pick a real name. Side-effect analysis is the user's
// responsibility — Dvala doesn't track purity, so extracting an effectful
// expression is on the developer (same convention TS / Rust extract-var
// take).
//
// Kept free of backend / vscode imports for test isolation. Promotes to
// `dvala-core-tooling/src/shared/` once the playground LS client lands.

const DEFAULT_NAME = 'extracted'

export interface ExtractVariableInputs {
  source: string
  // 1-based inclusive start, 1-based exclusive end. The expression range
  // that the user selected (or that the backend identified from a cursor).
  expressionStartLine: number
  expressionStartColumn: number
  expressionEndLine: number
  expressionEndColumn: number
  // The enclosing statement's start position — where the `let` declaration
  // goes. Indent for the new line is sampled from this statement's line.
  statementStartLine: number
  statementStartColumn: number
}

export interface ExtractVariableEdits {
  // Two-edit batch in document order — the `let` insertion comes first
  // (lower line number), the replacement comes second. Both use the
  // portable `{startLine, startColumn, endLine, endColumn, newText}`
  // shape; insertions have start === end.
  letInsertion: TextEditShape
  expressionReplacement: TextEditShape
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
 * Compute the two edits that move the selected expression into a new
 * `let <name> = <expr>` binding above its enclosing statement.
 *
 * Returns null if:
 *   - The selection range doesn't lie within a single line (multi-line
 *     extraction is a future polish; the line-based indent sampling here
 *     assumes the original expression occupies its line on one row).
 *   - The statement's line is out of range.
 *   - The selection is malformed (start after end).
 */
export function computeExtractVariableEdit(inputs: ExtractVariableInputs): ExtractVariableEdits | null {
  if (
    inputs.expressionStartLine !== inputs.expressionEndLine ||
    inputs.expressionEndColumn <= inputs.expressionStartColumn
  ) {
    return null
  }
  const lines = inputs.source.split('\n')
  const statementLineIndex = inputs.statementStartLine - 1
  if (statementLineIndex < 0 || statementLineIndex >= lines.length) return null
  const statementLineText = lines[statementLineIndex]!
  const indentMatch = /^\s*/.exec(statementLineText)
  const indent = indentMatch ? indentMatch[0] : ''

  const expressionText = lines[inputs.expressionStartLine - 1]!.slice(
    inputs.expressionStartColumn - 1,
    inputs.expressionEndColumn - 1,
  )

  const letInsertion: TextEditShape = {
    startLine: inputs.statementStartLine,
    startColumn: 1,
    endLine: inputs.statementStartLine,
    endColumn: 1,
    newText: `${indent}let ${DEFAULT_NAME} = ${expressionText};\n`,
  }
  const expressionReplacement: TextEditShape = {
    startLine: inputs.expressionStartLine,
    startColumn: inputs.expressionStartColumn,
    endLine: inputs.expressionEndLine,
    endColumn: inputs.expressionEndColumn,
    newText: DEFAULT_NAME,
  }

  return { letInsertion, expressionReplacement, defaultName: DEFAULT_NAME }
}

// Re-exported so tests + the backend wiring agree on what name appears
// in the inserted text. Future iterations can grow this to "pick a name
// based on the expression type" (extractedNumber, extractedString, …);
// keeping it a single export here keeps the surface tight.
export const EXTRACT_VARIABLE_DEFAULT_NAME = DEFAULT_NAME
