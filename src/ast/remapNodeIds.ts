import type { Ast, AstNode, SourceMap, SourceMapPosition } from '../parser/types'

/**
 * Remap all node IDs in an AST by adding an offset.
 * Used when merging independently-built bundles to avoid node ID collisions.
 *
 * Returns a new AST with remapped node IDs and a remapped source map.
 * The original AST is not modified.
 */
export function remapNodeIds(ast: Ast, offset: number): Ast {
  const body = ast.body.map(node => remapNode(node, offset))
  const sourceMap = ast.sourceMap ? remapSourceMap(ast.sourceMap, offset) : undefined
  return { body, sourceMap }
}

function remapNode(node: AstNode, offset: number): AstNode {
  const [type, payload, nodeId] = node
  const newId = nodeId === 0 ? 0 : nodeId + offset // preserve 0 sentinel for synthesized nodes
  const newPayload = remapPayload(payload, offset)
  return [type, newPayload, newId]
}

// Recursively remap node IDs in payload — payloads can contain nested AST nodes
function remapPayload(payload: unknown, offset: number): unknown {
  if (payload === null || payload === undefined)
    return payload
  if (typeof payload !== 'object')
    return payload

  // AstNode: [string, unknown, number] — check if it looks like a node
  if (Array.isArray(payload)) {
    if (isAstNode(payload)) {
      return remapNode(payload as AstNode, offset)
    }
    return payload.map(item => remapPayload(item, offset))
  }

  // Plain object — remap values. Today the only plain-object payload that
  // flows through `remapPayload` is `ObjectBindingEntry` (`{ key, keyNodeId,
  // target }`) from an object binding target — the runtime otherwise
  // represents AST nodes as arrays. `keyNodeId` points into the source map
  // and must be offset like any other node id; generic recursion would
  // leave it untouched because plain numbers aren't treated as payloads.
  // Guard by the ObjectBindingEntry shape before offsetting to reduce the
  // risk of silently re-interpreting an unrelated field named `keyNodeId`
  // on a future payload type.
  const obj = payload as Record<string, unknown>
  const isObjectBindingEntry = typeof obj.key === 'string'
    && typeof obj.keyNodeId === 'number'
    && obj.target !== undefined
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isObjectBindingEntry && key === 'keyNodeId' && typeof value === 'number') {
      result[key] = value === 0 ? 0 : value + offset
    } else {
      result[key] = remapPayload(value, offset)
    }
  }
  return result
}

// Heuristic: an AST node is a 3-tuple [string, unknown, number]
function isAstNode(arr: unknown[]): boolean {
  return arr.length === 3 && typeof arr[0] === 'string' && typeof arr[2] === 'number'
}

function remapSourceMap(sourceMap: SourceMap, offset: number): SourceMap {
  const positions = new Map<number, SourceMapPosition>()
  for (const [nodeId, pos] of sourceMap.positions) {
    const newId = nodeId === 0 ? 0 : nodeId + offset
    positions.set(newId, pos)
  }
  return { sources: [...sourceMap.sources], positions }
}
