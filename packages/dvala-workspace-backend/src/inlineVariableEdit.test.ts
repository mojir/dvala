import { describe, expect, it } from 'vitest'

import { computeInlineVariableEdits } from './inlineVariableEdit'

describe('computeInlineVariableEdits', () => {
  it('removes the let and replaces each reference with the value text', () => {
    const edits = computeInlineVariableEdits({
      source: 'let x = 42;\nx + 1\nx * 2',
      letRemoveStartLine: 1,
      letRemoveStartColumn: 1,
      letRemoveEndLine: 2,
      letRemoveEndColumn: 1,
      valueText: '42',
      references: [
        { line: 2, column: 1, length: 1 },
        { line: 3, column: 1, length: 1 },
      ],
    })

    expect(edits).toEqual([
      // First edit removes the entire let line including its trailing newline.
      { startLine: 1, startColumn: 1, endLine: 2, endColumn: 1, newText: '' },
      // Each reference replaced with the value text. Numeric literal — no parens.
      { startLine: 2, startColumn: 1, endLine: 2, endColumn: 2, newText: '42' },
      { startLine: 3, startColumn: 1, endLine: 3, endColumn: 2, newText: '42' },
    ])
  })

  it('wraps non-trivial value expressions in parentheses to preserve precedence', () => {
    const edits = computeInlineVariableEdits({
      source: 'let sum = a + b;\nsum * 2',
      letRemoveStartLine: 1,
      letRemoveStartColumn: 1,
      letRemoveEndLine: 2,
      letRemoveEndColumn: 1,
      valueText: 'a + b',
      references: [{ line: 2, column: 1, length: 3 }],
    })

    expect(edits?.[1]).toEqual({
      startLine: 2,
      startColumn: 1,
      endLine: 2,
      endColumn: 4,
      newText: '(a + b)',
    })
  })

  it('does not wrap a plain identifier value', () => {
    const edits = computeInlineVariableEdits({
      source: 'let alias = x;\nalias + 1',
      letRemoveStartLine: 1,
      letRemoveStartColumn: 1,
      letRemoveEndLine: 2,
      letRemoveEndColumn: 1,
      valueText: 'x',
      references: [{ line: 2, column: 1, length: 5 }],
    })

    expect(edits?.[1]?.newText).toBe('x')
  })

  it('does not wrap a plain string literal value', () => {
    const edits = computeInlineVariableEdits({
      source: 'let greeting = "hi";\ngreeting',
      letRemoveStartLine: 1,
      letRemoveStartColumn: 1,
      letRemoveEndLine: 2,
      letRemoveEndColumn: 1,
      valueText: '"hi"',
      references: [{ line: 2, column: 1, length: 8 }],
    })

    expect(edits?.[1]?.newText).toBe('"hi"')
  })

  it('wraps a template-literal value (could hide arbitrary expressions)', () => {
    const edits = computeInlineVariableEdits({
      source: 'let greeting = `hi ${name}`;\ngreeting',
      letRemoveStartLine: 1,
      letRemoveStartColumn: 1,
      letRemoveEndLine: 2,
      letRemoveEndColumn: 1,
      valueText: '`hi ${name}`',
      references: [{ line: 2, column: 1, length: 8 }],
    })

    expect(edits?.[1]?.newText).toBe('(`hi ${name}`)')
  })

  it('returns null when the binding has no references (nothing to inline)', () => {
    const edits = computeInlineVariableEdits({
      source: 'let unused = 42;',
      letRemoveStartLine: 1,
      letRemoveStartColumn: 1,
      letRemoveEndLine: 2,
      letRemoveEndColumn: 1,
      valueText: '42',
      references: [],
    })

    expect(edits).toBeNull()
  })
})
