import type { BuiltinNormalExpressions, FunctionDocs } from '../../builtin/interface'

/**
 * Represents a Dvala module that can be imported dynamically.
 * Modules contain a collection of functions that are not part of the core bundle.
 */
export interface DvalaModule {
  /** The name of the module (e.g., 'grid', 'vec', 'mat') */
  name: string
  /** The functions provided by this module, keyed by their short name (e.g., 'transpose') */
  functions: BuiltinNormalExpressions
  /**
   * Optional Dvala source code that is evaluated at import time.
   * The source must evaluate to an object mapping function names to functions.
   * These are merged with (and may override) the TypeScript `functions`.
   */
  source?: string
  /**
   * Docs for all functions in this module, including any defined in `source`.
   * The reference system uses this record as the sole source of truth for
   * function names and documentation. Not required for user-defined modules.
   */
  docs?: Record<string, FunctionDocs>
}

/**
 * Derives a docs record from a BuiltinNormalExpressions map.
 * Use this for modules whose docs are co-located inline on each function.
 */
export function moduleDocsFromFunctions(functions: BuiltinNormalExpressions): Record<string, FunctionDocs> {
  return Object.fromEntries(
    Object.entries(functions).map(([k, v]) => {
      if (!v.docs)
        throw new Error(`Missing docs for function "${k}"`)
      return [k, v.docs]
    }),
  )
}
