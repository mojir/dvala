import { describe, expect, it } from 'vitest'

import { computeExtractVariableEdit, EXTRACT_VARIABLE_DEFAULT_NAME } from './extractVariableEdit'

describe('computeExtractVariableEdit', () => {
  it('inserts the let declaration before the statement and replaces the expression with the new name', () => {
    const source = 'let answer = 1 + 2;'
    const edits = computeExtractVariableEdit({
      source,
      expressionStartLine: 1,
      expressionStartColumn: 14, // start of `1 + 2`
      expressionEndLine: 1,
      expressionEndColumn: 19, // exclusive end past `2`
      statementStartLine: 1,
      statementStartColumn: 1,
    })

    expect(edits).not.toBeNull()
    expect(edits!.letInsertion).toEqual({
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
      newText: `let ${EXTRACT_VARIABLE_DEFAULT_NAME} = 1 + 2;\n`,
    })
    expect(edits!.expressionReplacement).toEqual({
      startLine: 1,
      startColumn: 14,
      endLine: 1,
      endColumn: 19,
      newText: EXTRACT_VARIABLE_DEFAULT_NAME,
    })
  })

  it('preserves the enclosing statement indent', () => {
    const source = 'let f = (x) -> do\n  let answer = 1 + 2;\nend'
    const edits = computeExtractVariableEdit({
      source,
      expressionStartLine: 2,
      expressionStartColumn: 16, // start of `1 + 2`
      expressionEndLine: 2,
      expressionEndColumn: 21,
      statementStartLine: 2,
      statementStartColumn: 3, // `let` after 2-space indent
    })

    expect(edits?.letInsertion.newText).toBe(`  let ${EXTRACT_VARIABLE_DEFAULT_NAME} = 1 + 2;\n`)
    expect(edits?.expressionReplacement.startColumn).toBe(16)
  })

  it('returns null when the selection spans multiple lines (v1 limitation)', () => {
    const source = 'let answer = 1 +\n  2'
    const edits = computeExtractVariableEdit({
      source,
      expressionStartLine: 1,
      expressionStartColumn: 14,
      expressionEndLine: 2,
      expressionEndColumn: 4,
      statementStartLine: 1,
      statementStartColumn: 1,
    })

    expect(edits).toBeNull()
  })

  it('returns null when the selection has zero or negative width', () => {
    const edits = computeExtractVariableEdit({
      source: 'let x = 1',
      expressionStartLine: 1,
      expressionStartColumn: 9,
      expressionEndLine: 1,
      expressionEndColumn: 9,
      statementStartLine: 1,
      statementStartColumn: 1,
    })

    expect(edits).toBeNull()
  })

  it('returns null when the statement line is out of source range', () => {
    const edits = computeExtractVariableEdit({
      source: 'let x = 1',
      expressionStartLine: 1,
      expressionStartColumn: 9,
      expressionEndLine: 1,
      expressionEndColumn: 10,
      statementStartLine: 99,
      statementStartColumn: 1,
    })

    expect(edits).toBeNull()
  })
})
