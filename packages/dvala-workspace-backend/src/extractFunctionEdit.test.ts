import { describe, expect, it } from 'vitest'

import { computeExtractFunctionEdit, EXTRACT_FUNCTION_DEFAULT_NAME } from './extractFunctionEdit'

describe('computeExtractFunctionEdit', () => {
  it('wraps a single-line selection with no free vars into a parameterless function', () => {
    const source = 'let answer = 1 + 2;'
    const edits = computeExtractFunctionEdit({
      source,
      selectionStartLine: 1,
      selectionStartColumn: 14,
      selectionEndLine: 1,
      selectionEndColumn: 19,
      freeVars: [],
    })

    expect(edits).not.toBeNull()
    expect(edits!.letInsertion.newText).toBe(`let ${EXTRACT_FUNCTION_DEFAULT_NAME} = () -> do\n  1 + 2\nend;\n`)
    expect(edits!.selectionReplacement).toEqual({
      startLine: 1,
      startColumn: 14,
      endLine: 1,
      endColumn: 19,
      newText: `${EXTRACT_FUNCTION_DEFAULT_NAME}()`,
    })
  })

  it('threads free variables through both the params and the call args', () => {
    const source = 'let f = (x, y) -> x + y'
    const edits = computeExtractFunctionEdit({
      source,
      selectionStartLine: 1,
      selectionStartColumn: 19,
      selectionEndLine: 1,
      selectionEndColumn: 24,
      freeVars: ['x', 'y'],
    })

    expect(edits?.letInsertion.newText).toBe(`let ${EXTRACT_FUNCTION_DEFAULT_NAME} = (x, y) -> do\n  x + y\nend;\n`)
    expect(edits?.selectionReplacement.newText).toBe(`${EXTRACT_FUNCTION_DEFAULT_NAME}(x, y)`)
  })

  it('preserves the enclosing indent when the selection lives inside a do block', () => {
    const source = 'let f = (x) -> do\n  let answer = compute(x);\n  answer\nend'
    const edits = computeExtractFunctionEdit({
      source,
      // Select `compute(x)` on line 2 (single-line, mid-statement).
      selectionStartLine: 2,
      selectionStartColumn: 16,
      selectionEndLine: 2,
      selectionEndColumn: 26,
      freeVars: ['x'],
    })

    // Indent of line 2 is two spaces; the let inserts at that level, with
    // the body indented one more.
    expect(edits?.letInsertion.newText).toBe(
      `  let ${EXTRACT_FUNCTION_DEFAULT_NAME} = (x) -> do\n    compute(x)\n  end;\n`,
    )
  })

  it('handles multi-line selections by preserving internal line breaks', () => {
    const source = ['let f = (x) -> do', '  let a = x + 1;', '  let b = a * 2;', '  b', 'end'].join('\n')
    const edits = computeExtractFunctionEdit({
      source,
      // Select the two let statements on lines 2-3.
      selectionStartLine: 2,
      selectionStartColumn: 3,
      selectionEndLine: 3,
      selectionEndColumn: 18,
      freeVars: ['x'],
    })

    expect(edits?.letInsertion.newText).toMatch(/let extracted = \(x\) -> do/)
    expect(edits?.letInsertion.newText).toContain('let a = x + 1;')
    expect(edits?.letInsertion.newText).toContain('let b = a * 2;')
  })

  it('returns null when the selection has zero or negative width', () => {
    const edits = computeExtractFunctionEdit({
      source: 'let x = 1',
      selectionStartLine: 1,
      selectionStartColumn: 5,
      selectionEndLine: 1,
      selectionEndColumn: 5,
      freeVars: [],
    })

    expect(edits).toBeNull()
  })
})
