// Pure-function support for the "inline variable" refactor (LS Q4
// code-actions track). Given the source text + the `let` declaration's
// range + the value expression's text + every reference location, produces
// the edits that:
//   1. Replace each reference with the value-expression text.
//   2. Remove the `let` declaration's entire line (the binding is gone).
//
// The caller is responsible for the upstream AST work: finding the let
// binding at the cursor, extracting its value text from the source, and
// collecting every reference. This helper just does the source-text
// rewriting, so the boundary cases (let on its own line vs. mid-statement,
// reference within an expression vs. as a whole statement) are unit-
// testable without WorkspaceIndex / typechecker plumbing.
//
// Same shape as `catchallQuickFix.ts` / `extractVariableEdit.ts` — free of
// backend imports. Promotes to `dvala-core-tooling/src/shared/` when the
// playground LS client lands.

export interface InlineVariableInputs {
  source: string
  // Range of the `let` declaration to remove (1-based, inclusive start,
  // exclusive end). For `let x = 42;` on line N the range is (N, 1) →
  // (N+1, 1) — i.e. start of the line through start of the next line —
  // so removing the range deletes the whole line including its newline.
  // The caller computes this from the let's sourceMap entry.
  letRemoveStartLine: number
  letRemoveStartColumn: number
  letRemoveEndLine: number
  letRemoveEndColumn: number
  // Value expression text — what gets substituted in at each reference.
  // The caller slices this from the source using the value node's range.
  valueText: string
  // Where the binding is referenced. Each entry is the reference's
  // (line, column, length) — same shape the symbol table emits.
  references: readonly InlineReferenceLocation[]
}

export interface InlineReferenceLocation {
  line: number // 1-based
  column: number // 1-based
  length: number
}

export interface InlineVariableEditShape {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  newText: string
}

/**
 * Compute the edits to inline the variable. Returns the let-removal edit
 * first, followed by each reference-replacement edit. The order doesn't
 * matter for the editor (VS Code applies WorkspaceEdit edits
 * atomically), but consistent ordering helps tests assert against the
 * shape directly.
 *
 * Returns null if no references exist — there's nothing to inline if the
 * binding isn't used anywhere; the user probably wants "remove unused
 * variable" instead, which is a different refactor.
 */
export function computeInlineVariableEdits(inputs: InlineVariableInputs): InlineVariableEditShape[] | null {
  if (inputs.references.length === 0) return null

  // If the value expression is non-trivial (contains an operator, a call,
  // etc.) we wrap it in parens at each reference site to preserve
  // precedence. Simple identifiers and literals don't need parens.
  const needsParens = isNonTrivialExpression(inputs.valueText)
  const wrappedValue = needsParens ? `(${inputs.valueText})` : inputs.valueText

  const edits: InlineVariableEditShape[] = []
  edits.push({
    startLine: inputs.letRemoveStartLine,
    startColumn: inputs.letRemoveStartColumn,
    endLine: inputs.letRemoveEndLine,
    endColumn: inputs.letRemoveEndColumn,
    newText: '',
  })
  for (const ref of inputs.references) {
    edits.push({
      startLine: ref.line,
      startColumn: ref.column,
      endLine: ref.line,
      endColumn: ref.column + ref.length,
      newText: wrappedValue,
    })
  }
  return edits
}

/**
 * Crude precedence heuristic — treat anything that isn't a plain
 * identifier or numeric/string literal as "non-trivial" and wrap it in
 * parens at each use site. False positives are harmless (extra parens);
 * false negatives can corrupt precedence (e.g. `let x = a + b; x * 2`
 * inlined without parens becomes `a + b * 2` which evaluates wrong). So
 * we err on the side of wrapping.
 */
function isNonTrivialExpression(text: string): boolean {
  const trimmed = text.trim()
  // Bare identifier (Dvala JS-style).
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) return false
  // Plain numeric literal (with optional sign already factored out, since
  // a unary `-` does change precedence — `-x` and `x` need different
  // wrappers when inlined into an expression).
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(trimmed)) return false
  // Plain string literal (no embedded `${...}` interpolation — template
  // literals can hide arbitrary expressions, treat as non-trivial).
  if (/^"[^"\\$]*"$/.test(trimmed)) return false
  return true
}
