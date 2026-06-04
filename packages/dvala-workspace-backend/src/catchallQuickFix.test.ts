import { describe, expect, it } from 'vitest'

import { CATCHALL_INSERT_TEXT, computeCatchallEdit, type MatchNodeRange } from './catchallQuickFix'

describe('computeCatchallEdit', () => {
  it('inserts a catchall before the closing end with two-space indent past the end line', () => {
    const source = ['let classify = (n: Number) -> match n', '  case 0 then 0', '  case 1 then 1', 'end'].join('\n')
    // The match's `end` keyword starts at column 1 of line 4; the exclusive
    // end is one past `d` → column 4.
    const matchRange: MatchNodeRange = { endLine: 4, endColumn: 4 }

    const edit = computeCatchallEdit(source, matchRange)

    expect(edit).toEqual({
      startLine: 4,
      startColumn: 1,
      endLine: 4,
      endColumn: 1,
      newText: `  ${CATCHALL_INSERT_TEXT}\n`,
    })
  })

  it('preserves outer indent when the match is nested', () => {
    const source = ['let f = (n: Number) -> do', '  match n', '    case 0 then 0', '  end', 'end'].join('\n')
    // The inner match's `end` is on line 4, indented 2 spaces. Catchall
    // indent should be 4 (the end line's 2 + 2 more).
    const matchRange: MatchNodeRange = { endLine: 4, endColumn: 6 } // "  end" → end at columns 3-5, exclusive end column 6

    const edit = computeCatchallEdit(source, matchRange)

    expect(edit).toEqual({
      startLine: 4,
      startColumn: 1,
      endLine: 4,
      endColumn: 1,
      newText: `    ${CATCHALL_INSERT_TEXT}\n`,
    })
  })

  it('returns null when the source does not contain `end` at the expected position', () => {
    // Source/sourceMap out of sync: the match range claims `end` is at line
    // 2 column 4, but the actual line has different text. Defensive bail.
    const source = ['match n', 'case 0 then 0', 'something_else'].join('\n')
    const matchRange: MatchNodeRange = { endLine: 3, endColumn: 4 }

    const edit = computeCatchallEdit(source, matchRange)

    expect(edit).toBeNull()
  })

  it('returns null when endLine is out of range', () => {
    const source = 'match n\n  case 0 then 0\nend'
    const matchRange: MatchNodeRange = { endLine: 99, endColumn: 4 }

    const edit = computeCatchallEdit(source, matchRange)

    expect(edit).toBeNull()
  })

  it('returns null when endColumn is too small to contain `end`', () => {
    const source = 'match n\nend'
    // Bogus endColumn — `end` is at columns 1-3, exclusive end 4. Anything
    // less than 4 means we couldn't possibly have `end` ending there.
    const matchRange: MatchNodeRange = { endLine: 2, endColumn: 2 }

    const edit = computeCatchallEdit(source, matchRange)

    expect(edit).toBeNull()
  })

  it('handles tab-indented source by preserving the tab + adding two spaces', () => {
    const source = ['match n', '\tcase 0 then 0', '\tend'].join('\n')
    const matchRange: MatchNodeRange = { endLine: 3, endColumn: 5 } // `\tend` → end at columns 2-4, exclusive 5

    const edit = computeCatchallEdit(source, matchRange)

    expect(edit?.newText).toBe(`\t  ${CATCHALL_INSERT_TEXT}\n`)
  })
})
