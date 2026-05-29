/**
 * Dvala Type System — Set-Theoretic with Algebraic Subtyping
 *
 * Step 1: Core type algebra (types, subtyping, simplification)
 * Step 2: Simple-sub inference engine (constraint generation, solving)
 */

export { typeToString } from './types'
export { simplify } from './simplify'
export { expandTypeForDisplay, sanitizeDisplayType } from './infer'
