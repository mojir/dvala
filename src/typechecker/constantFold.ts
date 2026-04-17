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
import { isPersistentMap, isPersistentVector } from '../utils/persistent'
import type { Type } from './types'
import { NullType, atom as atomType, literal, record, tuple } from './types'

/**
 * Reconstruct a literal AST node from an inferred type.
 *
 * Supports primitives (Literal, Atom, Null) and closed composites (Tuple,
 * closed Record) with arbitrary nesting — per decision #10. Bails on:
 *   - Plain `Number` / `String` / `Boolean` (no concrete value).
 *   - Open records (`open: true`) — can't know all fields.
 *   - `Array` types (element-only, no length info).
 *   - Function values, `Unknown`, type vars.
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
  if (t.tag === 'Tuple') {
    const elements: AstNode[] = []
    for (const elemType of t.elements) {
      const elem = literalTypeToAstNode(elemType)
      if (!elem) return null
      elements.push(elem)
    }
    return [NodeTypes.Array, elements, 0] as unknown as AstNode
  }
  if (t.tag === 'Record' && !t.open) {
    const entries: [AstNode, AstNode][] = []
    for (const [key, fieldType] of t.fields) {
      const valueAst = literalTypeToAstNode(fieldType)
      if (!valueAst) return null
      const keyAst = [NodeTypes.Str, key, 0] as unknown as AstNode
      entries.push([keyAst, valueAst])
    }
    return [NodeTypes.Object, entries, 0] as unknown as AstNode
  }
  return null
}

/**
 * Lift a runtime value back into a `Literal`-ish type.
 *
 * Supports the same shapes as `literalTypeToAstNode`: primitives, atoms,
 * null, PersistentVector → closed Tuple, PersistentMap → closed Record.
 * Recurses through composite elements / fields.
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
  if (isPersistentVector(value)) {
    const elementTypes: Type[] = []
    for (const elem of value) {
      const elemType = valueToLiteralType(elem)
      if (!elemType) return null
      elementTypes.push(elemType)
    }
    return tuple(elementTypes)
  }
  if (isPersistentMap(value)) {
    const fields: Record<string, Type> = {}
    for (const [key, val] of value) {
      // Record keys are strings in the Dvala type system; skip anything else.
      if (typeof key !== 'string') return null
      const fieldType = valueToLiteralType(val)
      if (!fieldType) return null
      fields[key] = fieldType
    }
    // Closed record — every field is a known literal type.
    return record(fields, false)
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
 * Build the list of arg AST nodes for a fold call, or return null if any
 * argument isn't a reconstructible literal type.
 */
function reconstructArgAsts(argTypes: Type[]): AstNode[] | null {
  const argAsts: AstNode[] = []
  for (const argType of argTypes) {
    const litNode = literalTypeToAstNode(argType)
    if (!litNode) return null
    argAsts.push(litNode)
  }
  return argAsts
}

/**
 * Run a synthesized Call through the fold sandbox and translate the result
 * into a FoldOutcome. Shared by the builtin and user-function entry points.
 */
function runFold(syntheticCall: AstNode): FoldOutcome | null {
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
  // yet. User-defined functions route through `tryFoldUserFunctionCall`.
  if (calleeNode[0] !== NodeTypes.Builtin) return null

  const argAsts = reconstructArgAsts(argTypes)
  if (!argAsts) return null

  // Synthesize a Call AST: [Call, [builtinNode, args, hints], nodeId].
  // nodeId=0 because this node is ephemeral and never surfaced.
  const calleeClone: AstNode = [NodeTypes.Builtin, calleeNode[1], 0] as unknown as AstNode
  const syntheticCall: AstNode = [
    NodeTypes.Call,
    [calleeClone, argAsts, null],
    0,
  ] as unknown as AstNode

  return runFold(syntheticCall)
}

/**
 * Attempt to fold a Call to a user-defined function (C6).
 *
 * @param functionAst  The Function-node AST that the caller's binding
 *                     resolves to (captured via `env.bindFunctionAst`).
 * @param argTypes     The inferred types of each argument.
 * @returns Same contract as `tryFoldBuiltinCall`.
 *
 * How it works: we synthesize a Call whose callee is the function AST
 * itself (not a Sym lookup), so the sandbox evaluates the function
 * literal and immediately applies it to the reconstructed literal args.
 * Free variables in the body that aren't builtins will fail lookup in
 * the empty fresh ContextStack — the evaluator raises a `DvalaError`,
 * the sandbox intercepts that as `@dvala.error`, and we return
 * `{ effectName: 'dvala.error' }`. Callers treat that as a warning (a
 * conservative signal that the function references something the
 * typechecker can't reconstruct, not a true runtime failure).
 *
 * Out of scope for v1: closure-capture reconstruction for functions
 * that close over top-level let-bindings. Those currently bail.
 */
export function tryFoldUserFunctionCall(
  functionAst: AstNode,
  argTypes: Type[],
): FoldOutcome | null {
  if (functionAst[0] !== NodeTypes.Function) return null

  const argAsts = reconstructArgAsts(argTypes)
  if (!argAsts) return null

  // Synthesize `[Call, [<FunctionAst>, args, null], 0]`. The evaluator
  // treats the callee as a literal function expression, creates a value,
  // and immediately applies it to the args.
  const syntheticCall: AstNode = [
    NodeTypes.Call,
    [functionAst, argAsts, null],
    0,
  ] as unknown as AstNode

  return runFold(syntheticCall)
}
