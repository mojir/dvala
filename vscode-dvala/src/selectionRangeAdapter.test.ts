import { describe, expect, it } from 'vitest'

import { linkSelectionRangeChains, type LinkedSelectionRange } from './selectionRangeAdapter'

describe('linkSelectionRangeChains', () => {
  it('links a single chain innermost → outermost via parent pointers', () => {
    const chains = [
      [
        { startLine: 1, startColumn: 9, endLine: 1, endColumn: 10 }, // `1` literal
        { startLine: 1, startColumn: 9, endLine: 1, endColumn: 14 }, // `1 + 2`
        { startLine: 1, startColumn: 1, endLine: 1, endColumn: 14 }, // `let x = 1 + 2`
      ],
    ]
    const cursors = [{ line: 1, column: 9 }]

    const result = linkSelectionRangeChains(chains, cursors)

    expect(result).toHaveLength(1)
    const innermost = result[0]!
    expect(innermost).toMatchObject({ startColumn: 9, endColumn: 10 })
    expect(innermost.parent).toMatchObject({ startColumn: 9, endColumn: 14 })
    expect(innermost.parent?.parent).toMatchObject({ startColumn: 1, endColumn: 14 })
    expect(innermost.parent?.parent?.parent).toBeUndefined()
  })

  it('falls back to a zero-width range at the cursor when the chain is empty', () => {
    const result = linkSelectionRangeChains([[]], [{ line: 3, column: 7 }])

    expect(result).toEqual<LinkedSelectionRange[]>([
      { startLine: 3, startColumn: 7, endLine: 3, endColumn: 7, parent: undefined },
    ])
  })

  // The bug this PR fixes: multi-cursor request, one chain empty, the
  // adapter previously used `positions[0]` for every empty chain because
  // it discarded the map index. The empty-chain anchor must come from the
  // cursor at the same index as the empty chain.
  it('anchors an empty chain at cursors[i], not cursors[0] (multi-cursor)', () => {
    const chains = [
      [{ startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 }],
      [], // empty — must anchor at cursors[1], NOT cursors[0]
      [{ startLine: 3, startColumn: 5, endLine: 3, endColumn: 9 }],
    ]
    const cursors = [
      { line: 1, column: 1 },
      { line: 2, column: 10 },
      { line: 3, column: 5 },
    ]

    const result = linkSelectionRangeChains(chains, cursors)

    expect(result).toHaveLength(3)
    expect(result[1]).toEqual<LinkedSelectionRange>({
      startLine: 2,
      startColumn: 10,
      endLine: 2,
      endColumn: 10,
      parent: undefined,
    })
  })

  it('returns an empty array when no chains are provided', () => {
    expect(linkSelectionRangeChains([], [])).toEqual([])
  })

  it('throws when a chain has no matching cursor (defensive — should never happen in practice)', () => {
    expect(() => linkSelectionRangeChains([[]], [])).toThrow(/missing cursor/)
  })
})
