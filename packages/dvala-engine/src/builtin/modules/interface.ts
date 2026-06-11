export const MODULE_DESCRIPTION_MAX_LENGTH = 120

import type { BuiltinNormalExpressions, FunctionDocs } from '../interface'
import type { AstNode, SourceMap } from '@mojir/dvala-types'

/**
 * Represents a Dvala module that can be imported dynamically.
 * Modules contain a collection of functions that are not part of the core bundle.
 */
export interface DvalaModule {
  /** The name of the module (e.g., 'grid', 'vec', 'mat') */
  name: string
  /** Short description of what the module provides (max 120 chars). */
  description: string
  /** The functions provided by this module, keyed by their short name (e.g., 'transpose') */
  functions: BuiltinNormalExpressions
  /**
   * Optional Dvala source code that is evaluated at import time.
   * The source must evaluate to an object mapping function names to functions.
   * These are merged with (and may override) the TypeScript `functions`.
   */
  source?: string
  /**
   * Repo-relative path of the `.dvala` file `source` was loaded from
   * (e.g. `packages/dvala-engine/src/builtin/modules/math/math.dvala`). Used only
   * for `.dvala` coverage attribution — lets a `source` node's source-map position
   * resolve back to its file (the module `name` is camelCase and can't be mapped to
   * the kebab-case filename reliably). Optional; omit for user modules.
   */
  sourcePath?: string
  /**
   * Docs for all functions in this module, including any defined in `source`.
   * The reference system uses this record as the sole source of truth for
   * function names and documentation. Not required for user-defined modules.
   */
  docs?: Record<string, FunctionDocs>
  /** @internal Cached parsed AST nodes for the module source. */
  _cachedNodes?: AstNode[]
  /**
   * @internal Coverage-mode parse cache. Under `.dvala` coverage the module body
   * is parsed ONCE per process with a dedicated negative node-ID range (so it can
   * never collide with an instance's own >= 0 IDs) and reused across every
   * instance — both the nodes and the source map are shared read-only. Distinct
   * from `_cachedNodes`, which is the cheap non-coverage parse with no source map.
   */
  _coverageNodes?: AstNode[]
  /** @internal Source map for `_coverageNodes` (negative node IDs → file positions). */
  _coverageSourceMap?: SourceMap
}

/**
 * Derives a docs record from a BuiltinNormalExpressions map.
 * Use this for modules whose docs are co-located inline on each function.
 */
export function moduleDocsFromFunctions(functions: BuiltinNormalExpressions): Record<string, FunctionDocs> {
  return Object.fromEntries(
    Object.entries(functions).map(([k, v]) => {
      if (!v.docs) throw new Error(`Missing docs for function "${k}"`)
      return [k, v.docs]
    }),
  )
}
