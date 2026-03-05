/**
 * Side-effect import: wires up reference data for the `doc` and `arity` builtin functions.
 * Import this module before using `doc()` or `arity()` on built-in functions or effects.
 *
 * In the full entry point (src/full.ts), this is done automatically.
 * In the minimal entry point (src/index.ts), `doc()` returns '' for builtins.
 */
import { effectReference, normalExpressionReference } from '../reference/index'
import { setEffectReference, setNormalExpressionReference } from './builtin/normalExpressions'

setNormalExpressionReference(normalExpressionReference)
setEffectReference(effectReference)
