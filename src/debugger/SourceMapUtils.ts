import type { AstNode, SourceMap } from '../parser/types'

/**
 * Source map utilities for debugger frontends.
 * Resolves AST node positions from the source map — shared by VS Code DAP adapter,
 * playground debugger, and any future debug frontend.
 */

/** Resolve a node's source file path from the source map. */
export function getNodeFile(node: AstNode, sourceMap: SourceMap): string | null {
  const pos = sourceMap.positions.get(node[2])
  if (!pos) return null
  return sourceMap.sources[pos.source]?.path ?? null
}

/** Resolve a node's 0-based start line from the source map. */
export function getNodeLine(node: AstNode, sourceMap: SourceMap): number | null {
  const pos = sourceMap.positions.get(node[2])
  if (!pos) return null
  return pos.start[0]
}

/** Resolve a node's 0-based end line from the source map. */
export function getNodeEndLine(node: AstNode, sourceMap: SourceMap): number | null {
  const pos = sourceMap.positions.get(node[2])
  if (!pos) return null
  return pos.end[0]
}

/**
 * Find the first evaluatable node ID on a given line in a given file.
 * Skips structuralLeaf nodes (Sym, Builtin, etc.) since the evaluator's
 * onNodeEval hook never visits them — setting a breakpoint on one would never fire.
 * DAP lines are 1-based, source map positions are 0-based.
 * Returns null if no node found on that line.
 */
export function findNodeIdForLine(line: number, filePath: string, sourceMap: SourceMap): number | null {
  const line0 = line - 1 // convert 1-based to source map 0-based
  let bestNodeId: number | null = null
  let bestCol = Infinity

  for (const [nodeId, pos] of sourceMap.positions) {
    // Skip leaf nodes that onNodeEval never visits
    if (pos.structuralLeaf) continue

    // Match source file by path
    const source = sourceMap.sources[pos.source]
    if (source && source.path !== filePath) continue

    if (pos.start[0] === line0 && pos.start[1] < bestCol) {
      bestNodeId = nodeId
      bestCol = pos.start[1]
    }
  }
  return bestNodeId
}
