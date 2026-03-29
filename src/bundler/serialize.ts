import type { AstNode, SourceMap, SourceMapPosition } from '../parser/types'
import type { DvalaBundle } from './interface'

/**
 * Serialized bundle format for JSON storage.
 * Maps are converted to arrays of [key, value] pairs.
 */
interface SerializedBundle {
  version: 1
  ast: {
    body: unknown[]
    sourceMap?: {
      sources: { path: string; content: string }[]
      positions: [number, SourceMapPosition][]
    }
  }
}

/** Serialize a DvalaBundle to a JSON string. Converts Map to array of entries. */
export function serializeBundle(bundle: DvalaBundle): string {
  const serialized: SerializedBundle = {
    version: bundle.version,
    ast: {
      body: bundle.ast.body,
      sourceMap: bundle.ast.sourceMap
        ? {
          sources: bundle.ast.sourceMap.sources,
          positions: [...bundle.ast.sourceMap.positions.entries()],
        }
        : undefined,
    },
  }
  return JSON.stringify(serialized, null, 2)
}

/** Deserialize a parsed JSON object back to a DvalaBundle. Returns null if invalid. */
export function deserializeBundle(parsed: unknown): DvalaBundle | null {
  if (typeof parsed !== 'object' || parsed === null)
    return null

  const obj = parsed as Record<string, unknown>
  if (obj.version !== 1)
    return null

  const ast = obj.ast as Record<string, unknown> | undefined
  if (!ast || !Array.isArray(ast.body))
    return null

  let sourceMap: SourceMap | undefined
  const rawSourceMap = ast.sourceMap as { sources?: unknown[]; positions?: unknown[] } | undefined
  if (rawSourceMap && Array.isArray(rawSourceMap.sources) && Array.isArray(rawSourceMap.positions)) {
    sourceMap = {
      sources: rawSourceMap.sources as { path: string; content: string }[],
      positions: new Map(rawSourceMap.positions as [number, SourceMapPosition][]),
    }
  }

  return {
    version: 1,
    ast: {
      body: ast.body as AstNode[],
      sourceMap,
    },
  }
}
