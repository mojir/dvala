// Pure adapter helpers that turn the backend's flat selection-range chains
// into the linked tree shape VS Code's `SelectionRangeProvider` expects.
// Kept free of `vscode` imports so the index-alignment logic that's easy
// to break (multi-cursor + empty chain) is unit-testable without the
// editor mocks.
//
// Lifted out of `extension.ts` (LS Q4 — selection range PR #233) as the
// first step toward the shared-LS-helpers move planned in Phase 3 of
// `design/active/2026-04-26_playground-monaco-tree-ls-cli.md`. Once the
// playground LS client lands, this helper becomes a candidate for
// promotion to `dvala-core-tooling/src/shared/`.

interface BackendRangeShape {
  readonly startLine: number
  readonly startColumn: number
  readonly endLine: number
  readonly endColumn: number
}

interface BackendCursor {
  readonly line: number
  readonly column: number
}

/**
 * A linked range — `parent` points outward, matching VS Code's
 * `SelectionRange.parent` convention. The adapter wraps each level into a
 * `vscode.SelectionRange` afterwards; the linking itself happens here in
 * plain-data form so it's testable.
 */
export interface LinkedSelectionRange extends BackendRangeShape {
  readonly parent: LinkedSelectionRange | undefined
}

/**
 * For each requested cursor, link the chain (innermost → outermost) into a
 * nested structure. An empty chain — the cursor falls outside any AST
 * node, e.g. on a blank line — produces a zero-width range anchored at the
 * cursor *for that index*, not for index 0. Getting the index right is the
 * thing this helper exists to guarantee.
 */
export function linkSelectionRangeChains(
  chains: readonly (readonly BackendRangeShape[])[],
  cursors: readonly BackendCursor[],
): LinkedSelectionRange[] {
  return chains.map((chain, chainIndex) => {
    if (chain.length === 0) {
      const cursor = cursors[chainIndex]
      if (!cursor) {
        throw new Error(`linkSelectionRangeChains: missing cursor for chain index ${chainIndex}`)
      }
      return {
        startLine: cursor.line,
        startColumn: cursor.column,
        endLine: cursor.line,
        endColumn: cursor.column,
        parent: undefined,
      }
    }
    let parent: LinkedSelectionRange | undefined
    for (let i = chain.length - 1; i >= 0; i--) {
      parent = { ...chain[i]!, parent }
    }
    // `parent` is the innermost — chain.length > 0 guarantees the assignment ran.
    return parent!
  })
}
