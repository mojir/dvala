/**
 * Constant folding entry point for the type inference engine.
 *
 * Given a direct `Call` to a builtin with all-literal argument types and
 * an empty inferred effect set, synthesize a Call AST whose args are
 * literal nodes, hand it to the fold sandbox, and wrap the runtime result
 * back as a `Literal` type.
 *
 * Phase C v1 scope (primitives only):
 *   - Callee: `NodeTypes.Builtin` references only — user-defined and
 *     module-imported functions come in follow-ups (decision #5, #13).
 *   - Argument types: primitive literals (`Literal` of number/string/boolean),
 *     atoms (`Atom`), and `Null`. Closed tuples and records come in follow-ups
 *     (decision #10).
 *
 * Gate: callers must check `FOLD_ENABLED` before invoking. This file has no
 * knowledge of the toggle — it's pure fold mechanics.
 *
 * See design docs:
 *   - design/active/2026-04-16_constant-folding-in-types.md
 *   - design/active/2026-04-16_builtin-effect-audit.md
 *   - design/active/2026-04-16_fold-toggle-and-differential-tests.md
 */

import { NodeTypes } from '../constants/constants'
import { createContextStack } from '../evaluator/ContextStack'
import { evaluateNodeForFold } from '../evaluator/foldEvaluate'
import type { AstNode } from '../parser/types'
import type { Type } from './types'
import { NullType, literal, atom as atomType } from './types'

/**
 * Reconstruct a literal AST node from an inferred primitive literal type.
 * Returns `null` if the type isn't primitive-reconstructible (e.g. a plain
 * `Number` with no known value, an open record, a function type).
 */
function literalTypeToAstNode(t: Type): AstNode | null {
  if (t.tag === 'Literal') {
    const value = t.value
    if (typeof value === 'number') return [NodeTypes.Num, value, 0] as unknown as AstNode
    if (typeof value === 'string') return [NodeTypes.Str, value, 0] as unknown as AstNode
    if (typeof value === 'boolean') return [NodeTypes.Reserved, value ? 'true' : 'false', 0] as unknown as AstNode
  }
  if (t.tag === 'Atom') {
    return [NodeTypes.Atom, t.name, 0] as unknown as AstNode
  }
  if (t.tag === 'Primitive' && t.name === 'Null') {
    return [NodeTypes.Reserved, 'null', 0] as unknown as AstNode
  }
  return null
}

/**
 * Lift a runtime value back into a `Literal`-ish type. Primitives only in v1;
 * composite reconstruction (Tuple, Record) is a follow-up per decision #10.
 */
function valueToLiteralType(value: unknown): Type | null {
  if (value === null || value === undefined) return NullType
  if (typeof value === 'number' && Number.isFinite(value)) return literal(value)
  if (typeof value === 'string') return literal(value)
  if (typeof value === 'boolean') return literal(value)
  // Atom values carry a `name` field (see typeGuards/dvala isAtom).
  if (typeof value === 'object' && value !== null && 'name' in value
    && typeof (value as { name: unknown }).name === 'string'
    && '^^atom^^' in value) {
    return atomType((value as { name: string }).name)
  }
  return null
}

export interface FoldOutcome {
  /** Folded successfully — use this as the inferred result type. */
  type?: Type
  /** Fold surfaced an effect (typically `@dvala.error`) — caller should
   *  emit a warning and fall back to the normal inferred type. */
  effectName?: string
}

/**
 * Attempt to fold a direct builtin Call with all-primitive-literal args.
 *
 * @param calleeNode   The AST node of the callee (must be a Builtin node).
 * @param argTypes     The inferred types of each argument.
 * @returns
 *   - `{ type }`       on success: the literal type of the folded result.
 *   - `{ effectName }` when the fold performed an effect the sandbox caught
 *                      (caller emits a `severity: 'warning'` diagnostic).
 *   - `null`           when the call isn't eligible for folding (non-builtin
 *                      callee, non-literal args, budget exhaustion, or any
 *                      unhandled sandbox failure — silent fallback).
 */
export function tryFoldBuiltinCall(
  calleeNode: AstNode,
  argTypes: Type[],
): FoldOutcome | null {
  // Phase C v1: only direct Builtin references. Module-imported functions
  // enter by symbol lookup and arrive here as `NodeTypes.Sym` — not folded
  // yet. User-defined functions are also `Sym`.
  if (calleeNode[0] !== NodeTypes.Builtin) return null

  // Every argument must be a reconstructible primitive literal.
  const argAsts: AstNode[] = []
  for (const argType of argTypes) {
    const litNode = literalTypeToAstNode(argType)
    if (!litNode) return null
    argAsts.push(litNode)
  }

  // Synthesize a Call AST: [Call, [builtinNode, args, hints], nodeId].
  // nodeId=0 because this node is ephemeral and never surfaced.
  const calleeClone: AstNode = [NodeTypes.Builtin, calleeNode[1], 0] as unknown as AstNode
  const syntheticCall: AstNode = [
    NodeTypes.Call,
    [calleeClone, argAsts, null],
    0,
  ] as unknown as AstNode

  // Phase C v1 only folds direct Builtin calls — these don't need the
  // module registry. A future commit that folds module-imported or
  // user-defined functions will need to plumb a module map through here.
  const contextStack = createContextStack()
  const result = evaluateNodeForFold(syntheticCall, contextStack)

  if (result.ok) {
    const type = valueToLiteralType(result.value)
    return type ? { type } : null
  }
  if (result.reason === 'effect') {
    return { effectName: result.effectName }
  }
  return null
}
